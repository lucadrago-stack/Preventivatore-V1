import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFPage,
  PDFString,
} from "pdf-lib";

/** Sito aziendale (footer copertina). */
export const SITO_AZIENDALE_URL = "https://www.brunodragoserramenti.it";
export const SITO_AZIENDALE_LABEL = "www.brunodragoserramenti.it";

/** Normalizza un telefono italiano in URI `tel:+39…`. */
export function uriTelefono(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 6) return null;
  const withCountry = digits.startsWith("39") ? digits : `39${digits}`;
  return `tel:+${withCountry}`;
}

export function uriEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return `mailto:${email}`;
}

/**
 * Aggiunge un'annotazione Link URI su una pagina pdf-lib.
 * Rect in punti PDF: [xMin, yMin, xMax, yMax] (origine basso-sinistra).
 */
export function aggiungiLinkUri(
  doc: PDFDocument,
  page: PDFPage,
  uri: string,
  rect: [number, number, number, number],
): void {
  const trimmed = uri.trim();
  if (!trimmed) return;

  const annotRef = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: rect,
      Border: [0, 0, 0],
      A: {
        Type: "Action",
        S: "URI",
        URI: PDFString.of(trimmed),
      },
    }),
  );

  const existing = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (existing) {
    existing.push(annotRef);
  } else {
    page.node.set(PDFName.of("Annots"), doc.context.obj([annotRef]));
  }
}
