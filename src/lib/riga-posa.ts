import type { SupabaseClient } from "@supabase/supabase-js";
import { isCategoriaPosaAvanzata } from "@/lib/posa-categorie";

export const DESCRIZIONE_POSA_DEFAULT_FALLBACK =
  "POSA IN OPERA\nIN RISTRUTTURAZIONE SENZA OPERE MURARIE CON SISTEMA POSACLIMA CERTIFICATO";

export const CHIAVE_DESCRIZIONE_POSA = "descrizione_posa_default";

export const ETICHETTA_POSA_INCLUSA = "INCLUSA";

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

export type EnsureRigaPosaParams = {
  preventivoId: number;
  parentRigaId: number;
  /** Importo reale se separata; ignorato (forzato a 0) se inclusa. */
  importoPosaTotale: number;
  quantita: number;
  /** true = prezzo 0 + posa_inclusa_flag; false = importo a pagamento. */
  inclusa: boolean;
  ordineDopo?: number | null;
};

/**
 * Crea una riga tipo_riga='posa' collegata al prodotto via parent_riga_id.
 * Idempotente: se esiste già una posa con lo stesso parent, non ricrea
 * (restituisce l'id esistente; sync aggiorna importo/flag).
 */
export async function ensureRigaPosaSeparata(
  supabase: SupabaseClient,
  params: EnsureRigaPosaParams,
): Promise<{ created: boolean; id: number | null }> {
  const inclusa = params.inclusa === true;
  const importoRaw = Number(params.importoPosaTotale);
  const importo = inclusa
    ? 0
    : Number.isFinite(importoRaw) && importoRaw > 0
      ? importoRaw
      : NaN;

  if (!inclusa && !Number.isFinite(importo)) {
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
      prezzo_riga: inclusa ? 0 : importo,
      posa: false,
      posa_importo: null,
      posa_riga_separata: false,
      posa_inclusa_flag: inclusa,
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
 * Allinea la riga posa figlia al prodotto:
 * - posa attiva + separata → figlia con importo reale
 * - posa attiva + inclusa → figlia con prezzo 0 e posa_inclusa_flag
 * - posa disattiva → elimina figlia
 */
export async function syncRigaPosaSeparata(
  supabase: SupabaseClient,
  params: {
    preventivoId: number;
    parentRigaId: number;
    /** Posa attiva sul prodotto. */
    posaAttiva: boolean;
    /** true = riga a pagamento; false = INCLUSA (prezzo 0). */
    posaSeparata: boolean;
    importoPosaTotale: number;
    quantita: number;
    ordineDopo?: number | null;
  },
): Promise<void> {
  if (!params.posaAttiva) {
    await removeRigaPosaPerParent(supabase, params.parentRigaId);
    return;
  }

  const inclusa = !params.posaSeparata;
  const importo = Number(params.importoPosaTotale);

  if (!inclusa && !(Number.isFinite(importo) && importo > 0)) {
    await removeRigaPosaPerParent(supabase, params.parentRigaId);
    return;
  }

  const result = await ensureRigaPosaSeparata(supabase, {
    preventivoId: params.preventivoId,
    parentRigaId: params.parentRigaId,
    importoPosaTotale: inclusa ? 0 : importo,
    quantita: params.quantita,
    inclusa,
    ordineDopo: params.ordineDopo,
  });

  if (result.id) {
    const quantita = params.quantita > 0 ? params.quantita : 1;
    const { error: updateError } = await supabase
      .from("righe")
      .update({
        quantita,
        prezzo_riga: inclusa ? 0 : importo,
        posa_inclusa_flag: inclusa,
      })
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
 * Per ogni prodotto con posa attiva, crea o allinea la riga posa figlia.
 * Usato all'apertura Componi.
 */
export async function ensureFigliePosaMancanti(
  supabase: SupabaseClient,
  preventivoId: number | string,
): Promise<{ synced: number }> {
  const pid = Number(preventivoId);
  const { data: rows, error } = await supabase
    .from("righe")
    .select(
      `id, tipo_riga, parent_riga_id, quantita, posa, posa_importo, posa_riga_separata, ordine,
       prodotti(categorie(nome))`,
    )
    .eq("preventivo_id", pid);

  if (error) throw new Error(error.message);

  const all = rows ?? [];
  let synced = 0;

  for (const prodotto of all) {
    if (prodotto.tipo_riga === "posa" || prodotto.tipo_riga === "testo") {
      continue;
    }

    const prodottiRel = prodotto.prodotti as
      | { categorie: { nome: string } | { nome: string }[] | null }
      | { categorie: { nome: string } | { nome: string }[] | null }[]
      | null;
    const prod = Array.isArray(prodottiRel) ? prodottiRel[0] : prodottiRel;
    const catRel = prod?.categorie;
    const cat = Array.isArray(catRel) ? catRel[0] : catRel;
    const catNome = cat?.nome ?? null;
    const isAvanzata = isCategoriaPosaAvanzata(catNome);

    if (prodotto.posa === false) {
      // Posa spenta: eventuali figlie le toglie pulisciRighePosaPreventivo.
      continue;
    }
    if (prodotto.posa !== true && !(prodotto.posa == null && isAvanzata)) {
      continue;
    }

    if (prodotto.posa == null && isAvanzata) {
      const { error: updPosaErr } = await supabase
        .from("righe")
        .update({ posa: true, posa_riga_separata: false })
        .eq("id", prodotto.id);
      if (updPosaErr) throw new Error(updPosaErr.message);
    }

    // Sempre sync (crea o aggiorna qty/importo/flag): evita figlie stantie.
    await syncRigaPosaSeparata(supabase, {
      preventivoId: pid,
      parentRigaId: prodotto.id,
      posaAttiva: true,
      posaSeparata: prodotto.posa_riga_separata === true,
      importoPosaTotale: Number(prodotto.posa_importo ?? 0),
      quantita: Number(prodotto.quantita) || 1,
      ordineDopo:
        prodotto.ordine != null ? Number(prodotto.ordine) + 1 : null,
    });
    synced += 1;
  }

  return { synced };
}

/**
 * - Elimina figlie orfane (parent mancante / posa spenta sul padre)
 * - Una sola figlia per parent (tiene la più recente)
 * - Elimina posa "di sistema" senza parent se esiste già almeno una posa collegata
 *   (evita duplicati INCLUSA + vecchia riga a pagamento orfana)
 */
export async function pulisciRighePosaPreventivo(
  supabase: SupabaseClient,
  preventivoId: number | string,
): Promise<{ removed: number; updated: number }> {
  const pid = Number(preventivoId);
  const { data: rows, error } = await supabase
    .from("righe")
    .select(
      "id, tipo_riga, parent_riga_id, quantita, posa, posa_importo, posa_riga_separata, prezzo_riga, posa_inclusa_flag, descrizione_tecnica",
    )
    .eq("preventivo_id", pid);

  if (error) throw new Error(error.message);

  const all = rows ?? [];
  const byId = new Map(all.map((r) => [r.id, r]));
  const posaRows = all.filter((r) => r.tipo_riga === "posa");
  const toRemove = new Set<number>();

  // 1) Figlie con parent non valido
  for (const posa of posaRows) {
    const parentId = posa.parent_riga_id;
    if (parentId == null) continue;
    const parent = byId.get(parentId);
    const parentOk =
      parent != null &&
      parent.tipo_riga !== "posa" &&
      parent.tipo_riga !== "testo" &&
      parent.posa === true;
    if (!parentOk) toRemove.add(posa.id);
  }

  // 2) Più figlie sullo stesso parent → tieni solo la più recente (id max)
  const byParent = new Map<number, typeof posaRows>();
  for (const posa of posaRows) {
    if (posa.parent_riga_id == null || toRemove.has(posa.id)) continue;
    const list = byParent.get(posa.parent_riga_id) ?? [];
    list.push(posa);
    byParent.set(posa.parent_riga_id, list);
  }
  for (const list of byParent.values()) {
    if (list.length <= 1) continue;
    const sorted = [...list].sort((a, b) => b.id - a.id);
    for (const extra of sorted.slice(1)) {
      toRemove.add(extra.id);
    }
  }

  // 3) Orfane (parent null) "di sistema" se esiste già posa collegata a un prodotto
  const hasLinkedPosa = posaRows.some(
    (p) => p.parent_riga_id != null && !toRemove.has(p.id),
  );
  if (hasLinkedPosa) {
    for (const posa of posaRows) {
      if (posa.parent_riga_id != null || toRemove.has(posa.id)) continue;
      const tecnica = (posa.descrizione_tecnica ?? "").trim().toLowerCase();
      const isSistema =
        tecnica === "posa in opera" ||
        posa.posa_inclusa_flag === true ||
        Number(posa.prezzo_riga) === 0;
      if (isSistema) toRemove.add(posa.id);
    }
  }

  const ids = [...toRemove];
  if (ids.length > 0) {
    await deleteRigheByIds(supabase, ids);
  }

  return { removed: ids.length, updated: 0 };
}
