/** Regole di trasformazione listino/costo → prezzo BDS (prodotti a prezzo digitato). */

export type RegolaPrezzo = "diretto" | "sconto_listino" | "moltiplicatore";

export type ConfigRegolaPrezzo = {
  regola: RegolaPrezzo;
  valore: number | null;
  etichetta: string | null;
};

export function normalizzaRegolaPrezzo(
  value: string | null | undefined,
): RegolaPrezzo {
  if (value === "sconto_listino" || value === "moltiplicatore") return value;
  return "diretto";
}

/** Legge regola/etichetta dal prodotto (o da un record con le stesse colonne). */
export function configRegolaPrezzoDa(raw: {
  regola_prezzo?: string | null;
  regola_valore?: number | null;
  etichetta_prezzo?: string | null;
} | null | undefined): ConfigRegolaPrezzo {
  return {
    regola: normalizzaRegolaPrezzo(raw?.regola_prezzo),
    valore:
      raw?.regola_valore != null && Number.isFinite(Number(raw.regola_valore))
        ? Number(raw.regola_valore)
        : null,
    etichetta: raw?.etichetta_prezzo?.trim() || null,
  };
}

/** Prezzo BDS a partire dal valore digitato dal commerciale. */
export function applicaRegolaPrezzo(
  prezzoInserito: number,
  regola: RegolaPrezzo,
  valore: number | null | undefined,
): number {
  if (!Number.isFinite(prezzoInserito) || prezzoInserito <= 0) return 0;

  if (regola === "sconto_listino") {
    const sconto = Number(valore ?? 0);
    if (!Number.isFinite(sconto) || sconto < 0) return prezzoInserito;
    return prezzoInserito * (1 - sconto / 100);
  }

  if (regola === "moltiplicatore") {
    const moltiplicatore = Number(valore ?? 1);
    if (!Number.isFinite(moltiplicatore) || moltiplicatore <= 0) {
      return prezzoInserito;
    }
    return prezzoInserito * moltiplicatore;
  }

  return prezzoInserito;
}

/**
 * Inverso: da prezzo BDS al valore fornitore (campo A).
 * sconto_listino: inserito = BDS / (1 − valore/100)
 * moltiplicatore: inserito = BDS / valore
 */
export function invertiRegolaPrezzo(
  prezzoBds: number,
  regola: RegolaPrezzo,
  valore: number | null | undefined,
): number {
  if (!Number.isFinite(prezzoBds) || prezzoBds <= 0) return 0;

  if (regola === "sconto_listino") {
    const sconto = Number(valore ?? 0);
    const fattore = 1 - sconto / 100;
    if (!Number.isFinite(fattore) || fattore <= 0) return prezzoBds;
    return prezzoBds / fattore;
  }

  if (regola === "moltiplicatore") {
    const moltiplicatore = Number(valore ?? 1);
    if (!Number.isFinite(moltiplicatore) || moltiplicatore <= 0) {
      return prezzoBds;
    }
    return prezzoBds / moltiplicatore;
  }

  return prezzoBds;
}

/** Stringa per input numerico (centesimi, senza artefatti float). */
export function formatImportoCampo(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export function etichettaCampoPrezzoDigitato(
  config: ConfigRegolaPrezzo | null | undefined,
): string {
  if (config?.etichetta?.trim()) return config.etichetta.trim();
  if (config?.regola === "sconto_listino") return "Prezzo listino fornitore";
  if (config?.regola === "moltiplicatore") return "Costo netto fornitore";
  return "Prezzo";
}

function formatEuroBrief(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

/** Testo live sotto il campo: spiega listino/costo → BDS. */
export function spiegazioneRegolaPrezzo(
  prezzoInserito: number,
  regola: RegolaPrezzo,
  valore: number | null | undefined,
): string | null {
  if (!Number.isFinite(prezzoInserito) || prezzoInserito <= 0) return null;

  const bds = applicaRegolaPrezzo(prezzoInserito, regola, valore);

  if (regola === "sconto_listino") {
    const sconto = Number(valore ?? 0);
    return `Listino ${formatEuroBrief(prezzoInserito)} − ${sconto}% = ${formatEuroBrief(bds)} prezzo BDS`;
  }

  if (regola === "moltiplicatore") {
    const moltiplicatore = Number(valore ?? 1);
    return `Costo ${formatEuroBrief(prezzoInserito)} × ${moltiplicatore} = ${formatEuroBrief(bds)} prezzo BDS`;
  }

  return `Prezzo BDS ${formatEuroBrief(bds)} (nessuna trasformazione)`;
}

/**
 * Stesso schema di sconto_listino, etichetta "Prezzo da griglia".
 * listino = interpolazione (+ extra colore); BDS = listino × (1 − sconto%/100).
 */
export function spiegazionePrezzoGriglia(
  prezzoListinoGriglia: number,
  scontoPerc: number | null | undefined,
): string | null {
  if (!Number.isFinite(prezzoListinoGriglia) || prezzoListinoGriglia <= 0) {
    return null;
  }
  const sconto = Number(scontoPerc ?? 0);
  const bds = applicaRegolaPrezzo(
    prezzoListinoGriglia,
    "sconto_listino",
    sconto,
  );
  if (Number.isFinite(sconto) && sconto > 0) {
    return `Prezzo da griglia ${formatEuroBrief(prezzoListinoGriglia)} − ${sconto}% = ${formatEuroBrief(bds)} Prezzo BDS`;
  }
  return `Prezzo da griglia ${formatEuroBrief(prezzoListinoGriglia)} = ${formatEuroBrief(bds)} Prezzo BDS`;
}

/** Serializza la regola effettivamente usata sulla riga (tracciabilità). */
export function serializzaRegolaApplicata(
  regola: RegolaPrezzo,
  valore: number | null | undefined,
): string {
  if (regola === "diretto") return "diretto";
  const v =
    valore != null && Number.isFinite(Number(valore)) ? Number(valore) : 0;
  return `${regola}:${v}`;
}

export function parseRegolaApplicata(
  raw: string | null | undefined,
): { regola: RegolaPrezzo; valore: number | null } | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (trimmed === "diretto") return { regola: "diretto", valore: null };

  const [tipo, resto] = trimmed.split(":");
  const regola = normalizzaRegolaPrezzo(tipo);
  if (regola === "diretto") return { regola: "diretto", valore: null };
  const valore = Number(resto);
  return {
    regola,
    valore: Number.isFinite(valore) ? valore : null,
  };
}

export function etichettaValoreRegola(regola: RegolaPrezzo): string {
  if (regola === "sconto_listino") return "Sconto %";
  if (regola === "moltiplicatore") return "Moltiplicatore";
  return "Valore";
}
