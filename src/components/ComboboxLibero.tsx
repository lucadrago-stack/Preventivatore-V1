"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { inputControlClass } from "@/components/ui";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  wrapperClassName?: string;
};

/**
 * Combobox: tendina filtrabile + valore libero (Enter / blur / click fuori).
 * Stesso pattern della ricerca prodotto nel form categoria.
 */
export default function ComboboxLibero({
  label,
  value,
  onChange,
  options,
  placeholder = "Seleziona o digita...",
  hint,
  disabled,
  wrapperClassName = "",
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [aperto, setAperto] = useState(false);
  const [ricerca, setRicerca] = useState(value);

  useEffect(() => {
    setRicerca(value);
  }, [value]);

  useEffect(() => {
    if (!aperto) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setAperto(false);
        const trimmed = ricerca.trim();
        if (trimmed !== value) onChange(trimmed);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [aperto, onChange, ricerca, value]);

  const filtrate = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, ricerca]);

  function conferma(valore: string) {
    const next = valore.trim();
    setRicerca(next);
    onChange(next);
    setAperto(false);
  }

  return (
    <div
      ref={rootRef}
      className={["relative flex flex-col gap-1.5", wrapperClassName].join(" ")}
    >
      <span className="text-sm text-brand-label">{label}</span>
      <input
        type="text"
        role="combobox"
        aria-expanded={aperto}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        value={ricerca}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setAperto(true)}
        onClick={() => setAperto(true)}
        onChange={(e) => {
          setRicerca(e.target.value);
          setAperto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setAperto(false);
            setRicerca(value);
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            conferma(ricerca);
          }
        }}
        onBlur={() => {
          // conferma valore libero; chiusura lista gestita da mousedown fuori
          const trimmed = ricerca.trim();
          if (trimmed !== value) onChange(trimmed);
        }}
        className={inputControlClass}
      />
      {aperto && !disabled && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-brand-border bg-white shadow-md"
        >
          {filtrate.length > 0 ? (
            filtrate.map((opzione) => (
              <li key={opzione} role="option">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => conferma(opzione)}
                  className={`min-h-[44px] w-full px-3 py-2 text-left text-sm hover:bg-brand-surface ${
                    value === opzione
                      ? "bg-brand-surface font-medium text-brand-navy"
                      : "text-brand-text"
                  }`}
                >
                  {opzione}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-sm text-brand-muted">
              Nessuna corrispondenza — premi Invio per usare «{ricerca.trim() || "…"}»
            </li>
          )}
        </ul>
      )}
      {hint && <span className="text-xs text-brand-muted">{hint}</span>}
    </div>
  );
}
