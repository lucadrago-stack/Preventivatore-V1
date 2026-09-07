/**
 * Condizioni di pagamento del preventivo (punto 5 condizioni generali PDF).
 */

export type CondizioniPagamentoTipo =
  | "standard_50_40_10"
  | "finanziamento_totale"
  | "finanziamento_parziale"
  | "personalizzato";

export const CONDIZIONI_PAGAMENTO_DEFAULT: CondizioniPagamentoTipo =
  "standard_50_40_10";

export const CONDIZIONI_PAGAMENTO_OPZIONI: {
  value: CondizioniPagamentoTipo;
  label: string;
}[] = [
  { value: "standard_50_40_10", label: "Standard 50/40/10" },
  { value: "finanziamento_totale", label: "Finanziamento totale" },
  { value: "finanziamento_parziale", label: "Finanziamento parziale" },
  { value: "personalizzato", label: "Personalizzato" },
];

export const TESTO_STANDARD_50_40_10 =
  "Il pagamento dovrà avvenire come segue: 50% all'ordine, 40% alla consegna della merce in cantiere, 10% a fine posa.";

export const TESTO_FINANZIAMENTO_TOTALE =
  "Il pagamento dell'intero importo avverrà tramite finanziamento erogato da istituto convenzionato, salvo approvazione dello stesso.";

/** Importo it-IT con € finale, es. "5.000,00 €". */
export function formatEuroCondizioni(importo: number): string {
  const corpo = new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(importo);
  return `${corpo} €`;
}

export function normalizzaTipoCondizioniPagamento(
  raw: string | null | undefined,
): CondizioniPagamentoTipo {
  if (
    raw === "finanziamento_totale" ||
    raw === "finanziamento_parziale" ||
    raw === "personalizzato" ||
    raw === "standard_50_40_10"
  ) {
    return raw;
  }
  return CONDIZIONI_PAGAMENTO_DEFAULT;
}

export function generaTestoCondizioniPagamento(params: {
  tipo: CondizioniPagamentoTipo;
  acconto?: number | null;
  testoPersonalizzato?: string | null;
}): string {
  switch (params.tipo) {
    case "standard_50_40_10":
      return TESTO_STANDARD_50_40_10;
    case "finanziamento_totale":
      return TESTO_FINANZIAMENTO_TOTALE;
    case "finanziamento_parziale": {
      const n = Number(params.acconto);
      const importo =
        Number.isFinite(n) && n >= 0 ? formatEuroCondizioni(n) : formatEuroCondizioni(0);
      return `Acconto di ${importo} all'ordine, saldo tramite finanziamento erogato da istituto convenzionato, salvo approvazione.`;
    }
    case "personalizzato":
      return (params.testoPersonalizzato ?? "").trim();
    default:
      return TESTO_STANDARD_50_40_10;
  }
}
