import { NextResponse } from "next/server";
import {
  isRuoloUtente,
  requireAdminApi,
} from "@/lib/admin-utenti";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type BodyPatchUtente = {
  nome?: string;
  telefono?: string | null;
  ruolo?: string;
  sede_id?: number | null;
  attivo?: boolean;
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;

  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "ID non valido" }, { status: 400 });
  }

  let body: BodyPatchUtente;
  try {
    body = (await request.json()) as BodyPatchUtente;
  } catch {
    return NextResponse.json({ error: "Body non valido" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (body.nome !== undefined) {
    const nome = body.nome.trim();
    if (!nome) {
      return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
    }
    patch.nome = nome;
  }

  if (body.telefono !== undefined) {
    patch.telefono = (body.telefono ?? "").trim() || null;
  }

  if (body.ruolo !== undefined) {
    if (!isRuoloUtente(body.ruolo)) {
      return NextResponse.json({ error: "Ruolo non valido" }, { status: 400 });
    }
    patch.ruolo = body.ruolo;
  }

  if (body.sede_id !== undefined) {
    if (body.sede_id == null || body.sede_id === ("" as unknown)) {
      patch.sede_id = null;
    } else {
      const sedeId = Number(body.sede_id);
      if (!Number.isFinite(sedeId)) {
        return NextResponse.json({ error: "Sede non valida" }, { status: 400 });
      }
      patch.sede_id = sedeId;
    }
  }

  if (body.attivo !== undefined) {
    if (typeof body.attivo !== "boolean") {
      return NextResponse.json(
        { error: "Valore attivo non valido" },
        { status: 400 },
      );
    }
    // Non permettere di disattivare sé stessi
    if (
      body.attivo === false &&
      auth.sessione.commerciale?.id === id
    ) {
      return NextResponse.json(
        { error: "Non puoi disattivare il tuo account" },
        { status: 400 },
      );
    }
    patch.attivo = body.attivo;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Nessun campo da aggiornare" },
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

  const { data, error } = await admin
    .from("commerciali")
    .update(patch)
    .eq("id", id)
    .select(
      "id, nome, email, telefono, ruolo, sede_id, user_id, attivo, sedi(id, nome)",
    )
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Aggiornamento fallito" },
      { status: 400 },
    );
  }

  return NextResponse.json({ utente: data });
}
