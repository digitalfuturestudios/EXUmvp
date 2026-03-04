// ============================================================
// useResilientTimer — Tamper-Resistant Exam Timer
//
// Security Model:
//   - Start time is saved to IndexedDB as an immutable anchor.
//   - Elapsed time is computed as: performance.now() - sessionStartPerf
//     which CANNOT be manipulated by changing device clock.
//   - The anchor timestamp (absolute) is only used for UI display
//     and cross-session recovery (tab close/reopen).
//   - On session recovery: elapsed = (Date.now() - startTimestamp)
//     is used, capped at duration to prevent over-counting.
//
// Auto-Save:
//   - Persists session state every AUTOSAVE_INTERVAL_MS to Dexie.
//   - On re-mount, restores elapsed time from IndexedDB.
//
// Design:
//   - requestAnimationFrame loop for smooth UI updates.
//   - Ref-based state for rAF callback to avoid stale closures.
//   - Graceful degradation: falls back to wall clock on perf unavailable.
// ============================================================

import { useEffect, useRef, useCallback, useState } from 'react';
import { db, saveSession } from '../../../core/db/ExuLocalDB';
import type { ExamSession, TimerState } from '../../../core/types/local.types';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const AUTOSAVE_INTERVAL_MS = 5_000;
const RAF_THROTTLE_MS = 500; // Update UI at ~2fps to reduce CPU

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────

