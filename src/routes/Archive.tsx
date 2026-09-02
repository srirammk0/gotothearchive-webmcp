import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { isAgentAuthority, type ContextItem, type ItemType, type Region } from "@shared/contract";
import { EmptyState } from "../ui/primitives/EmptyState";
import { EmptyRow } from "../ui/primitives/EmptyRow";
import { Spinner } from "../ui/primitives/Spinner";
import { Button } from "../ui/primitives/Button";
import { Icon } from "../ui/primitives/Icon";
import { Modal } from "../ui/primitives/Modal";
import { Menu } from "../ui/primitives/Menu";
import { controlClass } from "../ui/primitives/Field";
import { AgentAccess } from "../ui/AgentAccess";
import { Capture } from "../ui/archive/Capture";
import { CapturePreview } from "../ui/archive/CapturePreview";
import { MemorySync } from "../ui/archive/MemorySync";
import { ItemLightbox } from "../ui/archive/ItemLightbox";
import { Tweet } from "../ui/archive/Tweet";
import { extractedImage, FileCard, kind, tweetId } from "../ui/archive/itemKind";
import { ArtifactThumb } from "../ui/workbench/ArtifactThumb";
import { useTrail } from "../ui/Breadcrumbs";
import { useSpace } from "../ui/hooks/useSpace";
import {
  blobUrl,
  createRegion,
  deleteItems,
  deleteRegion,
  listItems,
  renameRegion,
  updateItems,
} from "../api/client";
import { duration, ease } from "../ui/tokens";

/** Archive: a region rendered as an editorial index of its items. */
interface ArchiveRegionView {
  region: Region;
  items: ContextItem[];
}

type TypeFilter = ItemType | "all";

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "pdf", label: "PDFs" },
  { value: "link", label: "Links" },
  { value: "note", label: "Notes" },
  { value: "document", label: "Docs" },
];

function isAgentAdded(item: ContextItem): boolean {
  return isAgentAuthority(item.authority_class);
}

function isPinned(item: ContextItem): boolean {
  return item.metadata?.pinned === true;
}

function regionSubtreeIds(regions: Region[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  const pending = [rootId];
  while (pending.length > 0) {
    const parentId = pending.pop();
    if (!parentId) continue;
    for (const region of regions) {
      if (region.parent_id === parentId && !ids.has(region.id)) {
        ids.add(region.id);
        pending.push(region.id);
      }
    }
  }
  return ids;
}

function matchesType(item: ContextItem, filter: TypeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "image") return item.type === "image" || item.type === "screenshot";
  return item.type === filter;
}

