import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ContextItem, Region } from "@shared/contract";
import { Button } from "../primitives/Button";
import { Icon } from "../primitives/Icon";
import { controlClass } from "../primitives/Field";
import { ConnectionsPanel } from "./ConnectionsPanel";
import { extractedImage, FileCard, kind, tweetId } from "./itemKind";
import { Tweet } from "./Tweet";
import { ArtifactThumb } from "../workbench/ArtifactThumb";
import { blobUrl } from "../../api/client";
import { duration, ease } from "../tokens";

function host(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function PreviewPane({ item }: { item: ContextItem }) {
  const [imgFailed, setImgFailed] = useState(false);
  const { render } = kind(item);
  const tw = tweetId(item.source_url);
  const img = extractedImage(item);

  if (render === "image" && item.content_ref) {
    return <img src={blobUrl(item.content_ref)} alt="" className="max-h-full max-w-full object-contain" />;
  }
  if (render === "pdf" && item.content_ref) {
    return (
      <iframe
        title={item.title}
        src={`${blobUrl(item.content_ref)}#view=FitH`}
        className="h-full w-full rounded-[var(--radius-sm)] bg-white"
      />
    );
  }
  if (render === "text" && item.content_ref) {
    return <iframe title={item.title} src={blobUrl(item.content_ref)} className="h-full w-full rounded-[var(--radius-sm)] bg-white" />;
  }
  if (render === "artifact") {
    return <ArtifactThumb html={String(item.metadata?.preview_html ?? "")} className="h-full w-full" />;
  }
  if (render === "office") return <FileCard item={item} big />;
  if (render === "tweet" && tw) {
    return (
      <div className="no-scrollbar h-full w-full max-w-[520px] overflow-y-auto">
        <Tweet id={tw} />
      </div>
    );
  }
  if (img && !imgFailed) {
    return (
      <img
        src={img}
        alt=""
        onError={() => setImgFailed(true)}
        className="max-h-full max-w-full rounded-[var(--radius-sm)] object-contain"
      />
    );
  }
  return (
    <div className="flex max-w-prose flex-col gap-2">
      {host(item.source_url) ? (
        <span className="text-[length:var(--text-micro)] uppercase tracking-wide text-faint">
          {host(item.source_url)}
        </span>
      ) : null}
      <p className="text-[length:var(--text-body)] leading-relaxed text-muted">
        {item.semantic_text?.trim() || item.title}
      </p>
    </div>
  );
}

/**
 * The step right after a capture: the thing large on the left, everything you
 * can change about it on the right. Same shape as the item lightbox, minus the
 * prev/next — you just made this one thing.
 */
export function CapturePreview({
  item,
  region,
  allItems,
  onEdit,
  onClose,
}: {
  item: ContextItem;
  region: Region | null;
  allItems: ContextItem[];
  onEdit: (id: string, changes: { title?: string; semantic_text?: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [desc, setDesc] = useState(item.semantic_text ?? "");

  useEffect(() => {
    setTitle(item.title);
    setDesc(item.semantic_text ?? "");
  }, [item.id, item.title, item.semantic_text]);

  const saveTitle = () => {
    const next = title.trim();
    if (next && next !== item.title) onEdit(item.id, { title: next });
  };
  const saveDesc = () => {
    if (desc !== (item.semantic_text ?? "")) onEdit(item.id, { semantic_text: desc });
  };
  const done = () => {
    saveTitle();
    saveDesc();
    onClose();
  };
  const doneRef = useRef(done);
  doneRef.current = done;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") doneRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="capture-preview"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: duration.fast, ease }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-3 backdrop-blur-lg sm:p-5"
        onMouseDown={(e) => e.target === e.currentTarget && done()}
      >
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.985 }}
          transition={{ duration: duration.base, ease }}
          className="relative flex max-h-[93vh] w-full max-w-[min(1440px,96vw)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-2xl shadow-black/50 md:flex-row"
        >
          <button
            type="button"
            onClick={done}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 rounded-[var(--radius-sm)] bg-raised/80 p-1.5 text-muted backdrop-blur transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-text"
          >
            <Icon name="close" size={16} />
          </button>

          <div className="flex min-h-[280px] flex-1 items-center justify-center overflow-hidden border-b border-line-soft bg-canvas p-6 md:border-b-0 md:border-r md:p-12">
            <PreviewPane item={item} />
          </div>

          <div className="no-scrollbar flex w-full shrink-0 flex-col gap-4 overflow-y-auto p-6 md:w-[400px]">
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--text-micro)] uppercase tracking-wide text-faint">Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} className={controlClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--text-micro)] uppercase tracking-wide text-faint">Description</span>
              <textarea
                rows={3}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                onBlur={saveDesc}
                placeholder="What is this, and why did you save it?"
                className={`${controlClass} resize-none`}
              />
            </label>
            {region ? (
              <p className="text-[length:var(--text-micro)] text-faint">Saved to {region.name}</p>
            ) : null}

            <span className="h-px w-full bg-line-soft" />

            <ConnectionsPanel item={item} allItems={allItems} />

            <div className="mt-auto flex justify-end pt-2">
              <Button variant="primary" onClick={done}>
                Done
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
