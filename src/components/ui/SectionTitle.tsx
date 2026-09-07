import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3";
};

/** Titolo di sezione (livello 2 tipografico: piccolo, navy). */
export default function SectionTitle({
  children,
  className = "",
  as: Tag = "h2",
}: Props) {
  return (
    <Tag
      className={[
        "text-xs font-semibold uppercase tracking-wide text-brand-navy",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Tag>
  );
}
