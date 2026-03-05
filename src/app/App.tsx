// ============================================================
// APP ROOT — Exu Platform MVP
// Routing: Auth → Teacher Dashboard | Student Exam Lobby → Engine
// ============================================================

import './i18n';
import { useState } from 'react';
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

type AppView = 'lobby' | 'teacher-auth';

function AppRouter(): JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.role);
  const { cachedExam, session } = useExamStore();
  const [view, setView] = useState<AppView>('lobby');

  // ─── NO session check here ───────────────────────────────
  // providers.tsx ya maneja la restauración del token de Supabase.
  // App.tsx solo enruta basado en el estado del store.

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

export default function App(): JSX.Element {
  return (
    <Providers>
      <PWAUpdateNotification />
      <ConnectivityBanner />
      <AppRouter />
      <PWAInstallBanner />
    </Providers>
  );
}