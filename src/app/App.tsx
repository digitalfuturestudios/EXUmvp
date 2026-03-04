// ============================================================
// APP ROOT — Exu Platform MVP
// Routing: Auth → Teacher Dashboard | Student Exam Lobby → Engine
// ============================================================

import './i18n';
import { useState, useEffect } from 'react';
import { Providers } from './providers';
import { useAuthStore } from '../features/auth/store/authStore';
import { useExamStore } from '../features/exam-engine/store/examStore';
import { AuthScreen } from '../features/auth/components/AuthScreen';
import { ExamLobby } from '../features/exam-engine/components/ExamLobby';
import { ExamEngine } from '../features/exam-engine/components/ExamEngine';
import { TeacherDashboard } from '../features/teacher-dashboard/components/TeacherDashboard';
import { ConnectivityBanner } from '../shared/components/ConnectivityBanner';
import { PWAInstallBanner } from '../shared/components/PWAInstallBanner';
import { PWAUpdateNotification } from '../shared/components/PWAUpdateNotification';
import { supabase } from '../core/lib/supabaseClient';
import { apiRequest } from '../core/lib/serverApi';
import type { Profile } from '../core/types/database.types';

// ─────────────────────────────────────────────
// ROOT ROUTER — Simple state-based routing.
// ─────────────────────────────────────────────

type AppView = 'lobby' | 'teacher-auth';

function AppRouter(): JSX.Element {
  const { isAuthenticated, role, profile, setSession, clearSession } = useAuthStore();
  const { cachedExam, session } = useExamStore();
  const [view, setView] = useState<AppView>('lobby');
  const [sessionChecked, setSessionChecked] = useState(false);

  // ─── Revalidate Supabase session on every mount ──────────
  // The authStore persists isAuthenticated but NOT the access token.
  // On reload we must confirm Supabase still has a valid session;
  // if not (e.g. refresh token expired), force re-login.
  useEffect(() => {
    if (!isAuthenticated) {
      setSessionChecked(true);
      return;
    }

    supabase.auth.getSession().then(async ({ data: { session: supaSession }, error }) => {
      if (error || !supaSession) {
        console.warn('[App] Supabase session missing or expired — clearing auth store');
        clearSession();
      } else {
        // Refresh the store with the live token so serverApi uses it
        if (profile) {
          // Re-fetch profile to ensure it's up-to-date
          const { data: freshProfile } = await apiRequest<Profile>(
            `/profiles/${supaSession.user.id}`,
            { requiresAuth: false },
          );
          setSession(freshProfile ?? profile, supaSession.access_token);
        }
      }
    }).catch((err) => {
      console.error('[App] Session check failed:', err);
    }).finally(() => {
      setSessionChecked(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wait for session check to avoid flashing the wrong view
  if (isAuthenticated && !sessionChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  // 1. Authenticated teacher → Dashboard
  if (isAuthenticated && role === 'teacher') {
    return <TeacherDashboard />;
  }

  // 2. Active exam session → Engine
  if (cachedExam && session && session.status === 'in_progress') {
    return <ExamEngine />;
  }

  // 3. Teacher auth flow
  if (view === 'teacher-auth') {
    return <AuthScreen />;
  }

  // 4. Default: Student lobby with teacher link
  return <ExamLobbyWithTeacherLink onTeacherClick={() => setView('teacher-auth')} />;
}

interface ExamLobbyWithTeacherLinkProps {
  onTeacherClick: () => void;
}

function ExamLobbyWithTeacherLink({ onTeacherClick }: ExamLobbyWithTeacherLinkProps): JSX.Element {
  return (
    <div className="relative">
      <ExamLobby />
      {/* Teacher link — subtle, positioned at bottom */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2">
        <button
          onClick={onTeacherClick}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/30 backdrop-blur-sm transition-colors hover:border-white/20 hover:text-white/50"
        >
          Teacher login →
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// APP ROOT
// ─────────────────────────────────────────────

export default function App(): JSX.Element {
  return (
    <Providers>
      {/* PWA: new SW version available → top banner */}
      <PWAUpdateNotification />
      {/* Network status → top bar */}
      <ConnectivityBanner />
      <AppRouter />
      {/* PWA: install prompt → bottom sheet (shown after 2.5s delay) */}
      <PWAInstallBanner />
    </Providers>
  );
}