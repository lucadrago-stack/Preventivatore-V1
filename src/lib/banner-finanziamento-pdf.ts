/**
 * Pagina PDF "Il tuo investimento":
 * - riquadro costo reale + dispersioni se detrazione_perc > 0
 * - banner finanziamento se finanziamento_attivo
 * Indipendenti; pagina solo se almeno uno è attivo.
 */

import {
  mappaAnticipiDefault,
  parseDurateMostrate,
  parseFamigliaAlternativa,
  simulaTutteLeConvenzioni,
  titoloConvenzione,
  type ConfigFinanziamento,
  type ConvenzioneFinanziamento,
  type FamigliaAlternativa,
  type SimulazioneConvenzione,
} from "@/lib/finanziamento";

/** Input unificato per la pagina investimento / finanziamento. */
export type DatiFinanziamentoPdfInput = {
  /** Percentuale detrazione sul preventivo (0 | 36 | 50, …). */
  detrazionePerc: number;
  finanziamentoAttivo: boolean;
  totaleIvato: number;
  /** Imponibile (IVA esclusa) per il calcolo detrazione. */
  imponibile: number;
  /** Dati finanziamento (richiesti solo se finanziamentoAttivo). */
  famiglia: FamigliaAlternativa;
  durateMostrate: number[];
  anticipoScelta: number;
  durataScelta: number | null;
  config: ConfigFinanziamento | null;
  convenzioni: ConvenzioneFinanziamento[];
};

export type CardDurataPdf = {
  titolo: string;
  durataMesi: number;
  rataMensile: number;
  tan: number;
  doppioPiano: boolean;
  tanPrimaMeta: number | null;
};

export type InvestimentoRealePdf = {
  totaleIvato: number;
  detrazionePerc: number;
  detrazione: number;
  detrazioneAnnuale: number;
  costoEffettivo: number;
};

export type FinanziamentoBannerPdf = {
  istruttoria: number;
  famigliaLabel: string;
  promo20: {
    anticipo: number;
    importoFinanziato: number;
    rataMensile: number;
  } | null;
  bloccoImportoFatturato: number;
  bloccoAnticipo: number;
  cardsFamiglia: CardDurataPdf[];
};

export type PaginaInvestimentoPdfModel = {
  mostraInvestimento: boolean;
  mostraFinanziamento: boolean;
  investimento: InvestimentoRealePdf | null;
  finanziamento: FinanziamentoBannerPdf | null;
};

/** @deprecated alias: usa DatiFinanziamentoPdfInput.finanziamentoAttivo */
export type BannerFinanziamentoPdfModel = FinanziamentoBannerPdf & {
  totaleIvato: number;
  detrazionePerc: number;
  detrazione: number;
  detrazioneAnnuale: number;
  detrazioneMensile: number;
  costoEffettivo: number;
};

export function etichettaFamigliaPdf(famiglia: FamigliaAlternativa): string {
  if (famiglia === "doppio_piano") return "Doppio piano 60-120 mesi";
  return "Agevolato 36-60 mesi";
}

