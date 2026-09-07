import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { TESTO_STANDARD_50_40_10 } from "@/lib/condizioni-pagamento";

/** A4 in punti; margini ~1.4 cm per far stare il testo in 2 pagine. */
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40; // ~1.4 cm (prima 2 cm → 3 pagine)
const CONTENT_W = PAGE_W - MARGIN * 2;

const NAVY = rgb(28 / 255, 61 / 255, 90 / 255);
const TEXT = rgb(34 / 255, 34 / 255, 34 / 255);

const SIZE_TITLE = 11;
const SIZE_SECTION = 8.2;
const SIZE_BODY = 7.8;
const LINE_HEIGHT = SIZE_BODY * 1.22;
const SECTION_GAP_TOP = 5.5;
const BLOCK_GAP = 1.5;

type Blocco =
  | { tipo: "paragrafo"; testo: string }
  | { tipo: "lista"; voci: string[] };

type Sezione = {
  titolo: string;
  blocchi: Blocco[];
};

/** Helvetica/WinAnsi: rimuove glifi non supportati. */
function sanificaWinAnsi(testo: string): string {
  return testo
    .replace(/\u2014|\u2013/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ");
}

function wrapLines(font: PDFFont, text: string, fontSize: number, maxWidth: number): string[] {
  const clean = sanificaWinAnsi(text).trim();
  if (!clean) return [];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawJustifiedLine(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  maxWidth: number,
  isLastLine: boolean,
) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1 || isLastLine) {
    page.drawText(text, { x, y, size: fontSize, font, color: TEXT });
    return;
  }

  const totalWordsWidth = words.reduce(
    (sum, w) => sum + font.widthOfTextAtSize(w, fontSize),
    0,
  );
  const gaps = words.length - 1;
  const space = (maxWidth - totalWordsWidth) / gaps;
  // Evita giustificazione eccessiva
  const spaceWidth = Math.min(
    Math.max(space, font.widthOfTextAtSize(" ", fontSize)),
    font.widthOfTextAtSize(" ", fontSize) * 3,
  );

  let cursor = x;
  for (let i = 0; i < words.length; i++) {
    page.drawText(words[i], { x: cursor, y, size: fontSize, font, color: TEXT });
    cursor += font.widthOfTextAtSize(words[i], fontSize);
    if (i < gaps) cursor += spaceWidth;
  }
}

