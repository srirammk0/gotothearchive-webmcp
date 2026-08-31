/**
 * One control surface for every input and textarea in the product. Quiet by
 * default; the border is the only thing that moves on focus. Selects are built
 * from the Menu primitive, not native <select>.
 */
export const controlClass =
  "w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-[length:var(--text-body)] " +
  "text-text outline-none transition-colors duration-[var(--duration-fast)] placeholder:text-faint " +
  "hover:border-hover focus:border-muted";

export const labelClass = "text-[length:var(--text-micro)] text-faint";
