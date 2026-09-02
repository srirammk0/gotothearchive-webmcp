import { useState } from "react";

/** Tile multi-select: the set of selected item ids, and its two mutations. */
export function useArchiveSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clear = () => setSelectedIds(new Set());

  return { selectedIds, toggle, clear };
}