export function normalizzaDetrazionePerc(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Prepara i blocchi indipendenti della pagina.
 * Null solo se nessuno dei due va mostrato.
 */
export function preparaPaginaInvestimentoPdf(
  input: DatiFinanziamentoPdfInput,
): PaginaInvestimentoPdfModel | null {
  const detrazionePerc = normalizzaDetrazionePerc(input.detrazionePerc);
  const mostraInvestimento = detrazionePerc > 0;
  const mostraFinanziamento = Boolean(input.finanziamentoAttivo);

  if (!mostraInvestimento && !mostraFinanziamento) return null;

  let investimento: InvestimentoRealePdf | null = null;
  if (mostraInvestimento) {
    const detrazione =
      Math.round(input.imponibile * (detrazionePerc / 100) * 100) / 100;
    investimento = {
      totaleIvato: input.totaleIvato,
      detrazionePerc,
      detrazione,
      detrazioneAnnuale: Math.round((detrazione / 10) * 100) / 100,
      costoEffettivo:
        Math.round((input.totaleIvato - detrazione) * 100) / 100,
    };
  }

  let finanziamento: FinanziamentoBannerPdf | null = null;
  if (mostraFinanziamento && input.config) {
    finanziamento = preparaSoloFinanziamento(input, input.config);
  }

  return {
    mostraInvestimento,
    mostraFinanziamento,
    investimento,
    finanziamento,
  };
}

/** Retrocompat: prepara solo il banner finanziamento (o null). */
export function preparaBannerFinanziamentoPdf(
  input: DatiFinanziamentoPdfInput,
): BannerFinanziamentoPdfModel | null {
  const page = preparaPaginaInvestimentoPdf(input);
  if (!page?.finanziamento) return null;
  const inv = page.investimento;
  const f = page.finanziamento;
  return {
    ...f,
    totaleIvato: input.totaleIvato,
    detrazionePerc: inv?.detrazionePerc ?? normalizzaDetrazionePerc(input.detrazionePerc),
    detrazione: inv?.detrazione ?? 0,
    detrazioneAnnuale: inv?.detrazioneAnnuale ?? 0,
    detrazioneMensile: inv
      ? Math.round((inv.detrazione / 120) * 100) / 100
      : 0,
    costoEffettivo: inv?.costoEffettivo ?? input.totaleIvato,
  };
}

function preparaSoloFinanziamento(
  input: DatiFinanziamentoPdfInput,
  config: ConfigFinanziamento,
): FinanziamentoBannerPdf {
  const anticipi = mappaAnticipiDefault(
    input.totaleIvato,
    input.convenzioni,
    config,
  );

  if (input.durataScelta != null) {
    const scelta = input.convenzioni.find(
      (c) =>
        c.attivo &&
        c.durata_mesi === input.durataScelta &&
        (c.famiglia === "base" || c.famiglia === input.famiglia),
    );
    if (scelta) {
      anticipi[scelta.id] = Math.max(0, input.anticipoScelta);
    }
  }

  const simulazioni = simulaTutteLeConvenzioni({
    baseIvato: input.totaleIvato,
    anticipiPerId: anticipi,
    convenzioni: input.convenzioni,
    config,
    famigliaAlternativa: input.famiglia,
  });

  const mostrate = new Set(input.durateMostrate);
  const visibili = simulazioni.filter(
    (s) => s.possibile && mostrate.has(s.durataMesi),
  );

  const promoSim =
    visibili.find(
      (s) =>
        s.convenzione.famiglia === "base" ||
        (s.durataMesi === 20 && !s.convenzione.doppio_piano),
    ) ?? null;

  const famigliaSims = visibili.filter(
    (s) => s.convenzione.famiglia === input.famiglia,
  );

  const refBlocco =
    famigliaSims.find((s) => s.durataMesi === input.durataScelta) ??
    famigliaSims[0] ??
    null;

  return {
    istruttoria: config.istruttoria,
    famigliaLabel: etichettaFamigliaPdf(input.famiglia),
    promo20: promoSim
      ? {
          anticipo: promoSim.anticipo,
          importoFinanziato: promoSim.importoFinanziato,
          rataMensile: promoSim.rataMensile,
        }
      : null,
    bloccoImportoFatturato: refBlocco?.importoFatturato ?? input.totaleIvato,
    bloccoAnticipo: refBlocco?.anticipo ?? 0,
    cardsFamiglia: famigliaSims.map((s) => cardDaSim(s)),
  };
}

function cardDaSim(s: SimulazioneConvenzione): CardDurataPdf {
  return {
    titolo: titoloConvenzione(s.convenzione),
    durataMesi: s.durataMesi,
    rataMensile: s.rataMensile,
    tan: s.tan,
    doppioPiano: Boolean(s.doppioPiano),
    tanPrimaMeta: s.doppioPiano?.tanPrimaMeta ?? null,
  };
}

export function parseFinanziamentoDaPreventivo(row: {
  finanziamento_attivo?: boolean | null;
  finanziamento_anticipo?: number | null;
  finanziamento_durate_mostrate?: string | null;
  fin_famiglia?: string | null;
  fin_durata_scelta?: number | null;
  detrazione_perc?: number | null;
}): {
  attivo: boolean;
  anticipoScelta: number;
  durateMostrate: number[];
  famiglia: FamigliaAlternativa;
  durataScelta: number | null;
  detrazionePerc: number;
} {
  return {
    attivo: Boolean(row.finanziamento_attivo),
    anticipoScelta: Number(row.finanziamento_anticipo) || 0,
    durateMostrate: parseDurateMostrate(row.finanziamento_durate_mostrate),
    famiglia: parseFamigliaAlternativa(row.fin_famiglia),
    durataScelta: row.fin_durata_scelta ?? null,
    detrazionePerc: normalizzaDetrazionePerc(row.detrazione_perc),
  };
}
