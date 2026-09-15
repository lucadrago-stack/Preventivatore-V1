import { NextResponse } from "next/server";
import {
  isRuoloUtente,
  requireAdminApi,
} from "@/lib/admin-utenti";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type BodyNuovoUtente = {
  nome?: string;
  email?: string;
  password?: string;
  ruolo?: string;
  sede_id?: number | null;
  telefono?: string | null;
};

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;

  let body: BodyNuovoUtente;
  try {
    body = (await request.json()) as BodyNuovoUtente;
  } catch {
    return NextResponse.json({ error: "Body non valido" }, { status: 400 });
  }

  const nome = (body.nome ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const ruolo = (body.ruolo ?? "").trim();
  const telefono = (body.telefono ?? "").trim() || null;
  const sedeId =
    body.sede_id == null || body.sede_id === ("" as unknown)
      ? null
      : Number(body.sede_id);

  if (!nome || !email || !password) {
    return NextResponse.json(
      { error: "Nome, email e password sono obbligatori" },
      { status: 400 },
    );
  }
  if (!isRuoloUtente(ruolo)) {
    return NextResponse.json({ error: "Ruolo non valido" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "La password deve avere almeno 8 caratteri" },
      { status: 400 },
    );
  }
  if (sedeId != null && !Number.isFinite(sedeId)) {
    return NextResponse.json({ error: "Sede non valida" }, { status: 400 });
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

  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome },
    });

  if (authError || !authData.user) {
    const msg = (authError?.message ?? "").toLowerCase();
    if (
      msg.includes("already") ||
      msg.includes("registered") ||
      msg.includes("exists")
    ) {
      return NextResponse.json(
        { error: "Email già esistente" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: authError?.message ?? "Creazione utente Auth fallita" },
      { status: 400 },
    );
  }

  const userId = authData.user.id;

  const { data: commerciale, error: insertError } = await admin
    .from("commerciali")
    .insert({
      nome,
      email,
      telefono,
      ruolo,
      sede_id: sedeId,
      user_id: userId,
      attivo: true,
    })
    .select(
      "id, nome, email, telefono, ruolo, sede_id, user_id, attivo, sedi(id, nome)",
    )
    .single();

  if (insertError || !commerciale) {
    // Rollback Auth se l'insert fallisce
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json(
      { error: insertError?.message ?? "Inserimento commerciale fallito" },
      { status: 400 },
    );
  }

  return NextResponse.json({ utente: commerciale }, { status: 201 });
}
