// ============================================================
// APP ROOT — Exu Platform MVP
// Routing: Auth → Teacher Dashboard | Student Exam Lobby → Engine
//
// La restauración de sesión vive en providers.tsx.
// App.tsx solo enruta según el estado del store.
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

// ─────────────────────────────────────────────
// ROOT ROUTER
// ─────────────────────────────────────────────

type AppView = 'lobby' | 'teacher-auth';

function AppRouter(): JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.role);
  const { cachedExam, session } = useExamStore();
  const [view, setView] = useState<AppView>('lobby');

  // 1. Profesor autenticado → Dashboard
  if (isAuthenticated && role === 'teacher') {
    return <TeacherDashboard />;
  }

  // 2. Sesión de examen activa → Motor de examen
  if (cachedExam && session && session.status === 'in_progress') {
    return <ExamEngine />;
  }

  // 3. Flujo de login de profesor
  if (view === 'teacher-auth') {
    return <AuthScreen onBack={() => setView('lobby')} />;
  }

  // 4. Default: Lobby de estudiante con enlace a teacher login
  return <ExamLobbyWithTeacherLink onTeacherClick={() => setView('teacher-auth')} />;
}

interface ExamLobbyWithTeacherLinkProps {
  onTeacherClick: () => void;
}

function ExamLobbyWithTeacherLink({ onTeacherClick }: ExamLobbyWithTeacherLinkProps): JSX.Element {
  return (
    <div className="relative">
      <ExamLobby />
      {/* Enlace sutil para acceso del profesor */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2">
        <button
          onClick={onTeacherClick}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/30 backdrop-blur-sm transition-colors hover:border-white/20 hover:text-white/50"
        >
          Acceso profesor →
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
      {/* PWA: nueva versión del SW → banner superior */}
      <PWAUpdateNotification />
      {/* Estado de red → barra superior */}
      <ConnectivityBanner />
      <AppRouter />
      {/* PWA: prompt de instalación → bottom sheet */}
      <PWAInstallBanner />
    </Providers>
  );
}