function itemDate(item: ContextItem): string {
  return new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function host(item: ContextItem): string | null {
  return item.source_url ? new URL(item.source_url).hostname.replace(/^www\./, "") : null;
}

/**
 * The in-tile preview. Images and PDFs render their real bytes (cached hard by
 * the blob route); links lead with their host; text items become a quiet
 * excerpt so a wall of notes never reads as a wall of empty boxes.
 */
function Preview({ item }: { item: ContextItem }) {
  const { render } = kind(item);

  if (render === "image" && item.content_ref) {
    return (
      <img
        src={blobUrl(item.content_ref)}
        alt=""
        loading="lazy"
        decoding="async"
        className="max-h-full max-w-full object-contain"
      />
    );
  }
  if (render === "pdf" && item.content_ref) {
    return (
      <iframe
        title={item.title}
        src={`${blobUrl(item.content_ref)}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
        tabIndex={-1}
        className="pointer-events-none absolute inset-0 h-full w-full bg-white"
      />
    );
  }
  if (render === "text" && item.content_ref) {
    return (
      <iframe
        title={item.title}
        src={blobUrl(item.content_ref)}
        tabIndex={-1}
        className="pointer-events-none absolute inset-0 h-full w-full bg-white text-black"
      />
    );
  }
  if (render === "artifact") {
    return (
      <ArtifactThumb
        html={String(item.metadata?.preview_html ?? "")}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    );
  }
  if (render === "office") return <FileCard item={item} />;
  if (render === "tweet") {
    const tw = tweetId(item.source_url);
    return (
      <div className="pointer-events-none absolute inset-0 flex justify-center overflow-hidden">
        {tw ? <Tweet id={tw} className="max-w-full" /> : null}
      </div>
    );
  }
  if (render === "link") return <LinkPreview item={item} />;
  return (
    <p className="line-clamp-6 self-start text-meta leading-relaxed text-muted">
      {item.semantic_text ?? item.title}
    </p>
  );
}

/** A captured link leads with its extracted preview image; falls back to host + excerpt. */
function LinkPreview({ item }: { item: ContextItem }) {
  const [failed, setFailed] = useState(false);
  const img = extractedImage(item);
  const chip = host(item) ? (
    <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] bg-raised px-2 py-1 text-micro text-muted">
      <Icon name="arrowRight" size={12} />
      {host(item)}
    </span>
  ) : null;

  if (img && !failed) {
    return (
      <div className="flex h-full w-full flex-col gap-2">
        <img
          src={img}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="min-h-0 flex-1 rounded-[var(--radius-sm)] object-cover"
        />
        {chip}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 self-start">
      {chip}
      <p className="line-clamp-5 text-meta leading-relaxed text-muted">
        {item.semantic_text ?? item.title}
      </p>
    </div>
  );
}

function Tile({
  item,
  index,
  anySelected,
  selected,
  onToggle,
  onOpen,
  onTogglePin,
}: {
  item: ContextItem;
  index: number;
  anySelected: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onTogglePin: (item: ContextItem) => void;
}) {
  const pinned = isPinned(item);
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: duration.base, ease, delay: Math.min(index, 14) * 0.02 }}
      className={`group relative ${
        pinned ? "sm:col-span-2 sm:row-span-2" : "aspect-square self-start"
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => (anySelected ? onToggle(item.id) : onOpen(item.id))}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (anySelected) onToggle(item.id);
            else onOpen(item.id);
          }
        }}
        className={`relative flex h-full w-full cursor-pointer items-center justify-center overflow-hidden rounded-[var(--radius-md)] border bg-surface p-5 transition-colors duration-[var(--duration-fast)] ${
          selected ? "border-accent" : "border-line-soft group-hover:border-line"
        }`}
      >
        <Preview item={item} />

        {/* Checkbox — always in the DOM, shown on hover or whenever a selection is active. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(item.id);
          }}
          aria-label={selected ? `Deselect ${item.title}` : `Select ${item.title}`}
          aria-pressed={selected}
          className={`absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] border transition-opacity duration-[var(--duration-fast)] ${
            selected ? "border-accent bg-accent text-canvas" : "border-line bg-raised/90 text-transparent"
          } ${selected || anySelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        >
          <Icon name="check" size={12} />
        </button>

        {/* Pin — top-right, mirrors the checkbox. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(item);
          }}
          aria-label={pinned ? "Unpin" : "Pin"}
          aria-pressed={pinned}
          className={`absolute right-2 top-2 z-10 rounded-[var(--radius-sm)] bg-raised/90 p-1 backdrop-blur transition-all duration-[var(--duration-fast)] ${
            pinned ? "text-accent opacity-100" : "text-muted opacity-0 hover:text-text group-hover:opacity-100"
          }`}
        >
          <Icon name="pin" size={14} />
        </button>
      </div>

      {/* Caption sits in the row gap below the square, out of the grid-track math
          so every cell (1× and pinned) stays a clean square. */}
      <div className="absolute inset-x-0 top-full flex flex-col gap-0.5 pt-2 leading-tight">
        <div className="flex items-center gap-1.5">
          <span
            className={`shrink-0 rounded-[var(--radius-sm)] px-1.5 py-px text-micro ${
              isAgentAdded(item) ? "bg-accent/15 text-accent" : "bg-hover text-muted"
            }`}
          >
            {isAgentAdded(item) ? "Agent" : "Human"}
          </span>
          <p className="truncate text-meta text-text">{item.title}</p>
        </div>
        <p className="truncate text-micro text-faint">
          {kind(item).label} · {itemDate(item)}
          {host(item) ? ` · ${host(item)}` : ""}
        </p>
      </div>
    </motion.li>
  );
}

