// ============================================================
// LOCAL TYPES — Dexie / IndexedDB Schema Interfaces
// These represent the offline-first local data layer.
// ============================================================

import type { Exam, Question, SyncMethod } from './database.types';

// ─────────────────────────────────────────────
// DEXIE TABLE: cached_exams
// Full exam + questions bundle downloaded before the exam starts.
// ─────────────────────────────────────────────
export interface CachedExam {
  id: string;                // Exam UUID (primary key)
  exam: Exam;
  questions: Question[];
  cached_at: number;         // Unix timestamp (ms)
  expires_at: number;        // Unix timestamp (ms) — cache TTL
  version: number;           // Incremental version for cache invalidation
}

// ─────────────────────────────────────────────
// DEXIE TABLE: exam_sessions
// Persisted state of an in-progress exam.
// Auto-saved every 5 seconds by useResilientTimer.
// ─────────────────────────────────────────────
export type SessionStatus = 'in_progress' | 'paused' | 'completed' | 'abandoned';

export interface AnswerRecord {
  question_id: string;
  answer: string;             // Option id, 'true'/'false', or text
  answered_at: number;        // Unix timestamp (ms)
}

export interface ExamSession {
  id: string;                        // Composite: `${exam_id}__${student_id}`
  exam_id: string;
  student_id: string;
  student_name: string;
  start_timestamp: number;           // Unix timestamp (ms) — immutable reference
  elapsed_seconds: number;           // Computed elapsed time at last save
  answers: Record<string, AnswerRecord>; // Keyed by question_id
  current_question_index: number;
  status: SessionStatus;
  strikes: number;                   // Anti-cheat violations
  is_fullscreen: boolean;
  last_saved_at: number;             // Unix timestamp (ms)
  language: 'es' | 'en';
}

// ─────────────────────────────────────────────
// DEXIE TABLE: pending_results
// Completed exams waiting for network to sync.
// ─────────────────────────────────────────────
export type PendingResultStatus = 'pending' | 'syncing' | 'failed';

export interface PendingResult {
  id: string;                  // UUID generated locally
  exam_id: string;
  student_id: string;
  student_name: string;
  score: number;
  total_points: number;
  earned_points: number;
  encrypted_payload: string;   // AES encrypted + base64
  compressed_qr_payload: string; // lz-string compressed for QR
  sync_method: SyncMethod;
  started_at: number;          // Unix timestamp (ms)
  submitted_at: number;        // Unix timestamp (ms)
  status: PendingResultStatus;
  retry_count: number;
  last_attempt_at: number | null;
  error_message: string | null;
}

// ─────────────────────────────────────────────
// DERIVED / UI TYPES
// ─────────────────────────────────────────────

/** Payload structure before encryption */
export interface AnswerPayload {
  exam_id: string;
  student_id: string;
  student_name: string;
  answers: AnswerRecord[];
  started_at: number;
  submitted_at: number;
  integrity_hash: string; // SHA256 of sorted answers for tamper detection
}

/** Computed timer state exposed to UI */
export interface TimerState {
  elapsed_seconds: number;
  remaining_seconds: number;
  is_expired: boolean;
  formatted_remaining: string; // 'MM:SS'
}
