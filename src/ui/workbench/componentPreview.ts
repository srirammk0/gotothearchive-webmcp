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
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.tailwindcss.com; style-src 'unsafe-inline'; img-src ${imgSrc}; font-src data:; connect-src 'none'; worker-src blob:; frame-src 'none'; form-action 'none'; base-uri 'none'">`;
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
  return isComponentPreview(html) ? "allow-scripts" : "";
}
