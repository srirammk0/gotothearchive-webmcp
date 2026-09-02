import { useEffect, useState } from "react";
import type { ContextItem, Region } from "@shared/contract";
import { Modal } from "../primitives/Modal";
import { Button } from "../primitives/Button";
import { controlClass } from "../primitives/Field";
import { ConnectionsPanel } from "./ConnectionsPanel";
import { FileCard, kind, tweetId } from "./itemKind";
import { Tweet } from "./Tweet";
import { ArtifactThumb } from "../workbench/ArtifactThumb";
import { blobUrl } from "../../api/client";

function extractedImage(item: ContextItem): string | null {
  const ex = (item.metadata as { extracted?: { images?: unknown } }).extracted;
  const imgs = ex && Array.isArray(ex.images) ? ex.images : [];
  return typeof imgs[0] === "string" ? imgs[0] : null;
}

function host(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function PreviewPane({ item }: { item: ContextItem }) {
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
        src={`${blobUrl(item.content_ref)}#toolbar=0&navpanes=0&view=FitH`}
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
      <div className="no-scrollbar h-full w-full max-w-[460px] overflow-y-auto">
        <Tweet id={tw} />
      </div>
    );
  }
  if (img) {
    return <img src={img} alt="" className="max-h-full max-w-full rounded-[var(--radius-sm)] object-contain" />;
  }
  return (
    <div className="flex flex-col gap-2 overflow-hidden">
      {host(item.source_url) ? (
        <span className="text-[length:var(--text-micro)] uppercase tracking-wide text-faint">
          {host(item.source_url)}
        </span>
      ) : null}
      <p className="line-clamp-[12] text-[length:var(--text-meta)] leading-relaxed text-muted">
        {item.semantic_text?.trim() || item.title}
      </p>
    </div>
  );
}

/**
 * The step right after a capture: the thing on the left, everything you can
 * change about it on the right. Fits the viewport — the modal itself never
 * scrolls; a long connection list scrolls inside its own column.
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

  return (
    <Modal open onClose={done} size="lg" title="Just captured">
      {/* cancel Modal's px-5 py-5 so the preview reaches the panel edge */}
      <div className="-m-5 flex max-h-[74vh] flex-col overflow-hidden rounded-b-[var(--radius-lg)] md:flex-row">
        <div className="flex min-h-[220px] flex-1 items-center justify-center overflow-hidden border-b border-line-soft bg-canvas p-5 md:border-b-0 md:border-r">
          <PreviewPane item={item} />
        </div>

        <div className="no-scrollbar flex w-full shrink-0 flex-col gap-4 overflow-y-auto p-5 md:w-[360px]">
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
      </div>
    </Modal>
  );
}
