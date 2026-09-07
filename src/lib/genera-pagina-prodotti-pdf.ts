import { jsPDF } from "jspdf";
import autoTable, { type CellDef, type CellHookData, type RowInput } from "jspdf-autotable";
import {
  descrizionePlainText,
  isDescrizioneCentrata,
  parseDescrizioneFormattata,
  type DescrizioneSegmento,
} from "@/lib/descrizione-formattata";
import { formatEuro, formatDataDocumento } from "@/lib/format";
import { uriEmail, uriTelefono } from "@/lib/pdf-link";
import {
  etichettaImportoServizio,
  etichettaNotaServizio,
} from "@/lib/servizi-nota";
import type { DatiFinanziamentoPdfInput } from "@/lib/banner-finanziamento-pdf";
import { preparaPaginaInvestimentoPdf } from "@/lib/banner-finanziamento-pdf";

const MARGIN = 12;

/** Palette brand (RGB per jsPDF / autoTable) */
const C = {
  navy: [28, 61, 90] as [number, number, number],
  accent: [0, 147, 184] as [number, number, number],
  gold: [242, 194, 0] as [number, number, number],
  text: [34, 34, 34] as [number, number, number],
  textMuted: [90, 100, 112] as [number, number, number],
  rowAlt: [247, 248, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  border: [216, 222, 230] as [number, number, number],
  red: [200, 30, 30] as [number, number, number],
  verde: [15, 110, 86] as [number, number, number],
  azzurro: [24, 95, 165] as [number, number, number],
};

type JsPdfWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

export type RigaPaginaProdottiPdf = {
  key: string;
  tipo_riga: "prodotto" | "testo" | "posa";
  quantita: number;
  quantitaEtichetta?: string;
  descrizione: string;
  testo_libero: string;
  nota: string;
  prezzo_riga: number | null;
  /** Importo mostrato in tabella (può includere la posa se modalità inclusa). */
  importo_display: number | null;
  importoEtichetta?: string;
};

export type ServizioPaginaProdottiPdf = {
  descrizione: string;
  nota: string;
  importo: number;
};

export type DatiPaginaProdottiPdf = {
  riferimento: string;
  clienteNome: string;
  clienteCantiere: string;
  clienteTelefono: string;
  clienteEmail: string;
  numeroPreventivo: string;
  dataPreventivo: string;
  revisione: string;
  validitaGiorni: string;
  commerciale: {
    nome: string;
    telefono: string | null;
    email: string | null;
    riferimento_aziendale: string | null;
  } | null;
  sede: {
    nome: string;
    indirizzo: string | null;
    cap: string | null;
    telefono: string | null;
    email: string | null;
    orari: string | null;
  } | null;
  righe: RigaPaginaProdottiPdf[];
  importoTotale: number;
  scontoPercentuale: number;
  scontoPercentuale2: number;
  importoSconto1: number;
  importoSconto2: number;
  importoScontato: number;
  servizi: ServizioPaginaProdottiPdf[];
  totaleServizi: number;
  totaleFinale: number;
  ivaPercentuale: number;
  importoIva: number;
  totaleIvato: number;
  notePreventivo: string;
  /** Se presente e attivo, disegna il banner finanziamento dopo i totali. */
  finanziamento?: DatiFinanziamentoPdfInput | null;
};

/** Importo sconto con segno meno ASCII (Helvetica non renderizza bene U+2212). */
function formatEuroSconto(importoSconto: number): string {
  const importo = Math.abs(importoSconto);
  return `-${formatEuro(importo)}`;
}

function getTableEndY(pdf: jsPDF): number {
  const doc = pdf as JsPdfWithAutoTable;
  return doc.lastAutoTable?.finalY ?? MARGIN;
}

function ensureSpace(pdf: jsPDF, currentY: number, blockHeight: number): number {
  const pageHeight = pdf.internal.pageSize.getHeight();
  if (currentY + blockHeight > pageHeight - MARGIN) {
    pdf.addPage();
    return MARGIN + 4;
  }
  return currentY;
}

function drawSectionTitle(pdf: jsPDF, title: string, y: number): number {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...C.navy);
  pdf.text(title, MARGIN, y);
  const textWidth = pdf.getTextWidth(title);
  pdf.setDrawColor(...C.accent);
  pdf.setLineWidth(0.5);
  pdf.line(MARGIN, y + 1, MARGIN + Math.max(textWidth, 36), y + 1);
  return y + 5;
}

function drawInfoLine(
  pdf: jsPDF,
  x: number,
  y: number,
  label: string,
  value: string,
) {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...C.textMuted);
  pdf.text(`${label}: `, x, y);
  const labelWidth = pdf.getTextWidth(`${label}: `);
  pdf.setTextColor(...C.text);
  pdf.text(value || "—", x + labelWidth, y);
}

