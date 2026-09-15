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

/**
 * Telefono per visualizzazione PDF: senza prefisso +39, formato nazionale.
 * Es. "+393401000964" → "340 1000964". Non modifica il dato in DB.
 * I link `tel:` restano con uriTelefono (prefisso internazionale).
 */
export function formatTelefonoPdf(raw: string | null | undefined): string {
  const original = (raw ?? "").trim();
  if (!original || original === "—") return original;

  let digits = original.replace(/\D/g, "");
  if (!digits) return original;

  // Prefisso internazionale Italia: 0039 / 39
  if (digits.startsWith("0039") && digits.length >= 13) {
    digits = digits.slice(4);
  } else if (digits.startsWith("39") && digits.length >= 11) {
    digits = digits.slice(2);
  }

  if (!digits) return original;

  // Cellulare italiano: 3XX… (9–10 cifre)
  if (/^3\d{8,9}$/.test(digits)) {
    return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  }

  // Fisso nazionale che inizia con 0
  if (/^0\d{8,10}$/.test(digits)) {
    return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  }

  return digits;
}

/** Normalizza un telefono italiano in URI `tel:+39…`. */
export function uriTelefono(raw: string | null | undefined): string | null {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("0039")) {
    digits = digits.slice(4);
  } else if (digits.startsWith("39") && digits.length >= 11) {
    digits = digits.slice(2);
  }
  if (digits.length < 6) return null;
  return `tel:+39${digits}`;
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
