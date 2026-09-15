import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Aggiorna la sessione Supabase sui cookie della request/response.
 * Da chiamare nel middleware su ogni richiesta protetta.
 */
export async function updateSession(
  request: NextRequest,
): Promise<{
  supabaseResponse: NextResponse;
  user: User | null;
  supabase: SupabaseClient | null;
}> {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { supabaseResponse, user: null, supabase: null };
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({
          request,
        });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() rinfresca il token se necessario (non usare getSession qui).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, user, supabase };
}

/** Copia i cookie Set-Cookie dalla response di sessione a una redirect. */
export function withSessionCookies(
  from: NextResponse,
  to: NextResponse,
): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie.name, cookie.value);
  }
  return to;
}
