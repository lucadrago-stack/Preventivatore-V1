import Link from "next/link";
import type { ReactNode } from "react";

export type BreadcrumbItem = {
  label: ReactNode;
  href?: string;
};

type Props = {
  items: BreadcrumbItem[];
  className?: string;
};

/** Percorso navigabile: Preventivo › Categoria › … */
export default function Breadcrumb({ items, className = "" }: Props) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={["mb-4 text-sm text-brand-muted", className]
        .filter(Boolean)
        .join(" ")}
    >
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="flex items-center gap-1.5">
              {index > 0 && (
                <span className="text-brand-border" aria-hidden>
                  ›
                </span>
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="text-brand-muted underline-offset-2 hover:text-brand-navy hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={
                    isLast ? "font-medium text-brand-text" : "text-brand-muted"
                  }
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
