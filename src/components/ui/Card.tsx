import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Padding più compatto (elenchi, tabelle). */
  compact?: boolean;
  /** Evidenzia stato (es. form in modifica). */
  highlighted?: boolean;
};

export default function Card({
  children,
  className = "",
  compact,
  highlighted,
}: Props) {
  return (
    <div
      className={[
        "rounded-lg border bg-white",
        highlighted
          ? "border-brand-accent/40 ring-1 ring-brand-accent/20"
          : "border-brand-border",
        compact ? "p-3" : "p-4 sm:p-5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
