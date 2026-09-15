import { isProdottoPrezzoDigitato } from "@/lib/calcolo-prezzo";
import { notaGrigliaPosizioniAggregate } from "@/lib/griglia-prezzo";
import { isCategoriaPosaAvanzata } from "@/lib/posa-categorie";
import { normalizzaRelazione } from "@/lib/format";

export type RigaDbPerAggregazione = {
  id: number;
  quantita: number;
  prezzo_riga: number | null;
  posa_importo: number | null;
  posa: boolean | null;
  posa_riga_separata: boolean | null;
  descrizione_cliente: string | null;
  descrizione_libera: string | null;
  descrizione_tecnica: string | null;
  nota: string | null;
  colore: string | null;
  colore_interno: string | null;
  colore_esterno: string | null;
  colore_ferramenta: string | null;
  vetro: string | null;
  tipologia_apertura?: string | null;
  larghezza_mm?: number | null;
  altezza_mm?: number | null;
  extra_colore_nome?: string | null;
  extra_colore_percentuale?: number | null;
  prodotto_id: number | null;
  ordine: number | null;
  visibile_pdf: boolean | null;
  tipo_riga: string | null;
  testo_libero: string | null;
  prodotti:
    | {
        nome: string;
        descrizione_cliente: string | null;
        descrizione_tecnica: string | null;
        scheda_tecnica_path: string | null;
        tipo_prezzo: string | null;
        prezzo_unitario: number | null;
        ha_vetro?: boolean | null;
        regola_prezzo?: string | null;
        categorie: { nome: string } | { nome: string }[] | null;
      }
    | {
        nome: string;
        descrizione_cliente: string | null;
        descrizione_tecnica: string | null;
        scheda_tecnica_path: string | null;
        tipo_prezzo: string | null;
        prezzo_unitario: number | null;
        ha_vetro?: boolean | null;
        regola_prezzo?: string | null;
        categorie: { nome: string } | { nome: string }[] | null;
      }[]
    | null;
};

export type RigaAggregataComponi = {
  key: string;
  prodotto_id: number | null;
  righeIds: number[];
  quantita: number;
  prezzo_riga: number | null;
  posa_importo: number | null;
  posa_inclusa: boolean;
  posa_riga_separata: boolean;
  is_posa_avanzata: boolean;
  is_libera: boolean;
  descrizione: string;
  descrizione_tecnica: string;
  nota: string;
  colore: string;
  colore_interno: string;
  colore_esterno: string;
  colore_ferramenta: string;
  vetro: string;
  tipologia_apertura: string;
  larghezza_mm: number | null;
  altezza_mm: number | null;
  extra_colore_nome: string;
  extra_colore_percentuale: number | null;
  /** Note griglia multi-posizione (tipologia/mm per riga, extra una volta). */
  nota_griglia: string;
  tipo_riga: "prodotto" | "testo" | "posa";
  testo_libero: string;
  visibile_pdf: boolean;
  ordine: number;
  scheda_tecnica_path: string | null;
  nome_prodotto: string | null;
};

function descrizioneCommercialeDefault(
  riga: RigaDbPerAggregazione,
  normalizeHtml: (raw: string) => string,
): string {
  let raw = "";
  if (riga.descrizione_cliente?.trim()) {
    raw = riga.descrizione_cliente;
  } else if (riga.prodotto_id === null) {
    raw = riga.descrizione_libera ?? "";
  } else {
    const prodotto = normalizzaRelazione(riga.prodotti);
    if (!prodotto) return "";
    raw = prodotto.descrizione_cliente?.trim()
      ? prodotto.descrizione_cliente
      : prodotto.nome;
  }
  return normalizeHtml(raw);
}

function descrizioneTecnicaDefault(riga: RigaDbPerAggregazione): string {
  if (riga.descrizione_tecnica?.trim()) {
    return riga.descrizione_tecnica;
  }
  if (riga.prodotto_id === null) {
    return "Riga libera";
  }
  const prodotto = normalizzaRelazione(riga.prodotti);
  if (!prodotto) return "";
  if (prodotto.descrizione_tecnica?.trim()) {
    return prodotto.descrizione_tecnica;
  }
  return prodotto.nome;
}

function isRigaPosaAvanzata(riga: RigaDbPerAggregazione): boolean {
  const prodotto = normalizzaRelazione(riga.prodotti);
  if (!prodotto?.categorie) return false;
  const categoria = normalizzaRelazione(prodotto.categorie);
  return isCategoriaPosaAvanzata(categoria?.nome);
}

function coloreDaRiga(riga: RigaDbPerAggregazione): string {
  return (riga.colore ?? "").trim();
}

function coloreInternoDaRiga(riga: RigaDbPerAggregazione): string {
  const prodotto = normalizzaRelazione(riga.prodotti);
  if (!prodotto?.ha_vetro) return "";
  return (riga.colore_interno ?? "").trim();
}

