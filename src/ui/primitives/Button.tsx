import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const base =
  "inline-flex items-center gap-2 rounded-[var(--radius-sm)] font-sans text-[length:var(--text-meta)] font-medium tracking-wide transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-40";

const variants: Record<Variant, string> = {
  primary:
    "bg-ink text-paper px-4 py-2 hover:bg-accent",
  secondary:
    "border border-hairline text-ink px-4 py-2 hover:border-ink",
  ghost:
    "text-ink-soft px-2 py-1 hover:text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink",
  danger:
    "border border-hairline text-bad px-4 py-2 hover:border-bad",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "secondary", className = "", ...props }: ButtonProps) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props} />
  );
}
