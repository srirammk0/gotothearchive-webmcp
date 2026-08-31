import type { Annotation } from "@shared/contract";

/**
 * Review feedback is intentionally quiet until needed. Creating a note lives
 * beside the artifact in `ArtifactViewer`; this is only its compact record.
 */
export function AnnotationRail({ annotations }: { annotations: Annotation[] }) {
  if (annotations.length === 0) return null;
  return (
    <details className="border-t border-line-soft pt-3">
      <summary className="cursor-pointer text-[length:var(--text-meta)] text-muted hover:text-text">
        Feedback · {annotations.length}
      </summary>
      <ul className="mt-3 flex flex-col">
        {annotations.map((annotation) => (
          <li key={annotation.id} className="border-b border-line-soft py-2.5 text-[length:var(--text-meta)] last:border-0">
            <p className="text-[length:var(--text-micro)] text-faint">
              {annotation.target?.kind === "region" ? "Marked region" : "Version note"}
            </p>
            <p className="mt-1 leading-relaxed text-text">{annotation.comment}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