function RegionSection({
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

export function Archive() {
  const { space, regions: spaceRegions, task, loading: spaceLoading, error: spaceError } = useSpace();
  const [params, setParams] = useSearchParams();
  const folderSlug = params.get("folder");

  const [items, setItems] = useState<ContextItem[] | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [regionList, setRegionList] = useState<Region[] | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [folderModal, setFolderModal] = useState(false);
  const [folderParent, setFolderParent] = useState<Region | null>(null);
  const [folderDraft, setFolderDraft] = useState("");
  const [captureFor, setCaptureFor] = useState<Region | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Region | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const regions = regionList ?? spaceRegions;
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

  useEffect(() => {
    if (spaceRegions.length && !regionList) setRegionList(spaceRegions);
  }, [spaceRegions, regionList]);

  useEffect(() => {
    if (spaceLoading || spaceError) return;
    let cancelled = false;
    listItems()
      .then(({ items: fetched }) => !cancelled && setItems(fetched))
      .catch((err) => !cancelled && setItemsError(err instanceof Error ? err.message : "Could not load the archive."));
    return () => {
      cancelled = true;
    };
  }, [spaceLoading, spaceError]);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearSelection = () => setSelectedIds(new Set());

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setBanner(null);
    try {
      await fn();
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const addFolder = () =>
    guard(async () => {
      const name = folderDraft.trim();
      if (!name) return;
      const { region } = await createRegion(name, folderParent?.id ?? null);
      setRegionList((prev) => [...(prev ?? spaceRegions), region]);
      setFolderModal(false);
      setFolderDraft("");
      setFolderParent(null);
    });

  const renameFolder = (region: Region, name: string) =>
    guard(async () => {
      const { region: updated } = await renameRegion(region.id, name);
      setRegionList((prev) => (prev ?? spaceRegions).map((r) => (r.id === updated.id ? updated : r)));
    });

  const removeFolder = (region: Region) =>
    guard(async () => {
      const deletedRegionIds = regionSubtreeIds(regions, region.id);
      const parent = region.parent_id ? regions.find((r) => r.id === region.parent_id) ?? null : null;
      await deleteRegion(region.id);
      setRegionList((prev) => (prev ?? spaceRegions).filter((r) => !deletedRegionIds.has(r.id)));
      setItems((prev) => (prev ?? []).filter((i) => !deletedRegionIds.has(i.region_id)));
      clearSelection();
      setLightboxId(null);
      setFolderToDelete(null);
      if (folderSlug === region.slug) setParams(parent ? { folder: parent.slug } : {}, { replace: true });
    });

  const editItem = (id: string, changes: { title?: string; semantic_text?: string }) =>
    void guard(async () => {
      await updateItems([id], changes);
      setItems((prev) => (prev ?? []).map((i) => (i.id === id ? { ...i, ...changes } : i)));
    });

  const togglePin = (item: ContextItem) => {
    const next = !isPinned(item);
    void guard(async () => {
      await updateItems([item.id], { pinned: next });
      setItems((prev) =>
        (prev ?? []).map((i) => (i.id === item.id ? { ...i, metadata: { ...i.metadata, pinned: next } } : i)),
      );
    });
  };

  const moveSelected = (slug: string) => {
    const dest = regions.find((r) => r.slug === slug);
    if (!dest) return;
    const ids = [...selectedIds];
    void guard(async () => {
      await updateItems(ids, { region_slug: slug });
      setItems((prev) => (prev ?? []).map((i) => (selectedIds.has(i.id) ? { ...i, region_id: dest.id } : i)));
      clearSelection();
    });
  };

  const deleteSelected = () => {
    const ids = [...selectedIds];
    void guard(async () => {
      await deleteItems(ids);
      setItems((prev) => (prev ?? []).filter((i) => !selectedIds.has(i.id)));
      clearSelection();
    });
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
      const matched = (items ?? []).filter(
        (i) =>
          i.region_id === region.id &&
          matchesType(i, typeFilter) &&
          (!q || i.title.toLowerCase().includes(q)),
      );
      matched.sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)) || b.created_at - a.created_at);
      return { region, items: matched };
    });
  }, [visibleRegions, items, typeFilter, query]);

  const flatItems = useMemo(() => regionViews.flatMap((r) => r.items), [regionViews]);
  const lightboxIndex = lightboxId ? flatItems.findIndex((i) => i.id === lightboxId) : -1;
  const lightboxItem = lightboxIndex >= 0 ? flatItems[lightboxIndex] : null;
  const previewItem = previewId ? (items ?? []).find((i) => i.id === previewId) ?? null : null;

  if (!spaceError && (spaceLoading || (items === null && !itemsError))) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner label="Opening the archive…" />
      </div>
    );
  }

  if (spaceError || itemsError) {
    return (
      <EmptyState
        title="Couldn't load the archive"
        body={spaceError ?? itemsError ?? "Something went wrong."}
        action={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Try again
          </Button>
        }
      />
    );
  }

  const total = (items ?? []).filter((i) => !activeFolder || i.region_id === activeFolder.id).length;
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
                    onClick={() => setFolderToDelete(activeFolder)}
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
                onClick={() => { setFolderParent(activeFolder); setFolderModal(true); }}
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
            <div className="ml-auto">
              <MemorySync />
            </div>
          </div>

          {banner ? (
            <p role="alert" className="text-meta text-bad">
              {banner}
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
                onClick={() => setCaptureFor(activeFolder ?? regions[0] ?? null)}
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
              anySelected={selectedIds.size > 0}
              selectedIds={selectedIds}
              onCollapse={(id) =>
                setCollapsedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onToggle={(id) => toggleSelect(id)}
              onOpenItem={setLightboxId}
              onTogglePin={togglePin}
              onRename={renameFolder}
              onDelete={setFolderToDelete}
              onOpenFolder={(r) => setParams({ folder: r.slug })}
              onAdd={setCaptureFor}
              childFolders={childFoldersOf(view.region.id)}
              showOpen={!activeFolder}
            />
          ))
        )}
      </div>

      {task ? <AgentAccess taskId={task.id} regions={regions} /> : null}

      {/* Bulk action bar */}
      <AnimatePresence>
        {selectedIds.size > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: duration.fast, ease }}
            className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-raised px-4 py-2.5 shadow-lg shadow-black/40"
          >
            <span className="text-meta text-text">{selectedIds.size} selected</span>
            <span aria-hidden="true" className="h-4 w-px bg-line" />
            <Menu
              side="top"
              items={moveTargets.map((r) => ({ label: r.label, onSelect: () => moveSelected(r.slug), disabled: busy }))}
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
            <Button variant="danger" disabled={busy} onClick={deleteSelected}>
              Delete
            </Button>
            <button
              type="button"
              onClick={clearSelection}
              aria-label="Clear selection"
              className="rounded-[var(--radius-sm)] p-1 text-faint transition-colors duration-[var(--duration-fast)] hover:text-text"
            >
              <Icon name="close" size={14} />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* New folder modal */}
      <Modal open={folderModal} onClose={() => setFolderModal(false)} title={folderParent ? `New folder in ${folderParent.name}` : "New folder"}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void addFolder();
          }}
        >
          <input
            autoFocus
            placeholder="Folder name"
            value={folderDraft}
            onChange={(e) => setFolderDraft(e.target.value)}
            className={controlClass}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setFolderModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !folderDraft.trim()}>
              Create folder
            </Button>
          </div>
        </form>
      </Modal>

      <AnimatePresence>
        {captureFor ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/55 p-5 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => event.currentTarget === event.target && setCaptureFor(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: duration.fast, ease }}
              className="w-full max-w-xl"
            >
              <Capture
                region={captureFor}
                onCaptured={(item) => {
                  setItems((prev) => [item, ...(prev ?? [])]);
                  setCaptureFor(null);
                  setPreviewId(item.id);
                }}
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Delete-folder confirm */}
      <Modal
        open={folderToDelete !== null}
        onClose={() => setFolderToDelete(null)}
        title={`Delete ${folderToDelete?.name ?? "folder"}?`}
      >
        <div className="flex flex-col gap-4">
          <p className="text-meta leading-relaxed text-muted">
            This removes the folder and everything in it. This can't be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setFolderToDelete(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => folderToDelete && removeFolder(folderToDelete)}
            >
              Delete folder
            </Button>
          </div>
        </div>
      </Modal>

      {lightboxItem ? (
        <ItemLightbox
          allItems={items ?? []}
          onEdit={editItem}
          item={lightboxItem}
          region={regions.find((r) => r.id === lightboxItem.region_id) ?? null}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < flatItems.length - 1}
          onPrev={() => setLightboxId(flatItems[lightboxIndex - 1]?.id ?? null)}
          onNext={() => setLightboxId(flatItems[lightboxIndex + 1]?.id ?? null)}
          onClose={() => setLightboxId(null)}
          onTogglePin={togglePin}
          onDelete={(it) => {
            setLightboxId(null);
            void guard(async () => {
              await deleteItems([it.id]);
              setItems((prev) => (prev ?? []).filter((i) => i.id !== it.id));
            });
          }}
        />
      ) : null}

      {previewItem ? (
        <CapturePreview
          item={previewItem}
          region={regions.find((r) => r.id === previewItem.region_id) ?? null}
          allItems={items ?? []}
          onEdit={editItem}
          onClose={() => setPreviewId(null)}
        />
      ) : null}
    </div>
  );
}
