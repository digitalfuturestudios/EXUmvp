// ============================================================
// AUTH STORE — Zustand slice for authentication state.
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Profile, UserRole } from '../../../core/types/database.types';

interface AuthState {
  isAuthenticated: boolean;
  profile: Profile | null;
  accessToken: string | null;
  role: UserRole | null;
  // Actions
  setSession: (profile: Profile, token: string) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      profile: null,
      accessToken: null,
      role: null,

      setSession: (profile, accessToken) => {
        set({ isAuthenticated: true, profile, accessToken, role: profile.role });
      },

      clearSession: () => {
        set({ isAuthenticated: false, profile: null, accessToken: null, role: null });
      },
    }),
    {
      name: 'exu_auth',
      // Only persist non-sensitive data; token is kept in memory only
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        profile: state.profile,
        role: state.role,
        // Do NOT persist access token — re-auth on reload
        accessToken: null,
      }),
    },
  ),
);
