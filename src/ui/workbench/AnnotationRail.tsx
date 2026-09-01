import { useState } from "react";
import { dimensionLabel, type Annotation } from "@shared/contract";
import { Button } from "../primitives/Button";
import { Icon } from "../primitives/Icon";
import { DimensionTags, SentimentButtons, toggleDimension } from "./ArtifactViewer";

interface EditChanges {
  comment?: string;
  sentiment?: Annotation["sentiment"];
  dimensions?: string[];
}

function Row({ annotation, onEdit }: { annotation: Annotation; onEdit: (id: string, changes: EditChanges) => void }) {
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState(annotation.comment);
  const [sentiment, setSentiment] = useState<Annotation["sentiment"]>(annotation.sentiment);
  const [dimensions, setDimensions] = useState<string[]>(annotation.dimensions);

  const start = () => {
    setComment(annotation.comment);
    setSentiment(annotation.sentiment);
    setDimensions(annotation.dimensions);
    setEditing(true);
  };
  const save = () => {
    onEdit(annotation.id, { comment: comment.trim(), sentiment, dimensions });
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="border-b border-line-soft py-2.5 text-[length:var(--text-meta)] last:border-0">
        <textarea
          autoFocus
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full resize-none bg-transparent text-[length:var(--text-body)] text-text placeholder:text-faint"
        />
        <div className="mt-1.5 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <SentimentButtons sentiment={sentiment} onSentiment={setSentiment} />
          </div>
          <DimensionTags
            dimensions={dimensions}
            onToggle={(d) => setDimensions((prev) => toggleDimension(prev, d))}
          />
        </div>
        <div className="mt-1.5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button type="button" variant="primary" disabled={!comment.trim()} onClick={save}>
            Save
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="group border-b border-line-soft py-2.5 text-[length:var(--text-meta)] last:border-0">
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
        {annotation.dimensions.map((d) => (
          <span key={d}>{dimensionLabel(d)}</span>
        ))}
        <button
          type="button"
          onClick={start}
          aria-label="Edit feedback"
          className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 text-faint hover:text-text"
        >
          <Icon name="pencil" size={12} />
        </button>
      </p>
      <p className="mt-1 leading-relaxed text-text">{annotation.comment}</p>
    </li>
  );
}

/**
 * Review feedback is intentionally quiet until needed. Creating a note lives
 * beside the artifact in `ArtifactViewer`; this is only its compact record.
 */
export function AnnotationRail({
  annotations,
  onEdit,
}: {
  annotations: Annotation[];
  onEdit: (id: string, changes: EditChanges) => void;
}) {
  if (annotations.length === 0) return null;
  return (
    <details className="border-t border-line-soft pt-3">
      <summary className="cursor-pointer text-[length:var(--text-meta)] text-muted hover:text-text">
        Feedback · {annotations.length}
      </summary>
      <ul className="mt-3 flex flex-col">
        {annotations.map((annotation) => (
          <Row key={annotation.id} annotation={annotation} onEdit={onEdit} />
        ))}
      </ul>
    </details>
  );
}
