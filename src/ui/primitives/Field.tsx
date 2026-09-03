/**
 * One control surface for every input and textarea in the product. A hover tint
 * on the border, and the standard accent focus outline (styles.css) on keyboard
 * focus. Selects are built from the Menu primitive, not native <select>.
 */
export const controlClass =
  "w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-body " +
  "text-text transition-colors duration-[var(--duration-fast)] placeholder:text-faint " +
  "hover:border-hover";

export const labelClass = "text-micro text-faint";
