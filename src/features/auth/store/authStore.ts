// ============================================================
// AUTH STORE — Zustand slice for authentication state.
// Simple store — session sync is handled in Providers.
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Profile, UserRole } from '../../../core/types/database.types';

interface AuthState {
  isAuthenticated: boolean;
  profile: Profile | null;
  accessToken: string | null;
  role: UserRole | null;
  isReady: boolean;
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

      setToken: (accessToken) => {
        set((state) => ({ ...state, accessToken, isReady: true }));
      },

      clearSession: () => {
        set({ isAuthenticated: false, profile: null, accessToken: null, role: null, isReady: true });
      },

      setReady: () => set((state) => ({ ...state, isReady: true })),
    }),
    {
      name: 'exu_auth',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        profile: state.profile,
        role: state.role,
        accessToken: null,   // nunca persiste el token
        isReady: false,      // siempre arranca como false hasta validar
      }),
    },
  ),
);