import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

type Common = {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  /** Wrapper class (es. sm:col-span-2). */
  wrapperClassName?: string;
};

type InputProps = Common &
  Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
    as?: "input";
  };

type TextareaProps = Common &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
    as: "textarea";
  };

type SelectProps = Common &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
    as: "select";
    children: ReactNode;
  };

type Props = InputProps | TextareaProps | SelectProps;

const fieldClass =
  "min-h-[44px] w-full rounded-md border border-brand-input-border bg-white px-3 py-2 text-sm text-brand-text outline-none transition-colors placeholder:text-brand-muted/70 focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 disabled:bg-brand-surface disabled:text-brand-muted";

/**
 * Campo con label tipografica secondaria.
 * Per numeri: passare inputMode="decimal" (o "numeric").
 */
export default function Input(props: Props) {
  const { label, hint, error, wrapperClassName = "", className = "" } = props;
  const controlClass = [fieldClass, className].filter(Boolean).join(" ");

  return (
    <label className={["flex flex-col gap-1.5", wrapperClassName].join(" ")}>
      <span className="text-sm text-brand-label">{label}</span>
      {props.as === "textarea" ? (
        <textarea
          {...omitCommon(props)}
          className={[controlClass, "min-h-[88px] py-2.5"].join(" ")}
        />
      ) : props.as === "select" ? (
        <select {...omitCommon(props)} className={controlClass}>
          {props.children}
        </select>
      ) : (
        <input {...omitCommon(props)} className={controlClass} />
      )}
      {hint != null && !error && (
        <span className="text-xs text-brand-muted">{hint}</span>
      )}
      {error && <span className="text-xs text-brand-danger">{error}</span>}
    </label>
  );
}

function omitCommon<T extends Common>(props: T) {
  const {
    label: _l,
    hint: _h,
    error: _e,
    className: _c,
    wrapperClassName: _w,
    as: _a,
    ...rest
  } = props as T & { as?: string };
  return rest;
}

export { fieldClass as inputControlClass };
