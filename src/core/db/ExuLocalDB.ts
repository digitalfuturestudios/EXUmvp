// ============================================================
// EXU LOCAL DATABASE — Dexie.js (IndexedDB Wrapper)
// Singleton instance for all offline-first data operations.
// Schema version history is tracked for safe migrations.
// ============================================================

import Dexie, { type Table } from 'dexie';
import type { CachedExam, ExamSession, PendingResult } from '../types/local.types';

// ─────────────────────────────────────────────
// NEW: exam_code_map — maps short codes to exam IDs for offline access
// ─────────────────────────────────────────────

export interface ExamCodeMapEntry {
  code: string;      // "EXU-4F2A" — primary key
  exam_id: string;
  title_es: string;
  title_en: string;
  duration_minutes: number;
  cached_at: number;
}

// ─────────────────────────────────────────────
// DATABASE CLASS DEFINITION
// ─────────────────────────────────────────────

class ExuLocalDB extends Dexie {
  /**
   * cached_exams: Full exam bundles downloaded before the exam.
   * Indexed by exam id and expiry for efficient cache management.
   */
  cached_exams!: Table<CachedExam, string>;

  /**
   * exam_sessions: Live state of in-progress exams.
   * Auto-saved every 5s by useResilientTimer.
   * Indexed by student_id for multi-student device support.
   */
  exam_sessions!: Table<ExamSession, string>;

  /**
   * pending_results: Completed exams queued for sync.
   * Indexed by status for efficient queue processing.
   */
  pending_results!: Table<PendingResult, string>;

  /**
   * exam_code_map: Maps short codes to exam IDs for offline access.
   * Indexed by code for quick lookup.
   */
  exam_code_map!: Table<ExamCodeMapEntry, string>;

  constructor() {
    super('ExuDB');

    /**
     * SCHEMA VERSION 1 — Initial schema
     *
     * Indexing strategy:
     * - Primary key: First listed field (no &/++ prefix = manual UUID)
     * - Indexed: Fields prefixed with nothing (regular index)
     * - Unique: Fields prefixed with &
     * - Auto-increment: Fields prefixed with ++
     * - Compound index: [field1+field2]
     *
     * Note: Only index fields used in .where() queries.
     * Over-indexing increases storage and write overhead.
     */
    this.version(1).stores({
      cached_exams:   'id, expires_at, cached_at',
      exam_sessions:  'id, exam_id, student_id, status, last_saved_at',
      pending_results: 'id, exam_id, student_id, status, submitted_at',
    });

    // Version 2: adds exam_code_map table for offline code→id resolution
    this.version(2).stores({
      cached_exams:   'id, expires_at, cached_at',
      exam_sessions:  'id, exam_id, student_id, status, last_saved_at',
      pending_results: 'id, exam_id, student_id, status, submitted_at',
      exam_code_map:  'code, exam_id, cached_at',
    });
  }
}

// ─────────────────────────────────────────────
// SINGLETON EXPORT
// One instance per browser tab, shared across all hooks.
// ─────────────────────────────────────────────

export const db = new ExuLocalDB();

// ─────────────────────────────────────────────
// DATABASE SERVICE FUNCTIONS
// Encapsulated data access methods following Repository pattern.
// ─────────────────────────────────────────────

/** Returns a cached exam if it exists and hasn't expired */
export async function getCachedExam(examId: string): Promise<CachedExam | null> {
  try {
    const record = await db.cached_exams.get(examId);
    if (!record) return null;

    const now = Date.now();
    if (record.expires_at < now) {
      // Cache expired — clean up silently
      await db.cached_exams.delete(examId);
      return null;
    }
    return record;
  } catch (error) {
    console.error('[ExuLocalDB] getCachedExam error:', error);
    return null;
  }
}

/** Stores or updates a cached exam bundle (TTL: 2 hours) */
export async function setCachedExam(exam: CachedExam['exam'], questions: CachedExam['questions']): Promise<void> {
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const now = Date.now();

  const existing = await db.cached_exams.get(exam.id);

  const record: CachedExam = {
    id: exam.id,
    exam,
    questions,
    cached_at: now,
    expires_at: now + TWO_HOURS_MS,
    version: existing ? existing.version + 1 : 1,
  };

  await db.cached_exams.put(record);
}

