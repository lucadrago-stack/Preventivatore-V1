import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-utenti";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type BodyPassword = {
  password?: string;
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;

  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "ID non valido" }, { status: 400 });
  }

  let body: BodyPassword;
  try {
    body = (await request.json()) as BodyPassword;
  } catch {
    return NextResponse.json({ error: "Body non valido" }, { status: 400 });
  }

  const password = body.password ?? "";
  if (password.length < 8) {
    return NextResponse.json(
      { error: "La password deve avere almeno 8 caratteri" },
      { status: 400 },
    );
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Service role non configurata",
      },
      { status: 500 },
    );
  }

  const { data: commerciale, error: fetchError } = await admin
    .from("commerciali")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !commerciale) {
    return NextResponse.json(
      { error: fetchError?.message ?? "Utente non trovato" },
      { status: 404 },
    );
  }

  if (!commerciale.user_id) {
    return NextResponse.json(
      { error: "Utente senza account Auth collegato" },
      { status: 400 },
    );
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(
    commerciale.user_id,
    { password },
  );

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
