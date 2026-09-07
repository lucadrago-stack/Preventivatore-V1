/** Posa avanzata: Serramenti, Persiane (e scuri), Porte interne, Porte blindate. */

/** Varianti Serramenti (tipo cantiere). */
export type TipoCantiere = "ristrutturazione" | "nuovo";

/** Tutti i valori salvabili in righe.posa_tipo. */
export type PosaTipo = TipoCantiere | "meccanica" | "a_murare";

export type PosaModalita = "inclusa" | "separata";

export const CATEGORIE_POSA_AVANZATA = [
  "Serramenti",
  "Persiane",
  "Persiane e scuri",
  "Porte interne",
  "Porte blindate",
] as const;

export type NomeCategoriaPosaAvanzata =
  (typeof CATEGORIE_POSA_AVANZATA)[number];

export type VariantePosa = {
  tipo: PosaTipo;
  etichetta: string;
  prezzoUnitario: number;
};

export type ConfigVariantiPosa = {
  /** Titolo del gruppo radio (es. "Tipo cantiere", "Tipo posa"). */
  titoloScelta: string;
  defaultTipo: PosaTipo;
  varianti: VariantePosa[];
};

/**
 * Categorie con scelta aggiuntiva di variante posa (€/pz).
 * Persiane e Porte interne: la tariffa è sul prodotto, nessuna scelta qui.
 */
export const VARIANTI_POSA_PER_CATEGORIA: Record<string, ConfigVariantiPosa> = {
  serramenti: {
    titoloScelta: "Tipo cantiere",
    defaultTipo: "ristrutturazione",
    varianti: [
      {
        tipo: "ristrutturazione",
        etichetta: "Ristrutturazione",
        prezzoUnitario: 230,
      },
      { tipo: "nuovo", etichetta: "Nuovo", prezzoUnitario: 215 },
    ],
  },
  "porte blindate": {
    titoloScelta: "Tipo posa",
    defaultTipo: "meccanica",
    varianti: [
      {
        tipo: "meccanica",
        etichetta: "Posa meccanica",
        prezzoUnitario: 280,
      },
      {
        tipo: "a_murare",
        etichetta: "Posa a murare",
        prezzoUnitario: 470,
      },
    ],
  },
};

/** Compatibilità: tariffe Serramenti. */
export const POSA_SERRAMENTI_UNITARIO: Record<TipoCantiere, number> = {
  ristrutturazione:
    VARIANTI_POSA_PER_CATEGORIA.serramenti.varianti.find(
      (v) => v.tipo === "ristrutturazione",
    )!.prezzoUnitario,
  nuovo: VARIANTI_POSA_PER_CATEGORIA.serramenti.varianti.find(
    (v) => v.tipo === "nuovo",
  )!.prezzoUnitario,
};

function normalizzaNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().toLowerCase();
}

export function isCategoriaPosaAvanzata(
  nomeCategoria: string | null | undefined,
): boolean {
  const n = normalizzaNome(nomeCategoria);
  if (n.startsWith("persiane")) return true;
  return CATEGORIE_POSA_AVANZATA.some((c) => c.toLowerCase() === n);
}

export function isSerramenti(nomeCategoria: string | null | undefined): boolean {
  return normalizzaNome(nomeCategoria) === "serramenti";
}

export function isPorteBlindate(
  nomeCategoria: string | null | undefined,
): boolean {
  return normalizzaNome(nomeCategoria) === "porte blindate";
}

export function configVariantiPosa(
  nomeCategoria: string | null | undefined,
): ConfigVariantiPosa | null {
  return VARIANTI_POSA_PER_CATEGORIA[normalizzaNome(nomeCategoria)] ?? null;
}

export function haVariantiPosa(
  nomeCategoria: string | null | undefined,
): boolean {
  return configVariantiPosa(nomeCategoria) != null;
}

export function posaTipoDefault(
  nomeCategoria: string | null | undefined,
): PosaTipo {
  return configVariantiPosa(nomeCategoria)?.defaultTipo ?? "ristrutturazione";
}

/** Valida un posa_tipo rispetto alla categoria; altrimenti torna il default. */
export function normalizzaPosaTipo(
  nomeCategoria: string | null | undefined,
  value: string | null | undefined,
): PosaTipo {
  const config = configVariantiPosa(nomeCategoria);
  if (!config) return posaTipoDefault(nomeCategoria);
  if (config.varianti.some((v) => v.tipo === value)) {
    return value as PosaTipo;
  }
  return config.defaultTipo;
}

