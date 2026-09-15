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
