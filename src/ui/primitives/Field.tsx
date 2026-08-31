import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
}

export function Field({ label, hint, id, className = "", ...props }: FieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.14em] text-stone"
      >
        {label}
      </label>
      <input
        id={fieldId}
        className={`border-b border-hairline bg-transparent py-1.5 font-sans text-[length:var(--text-body)] text-ink outline-none placeholder:text-stone-soft focus:border-ink ${className}`}
        {...props}
      />
      {hint ? <p className="font-sans text-[length:var(--text-micro)] text-stone">{hint}</p> : null}
    </div>
  );
}
