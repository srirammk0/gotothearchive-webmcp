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

/**
 * The step right after a capture: the thing you just saved, with its title,
 * description, and auto-derived connections there to confirm or adjust before
 * moving on. A plain dialog, not the full lightbox.
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

  const { render } = kind(item);
  const tw = tweetId(item.source_url);

  return (
    <Modal open onClose={done} size="lg" title="Just captured">
      <div className="flex flex-col gap-5 p-5">
        <div className="flex max-h-72 min-h-32 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-line-soft bg-canvas p-3">
          {render === "image" && item.content_ref ? (
            <img src={blobUrl(item.content_ref)} alt="" className="max-h-64 max-w-full object-contain" />
          ) : render === "pdf" && item.content_ref ? (
            <iframe
              title={item.title}
              src={`${blobUrl(item.content_ref)}#toolbar=0&navpanes=0&view=FitH`}
              className="h-64 w-full rounded-[var(--radius-sm)] bg-white"
            />
          ) : render === "text" && item.content_ref ? (
            <iframe
              title={item.title}
              src={blobUrl(item.content_ref)}
              className="h-64 w-full rounded-[var(--radius-sm)] bg-white"
            />
          ) : render === "artifact" ? (
            <ArtifactThumb html={String(item.metadata?.preview_html ?? "")} className="h-64 w-full" />
          ) : render === "office" ? (
            <FileCard item={item} big />
          ) : render === "tweet" && tw ? (
            <div className="no-scrollbar max-h-64 w-full max-w-[520px] overflow-y-auto">
              <Tweet id={tw} />
            </div>
          ) : (
            <p className="line-clamp-6 max-w-prose text-[length:var(--text-meta)] leading-relaxed text-muted">
              {item.semantic_text?.trim() || item.source_url || item.title}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--text-micro)] uppercase tracking-wide text-faint">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              className={controlClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--text-micro)] uppercase tracking-wide text-faint">Description</span>
            <textarea
              rows={3}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onBlur={saveDesc}
              placeholder="What is this, and why does it matter?"
              className={`${controlClass} resize-none`}
            />
          </label>
          {region ? (
            <p className="text-[length:var(--text-micro)] text-faint">Saved to {region.name}</p>
          ) : null}
        </div>

        <span className="h-px w-full bg-line-soft" />

        <ConnectionsPanel item={item} allItems={allItems} />

        <div className="flex justify-end">
          <Button variant="primary" onClick={done}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
