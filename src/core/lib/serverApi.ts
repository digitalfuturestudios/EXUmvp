// ============================================================
// SERVER API CLIENT — Typed fetch wrapper for the Hono backend.
// Reads JWT from authStore (kept live by onAuthStateChange).
// ============================================================

import { projectId, publicAnonKey } from '/utils/supabase/info';
import { supabase } from './supabaseClient';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-cd016e9d`;

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface RequestOptions<TBody = unknown> {
  method?: HttpMethod;
  body?: TBody;
  requiresAuth?: boolean;
}

interface ApiResponse<TData> {
  data: TData | null;
  error: string | null;
}

/** Returns a valid JWT for the request */
async function getAuthHeader(requiresAuth: boolean): Promise<Record<string, string>> {
  if (!requiresAuth) {
    return { Authorization: `Bearer ${publicAnonKey}` };
  }

  // 1. Try token from authStore (kept fresh by onAuthStateChange listener)
  const { useAuthStore } = await import('../../features/auth/store/authStore');
  const storedToken = useAuthStore.getState().accessToken;
  if (storedToken) {
    return { Authorization: `Bearer ${storedToken}` };
  }

  // 2. Fallback: ask Supabase directly (handles page reload case)
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    // Sync back to store so next call is instant
    useAuthStore.getState().setToken(session.access_token);
    return { Authorization: `Bearer ${session.access_token}` };
  }

  // 3. Last resort: try refreshing the session
  const { data: { session: refreshed } } = await supabase.auth.refreshSession();
  if (refreshed?.access_token) {
    useAuthStore.getState().setToken(refreshed.access_token);
    return { Authorization: `Bearer ${refreshed.access_token}` };
  }

  // 4. Truly unauthenticated — use anon key (will 401 on protected routes)
  console.warn('[API] No valid session found, using anon key');
  return { Authorization: `Bearer ${publicAnonKey}` };
}

/** Typed fetch wrapper with error handling */
export async function apiRequest<TData, TBody = unknown>(
  path: string,
  options: RequestOptions<TBody> = {},
): Promise<ApiResponse<TData>> {
  const { method = 'GET', body, requiresAuth = false } = options;

  try {
    const authHeader = await getAuthHeader(requiresAuth);

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API] ${method} ${path} failed (${response.status}):`, errorText);
      return { data: null, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json() as TData;
    return { data, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown network error';
    console.error(`[API] ${method} ${path} threw:`, message);
    return { data: null, error: message };
  }
}