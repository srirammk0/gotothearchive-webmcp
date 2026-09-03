import { ARTIFACT_ASPECTS, ASPECT_RATIO, type ArtifactAspect } from "@shared/contract";
/**
 * Component artifacts are an explicit, narrowly-scoped exception to the
 * default static preview. Their code runs in an opaque iframe, never in the
 * Archive's origin, and the injected CSP removes network and host access.
 */
const COMPONENT_MARKER = '<meta name="gotothearchive-renderer" content="component">';

/**
 * img-src names this app's own origin explicitly, not 'self'. The iframe is
 * sandbox="allow-scripts" without allow-same-origin, so its document has an
 * opaque, unique origin — 'self' would mean *that* opaque origin, which
 * never matches any real URL, so it would silently permit nothing. An
 * explicit origin isn't subject to that: CSP source matching is about the
 * requested URL, not the document's own (opaque) origin. This is what lets
 * embed_url (this app's /api/blob path, or a captured link's own extracted
 * image) actually load — a real logo or reference photo, not a placeholder.
 */
function componentCsp(): string {
  // typeof-guarded: this file also runs under bun:test (no DOM), and should
  // degrade to the old data:/blob:-only behavior there rather than throw —
  // same fail-closed shape as everything else here (no signing secret, no
  // AI binding, etc. all quietly omit the feature instead of erroring).
  const origin = typeof window !== "undefined" ? window.location.origin : null;
  const imgSrc = origin ? `data: blob: ${origin}` : "data: blob:";
  // Script + style CDNs a component build actually reaches for: React/ReactDOM
  // and Babel-standalone UMD, Tailwind's play CDN, and the common package
  // mirrors. connect-src stays 'none' — a component builds from the data it was
  // given, it does not call out. The iframe is still opaque-origin (no
  // allow-same-origin), so a widened script-src cannot touch this app.
  const scriptSrc =
    "'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net " +
    "https://cdnjs.cloudflare.com https://esm.sh https://cdn.tailwindcss.com https://code.jquery.com";
  const styleSrc = "'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com";
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${scriptSrc}; style-src ${styleSrc}; img-src ${imgSrc}; font-src data: https://fonts.gstatic.com; connect-src 'none'; worker-src blob:; frame-src 'none'; form-action 'none'; base-uri 'none'">`;
}

export function markComponentPreview(html: string): string {
  return html.includes(COMPONENT_MARKER) ? html : `${COMPONENT_MARKER}${html}`;
}

export function isComponentPreview(html: string): boolean {
  return html.includes(COMPONENT_MARKER);
}

export function previewSrcDoc(html: string): string {
  if (!isComponentPreview(html)) return html;
  const csp = componentCsp();
  return /<head(?:\s[^>]*)?>/i.test(html)
    ? html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${csp}`)
    : `<!doctype html><html><head>${csp}</head><body>${html}</body></html>`;
}

export function previewSandbox(html: string): string {
  // No allow-same-origin: the document stays opaque-origin and cannot reach this
  // app. allow-forms / allow-modals / allow-pointer-lock let an actual
  // interactive component work (inputs, alert/confirm, canvas games).
  return isComponentPreview(html) ? "allow-scripts allow-forms allow-modals allow-pointer-lock" : "";
}

const ASPECT_MARKER_RE = /<meta\s+name=["']gotothearchive-aspect["']\s+content=["']([^"']+)["']\s*\/?>/i;

/**
 * The CSS `aspect-ratio` this artifact declared, or null for "auto" and for
 * anything recorded before artifacts declared a shape.
 */
export function previewAspectRatio(html: string): string | null {
  const found = ASPECT_MARKER_RE.exec(html);
  if (!found) return null;
  const key = found[1] as ArtifactAspect;
  return (ARTIFACT_ASPECTS as readonly string[]).includes(key) ? ASPECT_RATIO[key] : null;
}
