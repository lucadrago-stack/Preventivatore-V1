/**
 * Re-export compatibilità: la logica posa è in posa-categorie.ts
 * (Serramenti / Persiane / Porte interne / Porte blindate).
 */
export {
  calcolaPosaImporto as calcolaPosaImportoDefault,
  importoRigaCompleto,
  importoVisualizzatoRiga,
  isCategoriaInfissi,
  isCategoriaPosaAvanzata,
  isSerramenti,
  totaleImportoRigheVisibili,
  totalePosaInfissiVisibili,
  type PosaModalita,
  type TipoCantiere,
  type PosaTipo,
} from "@/lib/posa-categorie";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TipoCantiere } from "@/lib/posa-categorie";

/** Legacy no-op: la posa Serramenti è per-riga (posa_tipo), non più dal preventivo. */
export async function caricaTariffaPosaSerramenti(
  _supabase: SupabaseClient,
  tipoCantiere: TipoCantiere,
): Promise<number> {
  return tipoCantiere === "nuovo" ? 215 : 230;
}

export async function ricalcolaPoseInfissiPreventivo(
  _supabase: SupabaseClient,
  _preventivoId: string | number,
  _tipoCantiere: TipoCantiere,
): Promise<void> {
  // Intenzionalmente vuoto: ricalcolo gestito in form riga.
}
