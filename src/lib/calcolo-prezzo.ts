type TipoPrezzo = "mq" | "pezzo" | "ml";
export type TipoFlag = "fisso" | "percentuale" | "mq";

export type ProdottoCalcolo = {
  tipo_prezzo: TipoPrezzo;
  prezzo_unitario: number;
  minimo: number | null;
  posa_prezzo: number | null;
};

export type MisureRiga = {
  larghezza_cm?: number | null;
  altezza_cm?: number | null;
  lunghezza_cm?: number | null;
};

export type FlagCalcolo = {
  tipo: TipoFlag;
  valore: number;
};

export type ParametriCalcoloRiga = {
  prodotto: ProdottoCalcolo;
  misure: MisureRiga;
  quantita: number;
  /** Flag "Includi posa" */
  posa: boolean;
  flags: FlagCalcolo[];
  /** Listino fornitore digitato (solo pezzo con prezzo_unitario = 0). */
  prezzoDigitato?: number | null;
  /**
   * true = categorie a posa avanzata: posa in posa_importo, non in prezzo_riga.
   * false = complementi: posa inclusa in prezzo_riga.
   */
  posaInCampoSeparato?: boolean;
  /**
   * Tariffa posa €/pz da usare (serramenti 230/215, oppure prodotto.posa_prezzo).
   * Se omessa, si usa prodotto.posa_prezzo.
   */
  posaPrezzoUnitario?: number | null;
  /** Se true, usa posaImportoManuale al posto di unitario × quantità. */
  posaManuale?: boolean;
  posaImportoManuale?: number | null;
  /**
   * Per prodotti mq: 'diretti' = mq totali digitati (già totale riga, NON × qty).
   * Default / 'misure' = L×H cm come da sempre.
   */
  modalitaMq?: "misure" | "diretti";
  /** Valore mq digitati (solo se modalitaMq = 'diretti'). */
  mqDiretti?: number | null;
};

export type RisultatoCalcoloRiga = {
  /** Fornitura (senza posa se posaInCampoSeparato). */
  prezzo_riga: number;
  /** Posa totale (solo se posaInCampoSeparato e posa attiva); altrimenti 0. */
  posa_importo: number;
  /** prezzo_riga + posa_importo */
  totale: number;
  base: number;
  baseMaggiorata: number;
  mq: number;
  posaUnitaria: number;
  isDigitato: boolean;
  valido: boolean;
  motivoNonValido: string | null;
};

/** mq effettivi della riga: L(cm) × H(cm) / 10000. */
export function mqCalcolati(
  larghezzaCm: number | null | undefined,
  altezzaCm: number | null | undefined,
): number {
  return ((larghezzaCm ?? 0) * (altezzaCm ?? 0)) / 10000;
}

export function isProdottoPrezzoDigitato(prodotto: {
  tipo_prezzo: TipoPrezzo;
  prezzo_unitario: number;
  regola_prezzo?: string | null;
}): boolean {
  // Griglia ha prezzo_unitario=0 ma il prezzo arriva dalla interpolazione, non dal digitato.
  if (prodotto.regola_prezzo === "griglia") return false;
  const unitario = Number(prodotto.prezzo_unitario);
  return (
    prodotto.tipo_prezzo === "pezzo" &&
    Number.isFinite(unitario) &&
    !(unitario > 0)
  );
}

function risultatoNonValido(
  motivo: string,
  partial: Partial<RisultatoCalcoloRiga> = {},
): RisultatoCalcoloRiga {
  return {
    prezzo_riga: 0,
    posa_importo: 0,
    totale: 0,
    base: 0,
    baseMaggiorata: 0,
    mq: 0,
    posaUnitaria: 0,
    isDigitato: false,
    valido: false,
    motivoNonValido: motivo,
    ...partial,
  };
}

/**
 * UNICA funzione di calcolo riga.
 *
 * Tipi prodotto:
 * - mq (misure): base = max(L×H/10000, minimo) × prezzo_unitario  (poi × qty)
 * - mq (diretti): base = max(mq_digitati, minimo) × prezzo_unitario  (già totale, NON × qty)
 * - ml:  base = max(lunghezza/100, minimo) × prezzo_unitario
 * - pezzo listino (prezzo_unitario > 0): base = prezzo_unitario
 * - pezzo digitato (prezzo_unitario = 0): base = listino fornitore (NON × quantità)
 *
 * Ordine (uguale per tutti):
 * 1. percentuali SOLO sulla base
 * 2. + supplementi mq (valore × mq calcolati)
 * 3. + supplementi fissi
 * 4. + posa unitaria (se non in campo separato)
 * 5. × quantità  — tranne listino digitato e mq diretti (già totale riga);
 *    fissi e posa restano comunque × quantità anche in quei casi
 *
 * Posa avanzata (posaInCampoSeparato): posa_importo = unitario×qty (o manuale);
 * prezzo_riga resta solo fornitura.
 */
