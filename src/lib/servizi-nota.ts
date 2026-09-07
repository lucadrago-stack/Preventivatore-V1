import { formatEuro } from "@/lib/format";

/** Normalizza SI/NO legacy → etichette leggibili in PDF/UI. */
export function etichettaNotaServizio(
  nota: string | null | undefined,
): string {
  const n = (nota ?? "").trim();
  if (!n) return "—";
  if (/^no$/i.test(n)) return "Non previsto";
  if (/^si$/i.test(n)) return "PREVISTO";
  return n;
}

/** True se la nota indica servizio previsto/incluso (anche SI legacy). */
export function isNotaServizioPrevisto(
  nota: string | null | undefined,
): boolean {
  const n = (nota ?? "").trim();
  return /incluso|^\s*si\s*$|^previsto$/i.test(n);
}

/** True se la nota indica omaggio a importo zero (es. Tiro al piano). */
export function isNotaServizioOmaggio(
  nota: string | null | undefined,
): boolean {
  return /^se\s+previsto$/i.test((nota ?? "").trim());
}

/**
 * Etichetta colonna IMPORTO nei servizi complementari (PDF).
 * importo > 0 → euro; 0 + "SE PREVISTO" → OMAGGIO; 0 + previsto → INCLUSO; altrimenti —.
 */
export function etichettaImportoServizio(
  importo: number | null | undefined,
  nota: string | null | undefined,
): string {
  const value = Number(importo);
  if (Number.isFinite(value) && value !== 0) {
    return formatEuro(value);
  }
  if (isNotaServizioOmaggio(nota)) return "OMAGGIO";
  if (isNotaServizioPrevisto(nota)) return "INCLUSO";
  return "—";
}