const TABLE_BASE = {
  margin: { left: MARGIN, right: MARGIN, bottom: MARGIN },
  styles: {
    font: "helvetica",
    fontSize: 8,
    textColor: C.text,
    lineColor: C.border,
    lineWidth: 0.1,
    cellPadding: { top: 1, right: 1.5, bottom: 1, left: 1.5 },
    minCellHeight: 4.5,
    overflow: "linebreak" as const,
    valign: "top" as const,
  },
  headStyles: {
    fillColor: C.navy,
    textColor: C.white,
    fontStyle: "bold" as const,
    fontSize: 7,
    cellPadding: { top: 1.2, right: 1.5, bottom: 1.2, left: 1.5 },
  },
  alternateRowStyles: {
    fillColor: C.rowAlt,
  },
  rowPageBreak: "avoid" as const,
  showHead: "everyPage" as const,
  theme: "plain" as const,
};

function buildRigheProdottiBody(righe: RigaPaginaProdottiPdf[]): RowInput[] {
  const body: RowInput[] = [];

  for (const riga of righe) {
    if (riga.tipo_riga === "testo") {
      body.push([
        {
          content: riga.testo_libero || "—",
          colSpan: 4,
          styles: {
            fillColor: C.rowAlt,
            textColor: C.navy,
            fontStyle: "bold",
            fontSize: 8,
            cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
          },
        } satisfies CellDef,
      ]);
      continue;
    }

    body.push([
      riga.quantitaEtichetta ?? String(riga.quantita),
      riga.descrizione || "—",
      riga.nota || "—",
      riga.importoEtichetta
        ? riga.importoEtichetta
        : riga.importo_display != null
          ? formatEuro(riga.importo_display)
          : "—",
    ]);
  }

  return body;
}

function wrapSegmentiSuLarghezza(
  pdf: jsPDF,
  segments: DescrizioneSegmento[],
  maxWidth: number,
): DescrizioneSegmento[][] {
  const plain = segments.map((s) => s.text).join("");
  if (plain === "") return [[{ text: "", red: false }]];

  const rows: DescrizioneSegmento[][] = [];
  let current: DescrizioneSegmento[] = [];
  let currentWidth = 0;

  for (const seg of segments) {
    const tokens = seg.text.split(/(\s+)/);
    for (const token of tokens) {
      if (token === "") continue;
      const tokenWidth = pdf.getTextWidth(token);
      if (
        currentWidth + tokenWidth > maxWidth &&
        current.length > 0 &&
        !/^\s+$/.test(token)
      ) {
        rows.push(current);
        current = [];
        currentWidth = 0;
      }
      current.push({ text: token, red: seg.red });
      currentWidth += tokenWidth;
    }
  }

  if (current.length > 0) rows.push(current);
  return rows.length > 0 ? rows : [[{ text: "", red: false }]];
}

function drawDescrizioneFormattataInCella(
  pdf: jsPDF,
  data: CellHookData,
  raw: string,
) {
  const { centered, lines } = parseDescrizioneFormattata(raw);
  const padLeft = data.cell.padding("left");
  const padRight = data.cell.padding("right");
  const padTop = data.cell.padding("top");
  const maxWidth = Math.max(4, data.cell.width - padLeft - padRight);
  const fontSize = data.cell.styles.fontSize || 8;
  const lineHeight = fontSize * 0.4;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(fontSize);

  let cursorY = data.cell.y + padTop + lineHeight * 0.75;

  for (const lineSegs of lines) {
    const wrapped = wrapSegmentiSuLarghezza(pdf, lineSegs, maxWidth);
    for (const row of wrapped) {
      const rowPlain = row.map((s) => s.text).join("");
      if (rowPlain === "") {
        cursorY += lineHeight;
        continue;
      }

      const rowWidth = pdf.getTextWidth(rowPlain);
      let cursorX = centered
        ? data.cell.x + padLeft + Math.max(0, (maxWidth - rowWidth) / 2)
        : data.cell.x + padLeft;

      for (const seg of row) {
        if (!seg.text) continue;
        pdf.setTextColor(...(seg.red ? C.red : C.text));
        pdf.text(seg.text, cursorX, cursorY);
        cursorX += pdf.getTextWidth(seg.text);
      }
      cursorY += lineHeight;
    }
  }
}

function isCellaDescrizioneProdotto(data: CellHookData): boolean {
  return (
    data.section === "body" &&
    data.column.index === 1 &&
    typeof data.cell.raw === "string" &&
    (data.cell.colSpan == null || data.cell.colSpan === 1)
  );
}

