// ============================================================
// SUPABASE CLIENT — Singleton instance for frontend usage.
// Fuerza persistSession y localStorage explícitamente.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const supabaseUrl = `https://${projectId}.supabase.co`;

let _client: SupabaseClient | null = null;

/** Returns the singleton Supabase client instance */
export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  _client = createClient(supabaseUrl, publicAnonKey, {
    auth: {
      persistSession: true,           // Guardar sesión en storage
      storageKey: 'exu_supabase',     // Clave explícita en localStorage
      storage: window.localStorage,   // Forzar localStorage (no cookies)
      autoRefreshToken: true,         // Refrescar token automáticamente
      detectSessionInUrl: true,       // Para OAuth flows
    },
  });

  return _client;
}

export const supabase = getSupabaseClient();