function coloreEsternoDaRiga(riga: RigaDbPerAggregazione): string {
  const prodotto = normalizzaRelazione(riga.prodotti);
  if (!prodotto?.ha_vetro) return "";
  return (riga.colore_esterno ?? "").trim();
}

function coloreFerramentaDaRiga(riga: RigaDbPerAggregazione): string {
  const prodotto = normalizzaRelazione(riga.prodotti);
  if (!prodotto?.ha_vetro) return "";
  return (riga.colore_ferramenta ?? "").trim();
}

function vetroDaRiga(riga: RigaDbPerAggregazione): string {
  const prodotto = normalizzaRelazione(riga.prodotti);
  if (!prodotto?.ha_vetro) return "";
  return (riga.vetro ?? "").trim();
}

function notaGrigliaDaRiga(riga: RigaDbPerAggregazione): string {
  return (
    notaGrigliaPosizioniAggregate(
      [
        {
          tipologiaApertura: riga.tipologia_apertura,
          larghezzaMm: riga.larghezza_mm,
          altezzaMm: riga.altezza_mm,
          quantita: riga.quantita,
        },
      ],
      riga.extra_colore_nome,
      riga.extra_colore_percentuale,
    ) ?? ""
  );
}

function appendNotaGrigliaPosizione(
  esistente: string,
  riga: RigaDbPerAggregazione,
): string {
  const misura =
    notaGrigliaPosizioniAggregate(
      [
        {
          tipologiaApertura: riga.tipologia_apertura,
          larghezzaMm: riga.larghezza_mm,
          altezzaMm: riga.altezza_mm,
          quantita: riga.quantita,
        },
      ],
      null,
      null,
    ) ?? "";
  if (!misura) return esistente;
  if (!esistente.trim()) {
    return (
      notaGrigliaPosizioniAggregate(
        [
          {
            tipologiaApertura: riga.tipologia_apertura,
            larghezzaMm: riga.larghezza_mm,
            altezzaMm: riga.altezza_mm,
            quantita: riga.quantita,
          },
        ],
        riga.extra_colore_nome,
        riga.extra_colore_percentuale,
      ) ?? misura
    );
  }
  // Inserisci la nuova misura prima dell'eventuale riga extra colore in coda
  const linee = esistente.split("\n").filter(Boolean);
  const extraLine =
    linee.length > 0 && !linee[linee.length - 1].includes("×")
      ? linee.pop()
      : null;
  linee.push(misura);
  if (extraLine) linee.push(extraLine);
  return linee.join("\n");
}

/**
 * Solo pezzo con listino a 0 (prezzo digitato).
 * mq/ml, pezzo a listino e griglia multi-posizione si aggregano.
 * Se manca tipo_prezzo → aggregabile
 * (non assumere "digitato": altrimenti le multi-posizione restano spezzate).
 */
export function isRigaPrezzoDigitatoNonAggregabile(
  riga: RigaDbPerAggregazione,
): boolean {
  const prodotto = normalizzaRelazione(riga.prodotti);
  if (!prodotto) return false;
  if (prodotto.tipo_prezzo !== "pezzo") return false;
  // Griglia: aggregabile come mq/ml (dettaglio posizioni in nota_griglia)
  if (prodotto.regola_prezzo === "griglia") return false;
  return isProdottoPrezzoDigitato({
    tipo_prezzo: "pezzo",
    prezzo_unitario: Number(prodotto.prezzo_unitario ?? 0),
    regola_prezzo: prodotto.regola_prezzo,
  });
}

export type OpzioniRaggruppaRighe = {
  normalizeDescrizioneHtml: (raw: string) => string;
};

/**
 * Aggrega le righe DB per componi/PDF.
 * - stesso prodotto_id → 1 riga (qty + importi + posa sommati)
 * - esclusi: prezzo digitato, libere, testo
 */