export function calcolaRigaCompleta(
  params: ParametriCalcoloRiga,
): RisultatoCalcoloRiga {
  const {
    prodotto,
    misure,
    quantita,
    posa,
    flags,
    prezzoDigitato = null,
    posaInCampoSeparato = false,
    posaPrezzoUnitario = null,
    posaManuale = false,
    posaImportoManuale = null,
    modalitaMq = "misure",
    mqDiretti = null,
  } = params;

  if (!Number.isFinite(quantita) || quantita <= 0) {
    return risultatoNonValido("Quantità non valida");
  }

  const isDigitato = isProdottoPrezzoDigitato(prodotto);
  const isMqDiretti =
    prodotto.tipo_prezzo === "mq" && modalitaMq === "diretti";
  /** Totale già a livello riga: non moltiplicare base/%/extra mq per quantità. */
  const isTotaleRiga = isDigitato || isMqDiretti;

  const sommaPercentuali = flags
    .filter((f) => f.tipo === "percentuale")
    .reduce((sum, f) => sum + f.valore, 0);

  const sommaFlagMq = flags
    .filter((f) => f.tipo === "mq")
    .reduce((sum, f) => sum + f.valore, 0);

  const sommaFlagFissi = flags
    .filter((f) => f.tipo === "fisso")
    .reduce((sum, f) => sum + f.valore, 0);

  let base: number;
  let mq = 0;

  if (prodotto.tipo_prezzo === "mq") {
    if (isMqDiretti) {
      mq =
        mqDiretti != null && Number.isFinite(mqDiretti) ? Number(mqDiretti) : 0;
      if (!(mq > 0)) {
        return risultatoNonValido("Mq diretti non validi", { isDigitato, mq });
      }
    } else {
      mq = mqCalcolati(misure.larghezza_cm, misure.altezza_cm);
      if (!(mq > 0)) {
        return risultatoNonValido("Misure mq non valide", { isDigitato, mq });
      }
    }
    const minimo = prodotto.minimo ?? 0;
    base = Math.max(mq, minimo) * Number(prodotto.prezzo_unitario);
  } else if (prodotto.tipo_prezzo === "ml") {
    const ml = (misure.lunghezza_cm ?? 0) / 100;
    if (!(ml > 0)) {
      return risultatoNonValido("Lunghezza non valida", { isDigitato });
    }
    const minimo = prodotto.minimo ?? 0;
    base = Math.max(ml, minimo) * Number(prodotto.prezzo_unitario);
  } else if (isDigitato) {
    if (prezzoDigitato == null || !Number.isFinite(prezzoDigitato) || prezzoDigitato <= 0) {
      return risultatoNonValido("Prezzo digitato mancante", { isDigitato: true });
    }
    // prezzoDigitato = già il prezzo BDS (trasformazione regola applicata a monte)
    base = prezzoDigitato;
  } else {
    base = Number(prodotto.prezzo_unitario);
    if (!(base > 0)) {
      return risultatoNonValido("Prezzo unitario non valido", { isDigitato });
    }
  }

  const baseMaggiorata = base * (1 + sommaPercentuali / 100);
  const extraMq = sommaFlagMq * mq;

  const tariffaPosa =
    posaPrezzoUnitario != null && Number.isFinite(posaPrezzoUnitario)
      ? Number(posaPrezzoUnitario)
      : Number(prodotto.posa_prezzo ?? 0);
  const posaUnitaria = posa && tariffaPosa > 0 ? tariffaPosa : 0;

  let posa_importo = 0;
  if (posa && posaInCampoSeparato) {
    if (posaManuale) {
      if (
        posaImportoManuale == null ||
        !Number.isFinite(posaImportoManuale) ||
        posaImportoManuale < 0
      ) {
        return risultatoNonValido("Importo posa manuale non valido", {
          isDigitato,
          base,
          baseMaggiorata,
          mq,
          posaUnitaria,
        });
      }
      posa_importo = posaImportoManuale;
    } else {
      posa_importo = posaUnitaria * quantita;
    }
  }

  let prezzo_riga: number;

  if (isTotaleRiga) {
    // Base già totale riga: NON × quantità. Extra mq una volta; fissi e posa × qty.
    prezzo_riga = baseMaggiorata + extraMq + sommaFlagFissi * quantita;
    if (posa && !posaInCampoSeparato) {
      prezzo_riga += posaUnitaria * quantita;
    }
  } else {
    // mq misure / ml / pezzo listino: (base% + extra mq + fissi [+ posa se inclusa]) × qty
    let unitario = baseMaggiorata + extraMq + sommaFlagFissi;
    if (posa && !posaInCampoSeparato) {
      unitario += posaUnitaria;
    }
    prezzo_riga = unitario * quantita;
  }

  return {
    prezzo_riga,
    posa_importo,
    totale: prezzo_riga + posa_importo,
    base,
    baseMaggiorata,
    mq,
    posaUnitaria,
    isDigitato,
    valido: true,
    motivoNonValido: null,
  };
}

/**
 * Compatibilità: ritorna solo il totale "prezzo riga" come prima.
 * Per posa avanzata passare posa=false e usare calcolaRigaCompleta.
 */
export function calcolaPrezzoRiga(
  prodotto: ProdottoCalcolo,
  misure: MisureRiga,
  quantita: number,
  posa: boolean,
  flags: FlagCalcolo[],
  opzioni: { prezzoDigitato?: number | null } = {},
): number {
  const risultato = calcolaRigaCompleta({
    prodotto,
    misure,
    quantita,
    posa,
    flags,
    prezzoDigitato: opzioni.prezzoDigitato,
    posaInCampoSeparato: false,
  });
  return risultato.valido ? risultato.prezzo_riga : 0;
}