function drawIntestazione(pdf: jsPDF, dati: DatiPaginaProdottiPdf): number {
  const pageWidth = pdf.internal.pageSize.getWidth();
  let y = MARGIN + 2;

  pdf.setDrawColor(...C.border);
  pdf.setLineWidth(0.3);
  pdf.setFillColor(...C.rowAlt);
  pdf.rect(MARGIN, y, pageWidth - MARGIN * 2, 14, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...C.textMuted);
  pdf.text("LOGHI", pageWidth / 2, y + 8, { align: "center" });
  y += 18;

  const colWidth = (pageWidth - MARGIN * 2) / 2 - 4;
  const leftX = MARGIN;
  const rightX = MARGIN + colWidth + 8;

  // Client info on left
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(...C.textMuted);
  pdf.text("CLIENTE", leftX, y);
  y += 3.5;
  drawInfoLine(pdf, leftX, y, "RIF. CLIENTE", dati.riferimento);
  y += 3.5;
  drawInfoLine(pdf, leftX, y, "cantiere di", dati.clienteCantiere);
  y += 3.5;
  {
    const label = "Telefono Cliente: ";
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...C.textMuted);
    pdf.text(label, leftX, y);
    const labelW = pdf.getTextWidth(label);
    const telCli = (dati.clienteTelefono || "").trim() || "—";
    pdf.setTextColor(...C.text);
    const telUri = uriTelefono(telCli);
    if (telUri && telCli !== "—") {
      pdf.textWithLink(telCli, leftX + labelW, y, { url: telUri });
    } else {
      pdf.text(telCli, leftX + labelW, y);
    }
  }
  const clienteEndY = y;

  // Offer info on right
  let offertaY = y - 10.5;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(...C.textMuted);
  pdf.text("Data", rightX, offertaY);
  pdf.setTextColor(...C.text);
  pdf.text(formatDataDocumento(dati.dataPreventivo), rightX + 20, offertaY);
  offertaY += 3.5;
  drawInfoLine(pdf, rightX, offertaY, "Offerta n.", dati.numeroPreventivo);
  offertaY += 3.5;
  drawInfoLine(pdf, rightX, offertaY, "Data revisione", "");
  offertaY += 3.5;
  drawInfoLine(pdf, rightX, offertaY, "Revisione numero", dati.revisione || "0");

  y = Math.max(clienteEndY, offertaY) + 5;

  // Blocco sede + riferimento aziendale (sempre presente; vuoto se manca commerciale/sede)
  {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...C.textMuted);
    const sedeTitolo =
      dati.sede?.nome?.trim()
        ? `Sede di ${dati.sede.nome.trim()}${
            dati.sede.indirizzo?.trim()
              ? `, ${dati.sede.indirizzo.trim()}`
              : ""
          }`
        : "";
    if (sedeTitolo) {
      pdf.text(sedeTitolo, leftX, y);
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(...C.textMuted);
    pdf.text("RIFERIMENTO AZIENDALE", rightX, y);
    const rifAz = dati.commerciale?.riferimento_aziendale?.trim() ?? "";
    if (rifAz) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(...C.text);
      pdf.text(rifAz, rightX, y + 3.5);
      y += 8.5;
    } else {
      y += 5;
    }
  }

  // Tabella consulente tecnico (layout fisso; celle vuote se commerciale assente)
  {
    const tableW = pageWidth - MARGIN * 2;
    const col1 = 30;
    const col2 = tableW - col1 - 35 - 28;
    const headerH = 5;
    const rowH = 8;

    pdf.setFillColor(...C.navy);
    pdf.rect(MARGIN, y, tableW, headerH, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6);
    pdf.setTextColor(...C.white);
    let hx = MARGIN + 2;
    pdf.text("CONSULENTE TECNICO", hx, y + 3.5);
    hx += col1;
    pdf.text("CONTATTI CONSULENTE", hx, y + 3.5);
    hx += col2;
    pdf.text("CONSEGNA", hx, y + 3.5);
    pdf.text("VALIDITA' OFFERTA", MARGIN + tableW - 28, y + 3.5);
    y += headerH;

    pdf.setFillColor(...C.white);
    pdf.setDrawColor(...C.border);
    pdf.setLineWidth(0.2);
    pdf.rect(MARGIN, y, tableW, rowH, "FD");

    const nomeVenditore = dati.commerciale?.nome?.trim() ?? "";
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(...C.navy);
    if (nomeVenditore) {
      pdf.text(nomeVenditore, MARGIN + 2, y + 5);
    }

    const tel = dati.commerciale?.telefono?.trim() ?? "";
    const mail = dati.commerciale?.email?.trim() ?? "";
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(...C.text);
    let contattiX = MARGIN + 2 + col1;
    const contattiY = y + 5;
    if (tel) {
      const telUri = uriTelefono(tel);
      if (telUri) {
        pdf.textWithLink(tel, contattiX, contattiY, { url: telUri });
      } else {
        pdf.text(tel, contattiX, contattiY);
      }
      contattiX += pdf.getTextWidth(tel);
    }
    if (tel && mail) {
      const sep = " · ";
      pdf.text(sep, contattiX, contattiY);
      contattiX += pdf.getTextWidth(sep);
    }
    if (mail) {
      const mailUri = uriEmail(mail);
      if (mailUri) {
        pdf.textWithLink(mail, contattiX, contattiY, { url: mailUri });
      } else {
        pdf.text(mail, contattiX, contattiY);
      }
    }

    pdf.text("VEDASI DIETRO", MARGIN + 2 + col1 + col2, y + 5);
    pdf.text(
      `${dati.validitaGiorni || "30"} GIORNI`,
      MARGIN + tableW - 28,
      y + 5,
    );

    y += rowH + 4;
  }

  pdf.setDrawColor(...C.border);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN, y, pageWidth - MARGIN, y);
  return y + 5;
}

