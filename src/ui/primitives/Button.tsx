import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const base =
  "inline-flex items-center gap-1.5 rounded-[var(--radius-md)] text-[length:var(--text-meta)] " +
  "transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-40";

const variants: Record<Variant, string> = {
  primary: "bg-text text-canvas px-3 py-1.5 hover:bg-white",
  secondary: "border border-line text-text px-3 py-1.5 hover:border-hover hover:bg-surface",
  ghost: "text-muted px-2 py-1 hover:text-text",
  danger: "border border-line text-muted px-3 py-1.5 hover:border-bad hover:text-bad",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
