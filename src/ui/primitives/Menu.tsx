import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { duration, ease } from "../tokens";

export interface MenuItem {
  label: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * A small styled popover menu — the designed replacement for a native <select>.
 * The panel is portalled to <body> with fixed positioning so no ancestor
 * `overflow` can clip it. Closes on outside click, Escape, scroll, or select.
 */
export function Menu({
  trigger,
  items,
  align = "start",
  side = "bottom",
  className = "",
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  side?: "bottom" | "top";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const place = () => {
      const a = anchorRef.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      const panelH = panelRef.current?.offsetHeight ?? items.length * 34 + 8;
      const panelW = panelRef.current?.offsetWidth ?? 176;
      const openUp = side === "top" || r.bottom + panelH + 8 > window.innerHeight;
      const top = openUp ? r.top - panelH - 6 : r.bottom + 6;
      const left = align === "end" ? r.right - panelW : r.left;
      setPos({
        top: Math.max(8, Math.min(top, window.innerHeight - panelH - 8)),
        left: Math.max(8, Math.min(left, window.innerWidth - panelW - 8)),
      });
    };
    place();
    // A second pass once the panel has real dimensions.
    const id = requestAnimationFrame(place);
    return () => cancelAnimationFrame(id);
  }, [open, side, align, items.length]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDoc = (e: MouseEvent) => {
      if (!anchorRef.current?.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <div ref={anchorRef} className={className || "inline-flex"}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open &&
        createPortal(
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: duration.fast, ease }}
            role="menu"
            style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className="z-[70] min-w-44 overflow-hidden rounded-[var(--radius-md)] border border-line bg-raised p-1 shadow-xl shadow-black/40"
          >
            {items.map((item, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[length:var(--text-meta)] transition-colors duration-[var(--duration-fast)] disabled:opacity-40 ${
                  item.danger ? "text-bad hover:bg-bad/10" : "text-muted hover:bg-hover hover:text-text"
                }`}
              >
                {item.label}
              </button>
            ))}
          </motion.div>,
          document.body,
        )}
    </div>
  );
}