function drawRiepilogoImporti(
  pdf: jsPDF,
  dati: DatiPaginaProdottiPdf,
  startY: number,
): number {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const boxWidth = pageWidth - MARGIN * 2;
  const boxX = MARGIN;
  const righe = [
    {
      label: "IMPORTO iva di legge esclusa",
      value: formatEuro(dati.importoTotale),
      bold: false,
    },
  ];

  const scontoTotale = dati.scontoPercentuale + dati.scontoPercentuale2;
  if (scontoTotale > 0) {
    const scontoLabel = dati.scontoPercentuale2 > 0
      ? `${dati.scontoPercentuale}% + ${dati.scontoPercentuale2}%`
      : `${dati.scontoPercentuale}%`;
    righe.push({
      label: "Scontistica a Voi riservata",
      value: scontoLabel,
      bold: false,
    });
  }

  righe.push({
    label: "Importo scontato",
    value: formatEuro(dati.importoScontato),
    bold: true,
  });

  const rowH = 7;
  const boxHeight = 4 + righe.length * rowH + 4;
  let y = ensureSpace(pdf, startY, boxHeight);

  pdf.setFillColor(...C.rowAlt);
  pdf.setDrawColor(...C.border);
  pdf.setLineWidth(0.2);
  pdf.rect(boxX, y, boxWidth, boxHeight, "FD");

  let lineY = y + 7;
  for (const [index, riga] of righe.entries()) {
    const isLast = index === righe.length - 1;
    if (isLast) {
      pdf.setDrawColor(...C.accent);
      pdf.setLineWidth(0.5);
      pdf.line(boxX + 3, lineY - 2, boxX + boxWidth - 3, lineY - 2);
      lineY += 2;
    }

    pdf.setFont("helvetica", riga.bold ? "bold" : "normal");
    pdf.setFontSize(riga.bold ? 9 : 8);
    pdf.setTextColor(...(riga.bold ? C.navy : C.textMuted));
    pdf.text(riga.label, boxX + 4, lineY);

    pdf.setTextColor(...(riga.bold ? C.navy : C.text));
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(riga.bold ? 10 : 9);
    pdf.text(riga.value, boxX + boxWidth - 4, lineY, { align: "right" });
    lineY += rowH;
  }

  return y + boxHeight + 5;
}

function drawTotaleChiaviInMano(
  pdf: jsPDF,
  dati: DatiPaginaProdottiPdf,
  startY: number,
): number {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const boxWidth = pageWidth - MARGIN * 2;
  const boxHeight = 16;
  const y = ensureSpace(pdf, startY, boxHeight);

  pdf.setFillColor(...C.gold);
  pdf.setDrawColor(...C.navy);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(MARGIN, y, boxWidth, boxHeight, 1.2, 1.2, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...C.navy);
  pdf.text("IMPORTO TOTALE LAVORI CHIAVI IN MANO - iva di legge esclusa", MARGIN + 4, y + 7);

  pdf.setFontSize(13);
  pdf.text(formatEuro(dati.totaleFinale), pageWidth - MARGIN - 4, y + 8, {
    align: "right",
  });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.5);
  pdf.setTextColor(...C.text);
  pdf.text(
    `Importo scontato (${formatEuro(dati.importoScontato)}) + servizi (${formatEuro(dati.totaleServizi)})`,
    MARGIN + 4,
    y + 12.5,
  );

  return y + boxHeight + 4;
}

function drawBloccoIva(
  pdf: jsPDF,
  dati: DatiPaginaProdottiPdf,
  startY: number,
): number {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const boxWidth = pageWidth - MARGIN * 2;
  const boxHeight = 22;
  const y = ensureSpace(pdf, startY, boxHeight);

  pdf.setFillColor(...C.rowAlt);
  pdf.setDrawColor(...C.border);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(MARGIN, y, boxWidth, boxHeight, 1.2, 1.2, "FD");

  const rightX = pageWidth - MARGIN - 5;
  let lineY = y + 7;

  // Solo IVA + totale (imponibile già nel box "chiavi in mano" sopra)
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...C.textMuted);
  pdf.text(`IVA ${dati.ivaPercentuale}%`, MARGIN + 5, lineY);
  pdf.setTextColor(...C.text);
  pdf.text(formatEuro(dati.importoIva), rightX, lineY, { align: "right" });

  lineY += 7;
  pdf.setDrawColor(...C.accent);
  pdf.setLineWidth(0.45);
  pdf.line(MARGIN + 5, lineY - 3, pageWidth - MARGIN - 5, lineY - 3);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...C.navy);
  pdf.text("TOTALE IVA INCLUSA", MARGIN + 5, lineY + 2);
  pdf.setFontSize(13);
  pdf.text(`${formatEuro(dati.totaleIvato)}`, rightX, lineY + 2, {
    align: "right",
  });

  return y + boxHeight;
}

