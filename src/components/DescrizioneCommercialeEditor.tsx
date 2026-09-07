"use client";

import { useEffect, useRef } from "react";
import {
  isDescrizioneCentrata,
  normalizeDescrizioneToHtml,
  sanitizeDescrizioneHtml,
  toggleDescrizioneCentrata,
} from "@/lib/descrizione-formattata";

type Props = {
  value: string;
  onChange: (html: string) => void;
  /** Chiamato dopo blur, con HTML già sanificato (per autosave). */
  onBlurSave?: (html: string) => void;
  /** Chiave riga: serve a sincronizzare il DOM prima di una navigazione. */
  rigaKey?: string;
};

/**
 * Editor WYSIWYG minimale: solo Rosso + Centra, a capo liberi.
 * Salva HTML minimale in descrizione_cliente.
 */
export default function DescrizioneCommercialeEditor({
  value,
  onChange,
  onBlurSave,
  rigaKey,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);

  const htmlValue = normalizeDescrizioneToHtml(value);
  const centrata = isDescrizioneCentrata(htmlValue);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (focusedRef.current) return;
    const current = sanitizeDescrizioneHtml(el.innerHTML);
    if (current === htmlValue) return;
    el.innerHTML = htmlValue || "";
  }, [htmlValue]);

  function emitSanitized(rewriteDom: boolean) {
    const el = editorRef.current;
    if (!el) return;
    const cleaned = sanitizeDescrizioneHtml(el.innerHTML);
    if (rewriteDom && el.innerHTML !== cleaned) {
      el.innerHTML = cleaned || "";
    }
    onChange(cleaned);
  }

  function applicaRosso() {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("foreColor", false, "red");
    emitSanitized(true);
  }

  function applicaCentra() {
    const base = editorRef.current
      ? sanitizeDescrizioneHtml(editorRef.current.innerHTML)
      : htmlValue;
    const next = toggleDescrizioneCentrata(base);
    onChange(next);
    requestAnimationFrame(() => {
      const el = editorRef.current;
      if (!el) return;
      el.innerHTML = next || "";
      el.focus();
    });
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={applicaRosso}
          className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100"
          title="Colora di rosso la selezione"
        >
          Rosso
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={applicaCentra}
          className={`rounded border px-2 py-0.5 text-xs font-medium hover:bg-zinc-100 ${
            centrata
              ? "border-zinc-400 bg-zinc-200 text-zinc-900"
              : "border-zinc-300 bg-white text-zinc-700"
          }`}
          title="Centra il testo nella cella PDF"
        >
          Centra
        </button>
      </div>
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        data-descrizione-editor={rigaKey ?? "1"}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
          const el = editorRef.current;
          if (!el) {
            onBlurSave?.(sanitizeDescrizioneHtml(htmlValue));
            return;
          }
          const cleaned = sanitizeDescrizioneHtml(el.innerHTML);
          if (el.innerHTML !== cleaned) {
            el.innerHTML = cleaned || "";
          }
          onChange(cleaned);
          onBlurSave?.(cleaned);
        }}
        onInput={() => {
          const el = editorRef.current;
          if (!el) return;
          onChange(el.innerHTML);
        }}
        className={`min-h-[8.5rem] w-full rounded border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-zinc-500 [&_span]:font-semibold ${
          centrata ? "text-center" : "text-left"
        }`}
        style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
      />
      <p className="text-[11px] leading-snug text-zinc-400">
        Selezione + Rosso colora subito il testo. Centra allinea la cella nel
        PDF. A capo liberi.
      </p>
    </div>
  );
}
