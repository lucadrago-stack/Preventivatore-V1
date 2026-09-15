/**
 * Prezzo da griglia listino (interpolazione bilineare).
 * Celle: griglie_prezzo_celle (larghezza, altezza in mm).
 */

export type TipologiaAperturaGriglia =
  | "finestra_1anta"
  | "finestra_2ante"
  | "finestra_3ante"
  | "fissa"
  | "portafinestra_1anta"
  | "portafinestra_2ante"
  | "portafinestra_3ante";

export const TIPOLOGIE_APERTURA_GRIGLIA: {
  value: TipologiaAperturaGriglia;
  label: string;
}[] = [
  { value: "finestra_1anta", label: "Finestra 1 anta" },
  { value: "finestra_2ante", label: "Finestra 2 ante" },
  { value: "finestra_3ante", label: "Finestra 3 ante" },
  { value: "fissa", label: "Fissa" },
  { value: "portafinestra_1anta", label: "Porta finestra 1 anta" },
  { value: "portafinestra_2ante", label: "Porta finestra 2 ante" },
  { value: "portafinestra_3ante", label: "Porta finestra 3 ante" },
];

export const EXTRA_COLORE_BIANCO_MASSA = {
  nome: "Bianco massa",
  percentuale: 0,
} as const;

export type CellaGrigliaPrezzo = {
  larghezza: number;
  altezza: number;
  prezzo: number;
};

/** Cella con tipologia (caricamento completo griglia multi-posizione). */
export type CellaGrigliaPrezzoConTipologia = CellaGrigliaPrezzo & {
  tipologia_apertura: string;
};

export type ExtraColoreGriglia = {
  nome: string;
  percentuale: number;
};

export type RisultatoInterpolazioneGriglia =
  | {
      ok: true;
      prezzoBase: number;
      angoli: CellaGrigliaPrezzo[];
    }
  | {
      ok: false;
      motivo: "fuori_range" | "celle_mancanti" | "nessuna_cella";
      lMin: number;
      lMax: number;
      hMin: number;
      hMax: number;
    };

export function isProdottoGriglia(prodotto: {
  regola_prezzo?: string | null;
  griglia_prezzo_id?: number | null;
}): boolean {
  return (
    prodotto.regola_prezzo === "griglia" &&
    prodotto.griglia_prezzo_id != null &&
    Number(prodotto.griglia_prezzo_id) > 0
  );
}

export function etichettaTipologiaApertura(
  value: string | null | undefined,
): string {
  if (!value) return "";
  const found = TIPOLOGIE_APERTURA_GRIGLIA.find((t) => t.value === value);
  return found?.label ?? value;
}

function uniqueSorted(nums: number[]): number[] {
  return [...new Set(nums)].sort((a, b) => a - b);
}

/** Due valori di asse che circondano v (o lo stesso se esatto). */
function bracketing(assi: number[], v: number): [number, number] | null {
  if (assi.length === 0) return null;
  if (v < assi[0] || v > assi[assi.length - 1]) return null;
  const exact = assi.find((a) => a === v);
  if (exact != null) return [exact, exact];
  let i = 0;
  while (i < assi.length - 1 && assi[i + 1] < v) i++;
  return [assi[i], assi[i + 1]];
}

