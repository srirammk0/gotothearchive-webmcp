import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import type { ContextItem, ItemType, Region } from "@shared/contract";
import { EmptyState } from "../ui/primitives/EmptyState";
import { Spinner } from "../ui/primitives/Spinner";
import { Button } from "../ui/primitives/Button";
import { Icon } from "../ui/primitives/Icon";
import { Modal } from "../ui/primitives/Modal";
import { Menu } from "../ui/primitives/Menu";
import { controlClass } from "../ui/primitives/Field";
import { AgentAccess } from "../ui/AgentAccess";
import { Capture } from "../ui/archive/Capture";
import { CapturePreview } from "../ui/archive/CapturePreview";
import { ItemLightbox } from "../ui/archive/ItemLightbox";
import { RegionSection, type ArchiveRegionView } from "../ui/archive/RegionSection";
import { isPinned, useArchive } from "../ui/archive/useArchive";
import { useArchiveSelection } from "../ui/archive/useArchiveSelection";
import { usePaletteBackfill } from "../ui/archive/usePaletteBackfill";
import { useTrail } from "../ui/Breadcrumbs";
import { useSpace } from "../ui/hooks/useSpace";
import { duration, ease } from "../ui/tokens";

type TypeFilter = ItemType | "all";

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "pdf", label: "PDFs" },
  { value: "link", label: "Links" },
  { value: "note", label: "Notes" },
  { value: "document", label: "Docs" },
];

function matchesType(item: ContextItem, filter: TypeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "image") return item.type === "image" || item.type === "screenshot";
  return item.type === filter;
}

/**
 * The one thing shown "on top" of the Archive at a time — a modal, the capture
 * flow, or an open item — as a single value instead of seven independent
 * booleans/ids, so two of them can never be open together by accident.
 */
type Overlay =
  | { kind: "none" }
  | { kind: "newFolder"; parent: Region | null; draft: string }
  | { kind: "capture"; region: Region }
  | { kind: "deleteFolder"; region: Region }
  | { kind: "preview"; itemId: string }
  | { kind: "lightbox"; itemId: string };

