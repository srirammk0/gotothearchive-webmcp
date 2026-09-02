/**
 * Motion timing, mirrored from styles.css `@theme` (--duration-*, --ease-out)
 * — the one place a JS value (not a Tailwind class) is actually needed, since
 * Motion's `transition` prop takes numbers/arrays, not CSS custom properties.
 */
export const duration = { fast: 0.14, base: 0.26, slow: 0.42 } as const;

/** Motion's array form of the CSS --ease-out curve. */
export const ease = [0.22, 1, 0.36, 1] as const;
