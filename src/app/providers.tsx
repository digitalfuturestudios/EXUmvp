// ============================================================
// GLOBAL PROVIDERS — QueryClient, i18n, Toaster.
// Waits for Supabase session to be ready before rendering.
// ============================================================

import './i18n';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { supabase } from '../core/lib/supabaseClient';
import { useAuthStore } from '../features/auth/store/authStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,                                    // reduced from 2 to avoid loop
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
  const { isReady, setToken, clearSession } = useAuthStore((s) => ({
    isReady: s.isReady,
    setToken: s.setToken,
    clearSession: s.clearSession,
  }));

  // On first mount, restore session from Supabase storage
  // This ensures the token is available before any query fires
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token);
      } else {
        // No session — mark ready so UI can show login screen
        useAuthStore.getState().setReady();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Block render until we know the auth state
  // Prevents queries from firing with null token on page reload
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
