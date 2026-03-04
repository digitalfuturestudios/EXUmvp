// ============================================================
// GLOBAL PROVIDERS — QueryClient, i18n, Toaster.
// Maneja la restauración de sesión ANTES de renderizar la app.
// ============================================================

import './i18n';
import { useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { supabase } from '../core/lib/supabaseClient';
import { useAuthStore } from '../features/auth/store/authStore';

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

    // 1. Restaurar sesión existente de Supabase (localStorage/cookie)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        useAuthStore.getState().setToken(session.access_token);
      } else {
        useAuthStore.getState().setReady();
      }
    });

    // 2. Escuchar cambios de sesión (refresco de token, logout, etc.)
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