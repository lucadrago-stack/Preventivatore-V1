/**
 * Simulatore finanziamento: ammortamento francese + regole BDS.
 * Tutti i parametri arrivano da config_finanziamento / convenzioni_finanziamento.
 */

export type ConfigFinanziamento = {
  soglia_tasso_zero_gratis: number;
  limite_finanziabile_20mesi: number;
  maggiorazione_perc: number;
  istruttoria: number;
  costo_dealer_perc: number;
  /** Percentuale detrazione fiscale (es. 50). */
  detrazione_perc: number;
};

export type TipoConvenzione = "tasso_zero" | "rate_lunghe";
export type RegolaMaggiorazione = "mai" | "sempre" | "sopra_soglia";
/** Famiglia convenzione in DB. */
export type FamigliaConvenzione = "base" | "tasso_zero" | "doppio_piano";
/** Toggle UI: quale famiglia alternativa (oltre a 'base') è visibile. */
export type FamigliaAlternativa = "tasso_zero" | "doppio_piano";

export type ConvenzioneFinanziamento = {
  id: number;
  durata_mesi: number;
  tan: number;
  tipo: TipoConvenzione;
  regola_maggiorazione: RegolaMaggiorazione;
  attivo: boolean;
  ordine: number;
  doppio_piano: boolean;
  tan_prima_meta: number | null;
  famiglia: FamigliaConvenzione;
};

export type DettaglioDoppioPiano = {
  capitaleMeta: number;
  rataPrimaMeta: number;
  rataSecondaMeta: number;
  tanPrimaMeta: number;
  tanSecondaMeta: number;
};

export type SimulazioneConvenzione = {
  convenzione: ConvenzioneFinanziamento;
  /** Base IVATO del preventivo (imponibile + IVA). */
  baseIvato: number;
  /** Prezzo contrattuale firmato dal cliente (può includere maggiorazione). */
  importoFatturato: number;
  maggiorazioneApplicata: boolean;
  maggiorazioneImporto: number;
  anticipo: number;
  /** Anticipo minimo richiesto (solo tasso zero sopra il limite). */
  anticipoMinimo: number;
  /**
   * Quota del prezzo fatturato non coperta dall'anticipo (SENZA istruttoria).
   * È ciò che BDS “mette in finanziamento” sul contratto, non include spese finanziarie.
   */
  importoFinanziato: number;
  /**
   * Capitale su cui si calcola la rata = importoFinanziato + istruttoria.
   * L'istruttoria è spesa della finanziaria, non fatturata da BDS.
   */
  capitaleRata: number;
  istruttoria: number;
  rataMensile: number;
  tan: number;
  durataMesi: number;
  /** Maggiorazione − costo dealer sull'importo finanziato. */
  margineBds: number;
  /** Se false, la convenzione non è utilizzabile con l'anticipo corrente. */
  possibile: boolean;
  messaggio: string | null;
  /** Valorizzato solo per convenzioni doppio_piano. */
  doppioPiano: DettaglioDoppioPiano | null;
};

export const CONFIG_KEYS = [
  "soglia_tasso_zero_gratis",
  "limite_finanziabile_20mesi",
  "maggiorazione_perc",
  "istruttoria",
  "costo_dealer_perc",
  "detrazione_perc",
] as const;

export const DEFAULT_FAMIGLIA_ALTERNATIVA: FamigliaAlternativa = "tasso_zero";

export function parseConfigFinanziamento(
  rows: Array<{ chiave: string; valore: number | string }>,
): ConfigFinanziamento {
  const map = new Map<string, number>();
  for (const row of rows) {
    const n = Number(row.valore);
    if (Number.isFinite(n)) map.set(row.chiave, n);
  }
  return {
    soglia_tasso_zero_gratis: map.get("soglia_tasso_zero_gratis") ?? 5000,
    limite_finanziabile_20mesi: map.get("limite_finanziabile_20mesi") ?? 9500,
    maggiorazione_perc: map.get("maggiorazione_perc") ?? 3.5,
    istruttoria: map.get("istruttoria") ?? 400,
    costo_dealer_perc: map.get("costo_dealer_perc") ?? 2.5,
    detrazione_perc: map.get("detrazione_perc") ?? 50,
  };
}

export function parseFamigliaAlternativa(
  raw: string | null | undefined,
): FamigliaAlternativa {
  if (raw === "doppio_piano") return "doppio_piano";
  return "tasso_zero";
}

