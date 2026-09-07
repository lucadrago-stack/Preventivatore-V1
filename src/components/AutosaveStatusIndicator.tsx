"use client";

import type { AutosaveStatus } from "@/hooks/useAutosave";

type Props = {
  status: AutosaveStatus;
  onRetry?: () => void;
  className?: string;
};

/** Indicatore discreto per autosave (non è un pulsante di azione). */
export default function AutosaveStatusIndicator({
  status,
  onRetry,
  className = "",
}: Props) {
  if (status === "idle") return null;

  return (
    <div
      className={[
        "inline-flex min-h-[1.25rem] items-center gap-1.5 text-xs",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-live="polite"
    >
      {status === "saving" && (
        <span className="text-zinc-500">Salvataggio…</span>
      )}
      {status === "saved" && (
        <span className="inline-flex items-center gap-1 font-medium text-green-700">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.208Z"
              clipRule="evenodd"
            />
          </svg>
          Salvato
        </span>
      )}
      {status === "error" && (
        <span className="inline-flex items-center gap-2 text-red-700">
          <span className="font-medium">Errore</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded border border-red-200 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
            >
              Riprova
            </button>
          )}
        </span>
      )}
    </div>
  );
}
