import { useState } from "react";
import type { Annotation } from "@shared/contract";
import { Button } from "../primitives/Button";
import { EmptyState } from "../primitives/EmptyState";

const SENTIMENT_META: Record<Annotation["sentiment"], { glyph: string; label: string }> = {
  positive: { glyph: "+", label: "Positive" },
  negative: { glyph: "−", label: "Negative" },
  neutral: { glyph: "·", label: "Neutral" },
};

export interface AnnotationRailProps {
  annotations: Annotation[];
  onAdd: (input: { sentiment: Annotation["sentiment"]; comment: string; dimension: string | null }) => void;
}

/**
 * Every annotation here targets the whole artifact (target: null). Spatial
 * region-drawing is out of scope for this pass; the list is itself the
 * required structured, non-spatial equivalent.
 */
export function AnnotationRail({ annotations, onAdd }: AnnotationRailProps) {
  const [sentiment, setSentiment] = useState<Annotation["sentiment"]>("neutral");
  const [dimension, setDimension] = useState("");
  const [comment, setComment] = useState("");

  const submit = () => {
    if (!comment.trim()) return;
    onAdd({ sentiment, comment: comment.trim(), dimension: dimension.trim() || null });
    setComment("");
    setDimension("");
    setSentiment("neutral");
  };

  return (
    <section aria-label="Annotations" className="flex flex-col gap-4">
      <p className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.14em] text-stone">Annotations</p>

      {annotations.length === 0 ? (
        <EmptyState title="No annotations yet" body="Leave a comment on this version below." />
      ) : (
        <ul className="flex flex-col gap-4">
          {annotations.map((a) => {
            const meta = SENTIMENT_META[a.sentiment];
            return (
              <li key={a.id} className="border-t border-hairline pt-3">
                <p className="font-sans text-[length:var(--text-meta)] text-stone">
                  <span aria-hidden="true">{meta.glyph}</span> {meta.label} · {a.dimension ?? "general"} · {a.status}
                  {a.id.startsWith("optimistic_") ? " · sending…" : ""}
                </p>
                <p className="mt-1 font-sans text-[length:var(--text-body)] text-ink">{a.comment}</p>
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="flex flex-col gap-2 border-t border-hairline pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.14em] text-stone" htmlFor="annotation-sentiment">
          Sentiment
        </label>
        <select
          id="annotation-sentiment"
          value={sentiment}
          onChange={(e) => setSentiment(e.target.value as Annotation["sentiment"])}
          className="border-b border-hairline bg-transparent py-1.5 font-sans text-[length:var(--text-body)] text-ink outline-none focus:border-ink"
        >
          {(Object.keys(SENTIMENT_META) as Annotation["sentiment"][]).map((s) => (
            <option key={s} value={s}>
              {SENTIMENT_META[s].glyph} {SENTIMENT_META[s].label}
            </option>
          ))}
        </select>

        <label className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.14em] text-stone" htmlFor="annotation-dimension">
          Dimension (optional)
        </label>
        <input
          id="annotation-dimension"
          value={dimension}
          onChange={(e) => setDimension(e.target.value)}
          placeholder="typography, composition…"
          className="border-b border-hairline bg-transparent py-1.5 font-sans text-[length:var(--text-body)] text-ink outline-none placeholder:text-stone-soft focus:border-ink"
        />

        <label className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.14em] text-stone" htmlFor="annotation-comment">
          Comment
        </label>
        <textarea
          id="annotation-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Whole-artifact comment…"
          className="border-b border-hairline bg-transparent py-1.5 font-sans text-[length:var(--text-body)] text-ink outline-none placeholder:text-stone-soft focus:border-ink"
        />
        <Button type="submit" variant="secondary" className="self-start">
          Add comment
        </Button>
      </form>
    </section>
  );
}
