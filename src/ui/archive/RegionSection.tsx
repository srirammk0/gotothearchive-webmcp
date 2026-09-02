import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ContextItem, Region } from "@shared/contract";
import { EmptyRow } from "../primitives/EmptyRow";
import { Icon } from "../primitives/Icon";
import { controlClass } from "../primitives/Field";
import { duration, ease } from "../tokens";
import { Tile } from "./Tile";

/** Archive: a region rendered as an editorial index of its items. */
export interface ArchiveRegionView {
  region: Region;
  items: ContextItem[];
}

/** One region's collapsible header, child-folder chips, and item grid. */
export function RegionSection({
  view,
  collapsed,
  anySelected,
  selectedIds,
  onCollapse,
  onToggle,
  onOpenItem,
  onTogglePin,
  onRename,
  onDelete,
  onOpenFolder,
  onAdd,
  childFolders,
  showOpen,
}: {
  view: ArchiveRegionView;
  collapsed: boolean;
  anySelected: boolean;
  selectedIds: Set<string>;
  onCollapse: (id: string) => void;
  onToggle: (id: string) => void;
  onOpenItem: (id: string) => void;
  onTogglePin: (item: ContextItem) => void;
  onRename: (region: Region, name: string) => void;
  onDelete: (region: Region) => void;
  onOpenFolder: (region: Region) => void;
  onAdd: (region: Region) => void;
  childFolders: Region[];
  showOpen: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(view.region.name);

  return (
    <section className="flex flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-line-soft pb-2.5">
        {renaming ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim() && draft.trim() !== view.region.name) onRename(view.region, draft.trim());
              setRenaming(false);
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => setRenaming(false)}
              className={`${controlClass} h-8 w-48 py-1`}
            />
          </form>
        ) : (
          <div className="group/head flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onCollapse(view.region.id)}
              className="flex min-w-0 items-center gap-1.5 text-left"
              aria-expanded={!collapsed}
            >
              <Icon
                name="chevronDown"
                size={13}
                className={`shrink-0 text-faint transition-transform duration-[var(--duration-base)] ${
                  collapsed ? "rotate-0" : "rotate-180"
                }`}
              />
              <h2 className="truncate text-headline text-text">{view.region.name}</h2>
            </button>
            <button
              type="button"
              aria-label={`Rename ${view.region.name}`}
              onClick={() => {
                setDraft(view.region.name);
                setRenaming(true);
              }}
              className="shrink-0 text-faint opacity-0 transition-opacity duration-[var(--duration-fast)] hover:text-text group-hover/head:opacity-100"
            >
              <Icon name="pencil" size={13} />
            </button>
            {showOpen && view.region.parent_id !== null ? (
              <button
                type="button"
                aria-label={`Delete ${view.region.name}`}
                onClick={() => onDelete(view.region)}
                className="shrink-0 text-faint opacity-0 transition-opacity duration-[var(--duration-fast)] hover:text-bad group-hover/head:opacity-100"
              >
                <Icon name="trash" size={13} />
              </button>
            ) : null}
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2">
          {view.items.length > 0 ? (
            <span className="text-micro text-faint">
              {view.items.length} {view.items.length === 1 ? "item" : "items"}
            </span>
          ) : null}
          <button
            type="button"
            aria-label={`Add to ${view.region.name}`}
            onClick={() => onAdd(view.region)}
            className="rounded-[var(--radius-sm)] p-1 text-muted transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-text"
          >
            <Icon name="plus" size={14} />
          </button>
          {showOpen ? (
            <button
              type="button"
              aria-label={`Open ${view.region.name}`}
              onClick={() => onOpenFolder(view.region)}
              className="rounded-[var(--radius-sm)] p-1 text-muted transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-text"
            >
              <Icon name="arrowUpRight" size={14} />
            </button>
          ) : null}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {collapsed ? null : (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: duration.base, ease }}
            className="overflow-hidden"
          >
          <div className="pt-4">
            {childFolders.length > 0 ? (
              <ul className="mb-6 flex flex-wrap gap-2">
                {childFolders.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => onOpenFolder(f)}
                      className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-line-soft bg-surface px-3 py-2 text-meta text-text transition-colors duration-[var(--duration-fast)] hover:border-line hover:bg-hover"
                    >
                      <Icon name="folder" size={14} className="text-faint" />
                      {f.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {view.items.length === 0 ? (
              childFolders.length > 0 ? null : <EmptyRow />
            ) : (
              <ul className="grid grid-flow-dense grid-cols-2 gap-x-4 gap-y-14 pb-10 [grid-auto-rows:minmax(8rem,auto)] sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-6">
                {view.items.map((item, i) => (
                  <Tile
                    key={item.id}
                    item={item}
                    index={i}
                    anySelected={anySelected}
                    selected={selectedIds.has(item.id)}
                    onToggle={onToggle}
                    onOpen={onOpenItem}
                    onTogglePin={onTogglePin}
                  />
                ))}
              </ul>
            )}
          </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
