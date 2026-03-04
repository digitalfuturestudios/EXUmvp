// ============================================================
// SUPABASE CLIENT — Singleton instance for frontend usage.
// The service role key MUST remain server-side only.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const supabaseUrl = `https://${projectId}.supabase.co`;

let _client: SupabaseClient | null = null;

/** Returns the singleton Supabase client instance */
export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(supabaseUrl, publicAnonKey);
  return _client;
}

export const supabase = getSupabaseClient();
