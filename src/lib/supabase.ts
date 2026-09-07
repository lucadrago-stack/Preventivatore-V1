import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

function creaClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Variabili Supabase mancanti in .env.local");
  }

  return createClient(url, key);
}

export function createSupabaseClient() {
  if (typeof window === "undefined") {
    return creaClient();
  }
  if (!browserClient) {
    browserClient = creaClient();
  }
  return browserClient;
}
