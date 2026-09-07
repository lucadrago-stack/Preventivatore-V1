import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "tertiary" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
  /** Larghezza piena (es. CTA su tablet). */
  fullWidth?: boolean;
};

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    "border border-transparent bg-brand-accent text-white hover:bg-brand-accent-hover disabled:bg-brand-accent/50",
  secondary:
    "border border-brand-border bg-white text-brand-text hover:bg-brand-surface disabled:opacity-50",
  tertiary:
    "border border-transparent bg-transparent text-brand-muted hover:text-brand-navy hover:underline disabled:opacity-50",
  danger:
    "border border-transparent bg-transparent text-brand-danger hover:text-brand-danger-hover hover:underline disabled:opacity-50",
};

/**
 * Una sola azione primary per schermata.
 * secondary = bordo; tertiary = solo testo; danger = elimina discreto (mai pieno rosso).
 */
export default function Button({
  variant = "secondary",
  children,
  fullWidth,
  className = "",
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={[
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed",
        VARIANT_CLASS[variant],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}