export function raggruppaRigheComponi(
  righeDb: RigaDbPerAggregazione[],
  options: OpzioniRaggruppaRighe,
): RigaAggregataComponi[] {
  const ordinate = [...righeDb].sort((a, b) => {
    const ordineA = a.ordine ?? a.id;
    const ordineB = b.ordine ?? b.id;
    if (ordineA !== ordineB) return ordineA - ordineB;
    return a.id - b.id;
  });

  const risultato: RigaAggregataComponi[] = [];
  const indicePerProdotto = new Map<number, number>();

  for (const riga of ordinate) {
    if (riga.tipo_riga === "testo") {
      risultato.push({
        key: `testo-${riga.id}`,
        prodotto_id: null,
        righeIds: [riga.id],
        quantita: 0,
        prezzo_riga: null,
        posa_importo: null,
        posa_inclusa: false,
        posa_riga_separata: false,
        is_posa_avanzata: false,
        is_libera: false,
        descrizione: "",
        descrizione_tecnica: "",
        nota: riga.nota ?? "",
        colore: "",
        colore_interno: "",
        colore_esterno: "",
        colore_ferramenta: "",
        vetro: "",
        tipologia_apertura: "",
        larghezza_mm: null,
        altezza_mm: null,
        extra_colore_nome: "",
        extra_colore_percentuale: null,
        nota_griglia: "",
        tipo_riga: "testo",
        testo_libero: riga.testo_libero ?? "",
        visibile_pdf: riga.visibile_pdf ?? true,
        ordine: riga.ordine ?? riga.id,
        scheda_tecnica_path: null,
        nome_prodotto: null,
      });
      continue;
    }

    if (riga.tipo_riga === "posa") {
      risultato.push({
        key: `posa-${riga.id}`,
        prodotto_id: null,
        righeIds: [riga.id],
        quantita: Number(riga.quantita) || 0,
        prezzo_riga: riga.prezzo_riga != null ? Number(riga.prezzo_riga) : null,
        posa_importo: null,
        posa_inclusa: false,
        posa_riga_separata: false,
        is_posa_avanzata: false,
        is_libera: true,
        descrizione: descrizioneCommercialeDefault(
          riga,
          options.normalizeDescrizioneHtml,
        ),
        descrizione_tecnica: riga.descrizione_tecnica?.trim() || "Posa in opera",
        nota: riga.nota ?? "",
        colore: "",
        colore_interno: "",
        colore_esterno: "",
        colore_ferramenta: "",
        vetro: "",
        tipologia_apertura: "",
        larghezza_mm: null,
        altezza_mm: null,
        extra_colore_nome: "",
        extra_colore_percentuale: null,
        nota_griglia: "",
        tipo_riga: "posa",
        testo_libero: "",
        visibile_pdf: riga.visibile_pdf ?? true,
        ordine: riga.ordine ?? riga.id,
        scheda_tecnica_path: null,
        nome_prodotto: null,
      });
      continue;
    }

    if (riga.prodotto_id == null) {
      risultato.push({
        key: `libera-${riga.id}`,
        prodotto_id: null,
        righeIds: [riga.id],
        quantita: Number(riga.quantita) || 0,
        prezzo_riga: riga.prezzo_riga != null ? Number(riga.prezzo_riga) : null,
        posa_importo: riga.posa_importo,
        posa_inclusa: false,
        posa_riga_separata: false,
        is_posa_avanzata: false,
        is_libera: true,
        descrizione: descrizioneCommercialeDefault(
          riga,
          options.normalizeDescrizioneHtml,
        ),
        descrizione_tecnica: descrizioneTecnicaDefault(riga),
        nota: riga.nota ?? "",
        colore: coloreDaRiga(riga),
        colore_interno: coloreInternoDaRiga(riga),
        colore_esterno: coloreEsternoDaRiga(riga),
        colore_ferramenta: coloreFerramentaDaRiga(riga),
        vetro: vetroDaRiga(riga),
        tipologia_apertura: (riga.tipologia_apertura ?? "").trim(),
        larghezza_mm: riga.larghezza_mm ?? null,
        altezza_mm: riga.altezza_mm ?? null,
        extra_colore_nome: (riga.extra_colore_nome ?? "").trim(),
        extra_colore_percentuale:
          riga.extra_colore_percentuale != null
            ? Number(riga.extra_colore_percentuale)
            : null,
        nota_griglia: notaGrigliaDaRiga(riga),
        tipo_riga: "prodotto",
        testo_libero: "",
        visibile_pdf: riga.visibile_pdf ?? true,
        ordine: riga.ordine ?? riga.id,
        scheda_tecnica_path: null,
        nome_prodotto: null,
      });
      continue;
    }

    const prodottoId = Number(riga.prodotto_id);
    const prodotto = normalizzaRelazione(riga.prodotti);
    const isAvanzata = isRigaPosaAvanzata(riga);
    const posaImporto =
      isAvanzata && riga.posa ? Number(riga.posa_importo ?? 0) : 0;
    const posaInclusa = isAvanzata && !!riga.posa && posaImporto > 0;
    const posaSeparata = isAvanzata && riga.posa_riga_separata === true;
    const quantita = Number(riga.quantita) || 0;
    const prezzoRiga =
      riga.prezzo_riga != null ? Number(riga.prezzo_riga) : null;
    const colore = coloreDaRiga(riga);
    const coloreInterno = coloreInternoDaRiga(riga);
    const coloreEsterno = coloreEsternoDaRiga(riga);
    const coloreFerramenta = coloreFerramentaDaRiga(riga);
    const vetro = vetroDaRiga(riga);

    // Prezzo digitato: mai aggregare.
    if (isRigaPrezzoDigitatoNonAggregabile(riga)) {
      risultato.push({
        key: `riga-${riga.id}`,
        prodotto_id: prodottoId,
        righeIds: [riga.id],
        quantita,
        prezzo_riga: prezzoRiga,
        posa_importo: posaImporto,
        posa_inclusa: posaInclusa,
        posa_riga_separata: posaSeparata,
        is_posa_avanzata: isAvanzata,
        is_libera: false,
        descrizione: descrizioneCommercialeDefault(
          riga,
          options.normalizeDescrizioneHtml,
        ),
        descrizione_tecnica: descrizioneTecnicaDefault(riga),
        nota: riga.nota ?? "",
        colore,
        colore_interno: coloreInterno,
        colore_esterno: coloreEsterno,
        colore_ferramenta: coloreFerramenta,
        vetro,
        tipologia_apertura: (riga.tipologia_apertura ?? "").trim(),
        larghezza_mm: riga.larghezza_mm ?? null,
        altezza_mm: riga.altezza_mm ?? null,
        extra_colore_nome: (riga.extra_colore_nome ?? "").trim(),
        extra_colore_percentuale:
          riga.extra_colore_percentuale != null
            ? Number(riga.extra_colore_percentuale)
            : null,
        nota_griglia: notaGrigliaDaRiga(riga),
        tipo_riga: "prodotto",
        testo_libero: "",
        visibile_pdf: riga.visibile_pdf ?? true,
        ordine: riga.ordine ?? riga.id,
        scheda_tecnica_path: prodotto?.scheda_tecnica_path ?? null,
        nome_prodotto: prodotto?.nome ?? null,
      });
      continue;
    }

    const esistenteIdx = indicePerProdotto.get(prodottoId);
    if (esistenteIdx != null) {
      const agg = risultato[esistenteIdx];
      agg.righeIds.push(riga.id);
      agg.quantita += quantita;
      agg.prezzo_riga = (agg.prezzo_riga ?? 0) + (prezzoRiga ?? 0);
      if (posaImporto > 0) {
        agg.posa_importo = (agg.posa_importo ?? 0) + posaImporto;
        agg.posa_inclusa = true;
        agg.is_posa_avanzata = true;
      }
      if (posaSeparata) {
        agg.posa_riga_separata = true;
      }
      // Colore/vetro: conserva il primo valorizzato dell'aggregato
      if (!agg.colore && colore) agg.colore = colore;
      if (!agg.colore_interno && coloreInterno) {
        agg.colore_interno = coloreInterno;
      }
      if (!agg.colore_esterno && coloreEsterno) {
        agg.colore_esterno = coloreEsterno;
      }
      if (!agg.colore_ferramenta && coloreFerramenta) {
        agg.colore_ferramenta = coloreFerramenta;
      }
      if (!agg.vetro && vetro) agg.vetro = vetro;
      if (riga.tipologia_apertura || riga.larghezza_mm != null) {
        agg.nota_griglia = appendNotaGrigliaPosizione(agg.nota_griglia, riga);
      }
      continue;
    }

    indicePerProdotto.set(prodottoId, risultato.length);
    risultato.push({
      key: `prodotto-${prodottoId}`,
      prodotto_id: prodottoId,
      righeIds: [riga.id],
      quantita,
      prezzo_riga: prezzoRiga,
      posa_importo: posaImporto,
      posa_inclusa: posaInclusa,
      posa_riga_separata: posaSeparata,
      is_posa_avanzata: isAvanzata,
      is_libera: false,
      descrizione: descrizioneCommercialeDefault(
        riga,
        options.normalizeDescrizioneHtml,
      ),
      descrizione_tecnica: descrizioneTecnicaDefault(riga),
      nota: riga.nota ?? "",
      colore,
      colore_interno: coloreInterno,
      colore_esterno: coloreEsterno,
      colore_ferramenta: coloreFerramenta,
      vetro,
      tipologia_apertura: (riga.tipologia_apertura ?? "").trim(),
      larghezza_mm: riga.larghezza_mm ?? null,
      altezza_mm: riga.altezza_mm ?? null,
      extra_colore_nome: (riga.extra_colore_nome ?? "").trim(),
      extra_colore_percentuale:
        riga.extra_colore_percentuale != null
          ? Number(riga.extra_colore_percentuale)
          : null,
      nota_griglia: notaGrigliaDaRiga(riga),
      tipo_riga: "prodotto",
      testo_libero: "",
      visibile_pdf: riga.visibile_pdf ?? true,
      ordine: riga.ordine ?? riga.id,
      scheda_tecnica_path: prodotto?.scheda_tecnica_path ?? null,
      nome_prodotto: prodotto?.nome ?? null,
    });
  }

  return risultato;
}
