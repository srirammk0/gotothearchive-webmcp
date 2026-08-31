/**
 * Component artifacts are an explicit, narrowly-scoped exception to the
 * default static preview. Their code runs in an opaque iframe, never in the
 * Archive's origin, and the injected CSP removes network and host access.
 */
const COMPONENT_MARKER = '<meta name="gotothearchive-renderer" content="component">';

const COMPONENT_CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.tailwindcss.com; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; worker-src blob:; frame-src 'none'; form-action 'none'; base-uri 'none'">`;

export function markComponentPreview(html: string): string {
  return html.includes(COMPONENT_MARKER) ? html : `${COMPONENT_MARKER}${html}`;
}

export function isComponentPreview(html: string): boolean {
  return html.includes(COMPONENT_MARKER);
}

export function previewSrcDoc(html: string): string {
  if (!isComponentPreview(html)) return html;
  return /<head(?:\s[^>]*)?>/i.test(html)
    ? html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${COMPONENT_CSP}`)
    : `<!doctype html><html><head>${COMPONENT_CSP}</head><body>${html}</body></html>`;
}

export function previewSandbox(html: string): string {
  return isComponentPreview(html) ? "allow-scripts" : "";
}
