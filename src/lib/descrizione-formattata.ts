/** Formattazione descrizione commerciale: HTML minimale (rosso + centra + a capo). */

export const CENTER_MARKER = "[center]";

export type DescrizioneSegmento = {
  text: string;
  red: boolean;
};

export type DescrizioneParsata = {
  centered: boolean;
  lines: DescrizioneSegmento[][];
};

const RED_STYLE = "color:red";

/** Rileva markup HTML (anche tabelle Excel / paste ricchi). */
export function isDescrizioneHtml(raw: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(raw);
}

/**
 * Se un salvataggio precedente ha escapato i tag (&lt;table&gt;),
 * li riporta a HTML reale così possiamo estrarre solo il testo.
 */
function unescapeEscapedHtmlMarkup(raw: string): string {
  if (!/&lt;\/?[a-z]/i.test(raw)) return raw;
  return unescapeHtml(raw);
}

export function isDescrizioneCentrata(raw: string): boolean {
  if (/text-align\s*:\s*center/i.test(raw)) return true;
  return raw.trimStart().startsWith(CENTER_MARKER);
}

export function stripCenterMarker(raw: string): string {
  return raw.replace(/^\s*\[center\][ \t]*\r?\n?/, "");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function isRedColorValue(value: string): boolean {
  const v = value.trim().toLowerCase().replace(/\s+/g, "");
  if (v === "red" || v === "#f00" || v === "#ff0000" || v === "#c81e1e") {
    return true;
  }
  const rgb = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(v);
  if (rgb) {
    const r = Number(rgb[1]);
    const g = Number(rgb[2]);
    const b = Number(rgb[3]);
    return r >= 180 && g <= 80 && b <= 80;
  }
  return false;
}

function parseLegacyDescrizione(raw: string): DescrizioneParsata {
  const centered = raw.trimStart().startsWith(CENTER_MARKER);
  const body = stripCenterMarker(raw);

  const segments: DescrizioneSegmento[] = [];
  const re = /\*\*([\s\S]*?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    if (match.index > last) {
      segments.push({ text: body.slice(last, match.index), red: false });
    }
    segments.push({ text: match[1], red: true });
    last = match.index + match[0].length;
  }
  if (last < body.length) {
    segments.push({ text: body.slice(last), red: false });
  }
  if (segments.length === 0) {
    segments.push({ text: "", red: false });
  }

  const lines: DescrizioneSegmento[][] = [[]];
  for (const seg of segments) {
    const parts = seg.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      lines[lines.length - 1].push({ text: part, red: seg.red });
    });
  }

  return {
    centered,
    lines: lines.map((line) =>
      line.length === 0 ? [{ text: "", red: false }] : line,
    ),
  };
}

function decodeEntitiesInText(text: string): string {
  return unescapeHtml(text);
}

/**
 * Parser HTML minimale senza DOM (ok in browser e Node).
 * Supporta: <br>, <span style="color:red">, wrapper text-align:center.
 * Strippa tabelle/Excel e altri tag non ammessi tenendo il testo.
 */
