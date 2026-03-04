// ============================================================
// SERVER API CLIENT — Typed fetch wrapper for the Hono backend.
// All requests go through this module for consistency.
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

/** Returns the Authorization header value based on auth state */
async function getAuthHeader(requiresAuth: boolean): Promise<Record<string, string>> {
  if (!requiresAuth) {
    return { Authorization: `Bearer ${publicAnonKey}` };
  }

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? publicAnonKey;
  return { Authorization: `Bearer ${token}` };
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
