import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Sottotitolo / breadcrumb sotto il titolo. */
  meta?: ReactNode;
};

/** Titolo pagina (livello 1: grande, semibold, navy). */
export default function PageTitle({ children, className = "", meta }: Props) {
  return (
    <header className={["mb-6", className].filter(Boolean).join(" ")}>
      <h1 className="text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">
        {children}
      </h1>
      {meta != null && (
        <div className="mt-1 text-sm text-brand-muted">{meta}</div>
      )}
    </header>
  );
}
