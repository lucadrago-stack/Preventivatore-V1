import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import type { AllegatoPerPdf } from "@/lib/allegati-preventivo";
import {
  SITO_AZIENDALE_URL,
  aggiungiLinkUri,
  uriEmail,
  uriTelefono,
} from "@/lib/pdf-link";
import { generaPaginaProdottiPdf, type DatiPaginaProdottiPdf } from "./genera-pagina-prodotti-pdf";
import { generaPaginaCondizioniGeneraliPdf } from "./genera-pagina-condizioni-pdf";
import { TESTO_STANDARD_50_40_10 } from "./condizioni-pagamento";

export { generaPaginaProdottiPdf, type DatiPaginaProdottiPdf };

const PDF_TEMPLATE_BASE = "/pdf-template";

/** Template statici a piena pagina A4 (PNG). */
export const PDF_TEMPLATE_FILES = {
  copertina: `${PDF_TEMPLATE_BASE}/copertina.png`,
  azienda: `${PDF_TEMPLATE_BASE}/azienda.png`,
  produzione: `${PDF_TEMPLATE_BASE}/produzione.png`,
  retro: `${PDF_TEMPLATE_BASE}/retro.png`,
} as const;

/** Fallback se scheda_tecnica_path non è valorizzato nel DB */
export const SCHEDA_TECNICA_BY_NOME: Record<string, string> = {
  "Infisso PVC 70": "scheda_pvc70_clima-line.png",
  "Infisso PVC": "scheda_pvc_clima-76.png",
  "Infisso PVC/Alluminio": "scheda_pvcall_clima-76-alu.png",
  "Infisso Legno": "scheda_legno.png",
  "Infisso Alluminio": "scheda_alluminio.png",
};

export function normalizzaSchedaTecnicaPath(value: string): string {
  const trimmed = value.trim();
  let path = trimmed;
  if (trimmed.startsWith("/pdf-template/")) {
    path = trimmed;
  } else if (trimmed.startsWith("pdf-template/")) {
    path = `/${trimmed}`;
  } else {
    const filename = trimmed.includes("/")
      ? trimmed.split("/").pop()!
      : trimmed;
    path = `${PDF_TEMPLATE_BASE}/${filename}`;
  }

  // Compatibilità DB: schede storiche in .pdf → ora .png
  if (path.toLowerCase().endsWith(".pdf")) {
    path = path.replace(/\.pdf$/i, ".png");
  }
  return path;
}

export function risolviSchedaTecnicaPath(
  schedaDb: string | null | undefined,
  nomeProdotto: string | null | undefined,
): string | null {
  if (schedaDb?.trim()) {
    return normalizzaSchedaTecnicaPath(schedaDb);
  }

  const nome = nomeProdotto?.trim();
  if (nome && SCHEDA_TECNICA_BY_NOME[nome]) {
    return normalizzaSchedaTecnicaPath(SCHEDA_TECNICA_BY_NOME[nome]);
  }

  return null;
}

export function estraiSchedheTecnicheUniche(
  righe: Array<{
    tipo_riga: string;
    scheda_tecnica_path: string | null;
    nome_prodotto: string | null;
  }>,
): string[] {
  const paths: string[] = [];
  const visti = new Set<string>();

  for (const riga of righe) {
    if (riga.tipo_riga !== "prodotto") continue;

    const path = risolviSchedaTecnicaPath(
      riga.scheda_tecnica_path,
      riga.nome_prodotto,
    );
    if (!path || visti.has(path)) continue;

    visti.add(path);
    paths.push(path);
  }

  return paths;
}

export type DatiCopertinaPdf = {
  clienteNome: string;
  numeroPreventivo: string;
  revisione: string;
  dataPreventivo: string;
  validitaGiorni: string;
  commercialeNome: string;
  commercialeTelefono: string;
  commercialeEmail: string;
};

