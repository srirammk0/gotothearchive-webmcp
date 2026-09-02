import { useState } from "react";
import type { Annotation } from "@shared/contract";
import { Button } from "../primitives/Button";
import { Disclosure } from "../primitives/Disclosure";
import { Icon } from "../primitives/Icon";
import { SentimentButtons } from "./ArtifactViewer";

interface EditChanges {
  comment?: string;
  sentiment?: Annotation["sentiment"];
}

function Row({
  annotation,
  onEdit,
}: {
  annotation: Annotation;
  onEdit: (id: string, changes: EditChanges) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState(annotation.comment);
  const [sentiment, setSentiment] = useState<Annotation["sentiment"]>(annotation.sentiment);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const start = () => {
    setComment(annotation.comment);
    setSentiment(annotation.sentiment);
    setSaveError("");
    setEditing(true);
  };
  const save = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await onEdit(annotation.id, { comment: comment.trim(), sentiment });
      setEditing(false);
    } catch {
      setSaveError("Couldn't save this feedback. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <li className="border-b border-line-soft py-2.5 text-meta last:border-0">
        <label
          htmlFor={`annotation-${annotation.id}`}
          className="mb-1 block text-micro font-medium text-faint"
        >
          Feedback
        </label>
        <textarea
          id={`annotation-${annotation.id}`}
          autoFocus
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full resize-none bg-transparent text-body text-text placeholder:text-faint"
        />
        <div className="mt-2.5 flex flex-col gap-2.5">
          <div>
            <p className="mb-1 text-micro font-medium text-faint">Reaction</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <SentimentButtons sentiment={sentiment} onSentiment={setSentiment} />
            </div>
          </div>
        </div>
        {saveError ? (
          <p role="alert" className="mt-2 text-micro text-bad">
            {saveError}
          </p>
        ) : null}
        <div className="mt-1.5 flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button type="button" variant="primary" disabled={!comment.trim() || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save feedback"}
          </Button>
        </div>
      </li>
    );
  }

  const sentimentMeta =
    annotation.sentiment === "positive"
      ? { label: "Positive", className: "bg-good/15 text-good" }
      : annotation.sentiment === "negative"
        ? { label: "Negative", className: "bg-bad/15 text-bad" }
        : { label: "Neutral", className: "bg-hover text-muted" };

  return (
    <li className="group border-b border-line-soft py-2.5 text-meta last:border-0">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-faint">
        <span>{annotation.target?.kind === "region" ? "Marked region" : "Version note"}</span>
        <span className={`rounded-[var(--radius-sm)] px-1.5 py-0.5 ${sentimentMeta.className}`}>
          {sentimentMeta.label}
        </span>
        <button
          type="button"
          onClick={start}
          className="ml-auto inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-faint transition-colors hover:bg-hover hover:text-text"
        >
          <Icon name="pencil" size={12} />
          Edit
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
  onEdit: (id: string, changes: EditChanges) => Promise<void>;
}) {
  if (annotations.length === 0) return null;
  return (
    <Disclosure className="border-t border-line-soft pt-1" defaultOpen summary={`Feedback · ${annotations.length}`}>
      <ul className="mt-2 flex flex-col">
        {annotations.map((annotation) => (
          <Row key={annotation.id} annotation={annotation} onEdit={onEdit} />
        ))}
      </ul>
    </Disclosure>
  );
}