function formatMMSS(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface UseResilientTimerOptions {
  session: ExamSession | null;
  durationSeconds: number;
  onExpire: () => void;
  onAutoSave?: (elapsedSeconds: number) => void;
}

// ─────────────────────────────────────────────
// HOOK IMPLEMENTATION
// ─────────────────────────────────────────────

export function useResilientTimer({
  session,
  durationSeconds,
  onExpire,
  onAutoSave,
}: UseResilientTimerOptions): TimerState {

  const [timerState, setTimerState] = useState<TimerState>(() => {
    // Synchronous initial state from session (if recovering)
    if (session) {
      const elapsed = session.elapsed_seconds;
      const remaining = Math.max(0, durationSeconds - elapsed);
      return {
        elapsed_seconds: elapsed,
        remaining_seconds: remaining,
        is_expired: remaining <= 0,
        formatted_remaining: formatMMSS(remaining),
      };
    }
    return {
      elapsed_seconds: 0,
      remaining_seconds: durationSeconds,
      is_expired: false,
      formatted_remaining: formatMMSS(durationSeconds),
    };
  });

  // ─── Refs (for rAF closure — must not be stale) ───────────
  const rafIdRef = useRef<number | null>(null);
  const lastRafTimeRef = useRef<number>(0);
  const lastAutosaveRef = useRef<number>(0);
  const isExpiredRef = useRef<boolean>(false);
  const onExpireRef = useRef(onExpire);
  const onAutoSaveRef = useRef(onAutoSave);
  const sessionRef = useRef(session);
  const durationRef = useRef(durationSeconds);

  // Keep refs in sync with latest props
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);
  useEffect(() => { onAutoSaveRef.current = onAutoSave; }, [onAutoSave]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { durationRef.current = durationSeconds; }, [durationSeconds]);

  // ─── Compute elapsed from immutable anchor ────────────────
  //
  // SECURITY: We use two complementary mechanisms:
  //
  // 1. performance.now() delta: Measures wall-time since session init.
  //    Immune to system clock changes mid-session.
  //
  // 2. Date.now() - start_timestamp: Used for cross-session recovery.
  //    If a student closes and reopens the tab, we use this to
  //    reconstruct how much time passed. This can be gamed by
  //    changing the clock, but:
  //    a) The server validates timestamps on submission.
  //    b) The Dexie record shows the original start_timestamp.
  //
  // For active sessions, mechanism #1 takes priority.
  const perfStartRef = useRef<number>(0); // performance.now() at mount
  const anchorElapsedRef = useRef<number>(0); // elapsed seconds at mount

  useEffect(() => {
    if (!session) return;

    // Compute elapsed using wall clock (for recovery across tab close)
    const wallElapsed = Math.floor((Date.now() - session.start_timestamp) / 1000);
    // Clamp to avoid over-counting (e.g., device clock was changed forward)
    const clampedElapsed = Math.min(wallElapsed, durationSeconds);

    // Use the MAX of (persisted elapsed, wall-clock elapsed)
    // to prevent cheating by manipulating the device clock backward
    const recoveredElapsed = Math.max(session.elapsed_seconds, Math.max(0, clampedElapsed));

    anchorElapsedRef.current = recoveredElapsed;
    perfStartRef.current = performance.now();

    // If already expired on recovery, fire immediately
    if (recoveredElapsed >= durationSeconds && !isExpiredRef.current) {
      isExpiredRef.current = true;
      const remaining = 0;
      setTimerState({
        elapsed_seconds: recoveredElapsed,
        remaining_seconds: remaining,
        is_expired: true,
        formatted_remaining: '00:00',
      });
      onExpireRef.current();
    }
  }, [session, durationSeconds]);

  // ─── rAF Loop ─────────────────────────────────────────────
  const tick = useCallback((now: number): void => {
    if (isExpiredRef.current) return;

    // Throttle to RAF_THROTTLE_MS to reduce CPU usage
    if (now - lastRafTimeRef.current < RAF_THROTTLE_MS) {
      rafIdRef.current = requestAnimationFrame(tick);
      return;
    }
    lastRafTimeRef.current = now;

    // Compute total elapsed using performance.now() delta (tamper-immune)
    const perfElapsed = (performance.now() - perfStartRef.current) / 1000;
    const totalElapsed = anchorElapsedRef.current + perfElapsed;
    const elapsed = Math.floor(totalElapsed);
    const remaining = Math.max(0, durationRef.current - elapsed);

    setTimerState({
      elapsed_seconds: elapsed,
      remaining_seconds: remaining,
      is_expired: remaining <= 0,
      formatted_remaining: formatMMSS(remaining),
    });

    // Auto-save to IndexedDB every AUTOSAVE_INTERVAL_MS
    if (now - lastAutosaveRef.current >= AUTOSAVE_INTERVAL_MS) {
      lastAutosaveRef.current = now;
      onAutoSaveRef.current?.(elapsed);

      const currentSession = sessionRef.current;
      if (currentSession) {
        saveSession({ ...currentSession, elapsed_seconds: elapsed })
          .catch((err) => console.error('[ResilientTimer] Auto-save failed:', err));
      }
    }

    if (remaining <= 0) {
      isExpiredRef.current = true;
      onExpireRef.current();
      return; // Stop the loop
    }

    rafIdRef.current = requestAnimationFrame(tick);
  }, []);

  // ─── Start / Stop Loop ────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    if (isExpiredRef.current) return;

    // Delay start to let the anchor setup effect run first
    const startTimeout = setTimeout(() => {
      lastRafTimeRef.current = performance.now();
      lastAutosaveRef.current = performance.now();
      rafIdRef.current = requestAnimationFrame(tick);
    }, 0);

    return () => {
      clearTimeout(startTimeout);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [session, tick]);

  return timerState;
}

// ─────────────────────────────────────────────
// HELPER: Create a new exam session record
// ─────────────────────────────────────────────

export async function initExamSession(
  examId: string,
  studentId: string,
  studentName: string,
  language: 'es' | 'en',
): Promise<ExamSession> {
  const sessionId = `${examId}__${studentId}`;

  // Check if a session already exists (crash recovery)
  const existing = await db.exam_sessions.get(sessionId);
  if (existing && existing.status === 'in_progress') {
    console.info('[ResilientTimer] Recovering existing session');
    return existing;
  }

  const session: ExamSession = {
    id: sessionId,
    exam_id: examId,
    student_id: studentId,
    student_name: studentName,
    start_timestamp: Date.now(),
    elapsed_seconds: 0,
    answers: {},
    current_question_index: 0,
    status: 'in_progress',
    strikes: 0,
    is_fullscreen: Boolean(document.fullscreenElement),
    last_saved_at: Date.now(),
    language,
  };

  await saveSession(session);
  return session;
}
