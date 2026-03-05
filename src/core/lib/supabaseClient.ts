// ============================================================
// SUPABASE CLIENT — Singleton instance for frontend usage.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const supabaseUrl = `https://${projectId}.supabase.co`;

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  _client = createClient(supabaseUrl, publicAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // NO storageKey personalizado — usa la clave nativa sb-* de Supabase
    },
  });

  return _client;
}

export const supabase = getSupabaseClient();