function formatTanPdf(tan: number): string {
  if (tan === 0) return "0%";
  return `${tan.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`;
}

/** Casella vuota da barrare a biro sul PDF stampato. */
function drawCheckboxVuota(
  pdf: jsPDF,
  x: number,
  y: number,
  size: number,
  stroke: [number, number, number],
) {
  pdf.setDrawColor(...stroke);
  pdf.setLineWidth(0.45);
  pdf.setFillColor(...C.white);
  pdf.roundedRect(x, y, size, size, 0.6, 0.6, "FD");
}
/**
 * Pagina "Il tuo investimento".
 * Ordine: detrazione → risparmio bolletta → benefit → finanziamento.
 * Palette neutra calda + rosso IWG.
 */
function drawPaginaInvestimento(
  pdf: jsPDF,
  input: DatiFinanziamentoPdfInput,
): void {
  const page = preparaPaginaInvestimentoPdf(input);
  if (!page) return;

  pdf.addPage();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentW = pageWidth - MARGIN * 2;
  const checkSize = 5.5;

  // Neutro caldo + rosso IWG (#F7463D, anche + sbiadito)
  // Ref: https://www.iwgfinestre.it/chi-siamo/
  const I = {
    title: [44, 51, 58] as [number, number, number],
    text: [55, 60, 68] as [number, number, number],
    muted: [130, 125, 118] as [number, number, number],
    red: [247, 70, 61] as [number, number, number],
    redDark: [200, 52, 46] as [number, number, number],
    redSoft: [252, 240, 238] as [number, number, number],
    warmBg: [247, 246, 243] as [number, number, number],
    warmMid: [228, 222, 210] as [number, number, number],
    border: [220, 216, 208] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
  };

  let y = MARGIN + 6;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(...I.title);
  pdf.text("Il tuo investimento", pageWidth / 2, y + 5, { align: "center" });
  pdf.setFillColor(...I.red);
  pdf.roundedRect((pageWidth - 28) / 2, y + 9, 28, 1.2, 0.5, 0.5, "F");
  y += 16;

  // --- 1. Detrazione / investimento reale (prima del risparmio) ---
  if (page.mostraInvestimento && page.investimento) {
    const inv = page.investimento;
    const notaDet = `Detrazione del ${inv.detrazionePerc}% recuperabile in 10 quote annuali (${formatEuro(inv.detrazioneAnnuale)}/anno), subordinata ai requisiti di legge, ai massimali previsti e alla capienza fiscale.`;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    const notaDetLines = pdf.splitTextToSize(notaDet, contentW - 16);
    const invH = 36 + notaDetLines.length * 3.4;

    pdf.setFillColor(...I.white);
    pdf.setDrawColor(...I.border);
    pdf.setLineWidth(0.35);
    pdf.roundedRect(MARGIN, y, contentW, invH, 2.2, 2.2, "FD");
    pdf.setFillColor(...I.warmBg);
    pdf.roundedRect(MARGIN, y, contentW, 10, 2.2, 2.2, "F");
    pdf.rect(MARGIN, y + 6, contentW, 4, "F");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(...I.title);
    pdf.text("Il tuo investimento reale", MARGIN + 6, y + 7);

    const colY = y + 18;
    const col1 = MARGIN + contentW * 0.16;
    const sym1 = MARGIN + contentW * 0.3;
    const col2 = MARGIN + contentW * 0.44;
    const sym2 = MARGIN + contentW * 0.58;
    const col3 = MARGIN + contentW * 0.78;
    const valueBaseline = colY + 8;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...I.muted);
    pdf.text("Importo lavori", col1, colY, { align: "center" });
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(...I.text);
    pdf.text(formatEuro(inv.totaleIvato), col1, valueBaseline, {
      align: "center",
    });

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(...I.warmMid);
    pdf.text("-", sym1, valueBaseline - 1, { align: "center" });

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...I.muted);
    pdf.text(`Detrazione ${inv.detrazionePerc}%`, col2, colY, {
      align: "center",
    });
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(...I.redDark);
    pdf.text(formatEuro(inv.detrazione), col2, valueBaseline, {
      align: "center",
    });

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(...I.warmMid);
    pdf.text("=", sym2, valueBaseline - 1, { align: "center" });

    const costoBoxW = contentW * 0.3;
    const costoBoxX = col3 - costoBoxW / 2;
    pdf.setFillColor(...I.redSoft);
    pdf.setDrawColor(...I.red);
    pdf.setLineWidth(0.55);
    pdf.roundedRect(costoBoxX, colY - 2, costoBoxW, 15, 1.5, 1.5, "FD");

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...I.redDark);
    pdf.text("Costo effettivo", col3, colY + 2, { align: "center" });
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(...I.title);
    pdf.text(formatEuro(inv.costoEffettivo), col3, valueBaseline + 1, {
      align: "center",
    });

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...I.muted);
    pdf.text(
      notaDetLines,
      MARGIN + 6,
      y + invH - 4 - (notaDetLines.length - 1) * 3.4,
    );
    y += invH + 8;
  }

  // --- 2. Hero risparmio bolletta ---
  const heroH = 40;
  pdf.setFillColor(...I.warmBg);
  pdf.setDrawColor(...I.border);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(MARGIN, y, contentW, heroH, 2.5, 2.5, "FD");

  const badgeW = 38;
  const badgeH = 30;
  const badgeX = MARGIN + 8;
  const badgeY = y + (heroH - badgeH) / 2;
  pdf.setFillColor(...I.white);
  pdf.setDrawColor(...I.red);
  pdf.setLineWidth(0.6);
  pdf.roundedRect(badgeX, badgeY, badgeW, badgeH, 2, 2, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.setTextColor(...I.redDark);
  pdf.text("40%", badgeX + badgeW / 2, badgeY + 13, { align: "center" });
  pdf.setFontSize(6);
  pdf.setTextColor(...I.muted);
  pdf.text("FINO AL", badgeX + badgeW / 2, badgeY + 20, { align: "center" });

  const heroTitleX = badgeX + badgeW + 8;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(...I.title);
  pdf.text("di risparmio in bolletta", heroTitleX, y + 13);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...I.text);
  const heroBody =
    "Fino al 30-40% del calore di casa si disperde da finestre poco efficienti. Con infissi ad alta prestazione riduci le dispersioni: più comfort e bollette più leggere, tutto l'anno.";
  const heroLines = pdf.splitTextToSize(heroBody, contentW - badgeW - 28);
  pdf.text(heroLines, heroTitleX, y + 20);
  y += heroH + 7;

  // --- 3. Benefit ---
  const benefits = [
    { t: "Comfort", d: "Casa più calda d'inverno e fresca d'estate" },
    { t: "Energia", d: "Meno dispersioni, consumi più bassi" },
    { t: "Valore", d: "Investimento che si ripaga nel tempo" },
  ];
  const gap = 4;
  const cardW = (contentW - gap * 2) / 3;
  const cardH = 20;
  benefits.forEach((b, i) => {
    const cx = MARGIN + i * (cardW + gap);
    pdf.setFillColor(...I.white);
    pdf.setDrawColor(...I.border);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(cx, y, cardW, cardH, 1.8, 1.8, "FD");
    pdf.setFillColor(...I.red);
    pdf.roundedRect(cx + 3, y + 3, 1.2, cardH - 6, 0.4, 0.4, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(...I.title);
    pdf.text(b.t, cx + 8, y + 8);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...I.muted);
    const dLines = pdf.splitTextToSize(b.d, cardW - 12);
    pdf.text(dLines, cx + 8, y + 13.5);
  });
  y += cardH + 9;

  if (!page.mostraFinanziamento || !page.finanziamento) return;

  const model = page.finanziamento;
  const payStartY = y;
  const headerH = 14;
  pdf.setFillColor(...I.white);
  pdf.setDrawColor(...I.border);
  pdf.setLineWidth(0.35);
  pdf.roundedRect(MARGIN, y, contentW, headerH, 1.8, 1.8, "FD");
  pdf.setFillColor(...I.red);
  pdf.rect(MARGIN, y, 3.5, headerH, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...I.title);
  pdf.text("Le nostre soluzioni di pagamento", MARGIN + 8, y + 6);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...I.muted);
  pdf.text("Barra l'opzione che preferisci", MARGIN + 8, y + 11);
  y += headerH + 5;

  if (model.promo20) {
    const p = model.promo20;
    const ph = 18;
    pdf.setFillColor(...I.white);
    pdf.setDrawColor(...I.redDark);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(MARGIN, y, contentW, ph, 1.5, 1.5, "FD");

    drawCheckboxVuota(
      pdf,
      MARGIN + 5,
      y + (ph - checkSize) / 2,
      checkSize,
      I.redDark,
    );

    const textX = MARGIN + 5 + checkSize + 4;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(...I.title);
    pdf.text("20 mesi a tasso zero", textX, y + 7);

    const badgePromoX = textX + pdf.getTextWidth("20 mesi a tasso zero ") + 2;
    pdf.setFillColor(...I.redSoft);
    pdf.setDrawColor(...I.red);
    pdf.setLineWidth(0.35);
    pdf.roundedRect(badgePromoX, y + 3.5, 14, 5, 0.6, 0.6, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.5);
    pdf.setTextColor(...I.redDark);
    pdf.text("PROMO", badgePromoX + 7, y + 7, { align: "center" });

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...I.muted);
    pdf.text(
      `Anticipo ${formatEuro(p.anticipo)} · finanziato ${formatEuro(p.importoFinanziato)} · interessi 0`,
      textX,
      y + 13.5,
    );

    const rightX = MARGIN + contentW - 5;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(...I.title);
    pdf.text(formatEuro(p.rataMensile), rightX, y + 8, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...I.muted);
    pdf.text("× 20 mesi", rightX, y + 13.5, { align: "right" });

    y += ph + 4;
  }

  if (model.cardsFamiglia.length > 0) {
    const famHeaderH = 10;
    const rowH = 13;
    const blockH = famHeaderH + model.cardsFamiglia.length * rowH;
    const bx = MARGIN;
    const bw = contentW;

    pdf.setDrawColor(...I.border);
    pdf.setLineWidth(0.3);
    pdf.setFillColor(...I.white);
    pdf.roundedRect(bx, y, bw, blockH, 1.5, 1.5, "FD");

    pdf.setFillColor(...I.warmBg);
    pdf.rect(bx, y, bw, famHeaderH, "F");
    pdf.setDrawColor(...I.border);
    pdf.line(bx, y + famHeaderH, bx + bw, y + famHeaderH);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(...I.title);
    pdf.text(model.famigliaLabel, bx + 5, y + 6.5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...I.muted);
    pdf.text(
      `Importo ${formatEuro(model.bloccoImportoFatturato)} · anticipo ${formatEuro(model.bloccoAnticipo)}`,
      bx + bw - 5,
      y + 6.5,
      { align: "right" },
    );

    let rowY = y + famHeaderH;
    model.cardsFamiglia.forEach((card, index) => {
      if (index > 0) {
        pdf.setDrawColor(235, 232, 226);
        pdf.setLineWidth(0.25);
        pdf.line(bx, rowY, bx + bw, rowY);
      }

      drawCheckboxVuota(
        pdf,
        bx + 4,
        rowY + (rowH - checkSize) / 2,
        checkSize,
        I.warmMid,
      );

      const textX = bx + 4 + checkSize + 3.5;
      const tanLabel = card.doppioPiano
        ? `TAN ${formatTanPdf(card.tanPrimaMeta ?? 0)} / ${formatTanPdf(card.tan)}`
        : `TAN ${formatTanPdf(card.tan)}`;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.5);
      pdf.setTextColor(...I.text);
      const mesiLabel = `${card.durataMesi} mesi`;
      const mesiW = pdf.getTextWidth(mesiLabel);
      pdf.text(mesiLabel, textX, rowY + 8);
      pdf.setFontSize(7.5);
      pdf.setTextColor(...I.muted);
      pdf.text(`  ·  ${tanLabel}`, textX + mesiW + 1.5, rowY + 8);

      const rightX = bx + bw - 5;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.setTextColor(...I.title);
      pdf.text(formatEuro(card.rataMensile), rightX, rowY + 6, {
        align: "right",
      });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(...I.muted);
      pdf.text("/mese", rightX, rowY + 10.5, { align: "right" });

      rowY += rowH;
    });

    y += blockH + 5;
  }

  const nota = `Rate comprensive di ${formatEuro(model.istruttoria)} di spese istruttoria, non fatturate da Bruno Drago. Importi indicativi, salvo approvazione dell'istituto erogante; TAN e condizioni economiche nei documenti precontrattuali. Detrazione fiscale subordinata ai requisiti di legge e alla capienza fiscale del contribuente.`;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  const notaLines = pdf.splitTextToSize(nota, contentW - 10);
  pdf.setDrawColor(...I.border);
  pdf.setLineWidth(0.25);
  pdf.line(MARGIN, y, MARGIN + contentW, y);
  pdf.setTextColor(...I.muted);
  pdf.text(notaLines, MARGIN + 2, y + 5);

  const payEndY = y + 5 + notaLines.length * 3.4 + 3;
  pdf.setDrawColor(...I.border);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, payStartY + headerH, MARGIN, payEndY);
  pdf.line(MARGIN + contentW, payStartY + headerH, MARGIN + contentW, payEndY);
  pdf.line(MARGIN, payEndY, MARGIN + contentW, payEndY);
}

