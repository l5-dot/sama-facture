import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Client Supabase du navigateur.
 *
 * Seule la clé publique « anon » est utilisée : elle est conçue pour être
 * exposée, la sécurité reposant sur les policies RLS. La clé `service_role`
 * ne doit JAMAIS être présente dans un bundle frontend.
 */

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase n’est pas configuré : renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.',
    );
  }
  return supabase;
}