function costruisciSezioni(testoPagamento: string): Sezione[] {
  const pagamento = testoPagamento.trim() || TESTO_STANDARD_50_40_10;

  return [
    {
      titolo: "1. OGGETTO DEL CONTRATTO E NATURA DELLA FORNITURA",
      blocchi: [
        {
          tipo: "paragrafo",
          testo:
            "La Fornitura verrà eseguita, oltre che nel rispetto di quanto previsto dal presente contratto, anche in conformità alle specifiche del preventivo sopracitato, che riporta i dettagli tecnici, le condizioni di pagamento, il corrispettivo ed i termini di consegna e forma parte integrante del presente contratto.",
        },
        {
          tipo: "paragrafo",
          testo:
            "Ogni variazione e integrazione del prospetto tecnico deve essere prevista per iscritto, sarà sottoposta alle presenti condizioni di vendita e potrà comportare una maggiorazione del prezzo.",
        },
        {
          tipo: "paragrafo",
          testo:
            "Il presente contratto è vincolante per entrambe le parti dal momento della sottoscrizione.",
        },
        {
          tipo: "paragrafo",
          testo:
            "Il rilievo tecnico successivo ha esclusivamente la funzione di verificare la fattibilità tecnica dell'intervento e di confermare le misure definitive. Qualora il rilievo evidenzi oggettiva impossibilità tecnica di eseguire la fornitura, il contratto si intenderà risolto e l'eventuale acconto verrà restituito senza ulteriori pretese.",
        },
        {
          tipo: "paragrafo",
          testo:
            "Il Cliente prende atto e accetta che i prodotti oggetto della presente fornitura sono realizzati su misura in base alle dimensioni rilevate presso l'immobile del Cliente e alle specifiche tecniche, estetiche e cromatiche dallo stesso indicate, e costituiscono pertanto beni confezionati su misura o chiaramente personalizzati.",
        },
        {
          tipo: "paragrafo",
          testo:
            "Il Fornitore informa espressamente il Cliente, e quest'ultimo ne prende atto, che - trattandosi di beni confezionati su misura o chiaramente personalizzati - al presente contratto non si applica il diritto di recesso, ai sensi e per gli effetti dell'art. 59, comma 1, lett. c) del D.Lgs. 206/2005 (Codice del Consumo), e ciò anche qualora il contratto sia stato concluso fuori dei locali commerciali o a distanza.",
        },
      ],
    },
    {
      titolo: "2. TEMPI DI CONSEGNA",
      blocchi: [
        {
          tipo: "paragrafo",
          testo:
            "I tempi indicativi di consegna (con esclusione del mese di agosto e delle festività natalizie) sono:",
        },
        {
          tipo: "lista",
          voci: [
            "8 settimane per i serramenti in legno",
            "9 settimane per i serramenti in PVC bianco",
            "11 settimane per i serramenti PVC pellicolato",
            "7 settimane per le persiane",
            "7 settimane per le porte interne",
            "La consegna di accessori e oscuranti seguirà le tempistiche degli infissi",
          ],
        },
        {
          tipo: "paragrafo",
          testo:
            "I termini di consegna indicati nel preventivo sono da intendersi meramente indicativi e non essenziali.",
        },
        {
          tipo: "paragrafo",
          testo:
            "La decorrenza dei termini avrà inizio esclusivamente al verificarsi congiunto delle seguenti condizioni: pagamento dell'acconto pattuito; in caso di finanziamento, approvazione definitiva dello stesso; esecuzione del rilievo tecnico con esito positivo e conferma della fattibilità dell'intervento.",
        },
        {
          tipo: "paragrafo",
          testo:
            "Eventuali ritardi dovuti a cause di forza maggiore, indisponibilità o ritardo nella fornitura dei materiali, problematiche produttive, eventi imprevedibili o comunque non imputabili al Fornitore, non daranno diritto al Cliente ad annullare l'ordine né a richiedere indennizzi o risarcimenti.",
        },
        {
          tipo: "paragrafo",
          testo:
            "La consegna della merce in cantiere o presso il luogo indicato dal Cliente potrà avvenire esclusivamente previo pagamento della fattura relativa alla merce pronta in magazzino.",
        },
        {
          tipo: "paragrafo",
          testo:
            "In caso di ritardo nel pagamento, anche parziale, il Fornitore avrà facoltà di sospendere la produzione, la consegna o la posa in opera fino all'integrale regolarizzazione, senza che ciò comporti responsabilità per eventuali slittamenti dei termini.",
        },
      ],
    },
    {
      titolo: "3. POSA IN OPERA",
      blocchi: [
        {
          tipo: "paragrafo",
          testo:
            "Costi non espressamente inclusi nel contratto (es. occupazione suolo pubblico, ponteggi, autoscale, opere murarie, adeguamenti elettrici, smaltimenti straordinari) sono a carico del Cliente.",
        },
        {
          tipo: "paragrafo",
          testo:
            "La messa in sicurezza dell'immobile e delle aree di lavoro è responsabilità del Cliente. In caso di condizioni non idonee, il Fornitore potrà sospendere la posa.",
        },
        {
          tipo: "paragrafo",
          testo:
            "Il Cliente autorizza il Fornitore ad avvalersi di soggetti terzi per l'installazione.",
        },
      ],
    },
    {
      titolo: "4. CONSEGNA E COLLAUDO",
      blocchi: [
        {
          tipo: "paragrafo",
          testo:
            "Al momento della consegna il Cliente è tenuto a verificare la conformità dei prodotti.",
        },
        {
          tipo: "paragrafo",
          testo:
            "Dal momento dello scarico in cantiere il Cliente assume la custodia e il rischio per eventuali danni, furti o ammanchi.",
        },
        {
          tipo: "paragrafo",
          testo:
            "Con la sottoscrizione del verbale di fine lavori il Cliente dichiara di accettare la fornitura senza riserve, salvo difetti espressamente annotati.",
        },
        {
          tipo: "paragrafo",
          testo:
            "Il Cliente dichiara di aver ottenuto tutte le autorizzazioni necessarie. Eventuali ritardi dovuti a mancanza di permessi o impedimenti imputabili al Cliente non esonerano dall'obbligo di pagamento.",
        },
      ],
    },
    {
      titolo: "5. CONDIZIONI DI PAGAMENTO",
      blocchi: [
        { tipo: "paragrafo", testo: pagamento },
        {
          tipo: "paragrafo",
          testo: "Pagamenti con titoli di credito si intendono salvo buon fine.",
        },
        {
          tipo: "paragrafo",
          testo:
            "Il mancato pagamento anche parziale comporta la decadenza dal beneficio del termine e il diritto del Fornitore di esigere immediatamente l'intero importo residuo, oltre agli interessi di mora ex D.Lgs. 231/2002.",
        },
      ],
    },
    {
      titolo: "6. SOLVE ET REPETE",
      blocchi: [
        {
          tipo: "paragrafo",
          testo:
            "In nessun caso il Cliente potrà opporre eccezioni circa eventuali vizi o difetti della Merce o delle operazioni di posa in opera, al fine di evitare o ritardare il pagamento alle scadenze dovute degli importi indicati nel prospetto tecnico, nemmeno qualora vi sia la denunzia di vizi e/o difetti comunicata all'azienda, valendo in favore di quest'ultima la clausola limitativa della proponibilità di eccezione ai sensi dell'art. 1462 c.c.",
        },
      ],
    },
    {
      titolo: "7. GARANZIA",
      blocchi: [
        {
          tipo: "paragrafo",
          testo:
            "Non sono coperte da garanzia le parti soggette ad usura o sottoposte ad un uso improprio. Unicamente i profili dei serramenti in PVC sono garantiti contro alterazioni dimensionali, fatte salve le esclusioni previste e indicate successivamente.",
        },
        {
          tipo: "paragrafo",
          testo:
            "La garanzia riconosciuta dal FORNITORE e la sua durata è quella riconosciuta per legge e vale a partire dalla data del verbale di fine lavori. Il FORNITORE, a sua discrezione, potrà accordare speciali condizioni di garanzia, a titolo gratuito o dietro corrispettivo. Eventuali difetti coperti dalla garanzia devono essere segnalati al FORNITORE entro 8 giorni dalla comparsa tramite raccomandata con avviso di ricevimento o PEC, pena la decadenza della garanzia. In ogni caso, la garanzia decade qualora il COMMITTENTE impieghi gli oggetti della fornitura per servizio diverso da quello a cui erano destinati. A seguito di reclamo verrà mandato un tecnico per la verifica: nel caso di reclami ingiustificati si addebiterà al COMMITTENTE il costo relativo all'intervento del tecnico. La garanzia non si applica in caso di manutenzione impropria o mancanza di manutenzione ordinaria. Le istruzioni riportate sul manuale Istruzioni, Uso e Manutenzione, se consegnato insieme ai serramenti, sono vincolanti per l'efficacia della garanzia. La garanzia non copre danni dovuti a: atmosfere industriali (smog e piogge acide), usura normale dei componenti, danni meccanici non rilevati nel verbale di collaudo, utilizzo non corretto, danni da pulizia dovuti ad uso di prodotti aggressivi, abrasivi e comunque non idonei (per la pulizia corretta leggere il manuale Istruzioni, Uso e Manutenzione, se consegnato), eccesso di umidità a causa di ventilazione impropria dei locali.",
        },
      ],
    },
    {
      titolo: "8. LIMITAZIONE DI RESPONSABILITÀ",
      blocchi: [
        {
          tipo: "paragrafo",
          testo:
            "Salvo dolo o colpa grave, la responsabilità complessiva del Fornitore non potrà in ogni caso eccedere l'importo complessivamente corrisposto dal Cliente.",
        },
        {
          tipo: "paragrafo",
          testo:
            "È esclusa ogni responsabilità per danni indiretti, mancato godimento dell'immobile o interventi eseguiti da terzi successivamente alla posa.",
        },
      ],
    },
    {
      titolo: "9. RISERVA DI PROPRIETÀ",
      blocchi: [
        {
          tipo: "paragrafo",
          testo:
            "I prodotti forniti rimarranno di esclusiva proprietà del Fornitore fino all'integrale pagamento del prezzo pattuito ai sensi dell'art. 1523 c.c., anche se già installati.",
        },
      ],
    },
    {
      titolo: "10. DETRAZIONI FISCALI",
      blocchi: [
        {
          tipo: "paragrafo",
          testo:
            "L'eventuale accesso a detrazioni fiscali è sotto esclusiva responsabilità del Cliente. Il Fornitore non risponde di errori nella compilazione del bonifico parlante o perdita del beneficio fiscale per cause non imputabili allo stesso.",
        },
      ],
    },
    {
      titolo: "11. FORO COMPETENTE",
      blocchi: [
        {
          tipo: "paragrafo",
          testo:
            "Per ogni controversia sarà esclusivamente competente il Foro di Torino.",
        },
      ],
    },
    {
      titolo: "12. TUTELA DATI PERSONALI",
      blocchi: [
        {
          tipo: "paragrafo",
          testo:
            "Il FORNITORE si impegna a conformarsi ad ogni obbligo previsto dal Regolamento (UE) 2016/679 del Parlamento Europeo e del Consiglio del 27 aprile 2016 concernente la \"tutela delle persone fisiche con riguardo al trattamento dei dati personali e la libera circolazione di tali dati\" (di seguito \"GDPR\"), nonché alle normative nazionali in materia ed ai provvedimenti dell'Autorità Garante per la protezione dei dati personali. Il FORNITORE riconosce e dà atto che i dati personali (es. nominativi, indirizzo email aziendale, ecc.) di propri dipendenti/collaboratori, coinvolti nelle attività di cui al presente contratto, saranno da esso comunicati al COMMITTENTE e da quest'ultimo trattati per l'esecuzione del contratto stesso per finalità strettamente funzionali alla instaurazione e all'esecuzione del contratto stesso ed in conformità con l'informativa resa ai sensi e per gli effetti di cui agli artt. 13 e 14 del GDPR, che il COMMITTENTE si impegna a portare a conoscenza dei propri dipendenti/collaboratori, nell'ambito delle proprie procedure interne. Ciascuna parte si impegna a trattare i dati raccolti in esecuzione di questo contratto in modo lecito e in conformità alle normative relative alla protezione dei dati personali, avendo cura di verificare che i dati siano pertinenti, completi e non eccedenti rispetto alle finalità per le quali sono raccolti e/o successivamente trattati. Le parti si danno reciprocamente atto che i dati verranno trattati nell'ambito dello spazio economico europeo (di seguito \"SEE\"). Qualora una delle parti intenda trasferire i dati trattati in relazione al presente contratto in paesi al di fuori dello SEE, la stessa ne darà pronta comunicazione alle altre Parti. Le Parti riconoscono e si danno atto che: il COMMITTENTE riveste la qualità di Titolare autonomo del trattamento dei dati personali, così come definito in seno al GDPR, per quanto riguarda le finalità espresse dal presente contratto, determinando, pertanto, i relativi mezzi del trattamento dei dati personali; il COMMITTENTE tratterà i predetti dati personali solo ed esclusivamente per la finalità di cui al punto precedente salvo altre finalità collegate ad obblighi legislativi.",
        },
      ],
    },
    {
      titolo: "13. APPROVAZIONE SPECIFICA",
      blocchi: [
        {
          tipo: "paragrafo",
          testo:
            "Ai sensi degli artt. 1341 e 1342 c.c., il Cliente approva specificamente le clausole relative a: esclusione del diritto di recesso per beni su misura, termini indicativi, sospensione per mancato pagamento, costi extra posa, passaggio del rischio, solve et repete, decadenza dal beneficio del termine, limitazione di responsabilità, riserva di proprietà, foro competente.",
        },
      ],
    },
  ];
}

