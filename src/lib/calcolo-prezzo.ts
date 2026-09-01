type TipoPrezzo = "mq" | "pezzo" | "ml";
type TipoFlag = "fisso" | "percentuale";

type ProdottoCalcolo = {
  tipo_prezzo: TipoPrezzo;
  prezzo_unitario: number;
  minimo: number | null;
  posa_prezzo: number | null;
};

type MisureRiga = {
  larghezza_cm?: number | null;
  altezza_cm?: number | null;
  lunghezza_cm?: number | null;
};

type FlagCalcolo = {
  tipo: TipoFlag;
  valore: number;
};

export function calcolaPrezzoRiga(
  prodotto: ProdottoCalcolo,
  misure: MisureRiga,
  quantita: number,
  posa: boolean,
  flags: FlagCalcolo[],
): number {
  let base: number;

  if (prodotto.tipo_prezzo === "mq") {
    const mq =
      ((misure.larghezza_cm ?? 0) * (misure.altezza_cm ?? 0)) / 10000;
    const minimo = prodotto.minimo ?? 0;
    const mqEff = Math.max(mq, minimo);
    base = mqEff * prodotto.prezzo_unitario;
  } else if (prodotto.tipo_prezzo === "ml") {
    const ml = (misure.lunghezza_cm ?? 0) / 100;
    const minimo = prodotto.minimo ?? 0;
    const mlEff = Math.max(ml, minimo);
    base = mlEff * prodotto.prezzo_unitario;
  } else {
    base = prodotto.prezzo_unitario;
  }

  const sommaPercentuali = flags
    .filter((f) => f.tipo === "percentuale")
    .reduce((sum, f) => sum + f.valore, 0);

  const baseMagg = base * (1 + sommaPercentuali / 100);

  const sommaFlagFissi = flags
    .filter((f) => f.tipo === "fisso")
    .reduce((sum, f) => sum + f.valore, 0);

  let unitario = baseMagg + sommaFlagFissi;

  if (posa && prodotto.posa_prezzo != null) {
    unitario += prodotto.posa_prezzo;
  }

  return unitario * quantita;
}
