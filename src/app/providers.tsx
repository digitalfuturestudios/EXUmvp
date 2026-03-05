// ============================================================
// GLOBAL PROVIDERS — QueryClient, i18n, Toaster.
// Maneja la restauración de sesión ANTES de renderizar la app.
//
// Lógica de restauración (en orden de prioridad):
//   1. No hay sesión Supabase válida → clearSession() (logout limpio)
//   2. Hay sesión + perfil en store → setToken() (actualiza token)
//   3. Hay sesión pero no perfil → fetch profile → setSession() o clearSession()
// ============================================================

import './i18n';
import { useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { supabase } from '../core/lib/supabaseClient';
import { apiRequest } from '../core/lib/serverApi';
import { useAuthStore } from '../features/auth/store/authStore';
import type { Profile } from '../core/types/database.types';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    },
    mutations: {
      retry: 1,
    },
  },
});

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps): JSX.Element {
  // Selector simple (no objeto inline) — evita infinite loop
  const isReady = useAuthStore((s) => s.isReady);
  const initialized = useRef(false);

  useEffect(() => {
    // Guard para que solo corra una vez aunque React monte dos veces (StrictMode)
    if (initialized.current) return;
    initialized.current = true;

    // ─── Restauración de sesión ──────────────────────────────
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        // Caso 1: No hay sesión válida → limpiar estado obsoleto
        if (!session?.access_token) {
          useAuthStore.getState().clearSession();
          return;
        }

        const state = useAuthStore.getState();

        // Caso 2: Sesión existe + perfil en store → solo actualizar token
        if (state.isAuthenticated && state.profile) {
          state.setToken(session.access_token);
          return;
        }

        // Caso 3: Sesión existe pero NO hay perfil en el store
        // (ej. localStorage fue parcialmente borrado, otra pestaña, etc.)
        // → intentar restaurar el perfil automáticamente
        const { data: profile } = await apiRequest<Profile>(
          `/profiles/${session.user.id}`,
          { requiresAuth: false },
        );

        if (profile) {
          useAuthStore.getState().setSession(profile, session.access_token);
        } else {
          // El perfil no existe en BD → forzar re-login
          console.warn('[Providers] Profile not found for session user — clearing auth state');
          useAuthStore.getState().clearSession();
        }
      } catch (err) {
        console.error('[Providers] Session restoration error:', err);
        // En caso de error de red, marcar como listo sin auth
        // El usuario verá el lobby y podrá iniciar sesión manualmente
        useAuthStore.getState().clearSession();
      }
    })();

    // ─── Listener de cambios de sesión ───────────────────────
    // Maneja: refresco de token automático, logout desde otra pestaña
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'TOKEN_REFRESHED' && session?.access_token) {
          // Solo actualiza el token, no toca el profile
          useAuthStore.getState().setToken(session.access_token);
        } else if (event === 'SIGNED_OUT') {
          useAuthStore.getState().clearSession();
          queryClient.clear();
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []); // [] — solo una vez al montar

  // Bloquea render hasta saber el estado de autenticación
  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="top-right"
        theme="dark"
        richColors
        closeButton
      />
    </QueryClientProvider>
  );
}