/**
 * Genera le pagine «Condizioni generali di fornitura e posa in opera» (pdf-lib).
 * Punto 5: testo dinamico da condizioni_pagamento_testo (fallback 50/40/10).
 */
export async function generaPaginaCondizioniGeneraliPdf(
  testoPunto5Pagamento: string | null | undefined,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function nuovaPagina() {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) nuovaPagina();
  }

  // Titolo
  const titolo = "CONDIZIONI GENERALI DI FORNITURA E POSA IN OPERA";
  const titoloLines = wrapLines(fontBold, titolo, SIZE_TITLE, CONTENT_W);
  ensureSpace(titoloLines.length * (SIZE_TITLE * 1.2) + 8);
  for (const line of titoloLines) {
    const w = fontBold.widthOfTextAtSize(line, SIZE_TITLE);
    page.drawText(line, {
      x: MARGIN + (CONTENT_W - w) / 2,
      y: y - SIZE_TITLE,
      size: SIZE_TITLE,
      font: fontBold,
      color: NAVY,
    });
    y -= SIZE_TITLE * 1.2;
  }
  y -= 5;

  const sezioni = costruisciSezioni(
    testoPunto5Pagamento?.trim() || TESTO_STANDARD_50_40_10,
  );

  for (const sezione of sezioni) {
    ensureSpace(SECTION_GAP_TOP + SIZE_SECTION + LINE_HEIGHT);
    y -= SECTION_GAP_TOP;

    const titleLines = wrapLines(fontBold, sezione.titolo, SIZE_SECTION, CONTENT_W);
    for (const line of titleLines) {
      ensureSpace(SIZE_SECTION * 1.2);
      page.drawText(line, {
        x: MARGIN,
        y: y - SIZE_SECTION,
        size: SIZE_SECTION,
        font: fontBold,
        color: NAVY,
      });
      y -= SIZE_SECTION * 1.2;
    }
    y -= 2;

    for (const blocco of sezione.blocchi) {
      if (blocco.tipo === "paragrafo") {
        const lines = wrapLines(fontRegular, blocco.testo, SIZE_BODY, CONTENT_W);
        for (let i = 0; i < lines.length; i++) {
          ensureSpace(LINE_HEIGHT);
          drawJustifiedLine(
            page,
            fontRegular,
            lines[i],
            MARGIN,
            y - SIZE_BODY,
            SIZE_BODY,
            CONTENT_W,
            i === lines.length - 1,
          );
          y -= LINE_HEIGHT;
        }
        y -= BLOCK_GAP;
      } else {
        for (const voce of blocco.voci) {
          const bullet = `- ${voce}`;
          const lines = wrapLines(fontRegular, bullet, SIZE_BODY, CONTENT_W - 8);
          for (let i = 0; i < lines.length; i++) {
            ensureSpace(LINE_HEIGHT);
            page.drawText(lines[i], {
              x: MARGIN + 8,
              y: y - SIZE_BODY,
              size: SIZE_BODY,
              font: fontRegular,
              color: TEXT,
            });
            y -= LINE_HEIGHT;
          }
        }
        y -= BLOCK_GAP;
      }
    }
  }

  // Firma cliente a destra
  const firma = "Firma Cliente ___________________________";
  ensureSpace(22);
  y -= 12;
  const firmaW = fontRegular.widthOfTextAtSize(firma, SIZE_BODY);
  page.drawText(firma, {
    x: MARGIN + CONTENT_W - firmaW,
    y: y - SIZE_BODY,
    size: SIZE_BODY,
    font: fontRegular,
    color: TEXT,
  });

  return doc.save();
}

/** @deprecated alias compatibilità */
export async function generaPaginaCondizioniPagamentoPdf(
  testoPunto5: string,
): Promise<Uint8Array> {
  return generaPaginaCondizioniGeneraliPdf(testoPunto5);
}
