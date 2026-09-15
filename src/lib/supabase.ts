import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/**
 * Client Supabase per componenti client-side.
 * Usa cookie (via @supabase/ssr) così middleware e Server Components
 * vedono la stessa sessione.
 */
export function createSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Variabili Supabase mancanti in .env.local");
  }

  if (typeof window === "undefined") {
    // Evita singleton sul server: ogni chiamata è indipendente.
    return createBrowserClient(url, key);
  }

  if (!browserClient) {
    browserClient = createBrowserClient(url, key);
  }
  return browserClient;
}
