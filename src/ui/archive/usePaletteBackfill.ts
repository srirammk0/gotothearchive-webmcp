/**
 * Measure exact palettes for images archived before capture-time measurement.
 *
 * Colour is the one design fact this app refuses to estimate. Asked to name the
 * colours in a cream poster printed in ultramarine and burnt orange, the vision
 * model returned `#2ECC40` green — hallucinated flat-UI defaults. Those values
 * would flow into hue-bucket graph edges and into the palette an agent is told
 * to build with, so a wrong palette is materially worse than none.
 *
 * The Worker has no image decoder, so the browser is the only place the real
 * pixels exist. This runs quietly on the Archive page, measures anything
 * missing a palette, and PATCHes it back. The design-extraction pass then picks
 * it up on its next run.
 *
 * Deliberately unobtrusive: no spinner, no error surface, low concurrency. It
 * is a background repair of already-visible items, not something the person
 * asked for, so it must never make the page feel busy or fail loudly. Each
 * image is attempted once per session.
 */
import { useEffect, useRef } from "react";
import type { ContextItem } from "@shared/contract";
import { blobUrl, setItemPalette } from "../../api/client";
import { measurePalette } from "./palette";

/** One at a time. These are full-size originals; decoding several at once janks scrolling. */
const CONCURRENCY = 1;
/** Per session, so one broken blob cannot spin. */
const MAX_PER_SESSION = 40;

function needsPalette(item: ContextItem): boolean {
  if (item.type !== "image" && item.type !== "screenshot") return false;
  if (!item.content_ref) return false;
  const meta = item.metadata as { palette?: unknown; design?: { palette_source?: string } };
  if (Array.isArray(meta.palette) && meta.palette.length > 0) return false;
  return meta.design?.palette_source !== "measured";
}

export function usePaletteBackfill(items: ContextItem[], onMeasured?: () => void): void {
  const attempted = useRef(new Set<string>());
  const running = useRef(0);
  const measured = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function pump(): Promise<void> {
      if (running.current >= CONCURRENCY) return;
      const next = items.find((it) => needsPalette(it) && !attempted.current.has(it.id));
      if (!next || measured.current >= MAX_PER_SESSION) return;

      attempted.current.add(next.id);
      running.current++;
      try {
        const response = await fetch(blobUrl(next.content_ref!), { credentials: "same-origin" });
        if (!response.ok) return;
        const palette = await measurePalette(await response.blob());
        if (cancelled || palette.length === 0) return;
        await setItemPalette(next.id, palette);
        measured.current++;
        onMeasured?.();
      } catch {
        // A failed measurement is not a user-facing problem: the item keeps
        // `palette_source: "none"` and stays exactly as useful as it was.
      } finally {
        running.current--;
        if (!cancelled) void pump();
      }
    }

    void pump();
    return () => {
      cancelled = true;
    };
  }, [items, onMeasured]);
}
