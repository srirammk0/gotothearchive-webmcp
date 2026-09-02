import { useEffect, useState } from "react";
import type { ContextItem, Region } from "@shared/contract";
import {
  createRegion,
  deleteItems,
  deleteRegion,
  listItems,
  renameRegion,
  updateItems,
} from "../../api/client";

export function isPinned(item: ContextItem): boolean {
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

/**
 * Archive data + mutations: items, regions, and every write that touches
 * either. Selection and overlay (modal/lightbox) state live in the component —
 * this hook only owns what the server is authoritative over.
 *
 * Every mutator resolves to whether it succeeded, so a caller that only wants
 * to close a modal or clear a selection on success (never on a failed write,
 * where the banner below stays up so the user can retry) can await it.
 */
export function useArchive(spaceRegions: Region[], spaceLoading: boolean, spaceError: string | null) {
  const [items, setItems] = useState<ContextItem[] | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [regionList, setRegionList] = useState<Region[] | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const regions = regionList ?? spaceRegions;

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

  const guard = async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setBanner(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "That didn't work.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addFolder = (name: string, parentId: string | null): Promise<boolean> =>
    guard(async () => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const { region } = await createRegion(trimmed, parentId);
      setRegionList((prev) => [...(prev ?? spaceRegions), region]);
    });

  const renameFolder = (region: Region, name: string): Promise<boolean> =>
    guard(async () => {
      const { region: updated } = await renameRegion(region.id, name);
      setRegionList((prev) => (prev ?? spaceRegions).map((r) => (r.id === updated.id ? updated : r)));
    });

  /** Deletes a folder and everything in it. `parent` (on success) is where a caller viewing it should navigate to. */
  const removeFolder = async (region: Region): Promise<{ ok: boolean; parent: Region | null }> => {
    const deletedRegionIds = regionSubtreeIds(regions, region.id);
    const parent = region.parent_id ? regions.find((r) => r.id === region.parent_id) ?? null : null;
    const ok = await guard(async () => {
      await deleteRegion(region.id);
      setRegionList((prev) => (prev ?? spaceRegions).filter((r) => !deletedRegionIds.has(r.id)));
      setItems((prev) => (prev ?? []).filter((i) => !deletedRegionIds.has(i.region_id)));
    });
    return { ok, parent };
  };

  const addItem = (item: ContextItem) => setItems((prev) => [item, ...(prev ?? [])]);

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

  const moveItems = (ids: string[], destRegion: Region): Promise<boolean> =>
    guard(async () => {
      await updateItems(ids, { region_slug: destRegion.slug });
      const idSet = new Set(ids);
      setItems((prev) => (prev ?? []).map((i) => (idSet.has(i.id) ? { ...i, region_id: destRegion.id } : i)));
    });

  const deleteItemsById = (ids: string[]): Promise<boolean> =>
    guard(async () => {
      await deleteItems(ids);
      const idSet = new Set(ids);
      setItems((prev) => (prev ?? []).filter((i) => !idSet.has(i.id)));
    });

  return {
    items,
    itemsError,
    regions,
    banner,
    busy,
    addFolder,
    renameFolder,
    removeFolder,
    addItem,
    editItem,
    togglePin,
    moveItems,
    deleteItemsById,
  };
}
