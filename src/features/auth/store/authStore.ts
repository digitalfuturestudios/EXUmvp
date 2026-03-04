// ============================================================
// AUTH STORE — Zustand slice for authentication state.
// Includes Supabase session listener to keep token in sync.
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../../../core/lib/supabaseClient';
import type { Profile, UserRole } from '../../../core/types/database.types';

interface AuthState {
  isAuthenticated: boolean;
  profile: Profile | null;
  accessToken: string | null;
  role: UserRole | null;
  isReady: boolean; // NEW: true once Supabase has restored session
  // Actions
  setSession: (profile: Profile, token: string) => void;
  setToken: (token: string) => void;
  clearSession: () => void;
  setReady: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      profile: null,
      accessToken: null,
      role: null,
      isReady: false,

      setSession: (profile, accessToken) => {
        set({ isAuthenticated: true, profile, accessToken, role: profile.role, isReady: true });
      },

      // NEW: update token without touching profile (used by onAuthStateChange)
      setToken: (accessToken) => {
        set({ accessToken, isReady: true });
      },

      clearSession: () => {
        set({ isAuthenticated: false, profile: null, accessToken: null, role: null, isReady: true });
      },

      setReady: () => set({ isReady: true }),
    }),
    {
      name: 'exu_auth',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        profile: state.profile,
        role: state.role,
        // Do NOT persist access token — refreshed on reload via listener
        accessToken: null,
        isReady: false,
      }),
    },
  ),
);

// ─── Supabase session listener ────────────────────────────
// Runs once on app start. Keeps accessToken always fresh
// so serverApi.ts never sends an expired or null JWT.
supabase.auth.onAuthStateChange((event, session) => {
  const { setToken, clearSession, isAuthenticated } = useAuthStore.getState();

  if (session?.access_token) {
    setToken(session.access_token);
  } else if (event === 'SIGNED_OUT') {
    clearSession();
  } else if (!session && !isAuthenticated) {
    // No session and not logged in — mark as ready so UI doesn't hang
    useAuthStore.setState({ isReady: true });
  }
});




