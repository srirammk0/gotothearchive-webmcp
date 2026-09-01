import { dimensionLabel, type Annotation } from "@shared/contract";

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
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--text-micro)] text-faint">
              <span>{annotation.target?.kind === "region" ? "Marked region" : "Version note"}</span>
              {annotation.sentiment === "positive" ? (
                <span className="inline-flex items-center gap-1 text-good">
                  <span className="h-1.5 w-1.5 rounded-full bg-good" />
                  Works
                </span>
              ) : annotation.sentiment === "negative" ? (
                <span className="inline-flex items-center gap-1 text-bad">
                  <span className="h-1.5 w-1.5 rounded-full bg-bad" />
                  Doesn't work
                </span>
              ) : null}
              {annotation.dimension ? <span>{dimensionLabel(annotation.dimension)}</span> : null}
            </p>
            <p className="mt-1 leading-relaxed text-text">{annotation.comment}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