/** Scelta inclusa/separata: tutte le categorie a posa avanzata. */
export function haSceltaVisualizzazionePosa(
  nomeCategoria: string | null | undefined,
): boolean {
  return isCategoriaPosaAvanzata(nomeCategoria);
}

/** @deprecated Usa isCategoriaPosaAvanzata / isSerramenti */
export function isCategoriaInfissi(
  nomeCategoria: string | null | undefined,
): boolean {
  return (
    isSerramenti(nomeCategoria) ||
    normalizzaNome(nomeCategoria) === "infissi"
  );
}

export function prezzoPosaUnitario(params: {
  nomeCategoria: string | null | undefined;
  posaTipo: PosaTipo;
  prodottoPosaPrezzo: number | null | undefined;
}): number {
  const config = configVariantiPosa(params.nomeCategoria);
  if (config) {
    const variante =
      config.varianti.find((v) => v.tipo === params.posaTipo) ??
      config.varianti.find((v) => v.tipo === config.defaultTipo);
    return variante?.prezzoUnitario ?? 0;
  }
  return Number(params.prodottoPosaPrezzo ?? 0);
}

export function calcolaPosaImporto(
  prezzoUnitario: number,
  quantita: number,
): number {
  return prezzoUnitario * quantita;
}

export function importoRigaCompleto(
  prezzoRiga: number | null | undefined,
  posaImporto: number | null | undefined,
): number {
  return (prezzoRiga ?? 0) + (posaImporto ?? 0);
}

/** @deprecated Prefer config `descrizione_posa_default` / `caricaDescrizionePosaDefault`. */
export function descrizionePosaSeparata(_nomeProdotto?: string): string {
  return (
    "POSA IN OPERA\n" +
    "IN RISTRUTTURAZIONE SENZA OPERE MURARIE CON SISTEMA POSACLIMA CERTIFICATO"
  );
}

export type RigaConPosaDisplay = {
  tipo_riga: string;
  visibile_pdf?: boolean;
  prezzo_riga: number | null;
  posa_importo: number | null;
  /** true se la categoria usa posa avanzata e la posa è inclusa */
  posa_inclusa: boolean;
  posa_riga_separata: boolean;
  nome_prodotto: string | null;
  quantita: number;
  descrizione: string;
  nota: string;
  testo_libero?: string;
  key: string;
};

export type RigaEspansaDisplay = {
  key: string;
  tipo_riga: "prodotto" | "testo" | "posa";
  quantita: number;
  /** Es. "TOT." sulle righe posa/smontaggio stile cartaceo. */
  quantitaEtichetta?: string;
  descrizione: string;
  testo_libero: string;
  nota: string;
  prezzo_riga: number | null;
  importo_display: number | null;
  /** Es. "INCLUSA" / "INCLUSO" al posto dell'importo. */
  importoEtichetta?: string;
  is_posa_virtuale: boolean;
};

/**
 * Prepara le righe per il PDF cliente.
 * Non aggiunge più le due voci virtuali "TOT. INCLUSA / INCLUSO" (PosaClima /
 * smontaggio): erano fake e non comparivano in Componi.
 * Posa reale in DB (`tipo_riga = posa`) e posa inclusa nell'importo prodotto restano.
 */
export function espandiRighePdfCartaceo(
  righe: RigaConPosaDisplay[],
): RigaEspansaDisplay[] {
  const risultato: RigaEspansaDisplay[] = [];

  for (const riga of righe) {
    if (riga.tipo_riga === "testo") {
      risultato.push({
        key: riga.key,
        tipo_riga: "testo",
        quantita: 0,
        descrizione: "",
        testo_libero: riga.testo_libero ?? "",
        nota: "",
        prezzo_riga: null,
        importo_display: null,
        is_posa_virtuale: false,
      });
      continue;
    }

    // Riga posa reale in DB: importo proprio, non virtuale.
    if (riga.tipo_riga === "posa") {
      risultato.push({
        key: riga.key,
        tipo_riga: "posa",
        quantita: riga.quantita,
        descrizione: riga.descrizione,
        testo_libero: "",
        nota: riga.nota,
        prezzo_riga: riga.prezzo_riga,
        importo_display: riga.prezzo_riga,
        is_posa_virtuale: false,
      });
      continue;
    }

    // Posa separata: importo solo fornitura (la riga posa è indipendente).
    // Posa inclusa: somma prodotto+posa nel totale riga (senza voci fantasma).
    const posaSeparata = riga.posa_riga_separata === true;
    const posaImporto =
      riga.posa_inclusa && !posaSeparata && (riga.posa_importo ?? 0) > 0
        ? (riga.posa_importo ?? 0)
        : 0;

    risultato.push({
      key: riga.key,
      tipo_riga: "prodotto",
      quantita: riga.quantita,
      descrizione: riga.descrizione,
      testo_libero: "",
      nota: riga.nota,
      prezzo_riga: riga.prezzo_riga,
      importo_display:
        riga.prezzo_riga == null && posaImporto === 0
          ? null
          : importoRigaCompleto(riga.prezzo_riga, posaImporto),
      is_posa_virtuale: false,
    });
  }

  return risultato;
}