/** Stima altezza blocchi finali per tenerli uniti sulla stessa pagina. */
function stimaAltezzaFooter(dati: DatiPaginaProdottiPdf): number {
  const extraSconti =
    (dati.scontoPercentuale > 0 ? 1 : 0) + (dati.scontoPercentuale2 > 0 ? 1 : 0);
  const righeRiepilogo = 2 + extraSconti;
  let h = 6 + righeRiepilogo * 4 + 8;
  if (dati.servizi.length > 0) {
    h += 12 + dati.servizi.length * 5;
  }
  if (dati.notePreventivo.trim()) {
    h += 20;
  }
  h += 20 + 26;
  return h;
}

/** Genera la pagina prodotti con jsPDF + autoTable (page-break e intestazioni ripetute). */
export async function generaPaginaProdottiPdf(
  dati: DatiPaginaProdottiPdf,
): Promise<Uint8Array> {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = pdf.internal.pageSize.getWidth();

  let y = drawIntestazione(pdf, dati);

  // "FORNITURA E POSA" section header (like the real template)
  const fepW = pageWidth - MARGIN * 2;
  pdf.setFillColor(...C.navy);
  pdf.rect(MARGIN, y, fepW, 5, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(...C.white);
  pdf.text("La nostra migliore offerta per il tuo progetto", pageWidth / 2, y + 3.5, { align: "center" });
  y += 7;

  if (dati.righe.length === 0) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...C.textMuted);
    pdf.text("Nessuna riga nel preventivo.", MARGIN, y);
    y += 6;
  } else {
    autoTable(pdf, {
      ...TABLE_BASE,
      startY: y,
      head: [["Q.TA", "DESCRIZIONE", "NOTE/CARATTERISTICHE", "IMPORTO"]],
      body: buildRigheProdottiBody(dati.righe),
      columnStyles: {
        0: {
          cellWidth: 12,
          fontStyle: "bold",
          fontSize: 8,
          textColor: C.navy,
          halign: "center",
        },
        1: { cellWidth: "auto", fontSize: 8 },
        2: { cellWidth: 38, textColor: C.textMuted, fontSize: 7 },
        3: {
          cellWidth: 24,
          halign: "right",
          fontStyle: "bold",
          fontSize: 8,
          textColor: C.navy,
        },
      },
      didParseCell: (data) => {
        if (!isCellaDescrizioneProdotto(data)) return;
        const raw = data.cell.raw as string;
        const plain = descrizionePlainText(raw);
        data.cell.text = (plain.length > 0 ? plain : "—").split("\n");
        if (isDescrizioneCentrata(raw)) {
          data.cell.styles.halign = "center";
        }
      },
      willDrawCell: (data) => {
        if (!isCellaDescrizioneProdotto(data)) return;
        // Disegnamo noi il testo (supporto rosso + a capo).
        data.cell.text = [];
      },
      didDrawCell: (data) => {
        if (!isCellaDescrizioneProdotto(data)) return;
        const raw = data.cell.raw as string;
        drawDescrizioneFormattataInCella(
          pdf,
          data,
          raw.length > 0 ? raw : "—",
        );
      },
    });
    y = getTableEndY(pdf) + 5;
  }

  y = ensureSpace(pdf, y, stimaAltezzaFooter(dati));
  y = drawRiepilogoImporti(pdf, dati, y);

  if (dati.servizi.length > 0) {
    y = drawSectionTitle(pdf, "SERVIZI COMPLEMENTARI", y);

    autoTable(pdf, {
      ...TABLE_BASE,
      startY: y,
      head: [["SERVIZI COMPLEMENTARI", "NOTE", "IMPORTO"]],
      body: dati.servizi.map((servizio) => [
        servizio.descrizione || "—",
        etichettaNotaServizio(servizio.nota),
        etichettaImportoServizio(servizio.importo, servizio.nota),
      ]),
      columnStyles: {
        0: { cellWidth: "auto", fontSize: 8 },
        1: { cellWidth: 36, textColor: C.textMuted, fontSize: 7 },
        2: {
          cellWidth: 24,
          halign: "right",
          fontStyle: "bold",
          fontSize: 8,
          textColor: C.navy,
        },
      },
    });
    y = getTableEndY(pdf) + 5;
  }

  if (dati.notePreventivo.trim()) {
    const noteLines = pdf.splitTextToSize(
      dati.notePreventivo.trim(),
      pdf.internal.pageSize.getWidth() - MARGIN * 2 - 6,
    );
    const notesHeight = 10 + noteLines.length * 3.5;
    y = ensureSpace(pdf, y, notesHeight);
    y = drawSectionTitle(pdf, "Note preventivo", y);

    pdf.setFillColor(...C.rowAlt);
    pdf.setDrawColor(...C.border);
    pdf.setLineWidth(0.2);
    const boxHeight = 4 + noteLines.length * 3.5;
    pdf.rect(MARGIN, y - 2, pdf.internal.pageSize.getWidth() - MARGIN * 2, boxHeight, "FD");
    pdf.setDrawColor(...C.accent);
    pdf.setLineWidth(1);
    pdf.line(MARGIN, y - 2, MARGIN, y - 2 + boxHeight);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...C.text);
    pdf.text(noteLines, MARGIN + 3, y + 2);
    y += boxHeight + 5;
  }

  y = drawTotaleChiaviInMano(pdf, dati, ensureSpace(pdf, y, 18));
  drawBloccoIva(pdf, dati, y);

  if (dati.finanziamento) {
    drawPaginaInvestimento(pdf, dati.finanziamento);
  }

  return new Uint8Array(pdf.output("arraybuffer"));
}