export function normalizzaFamiglia(
  raw: string | null | undefined,
  doppioPiano: boolean,
  durataMesi: number,
): FamigliaConvenzione {
  if (raw === "base" || raw === "tasso_zero" || raw === "doppio_piano") {
    return raw;
  }
  if (doppioPiano) return "doppio_piano";
  if (durataMesi === 20) return "base";
  return "tasso_zero";
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Ammortamento francese: rata = C × i / (1 − (1+i)^(−n))
 * Se tan = 0 → rata = C / n
 */
export function calcolaRataFrancese(
  capitale: number,
  tanPercentuale: number,
  durataMesi: number,
): number {
  if (!Number.isFinite(capitale) || capitale <= 0) return 0;
  if (!Number.isFinite(durataMesi) || durataMesi <= 0) return 0;
  if (!Number.isFinite(tanPercentuale) || tanPercentuale <= 0) {
    return round2(capitale / durataMesi);
  }
  const i = tanPercentuale / 100 / 12;
  const fattore = 1 - Math.pow(1 + i, -durataMesi);
  if (fattore <= 0) return round2(capitale / durataMesi);
  return round2((capitale * i) / fattore);
}

export function applicaMaggiorazione(
  baseIvato: number,
  regola: RegolaMaggiorazione,
  maggiorazionePerc: number,
  soglia: number,
): { importoFatturato: number; applicata: boolean } {
  const base = Number.isFinite(baseIvato) ? Math.max(0, baseIvato) : 0;
  const perc = Number.isFinite(maggiorazionePerc) ? maggiorazionePerc : 0;

  if (regola === "mai") {
    return { importoFatturato: round2(base), applicata: false };
  }
  if (regola === "sempre") {
    return {
      importoFatturato: round2(base * (1 + perc / 100)),
      applicata: perc > 0,
    };
  }
  // sopra_soglia
  if (base <= soglia) {
    return { importoFatturato: round2(base), applicata: false };
  }
  return {
    importoFatturato: round2(base * (1 + perc / 100)),
    applicata: perc > 0,
  };
}

/**
 * Doppio piano: nessuna maggiorazione.
 * importoFinanziato = ivato − anticipo (senza istruttoria)
 * capitaleRata = importoFinanziato + istruttoria → solo per la rata
 * rata = francese(C/2, tan_prima_meta) + francese(C/2, tan)
 */
export function simulaDoppioPiano(params: {
  baseIvato: number;
  anticipo: number;
  convenzione: ConvenzioneFinanziamento;
  config: ConfigFinanziamento;
}): SimulazioneConvenzione {
  const { baseIvato, convenzione, config } = params;
  const anticipo = Math.max(0, Number(params.anticipo) || 0);
  const importoFatturato = round2(Math.max(0, baseIvato));
  const importoFinanziato = round2(Math.max(0, importoFatturato - anticipo));
  const capitaleRata = round2(importoFinanziato + config.istruttoria);
  const capitaleMeta = round2(capitaleRata / 2);
  const tanPrimaMeta = Number(convenzione.tan_prima_meta) || 0;
  const tanSecondaMeta = Number(convenzione.tan) || 0;

  const rataPrimaMeta = calcolaRataFrancese(
    capitaleMeta,
    tanPrimaMeta,
    convenzione.durata_mesi,
  );
  const rataSecondaMeta = calcolaRataFrancese(
    capitaleMeta,
    tanSecondaMeta,
    convenzione.durata_mesi,
  );
  const rataMensile = round2(rataPrimaMeta + rataSecondaMeta);

  const costoDealer = round2(
    (config.costo_dealer_perc / 100) * capitaleRata,
  );
  // Nessuna maggiorazione → margine = − costo dealer
  const margineBds = round2(0 - costoDealer);

  return {
    convenzione,
    baseIvato: round2(baseIvato),
    importoFatturato,
    maggiorazioneApplicata: false,
    maggiorazioneImporto: 0,
    anticipo: round2(anticipo),
    anticipoMinimo: 0,
    importoFinanziato,
    capitaleRata,
    istruttoria: config.istruttoria,
    rataMensile,
    tan: tanSecondaMeta,
    durataMesi: convenzione.durata_mesi,
    margineBds,
    possibile: true,
    messaggio: null,
    doppioPiano: {
      capitaleMeta,
      rataPrimaMeta,
      rataSecondaMeta,
      tanPrimaMeta,
      tanSecondaMeta,
    },
  };
}

/**
 * Simula una convenzione (famiglie base / tasso_zero).
 * L'anticipo riduce SOLO l'importo finanziato, mai il fatturato.
 */
export function simulaConvenzione(params: {
  baseIvato: number;
  anticipo: number;
  convenzione: ConvenzioneFinanziamento;
  config: ConfigFinanziamento;
  /** Se true, non applica la maggiorazione (contratto = base IVATO). */
  assorbiMaggiorazione?: boolean;
}): SimulazioneConvenzione {
  const { convenzione } = params;
  if (convenzione.doppio_piano || convenzione.famiglia === "doppio_piano") {
    return simulaDoppioPiano(params);
  }

  const { baseIvato, config } = params;
  const anticipo = Math.max(0, Number(params.anticipo) || 0);

  const { importoFatturato, applicata } = params.assorbiMaggiorazione
    ? { importoFatturato: round2(Math.max(0, baseIvato)), applicata: false }
    : applicaMaggiorazione(
        baseIvato,
        convenzione.regola_maggiorazione,
        config.maggiorazione_perc,
        config.soglia_tasso_zero_gratis,
      );
  const maggiorazioneImporto = round2(importoFatturato - baseIvato);

  let anticipoMinimo = 0;
  let possibile = true;
  let messaggio: string | null = null;

  // Quota del prezzo in finanziamento = fatturato − anticipo (senza istruttoria)
  const importoFinanziato = round2(Math.max(0, importoFatturato - anticipo));

  if (convenzione.tipo === "tasso_zero" || convenzione.famiglia === "base") {
    const limite = config.limite_finanziabile_20mesi;
    if (importoFinanziato > limite) {
      anticipoMinimo = round2(importoFatturato - limite);
      if (anticipo < anticipoMinimo) {
        possibile = false;
        messaggio = `Anticipo minimo richiesto: ${anticipoMinimo.toLocaleString("it-IT", {
          style: "currency",
          currency: "EUR",
        })} (limite finanziabile ${limite.toLocaleString("it-IT", {
          style: "currency",
          currency: "EUR",
        })})`;
      }
    }
  }

  // Istruttoria solo nel capitale per la rata (non fatturata da BDS)
  const capitaleRata = round2(importoFinanziato + config.istruttoria);

  const rataMensile = possibile
    ? calcolaRataFrancese(
        capitaleRata,
        convenzione.tan,
        convenzione.durata_mesi,
      )
    : 0;

  const costoDealer = round2(
    (config.costo_dealer_perc / 100) * capitaleRata,
  );
  const margineBds = round2(maggiorazioneImporto - costoDealer);

  return {
    convenzione,
    baseIvato: round2(baseIvato),
    importoFatturato,
    maggiorazioneApplicata: applicata,
    maggiorazioneImporto,
    anticipo: round2(anticipo),
    anticipoMinimo,
    importoFinanziato,
    capitaleRata,
    istruttoria: config.istruttoria,
    rataMensile,
    tan: convenzione.tan,
    durataMesi: convenzione.durata_mesi,
    margineBds,
    possibile,
    messaggio,
    doppioPiano: null,
  };
}

/** Convenzioni visibili: sempre 'base' + la famiglia alternativa selezionata. */
export function filtraConvenzioniPerFamiglia(
  convenzioni: ConvenzioneFinanziamento[],
  famigliaAlternativa: FamigliaAlternativa,
): ConvenzioneFinanziamento[] {
  return convenzioni.filter(
    (c) =>
      c.attivo &&
      (c.famiglia === "base" || c.famiglia === famigliaAlternativa),
  );
}

export function simulaTutteLeConvenzioni(params: {
  baseIvato: number;
  /** Anticipo unico (retrocompatibilità); ignorato se c'è anticipiPerId. */
  anticipo?: number;
  /** Anticipo per id convenzione. */
  anticipiPerId?: Record<number, number>;
  convenzioni: ConvenzioneFinanziamento[];
  config: ConfigFinanziamento;
  famigliaAlternativa?: FamigliaAlternativa;
  /** Se true, nessuna maggiorazione sul contratto. */
  assorbiMaggiorazione?: boolean;
}): SimulazioneConvenzione[] {
  const lista = params.famigliaAlternativa
    ? filtraConvenzioniPerFamiglia(
        params.convenzioni,
        params.famigliaAlternativa,
      )
    : params.convenzioni.filter((c) => c.attivo);

  return lista
    .slice()
    .sort((a, b) => a.ordine - b.ordine || a.durata_mesi - b.durata_mesi)
    .map((convenzione) => {
      const anticipo =
        params.anticipiPerId?.[convenzione.id] ?? params.anticipo ?? 0;
      return simulaConvenzione({
        baseIvato: params.baseIvato,
        anticipo,
        convenzione,
        config: params.config,
        assorbiMaggiorazione: params.assorbiMaggiorazione,
      });
    });
}

/**
 * Anticipo di default per una convenzione:
 * tasso zero oltre il limite → anticipo minimo (fatturato − limite);
 * altrimenti 0.
 */
export function anticipoDefaultPerConvenzione(
  baseIvato: number,
  convenzione: ConvenzioneFinanziamento,
  config: ConfigFinanziamento,
  assorbiMaggiorazione = false,
): number {
  if (convenzione.doppio_piano || convenzione.famiglia === "doppio_piano") {
    return 0;
  }
  const { importoFatturato } = assorbiMaggiorazione
    ? { importoFatturato: round2(Math.max(0, baseIvato)) }
    : applicaMaggiorazione(
        baseIvato,
        convenzione.regola_maggiorazione,
        config.maggiorazione_perc,
        config.soglia_tasso_zero_gratis,
      );
  if (convenzione.tipo === "tasso_zero" || convenzione.famiglia === "base") {
    const limite = config.limite_finanziabile_20mesi;
    if (importoFatturato > limite) {
      return round2(importoFatturato - limite);
    }
  }
  return 0;
}

/** Mappa id → anticipo di default per tutte le convenzioni attive. */
export function mappaAnticipiDefault(
  baseIvato: number,
  convenzioni: ConvenzioneFinanziamento[],
  config: ConfigFinanziamento,
  assorbiMaggiorazione = false,
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const c of convenzioni) {
    if (!c.attivo) continue;
    out[c.id] = anticipoDefaultPerConvenzione(
      baseIvato,
      c,
      config,
      assorbiMaggiorazione,
    );
  }
  return out;
}