/** Upserts an exam session (idempotent, called every 5s) */
export async function saveSession(session: ExamSession): Promise<void> {
  try {
    await db.exam_sessions.put({ ...session, last_saved_at: Date.now() });
  } catch (error) {
    console.error('[ExuLocalDB] saveSession error:', error);
    throw new Error(`Failed to persist session for exam ${session.exam_id}: ${error}`);
  }
}

/** Retrieves an active session by composite key */
export async function getSession(examId: string, studentId: string): Promise<ExamSession | null> {
  try {
    const sessionId = `${examId}__${studentId}`;
    const session = await db.exam_sessions.get(sessionId);
    return session ?? null;
  } catch (error) {
    console.error('[ExuLocalDB] getSession error:', error);
    return null;
  }
}

/** Marks a session as completed */
export async function completeSession(examId: string, studentId: string): Promise<void> {
  const sessionId = `${examId}__${studentId}`;
  await db.exam_sessions.update(sessionId, { status: 'completed' });
}

/** Enqueues a result for background sync */
export async function enqueuePendingResult(result: PendingResult): Promise<void> {
  try {
    await db.pending_results.put(result);
  } catch (error) {
    console.error('[ExuLocalDB] enqueuePendingResult error:', error);
    throw new Error(`Failed to enqueue result for exam ${result.exam_id}: ${error}`);
  }
}

/** Returns all results with 'pending' or 'failed' status */
export async function getPendingResults(): Promise<PendingResult[]> {
  try {
    return await db.pending_results
      .where('status')
      .anyOf(['pending', 'failed'])
      .toArray();
  } catch (error) {
    console.error('[ExuLocalDB] getPendingResults error:', error);
    return [];
  }
}

/** Updates sync status of a pending result */
export async function updatePendingResultStatus(
  id: string,
  status: PendingResult['status'],
  errorMessage?: string,
): Promise<void> {
  await db.pending_results.update(id, {
    status,
    last_attempt_at: Date.now(),
    error_message: errorMessage ?? null,
    ...(status === 'failed' ? { retry_count: Dexie.ignoreCase as unknown as number } : {}),
  });
}

/** Removes a successfully synced result */
export async function deleteSyncedResult(id: string): Promise<void> {
  await db.pending_results.delete(id);
}

/** Removes expired cached exams (maintenance) */
export async function purgeExpiredCache(): Promise<number> {
  const expired = await db.cached_exams
    .where('expires_at')
    .below(Date.now())
    .primaryKeys();

  await db.cached_exams.bulkDelete(expired as string[]);
  return expired.length;
}

// ─────────────────────────────────────────────
// EXAM CODE MAP FUNCTIONS
// ─────────────────────────────────────────────

/** Saves a short code → exam ID mapping for offline access */
export async function saveExamCodeMap(
  code: string,
  examId: string,
  titleEs: string,
  titleEn: string,
  durationMinutes: number,
): Promise<void> {
  try {
    await db.exam_code_map.put({
      code,
      exam_id: examId,
      title_es: titleEs,
      title_en: titleEn,
      duration_minutes: durationMinutes,
      cached_at: Date.now(),
    });
  } catch (error) {
    console.error('[ExuLocalDB] saveExamCodeMap error:', error);
  }
}

/** Looks up an exam ID from a short code (offline fallback) */
export async function getExamIdFromCode(code: string): Promise<ExamCodeMapEntry | null> {
  try {
    const entry = await db.exam_code_map.get(code);
    return entry ?? null;
  } catch (error) {
    console.error('[ExuLocalDB] getExamIdFromCode error:', error);
    return null;
  }
}

/** Returns all saved exam code mappings */
export async function getAllExamCodeMaps(): Promise<ExamCodeMapEntry[]> {
  try {
    return await db.exam_code_map.toArray();
  } catch (error) {
    console.error('[ExuLocalDB] getAllExamCodeMaps error:', error);
    return [];
  }
}