/**
 * Espande le righe per visualizzazione (legacy / non usato dal PDF attuale).
 * Non crea più righe virtuali: la posa separata è una riga reale in DB.
 */
export function espandiRigheConPosaSeparata(
  righe: RigaConPosaDisplay[],
): RigaEspansaDisplay[] {
  const risultato: RigaEspansaDisplay[] = [];

  for (const riga of righe) {
    if (riga.tipo_riga === "testo") {
      risultato.push({
        key: riga.key,
        tipo_riga: "testo",
        quantita: 0,
        descrizione: "",
        testo_libero: riga.testo_libero ?? "",
        nota: "",
        prezzo_riga: null,
        importo_display: null,
        is_posa_virtuale: false,
      });
      continue;
    }

    if (riga.tipo_riga === "posa") {
      risultato.push({
        key: riga.key,
        tipo_riga: "posa",
        quantita: riga.quantita,
        descrizione: riga.descrizione,
        testo_libero: "",
        nota: riga.nota,
        prezzo_riga: riga.prezzo_riga,
        importo_display: riga.prezzo_riga,
        is_posa_virtuale: false,
      });
      continue;
    }

    const posaImporto =
      riga.posa_inclusa && (riga.posa_importo ?? 0) > 0
        ? (riga.posa_importo ?? 0)
        : 0;

    risultato.push({
      key: riga.key,
      tipo_riga: "prodotto",
      quantita: riga.quantita,
      descrizione: riga.descrizione,
      testo_libero: "",
      nota: riga.nota,
      prezzo_riga: riga.prezzo_riga,
      importo_display:
        riga.posa_riga_separata === true
          ? riga.prezzo_riga
          : riga.prezzo_riga == null && posaImporto === 0
            ? null
            : importoRigaCompleto(riga.prezzo_riga, posaImporto),
      is_posa_virtuale: false,
    });
  }

  return risultato;
}

export function totaleImportoRigheVisibili(
  righe: Array<{
    tipo_riga: string;
    visibile_pdf?: boolean;
    prezzo_riga: number | null;
    posa_importo: number | null;
    /** Se true, posa_importo è su riga separata: non sommare qui. */
    posa_riga_separata?: boolean;
  }>,
): number {
  return righe.reduce((sum, riga) => {
    if (riga.tipo_riga === "testo" || riga.visibile_pdf === false) return sum;
    if (riga.tipo_riga === "posa" || riga.posa_riga_separata) {
      return sum + (riga.prezzo_riga ?? 0);
    }
    return sum + importoRigaCompleto(riga.prezzo_riga, riga.posa_importo);
  }, 0);
}

/** Compatibilità: non più usata per aggregato preventivo. */
export function totalePosaInfissiVisibili(): number {
  return 0;
}

export function importoVisualizzatoRiga(
  prezzoRiga: number | null,
  posaImporto: number | null,
  isPosaAvanzata: boolean,
  posaSeparata: boolean,
): number | null {
  if (prezzoRiga == null && !isPosaAvanzata) return null;
  if (!isPosaAvanzata) return prezzoRiga;
  if (posaSeparata) return prezzoRiga;
  return importoRigaCompleto(prezzoRiga, posaImporto);
}

export function formatPosaRiepilogo(riga: {
  posa: boolean;
  posa_importo: number | null;
  posa_riga_separata: boolean;
  posa_manuale?: boolean;
}): string {
  if (!riga.posa || riga.posa_importo == null) return "No";
  const modo = riga.posa_riga_separata ? "separata" : "inclusa";
  const man = riga.posa_manuale ? " · man." : "";
  return `${modo}${man}`;
}
