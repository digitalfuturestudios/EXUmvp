// ============================================================
// useOfflineDelivery — QR Generation & Background Sync Hook
//
// Flow:
//   1. onFinishExam() → encrypts answers (AES) → compresses (lz-string)
//   2. Generates QR payload string
//   3. Stores result in Dexie pending_results queue
//   4. window 'online' event → drains queue → POST to Supabase
//
// Design:
//   - Queue-based with retry logic (max 3 retries)
//   - Idempotent sync (uses exam result ID as deduplication key)
//   - Network detection uses Navigator.onLine + event listeners
// ============================================================

import { useEffect, useRef, useCallback, useState } from 'react';
import LZString from 'lz-string';
import { v4 as uuidv4 } from 'uuid';
import {
  enqueuePendingResult,
  getPendingResults,
  updatePendingResultStatus,
  deleteSyncedResult,
} from '../../../core/db/ExuLocalDB';
import { encryptPayload, generateIntegrityHash } from '../../../core/lib/crypto';
import { apiRequest } from '../../../core/lib/serverApi';
import type { AnswerRecord, AnswerPayload, PendingResult } from '../../../core/types/local.types';
import type { ExamResultInsert } from '../../../core/types/database.types';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface OfflineDeliveryInput {
  examId: string;
  studentId: string;
  studentName: string;
  answers: Record<string, AnswerRecord>;
  startTimestamp: number;
  totalPoints: number;
  earnedPoints: number;
  score: number;
}

export interface OfflineDeliveryState {
  qrPayload: string | null;
  isPending: boolean;
  isSyncing: boolean;
  isSynced: boolean;
  error: string | null;
  retrySync: () => void;
}

const MAX_RETRY_COUNT = 3;

// ─────────────────────────────────────────────
// HOOK IMPLEMENTATION
// ─────────────────────────────────────────────

export function useOfflineDelivery(): {
  state: OfflineDeliveryState;
  finishExam: (input: OfflineDeliveryInput) => Promise<string>;
} {
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [isPending, setIsPending] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSynced, setIsSynced] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isSyncingRef = useRef<boolean>(false);

  // ─── Restore QR payload from Dexie on mount ───────────────
  // Handles the case where the student reloads the page after exam
  // completion but before the teacher scans the QR code.
  useEffect(() => {
    getPendingResults().then((items) => {
      if (items.length > 0) {
        // Find the most recent pending item with a QR payload
        const latest = items
          .filter((i) => i.compressed_qr_payload)
          .sort((a, b) => b.submitted_at - a.submitted_at)[0];

        if (latest?.compressed_qr_payload) {
          console.info('[OfflineDelivery] Restored QR payload from IndexedDB');
          setQrPayload(latest.compressed_qr_payload);
          setIsPending(true);
        }
      }
    }).catch((err) => {
      console.warn('[OfflineDelivery] Could not restore QR from Dexie:', err);
    });
  }, []);

  // ─── Drain Pending Queue ──────────────────────────────────
  const drainQueue = useCallback(async (): Promise<void> => {
    if (isSyncingRef.current) return;
    if (!navigator.onLine) return;

    const pendingItems = await getPendingResults();
    if (pendingItems.length === 0) return;

    isSyncingRef.current = true;
    setIsSyncing(true);

    for (const item of pendingItems) {
      if (item.retry_count >= MAX_RETRY_COUNT) {
        console.warn(`[OfflineDelivery] Skipping item ${item.id} — max retries exceeded`);
        continue;
      }

      await updatePendingResultStatus(item.id, 'syncing');

      const payload: ExamResultInsert = {
        exam_id: item.exam_id,
        student_id: item.student_id,
        student_name: item.student_name,
        score: item.score,
        total_points: item.total_points,
        earned_points: item.earned_points,
        encrypted_payload: item.encrypted_payload,
        sync_method: 'API',
        started_at: new Date(item.started_at).toISOString(),
        submitted_at: new Date(item.submitted_at).toISOString(),
      };

      const { error: apiError } = await apiRequest('/results', {
        method: 'POST',
        body: payload,
        requiresAuth: false,
      });

      if (apiError) {
        const newRetryCount = item.retry_count + 1;
        await updatePendingResultStatus(
          item.id,
          newRetryCount >= MAX_RETRY_COUNT ? 'failed' : 'pending',
          apiError,
        );
        console.error(`[OfflineDelivery] Sync failed for ${item.id}:`, apiError);
      } else {
        await deleteSyncedResult(item.id);
        setIsSynced(true);
        setIsPending(false);
        console.info(`[OfflineDelivery] Successfully synced result ${item.id}`);
      }
    }

    isSyncingRef.current = false;
    setIsSyncing(false);
  }, []);

  // ─── Online Event Listener ────────────────────────────────
  useEffect(() => {
    const handleOnline = (): void => {
      console.info('[OfflineDelivery] Network restored — draining queue');
      drainQueue();
    };

    window.addEventListener('online', handleOnline);

    // Attempt sync on mount if already online and there are pending items
    if (navigator.onLine) {
      drainQueue();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [drainQueue]);

  // ─── Finish Exam & Generate QR ───────────────────────────
  const finishExam = useCallback(async (input: OfflineDeliveryInput): Promise<string> => {
    const {
      examId, studentId, studentName, answers,
      startTimestamp, totalPoints, earnedPoints, score,
    } = input;

    const submittedAt = Date.now();
    const answersArray = Object.values(answers);

    // Build the answer payload for encryption
    const answerPayload: AnswerPayload = {
      exam_id: examId,
      student_id: studentId,
      student_name: studentName,
      answers: answersArray,
      started_at: startTimestamp,
      submitted_at: submittedAt,
      integrity_hash: generateIntegrityHash(answersArray),
    };

    // 1. Encrypt with AES (crypto-js) using examId as partial key
    const encryptedPayload = encryptPayload(answerPayload, examId);

    // 2. Compress with lz-string for QR size reduction
    //    compressToEncodedURIComponent produces URI-safe base64
    const compressedQrPayload = LZString.compressToEncodedURIComponent(encryptedPayload);

    // 3. Build QR string with version prefix for future compatibility
    const qrString = `EXU1:${compressedQrPayload}`;

    // 4. Enqueue to Dexie for background sync
    const pendingResult: PendingResult = {
      id: uuidv4(),
      exam_id: examId,
      student_id: studentId,
      student_name: studentName,
      score,
      total_points: totalPoints,
      earned_points: earnedPoints,
      encrypted_payload: encryptedPayload,
      compressed_qr_payload: qrString,
      sync_method: navigator.onLine ? 'API' : 'QR',
      started_at: startTimestamp,
      submitted_at: submittedAt,
      status: 'pending',
      retry_count: 0,
      last_attempt_at: null,
      error_message: null,
    };

    await enqueuePendingResult(pendingResult);

    setQrPayload(qrString);
    setIsPending(true);
    setError(null);

    // 5. Attempt immediate sync if online
    if (navigator.onLine) {
      drainQueue();
    }

    return qrString;
  }, [drainQueue]);

  // ─── Manual Retry ─────────────────────────────────────────
  const retrySync = useCallback((): void => {
    setError(null);
    drainQueue();
  }, [drainQueue]);

  return {
    state: {
      qrPayload,
      isPending,
      isSyncing,
      isSynced,
      error,
      retrySync,
    },
    finishExam,
  };
}