/**
 * Default "mostra al cliente": tutte le durate della famiglia visualizzata
 * (base + famiglia alternativa) partono spuntate.
 */
export function defaultDurateMostrate(
  _baseIvato: number,
  convenzioni: ConvenzioneFinanziamento[],
  _soglia: number,
  famigliaAlternativa: FamigliaAlternativa = DEFAULT_FAMIGLIA_ALTERNATIVA,
): number[] {
  return filtraConvenzioniPerFamiglia(convenzioni, famigliaAlternativa).map(
    (c) => c.durata_mesi,
  );
}

/**
 * Default opzione scelta/evidenziata (una sola).
 * ≤ soglia → 20 mesi base; > soglia → nessuna (il commerciale sceglie).
 */
export function defaultDurataScelta(
  baseIvato: number,
  convenzioni: ConvenzioneFinanziamento[],
  soglia: number,
): number | null {
  if (baseIvato > soglia) return null;
  const base = convenzioni.find((c) => c.attivo && c.famiglia === "base");
  return base?.durata_mesi ?? null;
}

export function parseDurateMostrate(raw: string | null | undefined): number[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function serializzaDurateMostrate(durate: number[]): string {
  return [...new Set(durate)].sort((a, b) => a - b).join(",");
}

export function mapConvenzioneRow(
  row: Record<string, unknown>,
): ConvenzioneFinanziamento {
  const durata = Number(row.durata_mesi) || 0;
  const doppio = Boolean(row.doppio_piano);
  return {
    id: Number(row.id),
    durata_mesi: durata,
    tan: Number(row.tan) || 0,
    tipo: (row.tipo as TipoConvenzione) || "rate_lunghe",
    regola_maggiorazione:
      (row.regola_maggiorazione as RegolaMaggiorazione) || "mai",
    attivo: row.attivo !== false,
    ordine: Number(row.ordine) || 0,
    doppio_piano: doppio,
    tan_prima_meta:
      row.tan_prima_meta == null ? null : Number(row.tan_prima_meta),
    famiglia: normalizzaFamiglia(
      row.famiglia as string | null,
      doppio,
      durata,
    ),
  };
}

/** Titolo UI derivato dai campi DB (nessuna colonna etichetta). */
export function titoloConvenzione(c: ConvenzioneFinanziamento): string {
  if (c.famiglia === "base" || (c.tan === 0 && !c.doppio_piano)) {
    return `${c.durata_mesi} mesi tasso zero`;
  }
  if (c.doppio_piano || c.famiglia === "doppio_piano") {
    return `${c.durata_mesi} mesi doppio piano`;
  }
  if (c.famiglia === "tasso_zero") {
    return `${c.durata_mesi} mesi agevolato`;
  }
  return `${c.durata_mesi} mesi`;
}
