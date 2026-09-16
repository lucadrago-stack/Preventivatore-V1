/** Totali preventivo: sconti a cascata, netto prodotti, IVA. */

export const IVA_ALIQUOTE = [10, 22, 4] as const;
export type IvaAliquota = (typeof IVA_ALIQUOTE)[number];

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parsePercentuale(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export type ParametriTotaliPreventivo = {
  prodottiLordi: number;
  sconto1: number;
  sconto2: number;
  totaleServizi: number;
  ivaPercentuale: number;
  /**
   * Se impostato (es. netto digitato dall'utente), viene usato come netto prodotti
   * esatto; lo sconto2 residuo assorbe eventuali errori di floating point.
   */
  nettoProdottiOverride?: number | null;
};

export type TotaliPreventivo = {
  prodottiLordi: number;
  sconto1: number;
  sconto2: number;
  dopoSconto1: number;
  importoSconto1: number;
  nettoProdotti: number;
  importoSconto2: number;
  totaleServizi: number;
  /** Imponibile = netto prodotti + servizi = totale chiavi in mano. */
  imponibile: number;
  ivaPercentuale: number;
  importoIva: number;
  totaleIvato: number;
};

/**
 * prodotti lordi → sconto1 → sconto2 → netto prodotti → + servizi
 * → imponibile (chiavi in mano) → + IVA → totale ivato
 */
export function calcolaTotaliPreventivo(
  params: ParametriTotaliPreventivo,
): TotaliPreventivo {
  const prodottiLordi = Number.isFinite(params.prodottiLordi)
    ? params.prodottiLordi
    : 0;
  const sconto1 = Number.isFinite(params.sconto1) ? params.sconto1 : 0;
  const sconto2 = Number.isFinite(params.sconto2) ? params.sconto2 : 0;
  const totaleServizi = Number.isFinite(params.totaleServizi)
    ? params.totaleServizi
    : 0;
  const ivaPercentuale = Number.isFinite(params.ivaPercentuale)
    ? params.ivaPercentuale
    : 10;

  const dopoSconto1 = prodottiLordi * (1 - sconto1 / 100);
  const nettoDaCascata = dopoSconto1 * (1 - sconto2 / 100);
  const override = params.nettoProdottiOverride;
  // Override 0 con prodotti > 0 è quasi sempre dato spurio (campo vuoto salvato
  // come 0): ignoralo e usa la cascata sconti.
  const usaOverride =
    override != null &&
    Number.isFinite(override) &&
    !(override <= 0 && prodottiLordi > 0);
  const nettoProdotti = usaOverride ? (override as number) : nettoDaCascata;
  const imponibile = nettoProdotti + totaleServizi;
  const importoIva = imponibile * (ivaPercentuale / 100);

  return {
    prodottiLordi,
    sconto1,
    sconto2,
    dopoSconto1,
    importoSconto1: prodottiLordi - dopoSconto1,
    nettoProdotti,
    importoSconto2: dopoSconto1 - nettoProdotti,
    totaleServizi,
    imponibile,
    ivaPercentuale,
    importoIva,
    totaleIvato: imponibile + importoIva,
  };
}

export type RisultatoRicalcoloSconto1 =
  | { ok: true; sconto1: number }
  | { ok: false; motivo: string };

/**
 * Inverso: il netto target è sui SOLI prodotti (prima dei servizi), IVA esclusa.
 * Lascia sconto2 fisso e ricava sconto1 a piena precisione (niente arrotondamento):
 *   netto = lordo × (1 − s1/100) × (1 − s2/100)
 *   s1% = (1 − netto / (lordo × (1 − s2/100))) × 100
 */
export function ricalcolaSconto1DaNetto(params: {
  prodottiLordi: number;
  sconto2: number;
  nettoTarget: number;
}): RisultatoRicalcoloSconto1 {
  const { prodottiLordi, sconto2, nettoTarget } = params;

  if (!(prodottiLordi > 0) || !Number.isFinite(prodottiLordi)) {
    return { ok: false, motivo: "importo non raggiungibile" };
  }
  if (!Number.isFinite(nettoTarget) || nettoTarget < 0) {
    return { ok: false, motivo: "importo non raggiungibile" };
  }

  const fattoreSconto2 = 1 - sconto2 / 100;
  if (!(fattoreSconto2 > 0)) {
    return { ok: false, motivo: "importo non raggiungibile" };
  }

  const baseDopoSconto2 = prodottiLordi * fattoreSconto2;
  if (!(baseDopoSconto2 > 0)) {
    return { ok: false, motivo: "importo non raggiungibile" };
  }

  const sconto1 = (1 - nettoTarget / baseDopoSconto2) * 100;

  /** Limite ragionevole: sconto negativo o > 50% → non raggiungibile. */
  if (sconto1 < 0 || sconto1 > 50) {
    return { ok: false, motivo: "importo non raggiungibile" };
  }

  return { ok: true, sconto1 };
}

export function isIvaAliquota(n: number): n is IvaAliquota {
  return (IVA_ALIQUOTE as readonly number[]).includes(n);
}

/** Soglia oltre la quale avvisare (non blocca il salvataggio). */
export const SCONTO_MAX_CONSIGLIATO = 20;

export const MESSAGGIO_SCONTO_OLTRE_MAX =
  "Lo sconto massimo è del 20%. Sconti maggiori devono essere concordati con l'amministrazione preventivamente.";

/** Sconto complessivo a cascata: 1 − (1−s1/100)×(1−s2/100). */
export function scontoEffettivoPercentuale(
  sconto1: number,
  sconto2: number,
): number {
  const s1 = Number.isFinite(sconto1) ? sconto1 : 0;
  const s2 = Number.isFinite(sconto2) ? sconto2 : 0;
  return (1 - (1 - s1 / 100) * (1 - s2 / 100)) * 100;
}

export function isScontoOltreMassimoConsigliato(
  sconto1: number,
  sconto2: number,
): boolean {
  return scontoEffettivoPercentuale(sconto1, sconto2) > SCONTO_MAX_CONSIGLIATO;
}

/** Chiave stabile per non ripetere lo stesso avviso in loop. */
export function chiaveAvvisoSconto(sconto1: number, sconto2: number): string {
  return `${round2(sconto1)}|${round2(sconto2)}`;
}
