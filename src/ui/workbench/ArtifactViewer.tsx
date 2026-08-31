import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import type { Annotation, ArtifactVersion } from "@shared/contract";
import { Button } from "../primitives/Button";
import { Icon } from "../primitives/Icon";
import { duration, ease } from "../tokens";
import { isComponentPreview, previewSandbox, previewSrcDoc } from "./componentPreview";

type Rect = { x: number; y: number; w: number; h: number };

export interface ArtifactViewerProps {
  version: ArtifactVersion;
  annotations?: Annotation[];
  /** Fired when the reviewer draws a region and writes a comment on it. */
  onAddRegion?: (target: { kind: "region" } & Rect, comment: string) => void;
}

/**
 * Renders artifact content as untrusted (`sandbox=""` — no scripts, no
 * same-origin). On top of it, a review layer: toggle "Mark a region", drag a
 * box, write a comment. Existing region comments show as numbered boxes.
 */
export function ArtifactViewer({ version, annotations = [], onAddRegion }: ArtifactViewerProps) {
  const [full, setFull] = useState(false);
  const [marking, setMarking] = useState(false);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [comment, setComment] = useState("");
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

  const submit = () => {
    if (!draft || !comment.trim() || !onAddRegion) return;
    onAddRegion({ kind: "region", ...draft }, comment.trim());
    setDraft(null);
    setComment("");
    setMarking(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[length:var(--text-micro)] text-faint">
          {regionAnnotations.length > 0
            ? `${regionAnnotations.length} region comment(s)`
            : componentPreview
              ? "Interactive component preview · isolated"
              : "Preview"}
        </p>
        {onAddRegion ? (
          <button
            type="button"
            onClick={() => {
              setMarking((v) => !v);
              setDraft(null);
            }}
            aria-pressed={marking}
            className={`inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-[length:var(--text-micro)] transition-colors duration-[var(--duration-fast)] ${
              marking ? "bg-accent/15 text-accent" : "text-muted hover:text-text"
            }`}
          >
            <Icon name="pencil" size={12} />
            {marking ? "Marking — drag a box" : "Mark a region"}
          </button>
        ) : null}
      </div>

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
            <textarea
              autoFocus
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What about this region?"
              className="w-full resize-none bg-transparent text-[length:var(--text-meta)] text-text placeholder:text-faint"
            />
            <div className="mt-1 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" disabled={!comment.trim()} onClick={submit}>
                Comment
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
