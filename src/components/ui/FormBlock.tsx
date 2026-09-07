import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Riquadro form: card bianca a piena larghezza, titolo maiuscoletto navy.
 * I campi figli vanno in griglia 1→2 colonne; usare sm:col-span-2 per full-width.
 */
export default function FormBlock({ title, children, className = "" }: Props) {
  return (
    <section
      className={[
        "rounded-lg border border-brand-border bg-white p-4 sm:p-5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-navy">
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
