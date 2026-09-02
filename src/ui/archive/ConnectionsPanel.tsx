import { useEffect, useMemo, useState } from "react";
import type { ContextItem, ItemNote } from "@shared/contract";
import {
  addItemNote,
  createItemLink,
  deleteItemLink,
  deleteItemNote,
  listItemLinks,
  listItemNotes,
  reviewItemLink,
  type ItemLink,
} from "../../api/client";
import { Button } from "../primitives/Button";
import { Icon } from "../primitives/Icon";
import { ItemPreview } from "./ItemPreview";
import { kind } from "./itemKind";

function relTime(at: number): string {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/**
 * The Connections + Notes section of the item lightbox: link this block to
 * other blocks, review links an agent proposed, and pin free-text notes.
 */
export function ConnectionsPanel({ item, allItems }: { item: ContextItem; allItems: ContextItem[] }) {
  const [links, setLinks] = useState<ItemLink[] | null>(null);
  const [notes, setNotes] = useState<ItemNote[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickQuery, setPickQuery] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = () => {
    listItemLinks(item.id)
      .then((r) => setLinks(r.links))
      .catch(() => setLinks([]));
    listItemNotes(item.id)
      .then((r) => setNotes(r.notes))
      .catch(() => setNotes([]));
  };
  useEffect(reload, [item.id]);

  const linkedIds = useMemo(
    () => new Set((links ?? []).map((l) => l.other?.id).filter(Boolean) as string[]),
    [links],
  );
  const candidates = useMemo(() => {
    const q = pickQuery.trim().toLowerCase();
    return allItems
      .filter((i) => i.id !== item.id && !linkedIds.has(i.id))
      .filter((i) => !q || i.title.toLowerCase().includes(q))
      .slice(0, 50);
  }, [allItems, item.id, linkedIds, pickQuery]);

  const approved = (links ?? []).filter((l) => l.approval_state === "approved");
  const pending = (links ?? []).filter((l) => l.approval_state === "proposed");

  const guard = (fn: () => Promise<unknown>) => {
    setBusy(true);
    void fn().finally(() => {
      setBusy(false);
      reload();
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Connections */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <p className="text-micro uppercase tracking-wide text-faint">
            Connections {approved.length > 0 ? `· ${approved.length}` : ""}
          </p>
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            className="inline-flex items-center gap-1 text-micro text-muted transition-colors hover:text-text"
          >
            <Icon name={picking ? "close" : "plus"} size={12} />
            {picking ? "Close" : "Link a block"}
          </button>
        </div>

        {picking ? (
          <div className="flex flex-col gap-1 rounded-[var(--radius-sm)] border border-line-soft p-1.5">
            <input
              autoFocus
              value={pickQuery}
              onChange={(e) => setPickQuery(e.target.value)}
              placeholder="Search your archive…"
              className="bg-transparent px-1.5 py-1 text-meta text-text placeholder:text-faint"
            />
            {candidates.length === 0 ? (
              <p className="px-1.5 py-1 text-micro text-faint">No matches</p>
            ) : (
              <div className="no-scrollbar flex max-h-64 flex-col overflow-y-auto overscroll-contain">
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      guard(async () => {
                        await createItemLink(item.id, c.id);
                        setPicking(false);
                        setPickQuery("");
                      })
                    }
                    className="flex shrink-0 items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-left text-meta text-muted transition-colors hover:bg-hover hover:text-text"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[2px] border border-line-soft bg-canvas">
                      <ItemPreview item={c} size="chip" />
                    </span>
                    <span className="truncate">{c.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {pending.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {pending.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-accent/40 bg-accent/5 p-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-meta text-text">
                  {l.other?.title ?? "Unknown"}
                  <span className="ml-1.5 text-micro text-accent">agent proposed</span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => guard(() => reviewItemLink(l.id, "approved"))}
                  aria-label="Accept link"
                  className="rounded-[var(--radius-sm)] p-1 text-good transition-colors hover:bg-good/10"
                >
                  <Icon name="check" size={13} />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => guard(() => reviewItemLink(l.id, "rejected"))}
                  aria-label="Reject link"
                  className="rounded-[var(--radius-sm)] p-1 text-bad transition-colors hover:bg-bad/10"
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {links === null ? (
          <p className="text-meta text-faint">Loading…</p>
        ) : approved.length === 0 && pending.length === 0 ? (
          <p className="text-meta text-faint">Not linked to anything yet.</p>
        ) : (
          <ul className="flex flex-col">
            {approved.map((l) => (
              <li
                key={l.id}
                className="group/link flex items-center gap-2 border-b border-line-soft py-2 last:border-0"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-line-soft bg-canvas">
                  {l.other ? <ItemPreview item={l.other} size="chip" /> : <Icon name="file" size={14} className="text-faint" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-meta text-text">
                    {l.other?.title ?? "Unknown item"}
                  </span>
                  <span className="text-micro text-faint">
                    {l.other ? kind(l.other).label : ""} · {l.relationship.replace(/_/g, " ")}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => guard(() => deleteItemLink(l.id))}
                  aria-label="Unlink"
                  className="shrink-0 text-faint opacity-0 transition-opacity hover:text-bad group-hover/link:opacity-100"
                >
                  <Icon name="close" size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Notes */}
      <section className="flex flex-col gap-2.5">
        <p className="text-micro uppercase tracking-wide text-faint">
          Notes {notes && notes.length > 0 ? `· ${notes.length}` : ""}
        </p>
        {notes && notes.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {notes.map((n) => (
              <li key={n.id} className="group/note rounded-[var(--radius-sm)] border border-line-soft p-2">
                <p className="whitespace-pre-wrap text-meta leading-relaxed text-muted">{n.body}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-micro text-faint">{relTime(n.created_at)} ago</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => guard(() => deleteItemNote(n.id))}
                    className="text-micro text-faint opacity-0 transition-opacity hover:text-bad group-hover/note:opacity-100"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!noteDraft.trim()) return;
            guard(async () => {
              await addItemNote(item.id, noteDraft.trim());
              setNoteDraft("");
            });
          }}
        >
          <textarea
            rows={2}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Add a note on this block…"
            className="w-full resize-none rounded-[var(--radius-sm)] border border-line-soft bg-canvas px-2 py-1.5 text-meta text-text placeholder:text-faint"
          />
          <Button type="submit" variant="secondary" className="self-start" disabled={busy || !noteDraft.trim()}>
            Add note
          </Button>
        </form>
      </section>
    </div>
  );
}
