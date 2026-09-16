import type { SupabaseClient } from "@supabase/supabase-js";

export const DESCRIZIONE_POSA_DEFAULT_FALLBACK =
  "POSA IN OPERA\nIN RISTRUTTURAZIONE SENZA OPERE MURARIE CON SISTEMA POSACLIMA CERTIFICATO";

export const CHIAVE_DESCRIZIONE_POSA = "descrizione_posa_default";

/** HTML minimale per l'editor descrizione commerciale. */
export function descrizionePosaDefaultToHtml(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return descrizionePosaDefaultToHtml(DESCRIZIONE_POSA_DEFAULT_FALLBACK);
  }
  return lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function caricaDescrizionePosaDefault(
  supabase: SupabaseClient,
): Promise<string> {
  const { data, error } = await supabase
    .from("config_sistema")
    .select("valore")
    .eq("chiave", CHIAVE_DESCRIZIONE_POSA)
    .maybeSingle();

  if (error || !data?.valore?.trim()) {
    return DESCRIZIONE_POSA_DEFAULT_FALLBACK;
  }
  return data.valore.trim();
}

/**
 * Crea una riga tipo_riga='posa' collegata al prodotto via parent_riga_id.
 * Idempotente: se esiste già una posa con lo stesso parent, non ricrea.
 * Non aggiorna importo/descrizione se già presente (controllo manuale).
 *
 * @param importoPosaTotale già = unitario × quantità (come posa_importo sul prodotto)
 */