function parseHtmlDescrizione(html: string): DescrizioneParsata {
  const centered = /text-align\s*:\s*center/i.test(html);

  let body = html.trim();
  // Rimuove wrapper div di allineamento (eventualmente nested).
  body = body.replace(
    /^<div[^>]*style=["'][^"']*text-align\s*:\s*center[^"']*["'][^>]*>/i,
    "",
  );
  if (/<\/div>\s*$/i.test(body)) {
    body = body.replace(/<\/div>\s*$/i, "");
  }

  // Normalizza blocchi → a capo PRIMA di togliere i tag.
  // Chrome con contentEditable fa spesso: `riga1<div>riga2</div>`
  // (togliere solo <div> attaccava le frasi: CARDINIPALETTA).
  body = body
    .replace(/text-align\s*:\s*center;?/gi, "")
    .replace(/\salign=["']center["']/gi, "")
    .replace(/<div[^>]*>/gi, "<br>")
    .replace(/<\/div>/gi, "")
    .replace(/<p[^>]*>/gi, "<br>")
    .replace(/<\/p>/gi, "")
    .replace(/<\/tr>/gi, "<br>")
    .replace(/<\/(h[1-6]|li|blockquote)>/gi, "<br>")
    .replace(/<(?:table|thead|tbody|tfoot|tr|td|th|colgroup|col)\b[^>]*>/gi, "")
    .replace(/<\/(?:table|thead|tbody|tfoot|tr|td|th|colgroup|col)>/gi, "")
    .replace(/^(?:\s*<br\s*\/?>)+/i, "")
    .replace(/<br\s*\/?>/gi, "\n");

  const lines: DescrizioneSegmento[][] = [];
  const rawLines = body.split("\n");

  for (const rawLine of rawLines) {
    const segs: DescrizioneSegmento[] = [];
    const re =
      /<span\b([^>]*)>([\s\S]*?)<\/span>|<font\b([^>]*)>([\s\S]*?)<\/font>/gi;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(rawLine)) !== null) {
      if (match.index > last) {
        segs.push({
          text: decodeEntitiesInText(stripTags(rawLine.slice(last, match.index))),
          red: false,
        });
      }
      const attrs = match[1] ?? match[3] ?? "";
      const inner = match[2] ?? match[4] ?? "";
      const colorMatch =
        /(?:style=["'][^"']*color\s*:\s*([^;"']+)|color=["']([^"']+)["'])/i.exec(
          attrs,
        );
      const colorVal = (colorMatch?.[1] ?? colorMatch?.[2] ?? "").trim();
      const red = colorVal ? isRedColorValue(colorVal) : false;
      segs.push({
        text: decodeEntitiesInText(stripTags(inner)),
        red,
      });
      last = match.index + match[0].length;
    }
    if (last < rawLine.length) {
      segs.push({
        text: decodeEntitiesInText(stripTags(rawLine.slice(last))),
        red: false,
      });
    }
    lines.push(segs.length === 0 ? [{ text: "", red: false }] : segs);
  }

  if (lines.length === 0) {
    lines.push([{ text: "", red: false }]);
  }

  // Paste Excel: </tr> → a capo lascia spesso una riga vuota in coda.
  while (
    lines.length > 1 &&
    lines[lines.length - 1].every((s) => !s.text.trim())
  ) {
    lines.pop();
  }

  return { centered, lines };
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

/** Serializza la struttura parsata in HTML minimale salvabile (sempre a sinistra). */
export function serializeDescrizioneHtml(parsed: DescrizioneParsata): string {
  const body = parsed.lines
    .map((segs) =>
      segs
        .map((seg) => {
          const t = escapeHtml(seg.text);
          return seg.red ? `<span style="${RED_STYLE}">${t}</span>` : t;
        })
        .join(""),
    )
    .join("<br>");

  return body;
}

/**
 * Parsing unificato: HTML nuovo oppure legacy **testo** / [center].
 * Recupera anche descrizioni corrotte (tag Excel escapati come testo).
 */
export function parseDescrizioneFormattata(raw: string): DescrizioneParsata {
  if (!raw) {
    return { centered: false, lines: [[{ text: "", red: false }]] };
  }
  const unescaped = unescapeEscapedHtmlMarkup(raw);
  if (isDescrizioneHtml(unescaped)) {
    return parseHtmlDescrizione(unescaped);
  }
  return parseLegacyDescrizione(unescaped);
}

/** Converte legacy → HTML; se già HTML, sanifica. Usare al caricamento editor. */
export function normalizeDescrizioneToHtml(raw: string): string {
  if (!raw) return "";
  return serializeDescrizioneHtml(parseDescrizioneFormattata(raw));
}

/**
 * Sanifica HTML da contenteditable (font/span colorati, div/p → br, solo rosso).
 */
export function sanitizeDescrizioneHtml(html: string): string {
  return serializeDescrizioneHtml(parseDescrizioneFormattata(html));
}

export function toggleDescrizioneCentrata(htmlOrLegacy: string): string {
  const parsed = parseDescrizioneFormattata(htmlOrLegacy);
  return serializeDescrizioneHtml({
    ...parsed,
    centered: !parsed.centered,
  });
}

/** Testo senza markup, per altezza cella / stima. */
export function descrizionePlainText(raw: string): string {
  const { lines } = parseDescrizioneFormattata(raw);
  return lines.map((segs) => segs.map((s) => s.text).join("")).join("\n");
}

/** @deprecated Preferire toggleDescrizioneCentrata (HTML). */
export function toggleCenterMarker(raw: string): string {
  return toggleDescrizioneCentrata(raw);
}

/** @deprecated La selezione rossa è gestita dall'editor contenteditable. */
export function wrapSelectionInRed(
  text: string,
  start: number,
  end: number,
): string {
  if (start >= end) return text;
  const selected = text.slice(start, end);
  return `${text.slice(0, start)}**${selected}**${text.slice(end)}`;
}