export function Archive() {
  const { space, regions: spaceRegions, task, loading: spaceLoading, error: spaceError } = useSpace();
  const archive = useArchive(spaceRegions, spaceLoading, spaceError);
  const selection = useArchiveSelection();
  const [params, setParams] = useSearchParams();
  const folderSlug = params.get("folder");

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });

  const regions = archive.regions;
  const activeFolder = folderSlug ? regions.find((r) => r.slug === folderSlug) ?? null : null;

  // Full parent chain, root → current, so nested folders read as a real path.
  const folderPath = useMemo(() => {
    const chain: Region[] = [];
    for (let cur = activeFolder; cur; cur = cur.parent_id ? regions.find((r) => r.id === cur!.parent_id) ?? null : null) {
      chain.unshift(cur);
    }
    return chain;
  }, [activeFolder, regions]);

  useTrail(
    folderPath.length
      ? [
          { label: "Archive", to: "/" },
          ...folderPath.map((r, i) => (i === folderPath.length - 1 ? { label: r.name } : { label: r.name, to: `/?folder=${r.slug}` })),
        ]
      : [{ label: "Archive" }],
  );

  const handleAddFolder = async () => {
    if (overlay.kind !== "newFolder" || !overlay.draft.trim()) return;
    const ok = await archive.addFolder(overlay.draft, overlay.parent?.id ?? null);
    if (ok) setOverlay({ kind: "none" });
  };

  const handleRemoveFolder = async (region: Region) => {
    const { ok, parent } = await archive.removeFolder(region);
    if (!ok) return;
    selection.clear();
    setOverlay({ kind: "none" });
    if (folderSlug === region.slug) setParams(parent ? { folder: parent.slug } : {}, { replace: true });
  };

  const handleMoveSelected = (slug: string) => {
    const dest = regions.find((r) => r.slug === slug);
    if (!dest) return;
    void archive.moveItems([...selection.selectedIds], dest).then((ok) => ok && selection.clear());
  };

  const handleDeleteSelected = () => {
    void archive.deleteItemsById([...selection.selectedIds]).then((ok) => ok && selection.clear());
  };

  const visibleRegions = useMemo(
    () => (activeFolder ? [activeFolder] : regions.filter((r) => r.parent_id === null)),
    [regions, activeFolder],
  );

  const childFoldersOf = (regionId: string) => regions.filter((r) => r.parent_id === regionId);

  // Every folder is a move target, parents and children alike, labelled by its
  // full path. Only the folder currently open is excluded (nothing to do).
  const moveTargets = useMemo(() => {
    const pathOf = (r: Region): string => {
      const parts = [r.name];
      for (let p = r.parent_id; p; ) {
        const parent = regions.find((x) => x.id === p);
        if (!parent) break;
        parts.unshift(parent.name);
        p = parent.parent_id;
      }
      return parts.join(" / ");
    };
    const destinations = regions
      .filter((r) => r.id !== activeFolder?.id)
      .map((r) => ({ slug: r.slug, label: pathOf(r) }));
    // oxlint-disable-next-line unicorn/no-array-sort -- destinations is a fresh local array
    destinations.sort((a, b) => a.label.localeCompare(b.label));
    return destinations;
  }, [regions, activeFolder]);

  const regionViews: ArchiveRegionView[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visibleRegions.map((region) => {
      const matched = (archive.items ?? []).filter(
        (i) =>
          i.region_id === region.id &&
          matchesType(i, typeFilter) &&
          (!q || i.title.toLowerCase().includes(q)),
      );
      matched.sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)) || b.created_at - a.created_at);
      return { region, items: matched };
    });
  }, [visibleRegions, archive.items, typeFilter, query]);

  const flatItems = useMemo(() => regionViews.flatMap((r) => r.items), [regionViews]);

  // Quietly measure exact palettes for images archived before capture-time
  // measurement existed. Background repair; never blocks or interrupts.
  usePaletteBackfill(archive.items ?? []);
  const lightboxId = overlay.kind === "lightbox" ? overlay.itemId : null;
  const lightboxIndex = lightboxId ? flatItems.findIndex((i) => i.id === lightboxId) : -1;
  const lightboxItem = lightboxIndex >= 0 ? flatItems[lightboxIndex] : null;
  const previewId = overlay.kind === "preview" ? overlay.itemId : null;
  const previewItem = previewId ? (archive.items ?? []).find((i) => i.id === previewId) ?? null : null;

  if (!spaceError && (spaceLoading || (archive.items === null && !archive.itemsError))) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner label="Opening the archive…" />
      </div>
    );
  }

  if (spaceError || archive.itemsError) {
    return (
      <EmptyState
        title="Couldn't load the archive"
        body={spaceError ?? archive.itemsError ?? "Something went wrong."}
        action={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Try again
          </Button>
        }
      />
    );
  }

  const total = (archive.items ?? []).filter((i) => !activeFolder || i.region_id === activeFolder.id).length;
  const visible = flatItems.length;
  const filtered = query.trim() !== "" || typeFilter !== "all";

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_272px] lg:gap-14">
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-display leading-tight text-text">
                  {activeFolder ? activeFolder.name : "Archive"}
                </h1>
                {activeFolder && activeFolder.parent_id !== null ? (
                  <button
                    type="button"
                    aria-label={`Delete ${activeFolder.name}`}
                    title={`Delete ${activeFolder.name}`}
                    onClick={() => setOverlay({ kind: "deleteFolder", region: activeFolder })}
                    className="shrink-0 rounded-[var(--radius-sm)] p-1.5 text-faint transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-bad"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-meta text-faint">
                {activeFolder ? `${total} ${total === 1 ? "item" : "items"}` : `${space?.name} · ${total} items`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="relative w-44 transition-[width] duration-[var(--duration-base)] ease-out focus-within:w-56 sm:w-56 sm:focus-within:w-72">
                <Icon
                  name="search"
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
                />
                <span className="sr-only">Search the archive</span>
                <input
                  placeholder="Search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className={`${controlClass} box-border h-9 py-0 pl-8 leading-none focus:outline-none focus:ring-0`}
                />
              </label>
              <button
                type="button"
                onClick={() => setOverlay({ kind: "newFolder", parent: activeFolder, draft: "" })}
                className="box-border inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-line bg-raised px-3 text-meta text-text transition-colors duration-[var(--duration-fast)] hover:bg-hover focus:outline-none focus:ring-0"
              >
                <Icon name="plus" size={13} />
                New folder
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex flex-wrap items-center gap-1">
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setTypeFilter(f.value)}
                  className={`rounded-[var(--radius-sm)] px-2 py-1 text-micro transition-colors duration-[var(--duration-fast)] ${
                    typeFilter === f.value ? "bg-hover text-text" : "text-muted hover:text-text"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {filtered ? (
              <span className="text-micro text-faint">
                {visible} of {total}
              </span>
            ) : null}
          </div>

          {archive.banner ? (
            <p role="alert" className="text-meta text-bad">
              {archive.banner}
            </p>
          ) : null}
        </header>

        {activeFolder && total === 0 && !filtered && childFoldersOf(activeFolder.id).length === 0 ? (
          <EmptyState
            title={activeFolder ? "This folder is empty" : "Your archive is empty"}
            body="Add a note, link, image, or PDF to start building this space's context."
            action={
              <Button
                variant="primary"
                onClick={() => {
                  const region = activeFolder ?? regions[0];
                  if (region) setOverlay({ kind: "capture", region });
                }}
                disabled={regions.length === 0}
              >
                <Icon name="plus" size={13} />
                Add the first thing
              </Button>
            }
          />
        ) : visible === 0 && filtered ? (
          <EmptyState
            title="No matches"
            body="Nothing here matches the current search and filters."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setTypeFilter("all");
                }}
              >
                Clear
              </Button>
            }
          />
        ) : (
          regionViews.map((view) => (
            <RegionSection
              key={view.region.id}
              view={view}
              collapsed={collapsedIds.has(view.region.id)}
              anySelected={selection.selectedIds.size > 0}
              selectedIds={selection.selectedIds}
              onCollapse={(id) =>
                setCollapsedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onToggle={selection.toggle}
              onOpenItem={(id) => setOverlay({ kind: "lightbox", itemId: id })}
              onTogglePin={archive.togglePin}
              onRename={archive.renameFolder}
              onDelete={(region) => setOverlay({ kind: "deleteFolder", region })}
              onOpenFolder={(r) => setParams({ folder: r.slug })}
              onAdd={(region) => setOverlay({ kind: "capture", region })}
              childFolders={childFoldersOf(view.region.id)}
              showOpen={!activeFolder}
            />
          ))
        )}
      </div>

      {task ? <AgentAccess taskId={task.id} regions={regions} /> : null}

      {/* Bulk action bar */}
      <AnimatePresence>
        {selection.selectedIds.size > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: duration.fast, ease }}
            className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-raised px-4 py-2.5 shadow-lg shadow-black/40"
          >
            <span className="text-meta text-text">{selection.selectedIds.size} selected</span>
            <span aria-hidden="true" className="h-4 w-px bg-line" />
            <Menu
              side="top"
              items={moveTargets.map((r) => ({ label: r.label, onSelect: () => handleMoveSelected(r.slug), disabled: archive.busy }))}
              trigger={({ open, toggle }) => (
                <Button variant="secondary" onClick={toggle} aria-expanded={open}>
                  Move to
                  <Icon
                    name="chevronDown"
                    size={12}
                    className={`transition-transform duration-[var(--duration-base)] ${open ? "rotate-180" : ""}`}
                  />
                </Button>
              )}
            />
            <Button variant="danger" disabled={archive.busy} onClick={handleDeleteSelected}>
              Delete
            </Button>
            <button
              type="button"
              onClick={selection.clear}
              aria-label="Clear selection"
              className="rounded-[var(--radius-sm)] p-1 text-faint transition-colors duration-[var(--duration-fast)] hover:text-text"
            >
              <Icon name="close" size={14} />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* New folder modal */}
      <Modal
        open={overlay.kind === "newFolder"}
        onClose={() => setOverlay({ kind: "none" })}
        title={overlay.kind === "newFolder" && overlay.parent ? `New folder in ${overlay.parent.name}` : "New folder"}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleAddFolder();
          }}
        >
          <input
            autoFocus
            placeholder="Folder name"
            value={overlay.kind === "newFolder" ? overlay.draft : ""}
            onChange={(e) =>
              setOverlay((o) => (o.kind === "newFolder" ? { ...o, draft: e.target.value } : o))
            }
            className={controlClass}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOverlay({ kind: "none" })}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={archive.busy || !(overlay.kind === "newFolder" && overlay.draft.trim())}
            >
              Create folder
            </Button>
          </div>
        </form>
      </Modal>

      <AnimatePresence>
        {overlay.kind === "capture" ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/55 p-5 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => event.currentTarget === event.target && setOverlay({ kind: "none" })}
          >
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: duration.fast, ease }}
              className="w-full max-w-xl"
            >
              <Capture
                region={overlay.region}
                onCaptured={(item) => {
                  archive.addItem(item);
                  setOverlay({ kind: "preview", itemId: item.id });
                }}
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Delete-folder confirm */}
      <Modal
        open={overlay.kind === "deleteFolder"}
        onClose={() => setOverlay({ kind: "none" })}
        title={`Delete ${overlay.kind === "deleteFolder" ? overlay.region.name : "folder"}?`}
      >
        <div className="flex flex-col gap-4">
          <p className="text-meta leading-relaxed text-muted">
            This removes the folder and everything in it. This can't be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOverlay({ kind: "none" })}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={archive.busy}
              onClick={() => overlay.kind === "deleteFolder" && void handleRemoveFolder(overlay.region)}
            >
              Delete folder
            </Button>
          </div>
        </div>
      </Modal>

      {lightboxItem ? (
        <ItemLightbox
          allItems={archive.items ?? []}
          onEdit={archive.editItem}
          item={lightboxItem}
          region={regions.find((r) => r.id === lightboxItem.region_id) ?? null}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < flatItems.length - 1}
          onPrev={() => {
            const id = flatItems[lightboxIndex - 1]?.id;
            if (id) setOverlay({ kind: "lightbox", itemId: id });
          }}
          onNext={() => {
            const id = flatItems[lightboxIndex + 1]?.id;
            if (id) setOverlay({ kind: "lightbox", itemId: id });
          }}
          onClose={() => setOverlay({ kind: "none" })}
          onTogglePin={archive.togglePin}
          onDelete={(it) => {
            setOverlay({ kind: "none" });
            void archive.deleteItemsById([it.id]);
          }}
        />
      ) : null}

      {previewItem ? (
        <CapturePreview
          item={previewItem}
          region={regions.find((r) => r.id === previewItem.region_id) ?? null}
          allItems={archive.items ?? []}
          onEdit={archive.editItem}
          onClose={() => setOverlay({ kind: "none" })}
        />
      ) : null}
    </div>
  );
}
