import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { TASTE_DIMENSIONS, dimensionLabel, type Annotation, type ArtifactVersion } from "@shared/contract";
import { Button } from "../primitives/Button";
import { Icon } from "../primitives/Icon";
import { duration, ease } from "../tokens";
import { isComponentPreview, previewSandbox, previewSrcDoc } from "./componentPreview";

type Rect = { x: number; y: number; w: number; h: number };

type FeedbackPayload = { comment: string; sentiment: Annotation["sentiment"]; dimensions: string[] };

const SENTIMENTS: { value: Annotation["sentiment"]; label: string; dot: string; on: string }[] = [
  { value: "positive", label: "Positive", dot: "bg-good", on: "bg-good/15 text-good" },
  { value: "neutral", label: "Neutral", dot: "bg-faint", on: "bg-hover text-text" },
  { value: "negative", label: "Negative", dot: "bg-bad", on: "bg-bad/15 text-bad" },
];

/** Shared sentiment toggle row — reused by the rail's inline editor. */
export function SentimentButtons({
  sentiment,
  onSentiment,
}: {
  sentiment: Annotation["sentiment"];
  onSentiment: (s: Annotation["sentiment"]) => void;
}) {
  return (
    <>
      {SENTIMENTS.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => onSentiment(s.value)}
          aria-pressed={sentiment === s.value}
          className={`inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 py-1 text-[length:var(--text-micro)] transition-colors duration-[var(--duration-fast)] ${
            sentiment === s.value ? `${s.on} border-current/15` : "border-transparent bg-hover text-muted hover:text-text"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </button>
      ))}
    </>
  );
}

/** Shared multi-select dimension chips — reused by the rail's inline editor. */
export function DimensionTags({
  dimensions,
  onToggle,
}: {
  dimensions: string[];
  onToggle: (d: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TASTE_DIMENSIONS.map((d) => {
        const on = dimensions.includes(d);
        const disabled = !on && dimensions.length >= 6;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onToggle(d)}
            disabled={disabled}
            aria-pressed={on}
            title={disabled ? "Remove a label before adding another" : undefined}
            className={`rounded-[var(--radius-sm)] border px-2 py-1 text-[length:var(--text-micro)] transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-40 ${
              on
                ? "border-accent/20 bg-accent/15 text-accent"
                : "border-transparent bg-hover text-muted hover:text-text"
            }`}
          >
            {dimensionLabel(d)}
          </button>
        );
      })}
    </div>
  );
}

export const toggleDimension = (list: string[], d: string) =>
  list.includes(d) ? list.filter((x) => x !== d) : list.length < 6 ? [...list, d] : list;

function FeedbackControls({
  sentiment,
  dimensions,
  onSentiment,
  onToggleDimension,
}: {
  sentiment: Annotation["sentiment"];
  dimensions: string[];
  onSentiment: (s: Annotation["sentiment"]) => void;
  onToggleDimension: (d: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <p className="mb-1 text-[length:var(--text-micro)] font-medium text-faint">Reaction</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <SentimentButtons sentiment={sentiment} onSentiment={onSentiment} />
        </div>
      </div>
      <div>
        <p className="mb-1 text-[length:var(--text-micro)] font-medium text-faint">
          Labels <span className="font-normal">· choose up to 6</span>
        </p>
        <DimensionTags dimensions={dimensions} onToggle={onToggleDimension} />
      </div>
    </div>
  );
}

export interface ArtifactViewerProps {
  version: ArtifactVersion;
  annotations?: Annotation[];
  /** Fired when the reviewer draws a region and writes a comment on it. */
  onAddRegion?: (target: { kind: "region" } & Rect, payload: FeedbackPayload) => void;
  /** Fired from the same compact annotation control for a whole-artifact note. */
  onAddComment?: (payload: FeedbackPayload) => void;
}

/**
 * Renders artifact content as untrusted (`sandbox=""` — no scripts, no
 * same-origin). On top of it, a review layer: toggle "Mark a region", drag a
 * box, write a comment. Existing region comments show as numbered boxes.
 */
export function ArtifactViewer({ version, annotations = [], onAddRegion, onAddComment }: ArtifactViewerProps) {
  const [full, setFull] = useState(false);
  const [marking, setMarking] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [comment, setComment] = useState("");
  const [sentiment, setSentiment] = useState<Annotation["sentiment"]>("neutral");
  const [dimensions, setDimensions] = useState<string[]>([]);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [full]);

  const regionAnnotations = annotations.filter(
    (a): a is Annotation & { target: { kind: "region" } & Rect } => a.target?.kind === "region",
  );
  const componentPreview = isComponentPreview(version.content_html);
  const srcDoc = previewSrcDoc(version.content_html);
  const sandbox = previewSandbox(version.content_html);

  const pointFromEvent = (e: React.PointerEvent) => {
    const box = layerRef.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1),
      y: Math.min(Math.max((e.clientY - box.top) / box.height, 0), 1),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!marking) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startRef.current = pointFromEvent(e);
    setDraft({ ...startRef.current, w: 0, h: 0 });
    setComment("");
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!marking || !startRef.current) return;
    const p = pointFromEvent(e);
    const s = startRef.current;
    setDraft({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  };
  const onPointerUp = () => {
    startRef.current = null;
    if (draft && (draft.w < 0.02 || draft.h < 0.02)) setDraft(null);
  };

  const resetFeedback = () => {
    setComment("");
    setSentiment("neutral");
    setDimensions([]);
  };

  const toggleMarking = () => {
    const opening = !marking;
    setMarking(opening);
    setCommenting(false);
    setDraft(null);
    if (opening) resetFeedback();
  };

  const toggleCommenting = () => {
    const opening = !commenting;
    setCommenting(opening);
    setMarking(false);
    setDraft(null);
    if (opening) resetFeedback();
  };

  const cancelRegion = () => {
    setDraft(null);
    setMarking(false);
    resetFeedback();
  };

  const cancelWholeComment = () => {
    setCommenting(false);
    resetFeedback();
  };

  const submit = () => {
    if (!draft || !comment.trim() || !onAddRegion) return;
    onAddRegion({ kind: "region", ...draft }, { comment: comment.trim(), sentiment, dimensions });
    setDraft(null);
    resetFeedback();
    setMarking(false);
  };

  const submitWholeComment = () => {
    if (!comment.trim() || !onAddComment) return;
    onAddComment({ comment: comment.trim(), sentiment, dimensions });
    resetFeedback();
    setCommenting(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex items-center justify-between gap-3">
        <p className="text-[length:var(--text-micro)] text-faint">
          {regionAnnotations.length > 0
            ? `${regionAnnotations.length} region comment(s)`
            : componentPreview
              ? "Interactive component preview · isolated"
              : "Preview"}
        </p>
        {onAddRegion || onAddComment ? (
          <div className="flex items-center gap-1.5 text-[length:var(--text-micro)]">
            {onAddRegion ? (
              <button
                type="button"
                onClick={toggleMarking}
                aria-pressed={marking}
                className={`inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 transition-colors duration-[var(--duration-fast)] ${
                  marking ? "bg-accent/15 text-accent" : "text-muted hover:text-text"
                }`}
              >
                <Icon name="pencil" size={12} /> Mark region
              </button>
            ) : null}
            {onAddComment ? (
              <button
                type="button"
                onClick={toggleCommenting}
                aria-pressed={commenting}
                className={`inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 transition-colors duration-[var(--duration-fast)] ${
                  commenting ? "bg-accent/15 text-accent" : "text-muted hover:text-text"
                }`}
              >
                <Icon name="pencil" size={12} /> Comment on version
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {commenting ? (
        <div className="flex flex-col gap-2 border-b border-line-soft pb-3">
          <label htmlFor="version-feedback" className="text-[length:var(--text-micro)] font-medium text-faint">
            Feedback on this version
          </label>
          <textarea
            id="version-feedback"
            autoFocus
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What worked, or what should change?"
            className="w-full resize-none bg-transparent text-[length:var(--text-body)] text-text placeholder:text-faint"
          />
          <FeedbackControls
            sentiment={sentiment}
            dimensions={dimensions}
            onSentiment={setSentiment}
            onToggleDimension={(d) => setDimensions((prev) => toggleDimension(prev, d))}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={cancelWholeComment}>
              Cancel
            </Button>
            <Button type="button" variant="primary" disabled={!comment.trim()} onClick={submitWholeComment}>
              Save feedback
            </Button>
          </div>
        </div>
      ) : null}

      <div className="group relative">
        <iframe
          title="Artifact content"
          srcDoc={srcDoc}
          sandbox={sandbox}
          referrerPolicy="no-referrer"
          className="h-[560px] w-full rounded-[var(--radius-md)] border border-line bg-white"
        />

        {/* Review layer */}
        <div
          ref={layerRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className={`absolute inset-0 ${marking ? "cursor-crosshair" : "pointer-events-none"}`}
        >
          {regionAnnotations.map((a, i) => (
            <div
              key={a.id}
              className="group/mark absolute rounded-[2px] border-2 border-accent/70"
              style={{
                left: `${a.target.x * 100}%`,
                top: `${a.target.y * 100}%`,
                width: `${a.target.w * 100}%`,
                height: `${a.target.h * 100}%`,
              }}
            >
              <span className="absolute -left-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] text-canvas">
                {i + 1}
              </span>
              <span className="pointer-events-none absolute left-0 top-full mt-1 max-w-[240px] rounded-[var(--radius-sm)] bg-raised px-2 py-1 text-[length:var(--text-micro)] text-text opacity-0 shadow-lg transition-opacity group-hover/mark:opacity-100">
                {a.comment}
              </span>
            </div>
          ))}

          {draft ? (
            <div
              className="absolute rounded-[2px] border-2 border-accent bg-accent/10"
              style={{
                left: `${draft.x * 100}%`,
                top: `${draft.y * 100}%`,
                width: `${draft.w * 100}%`,
                height: `${draft.h * 100}%`,
              }}
            />
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setFull(true)}
          aria-label="View full screen"
          className="absolute right-3 top-3 rounded-[var(--radius-sm)] bg-raised/90 p-1.5 text-muted opacity-0 backdrop-blur transition-opacity duration-[var(--duration-fast)] hover:text-text group-hover:opacity-100"
        >
          <Icon name="expand" size={15} />
        </button>

        {/* Comment composer for the drawn region */}
        {draft && draft.w >= 0.02 && draft.h >= 0.02 ? (
          <div
            className="absolute z-10 w-64 rounded-[var(--radius-md)] border border-line bg-surface p-2.5 shadow-xl"
            style={{
              left: `min(${draft.x * 100}%, calc(100% - 16rem))`,
              top: `calc(${(draft.y + draft.h) * 100}% + 8px)`,
            }}
          >
            <label htmlFor="region-feedback" className="mb-1 block text-[length:var(--text-micro)] font-medium text-faint">
              Feedback on this region
            </label>
            <textarea
              id="region-feedback"
              autoFocus
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What worked, or what should change?"
              className="w-full resize-none bg-transparent text-[length:var(--text-meta)] text-text placeholder:text-faint"
            />
            <div className="mt-1.5">
              <FeedbackControls
                sentiment={sentiment}
                dimensions={dimensions}
                onSentiment={setSentiment}
                onToggleDimension={(d) => setDimensions((prev) => toggleDimension(prev, d))}
              />
            </div>
            <div className="mt-1 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={cancelRegion}>
                Cancel
              </Button>
              <Button type="button" variant="primary" disabled={!comment.trim()} onClick={submit}>
                Save feedback
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {createPortal(
        <AnimatePresence>
          {full ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: duration.fast, ease }}
              className="fixed inset-0 z-50 flex flex-col bg-canvas/95 p-4 backdrop-blur-sm sm:p-8"
              onMouseDown={(e) => e.target === e.currentTarget && setFull(false)}
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[length:var(--text-meta)] text-faint">
                  Version {version.version_no} · {version.state.replace(/_/g, " ")}
                </p>
                <button
                  type="button"
                  onClick={() => setFull(false)}
                  aria-label="Close"
                  className="rounded-[var(--radius-sm)] p-1.5 text-muted transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-text"
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
              <iframe
                title="Artifact content, full screen"
                srcDoc={srcDoc}
                sandbox={sandbox}
                referrerPolicy="no-referrer"
                className="min-h-0 flex-1 rounded-[var(--radius-md)] border border-line bg-white"
              />
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
