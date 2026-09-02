import { motion } from "motion/react";
import { isAgentAuthority, type ContextItem } from "@shared/contract";
import { Icon } from "../primitives/Icon";
import { duration, ease } from "../tokens";
import { host, kind } from "./itemKind";
import { ItemPreview } from "./ItemPreview";
import { isPinned } from "./useArchive";

function isAgentAdded(item: ContextItem): boolean {
  return isAgentAuthority(item.authority_class);
}

function itemDate(item: ContextItem): string {
  return new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** One grid cell in the Archive: the item's preview, select/pin controls, and its caption. */
export function Tile({
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
        <ItemPreview item={item} size="tile" />

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
