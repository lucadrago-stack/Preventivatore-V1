"use client";

import { useEffect, useRef } from "react";
import {
  normalizeDescrizioneToHtml,
  sanitizeDescrizioneHtml,
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
 * Editor WYSIWYG minimale: solo Rosso, a capo liberi.
 * Allineamento sempre a sinistra (niente Centra).
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

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (focusedRef.current) return;
    const current = sanitizeDescrizioneHtml(el.innerHTML);
    if (current === htmlValue) {
      // Anche se il testo coincide, togli eventuali text-align residui nel DOM.
      stripAlignCenterInPlace(el);
      return;
    }
    el.innerHTML = htmlValue || "";
    stripAlignCenterInPlace(el);
  }, [htmlValue]);

  function emitSanitized(rewriteDom: boolean) {
    const el = editorRef.current;
    if (!el) return;
    const cleaned = sanitizeDescrizioneHtml(el.innerHTML);
    if (rewriteDom && el.innerHTML !== cleaned) {
      el.innerHTML = cleaned || "";
      stripAlignCenterInPlace(el);
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
        onPaste={(e) => {
          e.preventDefault();
          const clipboard = e.clipboardData;
          const html = clipboard.getData("text/html");
          const plain = clipboard.getData("text/plain");
          const source = html?.trim() ? html : plain;
          const cleaned = sanitizeDescrizioneHtml(source);
          document.execCommand("insertHTML", false, cleaned || plain);
          emitSanitized(true);
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
          stripAlignCenterInPlace(el);
          onChange(cleaned);
          onBlurSave?.(cleaned);
        }}
        onInput={() => {
          const el = editorRef.current;
          if (!el) return;
          onChange(el.innerHTML);
        }}
        className="min-h-[8.5rem] w-full rounded border border-zinc-300 px-2 py-1 text-left text-sm outline-none focus:border-zinc-500 [&_*]:text-left [&_span]:font-semibold"
        style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", textAlign: "left" }}
      />
      <p className="text-[11px] leading-snug text-zinc-400">
        Selezione + Rosso colora il testo. Testo sempre allineato a sinistra nel
        PDF. A capo liberi.
      </p>
    </div>
  );
}

function stripAlignCenterInPlace(root: HTMLElement) {
  root.style.textAlign = "left";
  root.querySelectorAll<HTMLElement>("*").forEach((node) => {
    if (node.style?.textAlign) {
      node.style.textAlign = "left";
    }
    if (node.getAttribute("align") === "center") {
      node.removeAttribute("align");
    }
  });
}