export async function ensureRigaPosaSeparata(
  supabase: SupabaseClient,
  params: {
    preventivoId: number;
    parentRigaId: number;
    importoPosaTotale: number;
    quantita: number;
    ordineDopo?: number | null;
  },
): Promise<{ created: boolean; id: number | null }> {
  const importo = Number(params.importoPosaTotale);
  if (!Number.isFinite(importo) || importo <= 0) {
    return { created: false, id: null };
  }

  const { data: existing, error: findError } = await supabase
    .from("righe")
    .select("id")
    .eq("parent_riga_id", params.parentRigaId)
    .eq("tipo_riga", "posa")
    .maybeSingle();

  if (findError) throw new Error(findError.message);
  if (existing?.id) {
    return { created: false, id: existing.id };
  }

  const descrizioneRaw = await caricaDescrizionePosaDefault(supabase);
  const descrizioneHtml = descrizionePosaDefaultToHtml(descrizioneRaw);
  const quantita = params.quantita > 0 ? params.quantita : 1;

  let ordine = params.ordineDopo ?? null;
  if (ordine == null) {
    const { data: maxOrd } = await supabase
      .from("righe")
      .select("ordine")
      .eq("preventivo_id", params.preventivoId)
      .order("ordine", { ascending: false })
      .limit(1);
    ordine = (maxOrd?.[0]?.ordine ?? 0) + 1;
  }

  const { data: maxPos } = await supabase
    .from("righe")
    .select("numero_posizione")
    .eq("preventivo_id", params.preventivoId)
    .not("numero_posizione", "is", null)
    .order("numero_posizione", { ascending: false })
    .limit(1);
  const numeroPosizione =
    (typeof maxPos?.[0]?.numero_posizione === "number"
      ? maxPos[0].numero_posizione
      : 0) + 1;

  const { data: inserted, error: insertError } = await supabase
    .from("righe")
    .insert({
      preventivo_id: params.preventivoId,
      prodotto_id: null,
      tipo_riga: "posa",
      parent_riga_id: params.parentRigaId,
      quantita,
      prezzo_riga: importo,
      posa: false,
      posa_importo: null,
      posa_riga_separata: false,
      descrizione_cliente: descrizioneHtml,
      descrizione_libera: descrizioneRaw,
      descrizione_tecnica: "Posa in opera",
      visibile_pdf: true,
      numero_posizione: numeroPosizione,
      ordine,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Errore creazione riga posa");
  }

  return { created: true, id: inserted.id };
}

/** Elimina la riga posa collegata a un prodotto (se presente). */
export async function removeRigaPosaPerParent(
  supabase: SupabaseClient,
  parentRigaId: number,
): Promise<void> {
  const { data: posaRows, error: findError } = await supabase
    .from("righe")
    .select("id")
    .eq("parent_riga_id", parentRigaId)
    .eq("tipo_riga", "posa");

  if (findError) throw new Error(findError.message);
  if (!posaRows?.length) return;

  const ids = posaRows.map((r) => r.id);
  const { error: flagError } = await supabase
    .from("righe_flag")
    .delete()
    .in("riga_id", ids);
  if (flagError) throw new Error(flagError.message);

  const { error: deleteError } = await supabase
    .from("righe")
    .delete()
    .in("id", ids);
  if (deleteError) throw new Error(deleteError.message);
}

/**
 * Allinea la riga posa figlia al prodotto: crea/aggiorna se posa separata, elimina altrimenti.
 */
export async function syncRigaPosaSeparata(
  supabase: SupabaseClient,
  params: {
    preventivoId: number;
    parentRigaId: number;
    posaSeparata: boolean;
    importoPosaTotale: number;
    quantita: number;
    ordineDopo?: number | null;
  },
): Promise<void> {
  const importo = Number(params.importoPosaTotale);
  const needsChild =
    params.posaSeparata && Number.isFinite(importo) && importo > 0;

  if (!needsChild) {
    await removeRigaPosaPerParent(supabase, params.parentRigaId);
    return;
  }

  const result = await ensureRigaPosaSeparata(supabase, {
    preventivoId: params.preventivoId,
    parentRigaId: params.parentRigaId,
    importoPosaTotale: importo,
    quantita: params.quantita,
    ordineDopo: params.ordineDopo,
  });

  if (result.id && !result.created) {
    const quantita = params.quantita > 0 ? params.quantita : 1;
    const { error: updateError } = await supabase
      .from("righe")
      .update({ quantita, prezzo_riga: importo })
      .eq("id", result.id)
      .eq("tipo_riga", "posa");
    if (updateError) throw new Error(updateError.message);
  }
}

async function deleteRigheByIds(
  supabase: SupabaseClient,
  ids: number[],
): Promise<void> {
  if (ids.length === 0) return;
  const { error: flagError } = await supabase
    .from("righe_flag")
    .delete()
    .in("riga_id", ids);
  if (flagError) throw new Error(flagError.message);
  const { error: deleteError } = await supabase
    .from("righe")
    .delete()
    .in("id", ids);
  if (deleteError) throw new Error(deleteError.message);
}

/**
 * Elimina righe tipo posa e riporta i prodotti padre a posa inclusa
 * (evita perdita dell'importo posa_importo sul prodotto).
 */
export async function eliminaRighePosaERipristinaParent(
  supabase: SupabaseClient,
  posaIds: number[],
): Promise<void> {
  if (posaIds.length === 0) return;

  const { data: posaRows, error: findError } = await supabase
    .from("righe")
    .select("id, parent_riga_id")
    .in("id", posaIds)
    .eq("tipo_riga", "posa");
  if (findError) throw new Error(findError.message);
  if (!posaRows?.length) return;

  const ids = posaRows.map((r) => r.id);
  const parentIds = [
    ...new Set(
      posaRows
        .map((r) => r.parent_riga_id)
        .filter((id): id is number => id != null),
    ),
  ];

  await deleteRigheByIds(supabase, ids);

  if (parentIds.length > 0) {
    const { error: updateError } = await supabase
      .from("righe")
      .update({ posa_riga_separata: false })
      .in("id", parentIds);
    if (updateError) throw new Error(updateError.message);
  }
}

/**
 * Rimuove righe posa orfane o incongruenti rispetto al prodotto padre.
 * Vale per tutte le categorie (Serramenti, Persiane, Porte, …).
 * - parent mancante / parent senza posa separata attiva → elimina figlia
 * - parent con posa separata → aggiorna qty/importo figlia
 */
export async function pulisciRighePosaPreventivo(
  supabase: SupabaseClient,
  preventivoId: number | string,
): Promise<{ removed: number; updated: number }> {
  const pid = Number(preventivoId);
  const { data: rows, error } = await supabase
    .from("righe")
    .select(
      "id, tipo_riga, parent_riga_id, quantita, posa, posa_importo, posa_riga_separata, prezzo_riga",
    )
    .eq("preventivo_id", pid);

  if (error) throw new Error(error.message);

  const all = rows ?? [];
  const byId = new Map(all.map((r) => [r.id, r]));
  const posaRows = all.filter((r) => r.tipo_riga === "posa");

  const toRemove: number[] = [];
  let updated = 0;

  for (const posa of posaRows) {
    const parent =
      posa.parent_riga_id != null ? byId.get(posa.parent_riga_id) : null;
    const parentOk =
      parent != null &&
      parent.tipo_riga !== "posa" &&
      parent.tipo_riga !== "testo" &&
      parent.posa === true &&
      parent.posa_riga_separata === true &&
      Number(parent.posa_importo) > 0;

    if (!parentOk) {
      toRemove.push(posa.id);
      continue;
    }

    const quantita = Number(parent.quantita) > 0 ? Number(parent.quantita) : 1;
    const importo = Number(parent.posa_importo);
    const qtyDiff = Number(posa.quantita) !== quantita;
    const prezzoDiff = Number(posa.prezzo_riga) !== importo;
    if (qtyDiff || prezzoDiff) {
      const { error: updateError } = await supabase
        .from("righe")
        .update({ quantita, prezzo_riga: importo })
        .eq("id", posa.id);
      if (updateError) throw new Error(updateError.message);
      updated += 1;
    }
  }

  if (toRemove.length > 0) {
    await deleteRigheByIds(supabase, toRemove);
  }

  return { removed: toRemove.length, updated };
}
