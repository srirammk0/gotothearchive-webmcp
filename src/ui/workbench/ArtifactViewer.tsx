import type { ArtifactVersion } from "@shared/contract";

/**
 * Renders artifact content as untrusted. `sandbox=""` (no allow-scripts,
 * no allow-same-origin) means the frame cannot run script, read cookies,
 * navigate the parent, or touch storage — viewing is fully separated from
 * execution per docs/product/workbench.md.
 */
export function ArtifactViewer({ version }: { version: ArtifactVersion }) {
  return (
    <iframe
      title="Artifact content"
      srcDoc={version.content_html}
      sandbox=""
      referrerPolicy="no-referrer"
      className="h-[520px] w-full border border-hairline bg-paper-raised"
    />
  );
}
