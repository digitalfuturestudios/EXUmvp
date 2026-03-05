// ============================================================
// SERVER API CLIENT — Typed fetch wrapper for the Hono backend.
// Supabase requiere el header 'apikey' en todas las requests
// a Edge Functions para pasar la verificación de plataforma.
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

/** Construye los headers correctos para Supabase Edge Functions */
async function buildHeaders(requiresAuth: boolean): Promise<Record<string, string>> {
  // Supabase Edge Functions SIEMPRE necesitan el header 'apikey'
  // además del Authorization para pasar la verificación de plataforma
  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': publicAnonKey,  // ← requerido por Supabase para todas las requests
  };

  if (!requiresAuth) {
    return {
      ...baseHeaders,
      'Authorization': `Bearer ${publicAnonKey}`,
    };
  }

  // Para rutas autenticadas, usar el JWT del usuario
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.access_token) {
    return {
      ...baseHeaders,
      'Authorization': `Bearer ${session.access_token}`,
    };
  }

  // Intentar refrescar si no hay sesión
  const { data: { session: refreshed } } = await supabase.auth.refreshSession();
  if (refreshed?.access_token) {
    return {
      ...baseHeaders,
      'Authorization': `Bearer ${refreshed.access_token}`,
    };
  }

  console.warn('[API] No valid session found');
  return {
    ...baseHeaders,
    'Authorization': `Bearer ${publicAnonKey}`,
  };
}

/** Typed fetch wrapper con manejo de errores */
export async function apiRequest<TData, TBody = unknown>(
  path: string,
  options: RequestOptions<TBody> = {},
): Promise<ApiResponse<TData>> {
  const { method = 'GET', body, requiresAuth = false } = options;

  try {
    const headers = await buildHeaders(requiresAuth);

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
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