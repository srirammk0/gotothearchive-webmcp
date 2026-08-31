import { useState } from "react";
import { motion } from "motion/react";
import type { Annotation } from "@shared/contract";
import { Button } from "../primitives/Button";
import { EmptyState } from "../primitives/EmptyState";
import { Menu } from "../primitives/Menu";
import { Icon } from "../primitives/Icon";
import { controlClass, labelClass } from "../primitives/Field";
import { duration, ease } from "../tokens";

const SENTIMENT_META: Record<Annotation["sentiment"], { glyph: string; label: string; tone: string }> = {
  positive: { glyph: "+", label: "Positive", tone: "text-good" },
  negative: { glyph: "−", label: "Negative", tone: "text-bad" },
  neutral: { glyph: "·", label: "Neutral", tone: "text-muted" },
};

export interface AnnotationRailProps {
  annotations: Annotation[];
  onAdd: (input: { sentiment: Annotation["sentiment"]; comment: string; dimension: string | null }) => void;
}

/**
 * Whole-artifact comments. Region-scoped comments are drawn directly on the
 * artifact in ArtifactViewer; both land in the same annotation list.
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
      <p className="border-t border-line pt-4 text-[length:var(--text-section)] text-text">Annotations</p>

      {annotations.length === 0 ? (
        <EmptyState title="No annotations yet" body="Leave a comment on this version below." />
      ) : (
        <ul className="flex flex-col">
          {annotations.map((a) => {
            const meta = SENTIMENT_META[a.sentiment];
            const sending = a.id.startsWith("optimistic_");
            return (
              <motion.li
                key={a.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: sending ? 0.55 : 1, y: 0 }}
                transition={{ duration: duration.fast, ease }}
                className="border-b border-line-soft py-3"
              >
                <p className="text-[length:var(--text-micro)] text-faint">
                  <span aria-hidden="true" className={meta.tone}>
                    {meta.glyph}
                  </span>{" "}
                  {meta.label} · {a.target?.kind === "region" ? "region" : a.dimension ?? "general"} · {a.status}
                  {sending ? " · sending…" : ""}
                </p>
                <p className="mt-1 text-[length:var(--text-body)] leading-relaxed text-text">{a.comment}</p>
              </motion.li>
            );
          })}
        </ul>
      )}

      <form
        className="flex flex-col gap-3 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <span className={labelClass}>Sentiment</span>
            <Menu
              className="block w-full"
              items={(Object.keys(SENTIMENT_META) as Annotation["sentiment"][]).map((s) => ({
                label: `${SENTIMENT_META[s].glyph}  ${SENTIMENT_META[s].label}`,
                onSelect: () => setSentiment(s),
              }))}
              trigger={({ toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  className={`${controlClass} flex items-center justify-between`}
                >
                  <span>
                    <span className={SENTIMENT_META[sentiment].tone}>{SENTIMENT_META[sentiment].glyph}</span>{" "}
                    {SENTIMENT_META[sentiment].label}
                  </span>
                  <Icon name="chevronRight" size={12} className="rotate-90 text-faint" />
                </button>
              )}
            />
          </div>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className={labelClass}>Dimension</span>
            <input
              id="annotation-dimension"
              value={dimension}
              onChange={(e) => setDimension(e.target.value)}
              placeholder="typography…"
              className={controlClass}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Comment</span>
          <textarea
            id="annotation-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Whole-artifact comment…"
            className={`${controlClass} resize-none`}
          />
        </label>
        <Button type="submit" variant="secondary" className="self-start">
          Add comment
        </Button>
      </form>
    </section>
  );
}
