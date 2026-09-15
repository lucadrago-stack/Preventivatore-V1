/**
 * Utility di formattazione condivise.
 */

/** Formatta un numero come valuta EUR italiana (es. "€ 1.234,56"). */
export function formatEuro(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

/**
 * Titolo UI preventivo: "Cliente - Riferimento" (come in home).
 * Se manca il cliente, resta solo il riferimento.
 */
export function titoloPreventivo(
  clienteNome: string | null | undefined,
  riferimento: string | null | undefined,
): string {
  const rif = (riferimento ?? "").trim();
  const cliente = (clienteNome ?? "").trim();
  if (cliente && rif) return `${cliente} - ${rif}`;
  return rif || cliente || "Preventivo";
}

/**
 * Normalizza il risultato di una relazione Supabase:
 * può arrivare come singolo oggetto, array con un elemento, o null.
 */
export function normalizzaRelazione<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
}

/** Formatta una data ISO come "3 settembre 2026". */
export function formatData(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Formatta una data ISO per un <input type="date"> ("2026-09-03"). */
export function formatDataPerInput(data: string | null): string {
  if (!data) return "";
  return data.slice(0, 10);
}

/** Data di oggi in formato <input type="date"> ("2026-09-14"). */
export function dataOggiPerInput(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Formatta data+ora come "03/09/2026 14:30". Usata per allegati e versioni. */
export function formatDataOra(data: string): string {
  return new Date(data).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Formatta data per documenti PDF: "3 settembre 2026". */
export function formatDataDocumento(data: string): string {
  if (!data) return "—";
  return new Date(data).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