function prezzoA(
  celle: Map<string, number>,
  L: number,
  H: number,
): number | null {
  const p = celle.get(`${L}x${H}`);
  return p == null || !Number.isFinite(p) ? null : p;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolazione bilineare su griglia discreta.
 * Prima lungo L a H_inf e H_sup, poi lungo H.
 */
export function interpolaPrezzoGriglia(
  celleRaw: CellaGrigliaPrezzo[],
  L: number,
  H: number,
): RisultatoInterpolazioneGriglia {
  if (celleRaw.length === 0) {
    return {
      ok: false,
      motivo: "nessuna_cella",
      lMin: 0,
      lMax: 0,
      hMin: 0,
      hMax: 0,
    };
  }

  const mappa = new Map<string, number>();
  for (const c of celleRaw) {
    mappa.set(`${c.larghezza}x${c.altezza}`, Number(c.prezzo));
  }

  const larghezze = uniqueSorted(celleRaw.map((c) => c.larghezza));
  const altezze = uniqueSorted(celleRaw.map((c) => c.altezza));
  const lMin = larghezze[0] ?? 0;
  const lMax = larghezze[larghezze.length - 1] ?? 0;
  const hMin = altezze[0] ?? 0;
  const hMax = altezze[altezze.length - 1] ?? 0;

  const bracketL = bracketing(larghezze, L);
  const bracketH = bracketing(altezze, H);
  if (!bracketL || !bracketH) {
    return { ok: false, motivo: "fuori_range", lMin, lMax, hMin, hMax };
  }

  const [L0, L1] = bracketL;
  const [H0, H1] = bracketH;

  const p00 = prezzoA(mappa, L0, H0);
  const p10 = prezzoA(mappa, L1, H0);
  const p01 = prezzoA(mappa, L0, H1);
  const p11 = prezzoA(mappa, L1, H1);

  if (p00 == null || p10 == null || p01 == null || p11 == null) {
    return { ok: false, motivo: "celle_mancanti", lMin, lMax, hMin, hMax };
  }

  const tL = L0 === L1 ? 0 : (L - L0) / (L1 - L0);
  const tH = H0 === H1 ? 0 : (H - H0) / (H1 - H0);

  const prezzoA_H0 = lerp(p00, p10, tL);
  const prezzoA_H1 = lerp(p01, p11, tL);
  const prezzoBase = lerp(prezzoA_H0, prezzoA_H1, tH);

  return {
    ok: true,
    prezzoBase: Math.round(prezzoBase * 100) / 100,
    angoli: [
      { larghezza: L0, altezza: H0, prezzo: p00 },
      { larghezza: L1, altezza: H0, prezzo: p10 },
      { larghezza: L0, altezza: H1, prezzo: p01 },
      { larghezza: L1, altezza: H1, prezzo: p11 },
    ],
  };
}

/** Unitario = base × (1 + extra%/100). Bianco massa → 0. */
export function prezzoUnitarioConExtraColore(
  prezzoBase: number,
  extraPerc: number,
): number {
  const p = prezzoBase * (1 + (Number(extraPerc) || 0) / 100);
  return Math.round(p * 100) / 100;
}

export function messaggioFuoriRangeGriglia(r: {
  lMin: number;
  lMax: number;
  hMin: number;
  hMax: number;
}): string {
  return `Misura non disponibile a listino per questa tipologia (range disponibile: L da ${r.lMin} a ${r.lMax} mm, H da ${r.hMin} a ${r.hMax} mm). Contattare l'ufficio tecnico per una quotazione dedicata.`;
}

function rigaMisuraGriglia(opts: {
  tipologiaApertura: string | null | undefined;
  larghezzaMm: number | null | undefined;
  altezzaMm: number | null | undefined;
  quantita?: number | null;
}): string | null {
  const tip = etichettaTipologiaApertura(opts.tipologiaApertura);
  const L = opts.larghezzaMm;
  const H = opts.altezzaMm;
  if (!tip || L == null || H == null) return null;
  const qty = Number(opts.quantita);
  const qtyPart =
    Number.isFinite(qty) && qty > 1 ? ` ×${Math.round(qty)}` : "";
  return `${tip} — ${L}×${H}mm${qtyPart}`;
}

function rigaExtraColoreGriglia(
  extraColoreNome: string | null | undefined,
  extraColorePercentuale: number | null | undefined,
): string | null {
  const extraNome = (extraColoreNome ?? "").trim();
  if (!extraNome) return null;
  if (extraNome === EXTRA_COLORE_BIANCO_MASSA.nome) {
    return EXTRA_COLORE_BIANCO_MASSA.nome;
  }
  const perc = Number(extraColorePercentuale) || 0;
  return perc > 0 ? `${extraNome} (+${perc}%)` : extraNome;
}

/** Riga note PDF: "Finestra 2 ante — 1200×1400mm — Pellicolato standard (+15%)" */
export function rigaNotaGriglia(opts: {
  tipologiaApertura: string | null | undefined;
  larghezzaMm: number | null | undefined;
  altezzaMm: number | null | undefined;
  extraColoreNome: string | null | undefined;
  extraColorePercentuale: number | null | undefined;
}): string | null {
  const misura = rigaMisuraGriglia(opts);
  if (!misura) return null;
  const extra = rigaExtraColoreGriglia(
    opts.extraColoreNome,
    opts.extraColorePercentuale,
  );
  return extra ? `${misura} — ${extra}` : misura;
}

/**
 * Note griglia per riga aggregata multi-posizione:
 * una riga per posizione (tipologia + mm), extra colore una sola volta in coda.
 */
export function notaGrigliaPosizioniAggregate(
  posizioni: Array<{
    tipologiaApertura?: string | null;
    larghezzaMm?: number | null;
    altezzaMm?: number | null;
    quantita?: number | null;
  }>,
  extraColoreNome?: string | null,
  extraColorePercentuale?: number | null,
): string | null {
  const misure = posizioni
    .map((p) =>
      rigaMisuraGriglia({
        tipologiaApertura: p.tipologiaApertura,
        larghezzaMm: p.larghezzaMm,
        altezzaMm: p.altezzaMm,
        quantita: p.quantita,
      }),
    )
    .filter((s): s is string => Boolean(s));
  if (misure.length === 0) return null;
  const extra = rigaExtraColoreGriglia(
    extraColoreNome,
    extraColorePercentuale,
  );
  return extra ? [...misure, extra].join("\n") : misure.join("\n");
}
