// ============================================================
// useExuGuard — Anti-Cheat Monitor Hook
//
// Responsibilities:
//   1. Detects tab/window focus changes via visibilitychange API.
//   2. Enforces fullscreen mode via the Fullscreen API.
//   3. Issues "strikes" on violations and temporarily blocks the UI.
//   4. Persists strike count in IndexedDB for session recovery.
//   5. Suspends the exam after MAX_STRIKES violations.
//
// Design Principles:
//   - All event listeners cleaned up in useEffect return function.
//   - Uses refs for values accessed in callbacks to avoid stale closures.
//   - No direct DOM manipulation — communicates state for UI layer.
// ============================================================

import { useEffect, useRef, useCallback, useState } from 'react';
import { db } from '../../../core/db/ExuLocalDB';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const MAX_STRIKES = 3;
const BLOCK_DURATION_SECONDS = 10;

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export type GuardStatus =
  | 'idle'          // Not monitoring (exam not started)
  | 'active'        // Monitoring, no violations
  | 'blocked'       // Temporarily blocked — countdown active
  | 'suspended';    // Max strikes exceeded — exam terminated

export interface GuardViolation {
  type: 'tab_change' | 'fullscreen_exit';
  timestamp: number;
}

export interface ExuGuardState {
  status: GuardStatus;
  strikes: number;
  maxStrikes: number;
  blockSecondsRemaining: number;
  violations: GuardViolation[];
  isFullscreen: boolean;
  requestFullscreen: () => Promise<void>;
}

interface UseExuGuardOptions {
  examId: string;
  studentId: string;
  /** Called when exam is forcefully suspended */
  onSuspended?: () => void;
  /** Called each time a new strike is issued */
  onStrike?: (strike: number, violation: GuardViolation) => void;
}

// ─────────────────────────────────────────────
// HOOK IMPLEMENTATION
// ─────────────────────────────────────────────

export function useExuGuard({
  examId,
  studentId,
  onSuspended,
  onStrike,
}: UseExuGuardOptions): ExuGuardState {

  const [status, setStatus] = useState<GuardStatus>('active');
  const [strikes, setStrikes] = useState<number>(0);
  const [blockSecondsRemaining, setBlockSecondsRemaining] = useState<number>(0);
  const [violations, setViolations] = useState<GuardViolation[]>([]);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    Boolean(document.fullscreenElement),
  );

  // Refs to avoid stale closures in event listeners
  const strikesRef = useRef<number>(0);
  const statusRef = useRef<GuardStatus>('active');
  const blockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onSuspendedRef = useRef(onSuspended);
  const onStrikeRef = useRef(onStrike);

  // Keep refs in sync with latest callbacks
  useEffect(() => { onSuspendedRef.current = onSuspended; }, [onSuspended]);
  useEffect(() => { onStrikeRef.current = onStrike; }, [onStrike]);

  // ─── Restore persisted strikes on mount ───────────────────
  useEffect(() => {
    const sessionId = `${examId}__${studentId}`;

    db.exam_sessions.get(sessionId).then((session) => {
      if (session && session.strikes > 0) {
        strikesRef.current = session.strikes;
        setStrikes(session.strikes);

        if (session.strikes >= MAX_STRIKES) {
          statusRef.current = 'suspended';
          setStatus('suspended');
        }
      }
    }).catch((err) => {
      console.error('[ExuGuard] Failed to restore session strikes:', err);
    });
  }, [examId, studentId]);

  // ─── Persist strikes to IndexedDB ─────────────────────────
  const persistStrikes = useCallback(async (strikeCount: number): Promise<void> => {
    const sessionId = `${examId}__${studentId}`;
    try {
      await db.exam_sessions.update(sessionId, { strikes: strikeCount });
    } catch (err) {
      console.error('[ExuGuard] Failed to persist strike count:', err);
    }
  }, [examId, studentId]);

  // ─── Block Timer ──────────────────────────────────────────
  const startBlockCountdown = useCallback((): void => {
    statusRef.current = 'blocked';
    setStatus('blocked');
    setBlockSecondsRemaining(BLOCK_DURATION_SECONDS);

    let remaining = BLOCK_DURATION_SECONDS;

    blockTimerRef.current = setInterval(() => {
      remaining -= 1;
      setBlockSecondsRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(blockTimerRef.current!);
        blockTimerRef.current = null;

        if (statusRef.current !== 'suspended') {
          statusRef.current = 'active';
          setStatus('active');
        }
      }
    }, 1000);
  }, []);

  // ─── Issue Strike ─────────────────────────────────────────
  const issueStrike = useCallback((type: GuardViolation['type']): void => {
    // Guard: ignore if already suspended or blocked
    if (statusRef.current === 'suspended') return;

    const newCount = strikesRef.current + 1;
    strikesRef.current = newCount;

    const violation: GuardViolation = { type, timestamp: Date.now() };
    setStrikes(newCount);
    setViolations((prev) => [...prev, violation]);

    onStrikeRef.current?.(newCount, violation);
    persistStrikes(newCount);

    if (newCount >= MAX_STRIKES) {
      statusRef.current = 'suspended';
      setStatus('suspended');
      clearInterval(blockTimerRef.current!);
      onSuspendedRef.current?.();
      return;
    }

    startBlockCountdown();
  }, [persistStrikes, startBlockCountdown]);

  // ─── Visibility Change Handler ────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (!document.hidden) return; // Only penalize on hide
      if (statusRef.current === 'suspended' || statusRef.current === 'blocked') return;

      console.warn('[ExuGuard] Tab change detected — issuing strike');
      issueStrike('tab_change');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [issueStrike]);

  // ─── Fullscreen Change Handler ────────────────────────────
  useEffect(() => {
    const handleFullscreenChange = (): void => {
      const inFullscreen = Boolean(document.fullscreenElement);
      setIsFullscreen(inFullscreen);

      if (!inFullscreen && statusRef.current === 'active') {
        console.warn('[ExuGuard] Fullscreen exit detected — issuing strike');
        issueStrike('fullscreen_exit');
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [issueStrike]);

  // ─── Cleanup on unmount ───────────────────────────────────
  useEffect(() => {
    return () => {
      if (blockTimerRef.current) {
        clearInterval(blockTimerRef.current);
      }
    };
  }, []);

  // ─── Request Fullscreen ───────────────────────────────────
  const requestFullscreen = useCallback(async (): Promise<void> => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.warn('[ExuGuard] Fullscreen request rejected:', err);
    }
  }, []);

  return {
    status,
    strikes,
    maxStrikes: MAX_STRIKES,
    blockSecondsRemaining,
    violations,
    isFullscreen,
    requestFullscreen,
  };
}
