/**
 * A non-interactive thumbnail of artifact HTML. Same `sandbox=""` isolation as
 * the full viewer; rendered large then scaled down so text stays crisp.
 */
import { previewSandbox, previewSrcDoc } from "./componentPreview";

export function ArtifactThumb({ html, className = "" }: { html: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-[var(--radius-sm)] border border-line-soft bg-white ${className}`}>
      {html ? (
        <iframe
          title="Artifact preview"
          srcDoc={previewSrcDoc(html)}
          sandbox={previewSandbox(html)}
          referrerPolicy="no-referrer"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{ width: "320%", height: "320%", transform: "scale(0.3125)" }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-[length:var(--text-micro)] text-faint">
          No preview
        </div>
      )}
    </div>
  );
}