/** Formato gg/mm/aaaa per la copertina (accetta ISO YYYY-MM-DD o già formattata). */
export function formatDataCopertina(data: string | null | undefined): string {
  if (!data?.trim()) return "—";
  const trimmed = data.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`;
  }
  return trimmed;
}

async function caricaBytesDaUrl(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Impossibile caricare il template: ${url}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Rileva PNG/JPEG dai magic bytes (l'estensione del file può mentire). */
function tipoImmagineDaBytes(
  bytes: Uint8Array,
): "png" | "jpeg" | "webp" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "jpeg";
  }
  // RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

/** Converte WebP → PNG via canvas (solo browser; pdf-lib non supporta WebP). */
async function webpToPngBytes(
  bytes: Uint8Array,
): Promise<Uint8Array | null> {
  if (typeof createImageBitmap === "undefined" || typeof document === "undefined") {
    return null;
  }
  try {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy.buffer], { type: "image/webp" });
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!pngBlob) return null;
    return new Uint8Array(await pngBlob.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Aggiunge una pagina A4 e disegna il PNG a piena pagina (0,0 → 595×842).
 */
async function appendPngA4Page(
  target: PDFDocument,
  pngUrl: string,
): Promise<PDFPage> {
  const bytes = await caricaBytesDaUrl(pngUrl);
  const tipo = tipoImmagineDaBytes(bytes);
  if (tipo !== "png") {
    throw new Error(
      `Template non PNG valido: ${pngUrl}` +
        (tipo ? ` (rilevato ${tipo})` : " (formato non supportato)"),
    );
  }
  const image = await target.embedPng(bytes);
  const page = target.addPage(PageSizes.A4);
  const [width, height] = PageSizes.A4;
  page.drawImage(image, {
    x: 0,
    y: 0,
    width,
    height,
  });
  return page;
}

async function appendTutteLePagine(
  target: PDFDocument,
  source: PDFDocument,
): Promise<void> {
  const pagine = await target.copyPages(source, source.getPageIndices());
  for (const pagina of pagine) {
    target.addPage(pagina);
  }
}

/** A4 in punti pdf-lib (allegati non full-bleed). */
const A4 = PageSizes.A4;
const MARGINE_ALLEGATO_IMG = 36;

async function appendAllegato(
  target: PDFDocument,
  allegato: AllegatoPerPdf,
): Promise<void> {
  const bytes = new Uint8Array(allegato.bytes);

  if (allegato.tipo === "pdf") {
    try {
      const pdfAllegato = await PDFDocument.load(bytes);
      await appendTutteLePagine(target, pdfAllegato);
    } catch (err) {
      console.warn(
        `[PDF] Allegato PDF non valido, saltato: ${allegato.nome}`,
        err,
      );
    }
    return;
  }

  // Estensione/content-type possono mentire (es. WebP salvato come .png).
  let tipoReale = tipoImmagineDaBytes(bytes);
  let imageBytes = bytes;

  if (tipoReale === "webp") {
    const convertiti = await webpToPngBytes(bytes);
    if (!convertiti) {
      console.warn(
        `[PDF] Allegato WebP non convertibile, saltato: ${allegato.nome}`,
      );
      return;
    }
    imageBytes = convertiti;
    tipoReale = "png";
  }

  if (tipoReale !== "png" && tipoReale !== "jpeg") {
    console.warn(
      `[PDF] Allegato immagine non supportato (serve PNG/JPG), saltato: ${allegato.nome}`,
    );
    return;
  }

  const image =
    tipoReale === "png"
      ? await target.embedPng(imageBytes)
      : await target.embedJpg(imageBytes);

  const page = target.addPage(A4);
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const dims = image.scale(1);
  const scale = Math.min(
    (pageWidth - MARGINE_ALLEGATO_IMG * 2) / dims.width,
    (pageHeight - MARGINE_ALLEGATO_IMG * 2) / dims.height,
  );
  const width = dims.width * scale;
  const height = dims.height * scale;

  page.drawImage(image, {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  });
}

async function appendAllegati(
  target: PDFDocument,
  allegati: AllegatoPerPdf[],
): Promise<void> {
  for (const allegato of allegati) {
    try {
      await appendAllegato(target, allegato);
    } catch (err) {
      console.warn(`[PDF] Allegato saltato (${allegato.nome}):`, err);
    }
  }
}

/**
 * Overlay dinamici sulla copertina PNG.
 * Coordinate in punti PDF (origine basso-sinistra, pagina A4 595×842).
 * Template: public/pdf-template/copertina.png
 */
async function applicaOverlayCopertina(
  doc: PDFDocument,
  pagina: PDFPage,
  dati: DatiCopertinaPdf,
): Promise<void> {
  const textColor = rgb(0.133, 0.133, 0.133);

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  function scrivi(
    testo: string,
    config: {
      x: number;
      y: number;
      size: number;
      bold?: boolean;
      align?: "left" | "center";
    },
  ) {
    const trimmed = testo.trim();
    if (!trimmed) return;
    const font = config.bold ? fontBold : fontRegular;
    const width = font.widthOfTextAtSize(trimmed, config.size);
    const x =
      config.align === "center" ? config.x - width / 2 : config.x;
    pagina.drawText(trimmed, {
      x,
      y: config.y,
      size: config.size,
      font,
      color: textColor,
    });
  }

  // Cliente — centrato nel box sotto "Il nostro progetto per:"
  // (fascia contenuti ~x 45–305; baseline abbassata per centrare nel pill)
  const CLIENTE_BOX = { x: 45, w: 258, y: 380, h: 28 };
  const clienteNome = dati.clienteNome.trim() || "—";
  const clienteSize = 13;
  const clienteMaxW = CLIENTE_BOX.w - 16;
  let clienteTesto = clienteNome;
  while (
    clienteTesto.length > 1 &&
    fontBold.widthOfTextAtSize(clienteTesto, clienteSize) > clienteMaxW
  ) {
    clienteTesto = `${clienteTesto.slice(0, -2)}…`;
  }
  // Baseline circa a metà pill (Helvetica: centro ottico ≈ size * 0.35 sotto il centro)
  const clienteY =
    CLIENTE_BOX.y + CLIENTE_BOX.h / 2 - clienteSize * 0.35;
  scrivi(clienteTesto, {
    x: CLIENTE_BOX.x + CLIENTE_BOX.w / 2,
    y: clienteY,
    size: clienteSize,
    bold: true,
    align: "center",
  });

  // Dettagli preventivo (valori a destra delle etichette del PNG)
  scrivi(dati.numeroPreventivo.trim() || "—", {
    x: 138,
    y: 355,
    size: 11,
  });
  scrivi(dati.revisione.trim() || "0", {
    x: 92,
    y: 333,
    size: 11,
  });
  scrivi(formatDataCopertina(dati.dataPreventivo), {
    x: 92,
    y: 312,
    size: 11,
  });
  scrivi(`${dati.validitaGiorni.trim() || "30"} giorni`, {
    x: 112,
    y: 289,
    size: 11,
  });

  // Consulente: copriamo il box PNG e ridisegniamo etichetta + contatti.
  const REDATTO = { x: 45, y: 218, w: 258, h: 44 };
  const accent = rgb(27 / 255, 154 / 255, 176 / 255);
  const boxFill = rgb(0.94, 0.94, 0.94);
  const boxBorder = rgb(0.8, 0.82, 0.84);

  pagina.drawRectangle({
    x: REDATTO.x,
    y: REDATTO.y,
    width: REDATTO.w,
    height: REDATTO.h,
    color: boxFill,
    borderColor: boxBorder,
    borderWidth: 0.6,
  });

  const padX = 10;
  const label = "Consulente:";
  const labelSize = 9;
  const labelY = REDATTO.y + REDATTO.h - 14;
  pagina.drawText(label, {
    x: REDATTO.x + padX,
    y: labelY,
    size: labelSize,
    font: fontBold,
    color: accent,
  });

  const nomeComm = dati.commercialeNome.trim();
  if (nomeComm) {
    const labelW = fontBold.widthOfTextAtSize(label, labelSize);
    const nomeSize = 11;
    const maxNomeW = REDATTO.w - padX * 2 - labelW - 6;
    let nome = nomeComm;
    while (
      nome.length > 1 &&
      fontBold.widthOfTextAtSize(nome, nomeSize) > maxNomeW
    ) {
      nome = `${nome.slice(0, -2)}…`;
    }
    pagina.drawText(nome, {
      x: REDATTO.x + padX + labelW + 6,
      y: labelY,
      size: nomeSize,
      font: fontBold,
      color: textColor,
    });
  }

  const telefono = dati.commercialeTelefono.trim();
  const email = dati.commercialeEmail.trim();
  const contattiSize = 8.5;
  const contattiY = REDATTO.y + 11;
  const sep = "   ·   ";
  let cursorX = REDATTO.x + padX;
  const maxX = REDATTO.x + REDATTO.w - padX;

  if (telefono) {
    const telUri = uriTelefono(telefono);
    let telText = telefono;
    while (
      telText.length > 1 &&
      cursorX + fontRegular.widthOfTextAtSize(telText, contattiSize) > maxX
    ) {
      telText = `${telText.slice(0, -2)}…`;
    }
    const telW = fontRegular.widthOfTextAtSize(telText, contattiSize);
    pagina.drawText(telText, {
      x: cursorX,
      y: contattiY,
      size: contattiSize,
      font: fontRegular,
      color: textColor,
    });
    if (telUri) {
      aggiungiLinkUri(doc, pagina, telUri, [
        cursorX - 1,
        contattiY - 2,
        cursorX + telW + 1,
        contattiY + contattiSize,
      ]);
    }
    cursorX += telW;
  }

  if (telefono && email && cursorX + 20 < maxX) {
    const sepW = fontRegular.widthOfTextAtSize(sep, contattiSize);
    pagina.drawText(sep, {
      x: cursorX,
      y: contattiY,
      size: contattiSize,
      font: fontRegular,
      color: textColor,
    });
    cursorX += sepW;
  }

  if (email) {
    const mailUri = uriEmail(email);
    let mailText = email;
    while (
      mailText.length > 1 &&
      cursorX + fontRegular.widthOfTextAtSize(mailText, contattiSize) > maxX
    ) {
      mailText = `${mailText.slice(0, -2)}…`;
    }
    const mailW = fontRegular.widthOfTextAtSize(mailText, contattiSize);
    pagina.drawText(mailText, {
      x: cursorX,
      y: contattiY,
      size: contattiSize,
      font: fontRegular,
      color: textColor,
    });
    if (mailUri) {
      aggiungiLinkUri(doc, pagina, mailUri, [
        cursorX - 1,
        contattiY - 2,
        cursorX + mailW + 1,
        contattiY + contattiSize,
      ]);
    }
  }

  // Footer copertina (barra ciano PNG ≈ y 42–56): aree cliccabili
  aggiungiLinkUri(doc, pagina, SITO_AZIENDALE_URL, [48, 42, 210, 56]);
  const footerTel = uriTelefono(telefono);
  if (footerTel) {
    aggiungiLinkUri(doc, pagina, footerTel, [220, 42, 370, 56]);
  }
  const footerMail = uriEmail(email);
  if (footerMail) {
    aggiungiLinkUri(doc, pagina, footerMail, [380, 42, 545, 56]);
  }
}

export type ParametriPdfCompleto = {
  paginaProdotti: DatiPaginaProdottiPdf;
  schedheTecnichePaths: string[];
  datiCopertina: DatiCopertinaPdf;
  allegati?: AllegatoPerPdf[];
  /** Testo punto 5 condizioni generali (pagamento). */
  condizioniPagamentoTesto?: string | null;
};

export type { AllegatoPerPdf };

/** Genera il PDF completo (pagina prodotti + cucitura template). */
export async function generaPdfCompletoBytes(
  params: ParametriPdfCompleto,
): Promise<Uint8Array> {
  const paginaProdottiBytes = await generaPaginaProdottiPdf(params.paginaProdotti);
  return cucitiPreventivoCompleto({
    paginaProdottiBytes,
    schedheTecnichePaths: params.schedheTecnichePaths,
    datiCopertina: params.datiCopertina,
    allegati: params.allegati,
    condizioniPagamentoTesto: params.condizioniPagamentoTesto,
  });
}

/**
 * Ordine pagine:
 * 1. copertina.png (+ overlay)
 * 2. azienda.png
 * 3. produzione.png
 * 4. pagina prodotti (+ investimento se attivo)
 * 5. schede tecniche .png
 * 6. allegati (se presenti)
 * 7. condizioni generali (testo)
 * 8. retro.png
 */
export async function cucitiPreventivoCompleto(options: {
  paginaProdottiBytes: Uint8Array;
  schedheTecnichePaths: string[];
  datiCopertina: DatiCopertinaPdf;
  allegati?: AllegatoPerPdf[];
  condizioniPagamentoTesto?: string | null;
}): Promise<Uint8Array> {
  const finale = await PDFDocument.create();

  const copertinaPage = await appendPngA4Page(
    finale,
    PDF_TEMPLATE_FILES.copertina,
  );
  await applicaOverlayCopertina(finale, copertinaPage, options.datiCopertina);

  await appendPngA4Page(finale, PDF_TEMPLATE_FILES.azienda);
  await appendPngA4Page(finale, PDF_TEMPLATE_FILES.produzione);

  const paginaProdotti = await PDFDocument.load(options.paginaProdottiBytes);
  await appendTutteLePagine(finale, paginaProdotti);

  for (const path of options.schedheTecnichePaths) {
    await appendPngA4Page(finale, path);
  }

  if (options.allegati && options.allegati.length > 0) {
    await appendAllegati(finale, options.allegati);
  }

  const testoPagamento =
    options.condizioniPagamentoTesto?.trim() || TESTO_STANDARD_50_40_10;
  const condizioniGeneraliBytes =
    await generaPaginaCondizioniGeneraliPdf(testoPagamento);
  const condizioniGenerali = await PDFDocument.load(condizioniGeneraliBytes);
  await appendTutteLePagine(finale, condizioniGenerali);

  await appendPngA4Page(finale, PDF_TEMPLATE_FILES.retro);

  return finale.save();
}

/** Copia in ArrayBuffer “puro” — evita errori Blob con Uint8Array di pdf-lib. */
export function bytesToPdfBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: "application/pdf" });
}

export function scaricaPdf(bytes: Uint8Array, filename: string): void {
  const blob = bytesToPdfBlob(bytes);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
