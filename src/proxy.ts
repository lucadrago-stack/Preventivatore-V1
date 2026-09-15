import { type NextRequest, NextResponse } from "next/server";
import {
  updateSession,
  withSessionCookies,
} from "@/lib/supabase-middleware";

/**
 * Next.js 16: la convention `middleware.ts` è deprecata → usare `proxy.ts`.
 * Protegge le rotte e rinfresca la sessione Supabase (cookie).
 */
export async function proxy(request: NextRequest) {
  const { supabaseResponse, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/login";
  const isApi = pathname.startsWith("/api/");

  // Account disattivato: forza logout e messaggio su /login
  if (user && supabase) {
    const { data: profilo } = await supabase
      .from("commerciali")
      .select("attivo")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profilo && profilo.attivo === false) {
      await supabase.auth.signOut();
      if (isApi) {
        return withSessionCookies(
          supabaseResponse,
          NextResponse.json(
            { error: "Account disattivato, contatta l'amministratore" },
            { status: 403 },
          ),
        );
      }
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("error", "disattivato");
      return withSessionCookies(
        supabaseResponse,
        NextResponse.redirect(loginUrl),
      );
    }
  }

  if (!user && !isLogin) {
    if (isApi) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isLogin) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|pdf-template/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
