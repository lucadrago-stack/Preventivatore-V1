export const DICITURA_ANTA_RIBALTA_MICROCIRCOLO =
  "Anta a ribalta e microcircolo incluso";

export type OpzioniNotaAutomatica = {
  /** Colore unico (prodotti senza vetro / non serramento). */
  colore?: string | null;
  coloreInterno?: string | null;
  coloreEsterno?: string | null;
  coloreFerramenta?: string | null;
  vetro?: string | null;
};

/**
 * Righe automatiche per la colonna NOTE del prodotto (PDF e anteprima Componi).
 * Solo caratteristiche prodotto — niente riferimenti alla posa (ha riga dedicata).
 * Non sovrascrivono la nota scritta a mano.
 */
export function righeAutomaticheNota(opts: OpzioniNotaAutomatica): string[] {
  const parti: string[] = [];

  const interno = (opts.coloreInterno ?? "").trim();
  const esterno = (opts.coloreEsterno ?? "").trim();
  const ferramenta = (opts.coloreFerramenta ?? "").trim();
  const vet = (opts.vetro ?? "").trim();
  const isSerramento = Boolean(interno || esterno || ferramenta || vet);

  if (isSerramento) {
    if (interno || esterno) {
      if (interno === esterno) {
        parti.push(`Colore: ${interno}`);
      } else {
        parti.push(`Interno: ${interno} · Esterno: ${esterno}`);
      }
    }
    if (ferramenta) {
      parti.push(`Ferramenta: ${ferramenta}`);
    }
    if (vet) {
      parti.push(`Vetro: ${vet}`);
    }
    parti.push(DICITURA_ANTA_RIBALTA_MICROCIRCOLO);
  } else {
    const col = (opts.colore ?? "").trim();
    if (col) parti.push(`Colore: ${col}`);
  }

  return parti;
}

/** @deprecated usa righeAutomaticheNota */
export function righeCaratteristicheNota(
  colore: string | null | undefined,
  vetro: string | null | undefined,
): string[] {
  return righeAutomaticheNota({ colore, vetro });
}

/**
 * Compone la colonna NOTE del PDF: nota manuale + automatiche in coda.
 */
export function composiNotaConCaratteristiche(
  notaManuale: string | null | undefined,
  opts: OpzioniNotaAutomatica,
): string {
  const parti: string[] = [];
  const nota = (notaManuale ?? "").trim();
  if (nota) parti.push(nota);
  parti.push(...righeAutomaticheNota(opts));
  return parti.join("\n");
}
