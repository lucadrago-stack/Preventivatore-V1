import type { SupabaseClient } from "@supabase/supabase-js";

/** Prossimo numero_posizione univoco per preventivo (max + 1). */
export async function prossimoNumeroPosizione(
  supabase: SupabaseClient,
  preventivoId: number | string,
): Promise<number> {
  const { data, error } = await supabase
    .from("righe")
    .select("numero_posizione")
    .eq("preventivo_id", preventivoId)
    .not("numero_posizione", "is", null)
    .order("numero_posizione", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);

  const max = data?.[0]?.numero_posizione;
  return (typeof max === "number" && Number.isFinite(max) ? max : 0) + 1;
}

export type ModalitaMq = "misure" | "diretti";

export function normalizzaModalitaMq(
  value: string | null | undefined,
): ModalitaMq {
  return value === "diretti" ? "diretti" : "misure";
}
