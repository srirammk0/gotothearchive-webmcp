import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { isAgentAuthority, type ContextItem, type Region } from "@shared/contract";
import { MetaList } from "../primitives/MetaList";
import { Menu } from "../primitives/Menu";
import { Icon } from "../primitives/Icon";
import { Tweet } from "./Tweet";
import { ConnectionsPanel } from "./ConnectionsPanel";
import { FileCard, kind, tweetId } from "./itemKind";
import { ArtifactThumb } from "../workbench/ArtifactThumb";
import { blobUrl } from "../../api/client";
import { duration, ease } from "../tokens";

function fullDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function agentLabel(item: ContextItem): string {
  return isAgentAuthority(item.authority_class) ? "Agent" : "Human";
}

/**
 * The opened state of one archived thing: the material large on the left with a
 * prev/next/close cluster over it, its editable facts and links on a fixed
 * right rail — the shape of Are.na's block view.
 */
export function ItemLightbox({
  item,
  region,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  onTogglePin,
  onDelete,
  onEdit,
  allItems,
}: {
  item: ContextItem;
  region: Region | null;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onTogglePin: (item: ContextItem) => void;
  onDelete: (item: ContextItem) => void;
  onEdit: (id: string, changes: { title?: string; semantic_text?: string }) => void;
  allItems: ContextItem[];
}) {
  const [editing, setEditing] = useState<"title" | "desc" | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onPrev();
      if (e.key === "ArrowRight" && hasNext) onNext();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [hasPrev, hasNext, onPrev, onNext, onClose, editing]);

  const { render } = kind(item);
  const tw = tweetId(item.source_url);
  const pinned = item.metadata?.pinned === true;

  const [note, setNote] = useState(item.semantic_text ?? "");
  useEffect(() => setNote(item.semantic_text ?? ""), [item.id, item.semantic_text]);
  const saveNote = () => {
    if (note !== (item.semantic_text ?? "")) onEdit(item.id, { semantic_text: note });
  };

  const startEdit = (field: "title" | "desc") => {
    setDraft(field === "title" ? item.title : (item.semantic_text ?? ""));
    setEditing(field);
  };
  const commit = () => {
    if (editing === "title" && draft.trim() && draft.trim() !== item.title) {
      onEdit(item.id, { title: draft.trim() });
    } else if (editing === "desc" && draft !== (item.semantic_text ?? "")) {
      onEdit(item.id, { semantic_text: draft });
    }
    setEditing(null);
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: duration.fast, ease }}
        className="fixed inset-0 z-50 flex bg-canvas/95 backdrop-blur-sm"
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="absolute left-4 top-4 z-10 flex items-center gap-1">
          <button
            type="button"
            disabled={!hasPrev}
            onClick={onPrev}
            aria-label="Previous"
            className="rounded-[var(--radius-sm)] p-2 text-muted transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-text disabled:opacity-30"
          >
            <Icon name="chevronRight" size={16} className="rotate-180" />
          </button>
          <button
            type="button"
            disabled={!hasNext}
            onClick={onNext}
            aria-label="Next"
            className="rounded-[var(--radius-sm)] p-2 text-muted transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-text disabled:opacity-30"
          >
            <Icon name="chevronRight" size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-[var(--radius-sm)] p-2 text-muted transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-text"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: duration.base, ease }}
          className="flex min-h-0 flex-1 flex-col md:flex-row"
        >
          {/* Material */}
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6 pt-16 md:p-12">
            {render === "image" && item.content_ref ? (
              <img src={blobUrl(item.content_ref)} alt="" className="max-h-full max-w-full object-contain" />
            ) : render === "pdf" && item.content_ref ? (
              <iframe
                title={item.title}
                src={`${blobUrl(item.content_ref)}#view=FitH`}
                className="h-full w-full rounded-[var(--radius-sm)] bg-white"
              />
            ) : render === "text" && item.content_ref ? (
              <iframe
                title={item.title}
                src={blobUrl(item.content_ref)}
                className="h-full w-full rounded-[var(--radius-sm)] bg-white"
              />
            ) : render === "artifact" ? (
              <ArtifactThumb html={String(item.metadata?.preview_html ?? "")} className="h-full w-full" />
            ) : render === "office" ? (
              <FileCard item={item} big />
            ) : render === "tweet" && tw ? (
              <div className="no-scrollbar h-full w-full max-w-[550px] overflow-y-auto">
                <Tweet id={tw} />
              </div>
            ) : render === "note" ? (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={saveNote}
                placeholder="Write a note…"
                className="no-scrollbar h-full w-full max-w-prose resize-none bg-transparent text-[length:var(--text-body)] leading-relaxed text-text placeholder:text-faint"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <p className="text-[length:var(--text-body)] text-muted">{item.title}</p>
                {item.source_url ? (
                  <span className="text-[length:var(--text-meta)] text-faint">
                    {new URL(item.source_url).hostname.replace(/^www\./, "")}
                  </span>
                ) : null}
              </div>
            )}
          </div>

          {/* Right rail */}
          <aside className="no-scrollbar flex w-full shrink-0 flex-col gap-4 border-t border-line-soft bg-surface p-6 md:w-[340px] md:overflow-y-auto md:border-l md:border-t-0">
            <div className="flex flex-col gap-1.5">
              {editing === "title" ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                    if (e.key === "Escape") setEditing(null);
                  }}
                  className="w-full rounded-[var(--radius-sm)] bg-canvas px-2 py-1 text-[length:var(--text-headline)] text-text"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit("title")}
                  className="-mx-2 rounded-[var(--radius-sm)] px-2 py-1 text-left text-[length:var(--text-headline)] leading-snug text-text transition-colors duration-[var(--duration-fast)] hover:bg-hover"
                >
                  {item.title}
                </button>
              )}

              {editing === "desc" ? (
                <textarea
                  autoFocus
                  rows={3}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditing(null);
                  }}
                  placeholder="Add a description…"
                  className="w-full resize-none rounded-[var(--radius-sm)] bg-canvas px-2 py-1 text-[length:var(--text-meta)] leading-relaxed text-muted placeholder:text-faint"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit("desc")}
                  className="-mx-2 rounded-[var(--radius-sm)] px-2 py-1 text-left text-[length:var(--text-meta)] leading-relaxed text-faint transition-colors duration-[var(--duration-fast)] hover:bg-hover"
                >
                  {item.semantic_text?.trim() ? item.semantic_text : "Add a description"}
                </button>
              )}
            </div>

            <span className="h-px w-full bg-line-soft" />

            <MetaList
              rows={[
                { label: "Type", value: item.type },
                { label: "Folder", value: region?.name ?? null },
                { label: "Added", value: fullDate(item.created_at) },
                { label: "By", value: agentLabel(item) },
                {
                  label: "Source",
                  value: item.source_url ? (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted underline decoration-line underline-offset-2 hover:text-text"
                    >
                      {new URL(item.source_url).hostname.replace(/^www\./, "")}
                    </a>
                  ) : null,
                },
              ]}
            />

            <div className="flex items-center gap-2">
              {item.metadata?.artifact_id ? (
                <a
                  href={`/workbench/${String(item.metadata.artifact_id)}`}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-text px-3 py-1.5 text-[length:var(--text-meta)] text-canvas transition-colors duration-[var(--duration-fast)] hover:bg-white"
                >
                  Open in Workbench <Icon name="arrowRight" size={14} />
                </a>
              ) : null}
              {item.source_url ? (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-text px-3 py-1.5 text-[length:var(--text-meta)] text-canvas transition-colors duration-[var(--duration-fast)] hover:bg-white"
                >
                  Open source <Icon name="arrowRight" size={14} />
                </a>
              ) : null}
              <Menu
                align="end"
                items={[
                  { label: pinned ? "Unpin" : "Pin", onSelect: () => onTogglePin(item) },
                  { label: "Delete", onSelect: () => onDelete(item), danger: true },
                ]}
                trigger={({ open, toggle }) => (
                  <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={open}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-line px-3 py-1.5 text-[length:var(--text-meta)] text-muted transition-colors duration-[var(--duration-fast)] hover:border-hover hover:text-text"
                  >
                    Actions
                    <Icon
                      name="chevronDown"
                      size={12}
                      className={`transition-transform duration-[var(--duration-base)] ${open ? "rotate-180" : ""}`}
                    />
                  </button>
                )}
              />
            </div>

            <span className="h-px w-full bg-line-soft" />
            <ConnectionsPanel item={item} allItems={allItems} />
          </aside>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
