import type { Queries } from "./db/queries";

/**
 * Auto-caption images/screenshots on capture and via backfill, so an agent —
 * which never receives image bytes through WebMCP (the tool-call transport is
 * string-only; see webmcp-capability-layer.md's rule against overclaiming
 * multimodal transport) — still gets a real description instead of nothing.
 *
 * No env / no AI binding, or any failure/empty/over-long output → null, and
 * the caller keeps the item exactly as it was (title-only, same as today).
 * A human-written description always wins — this only ever fills a gap.
 */
export type VisionAiLike = {
  AI?: { run: (model: string, opts: unknown) => Promise<unknown> };
};

const MAX_CAPTION_LEN = 600;

const PROMPT =
  "Describe this image in detail for someone building a taste profile from " +
  "design references. Cover what's actually visible: composition and layout, " +
  "color palette, typography and type treatment (if any text is shown), " +
  "imagery style, visual hierarchy, and overall mood or tone. Plain " +
  "prose, no preamble, no markdown, 2-4 sentences.";

/**
 * `bytes` is the raw file (not yet type-checked) — callers are responsible for
 * only calling this on an image/screenshot content type.
 */
export async function captionImage(env: VisionAiLike | undefined, bytes: Uint8Array): Promise<string | null> {
  if (!env?.AI?.run) return null;
  try {
    const result = await env.AI.run("@cf/llava-hf/llava-1.5-7b-hf", {
      image: Array.from(bytes),
      prompt: PROMPT,
      max_tokens: 512,
    });
    const text = (result as { description?: string; response?: string }).description
      ?? (result as { description?: string; response?: string }).response;
    if (typeof text !== "string") {
      console.warn(`vision: unexpected caption response shape — ${JSON.stringify(result).slice(0, 200)}`);
      return null;
    }
    const trimmed = text.trim();
    if (!trimmed) return null;
    return trimmed.length > MAX_CAPTION_LEN ? `${trimmed.slice(0, MAX_CAPTION_LEN)}…` : trimmed;
  } catch (e) {
    console.warn(`vision: caption call failed — ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

const BACKFILL_BATCH = 5;

/**
 * One bounded batch of the caption backlog — images already in the archive
 * (captured before this feature existed, or where a caption call previously
 * failed) that still have no description. No new table: the backlog is just
 * `imagesNeedingCaption`'s live query, so a permanently-failing image simply
 * gets retried on the next drain rather than needing its own retry bookkeeping.
 */
export async function captionSpaceImages(
  queries: Queries,
  env: VisionAiLike,
  spaceId: string,
  getBlob: (key: string) => Promise<Uint8Array | null>,
): Promise<{ captioned: number; morePending: boolean }> {
  const items = queries.imagesNeedingCaption(spaceId, BACKFILL_BATCH);
  let captioned = 0;
  for (const item of items) {
    if (!item.content_ref) continue;
    const bytes = await getBlob(item.content_ref).catch(() => null);
    if (!bytes) continue;
    const caption = await captionImage(env, bytes);
    if (caption) {
      queries.updateItem({ ...item, semantic_text: caption, updated_at: Date.now() });
      captioned++;
    }
  }
  const morePending = queries.imagesNeedingCaption(spaceId, 1).length > 0;
  return { captioned, morePending };
}
