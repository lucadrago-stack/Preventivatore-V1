import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase con service role — SOLO server-side (API routes).
 * Non esporre mai SUPABASE_SERVICE_ROLE_KEY al browser.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY mancante. Aggiungila in .env.local e su Vercel.",
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
