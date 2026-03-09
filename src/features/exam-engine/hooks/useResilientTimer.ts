// ============================================================
// useResilientTimer — Tamper-Resistant Exam Timer
// ============================================================

import { useEffect, useRef, useCallback, useState } from 'react';
import { db, saveSession } from '../../../core/db/ExuLocalDB';
import type { ExamSession, TimerState } from '../../../core/types/local.types';

const AUTOSAVE_INTERVAL_MS = 5_000;
const RAF_THROTTLE_MS = 500;

function formatMMSS(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

interface UseResilientTimerOptions {
  session: ExamSession | null;
  durationSeconds: number;
  onExpire: () => void;
  onAutoSave?: (elapsedSeconds: number) => void;
}

export function useResilientTimer({
  session,
  durationSeconds,
  onExpire,
  onAutoSave,
}: UseResilientTimerOptions): TimerState {

  const [timerState, setTimerState] = useState<TimerState>(() => {
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

  const rafIdRef = useRef<number | null>(null);
  const lastRafTimeRef = useRef<number>(0);
  const lastAutosaveRef = useRef<number>(0);
  const isExpiredRef = useRef<boolean>(false);
  const onExpireRef = useRef(onExpire);
  const onAutoSaveRef = useRef(onAutoSave);
  const sessionRef = useRef(session);
  const durationRef = useRef(durationSeconds);

  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);
  useEffect(() => { onAutoSaveRef.current = onAutoSave; }, [onAutoSave]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { durationRef.current = durationSeconds; }, [durationSeconds]);

  const perfStartRef = useRef<number>(0);
  const anchorElapsedRef = useRef<number>(0);

  useEffect(() => {
    if (!session) return;

    const wallElapsed = Math.floor((Date.now() - session.start_timestamp) / 1000);
    const clampedElapsed = Math.min(wallElapsed, durationSeconds);
    const recoveredElapsed = Math.max(session.elapsed_seconds, Math.max(0, clampedElapsed));

    anchorElapsedRef.current = recoveredElapsed;
    perfStartRef.current = performance.now();

    if (recoveredElapsed >= durationSeconds && !isExpiredRef.current) {
      isExpiredRef.current = true;
      setTimerState({
        elapsed_seconds: recoveredElapsed,
        remaining_seconds: 0,
        is_expired: true,
        formatted_remaining: '00:00',
      });
      onExpireRef.current();
    }
  }, [session, durationSeconds]);

  const tick = useCallback((now: number): void => {
    if (isExpiredRef.current) return;

    if (now - lastRafTimeRef.current < RAF_THROTTLE_MS) {
      rafIdRef.current = requestAnimationFrame(tick);
      return;
    }
    lastRafTimeRef.current = now;

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
      return;
    }

    rafIdRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (!session) return;
    if (isExpiredRef.current) return;

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
  cedula: string,
  section: string,
  language: 'es' | 'en',
): Promise<ExamSession> {
  const sessionId = `${examId}__${studentId}`;

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
    cedula,
    section,
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