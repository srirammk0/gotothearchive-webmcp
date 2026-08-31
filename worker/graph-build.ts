/**
 * Automatic context-graph edge derivation.
 *
 * Derives ContextEdges between a freshly-captured item and the items already in
 * its space, from the items themselves — no agent, no human. Called from the
 * capture flow (deriveEdgesForItem) and from a backfill (rebuildSpaceEdges).
 *
 * All derived edges have created_by = "system". Approval state is per-rule:
 * strong structural facts land "approved"; fuzzy similarity lands "proposed"
 * for a human to confirm in the Connections panel.
 *
 * ponytail: rules 3 and 4 are O(n) per capture over the space's items (token
 * sets + pairwise jaccard). Fine to low hundreds of items per space. The
 * upgrade beyond that is a blocked/indexed similarity pass (e.g. an FTS-driven
 * candidate shortlist) instead of scanning every sibling.
 */
import type { ContextItem, Relationship } from "@shared/contract";
import type { Queries } from "./db/queries";

const MAX_PER_CALL = 12;

const STOPLIST = new Set([
  "this", "that", "with", "from", "have", "will", "your", "about", "into",
  "they", "them", "then", "than", "there", "here", "what", "when", "which",
  "were", "been", "being", "some", "such", "only", "also", "more", "most",
  "over", "under", "just", "like", "make", "made", "very", "much", "many",
  "http", "https", "www", "com", "org", "net", "html",
]);

function hostname(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function contentWords(item: ContextItem): Set<string> {
  const text = `${item.title} ${item.semantic_text ?? ""}`.toLowerCase();
  const out = new Set<string>();
  for (const w of text.split(/[^a-z0-9]+/)) {
    if (w.length >= 4 && !STOPLIST.has(w) && !/^\d+$/.test(w)) out.add(w);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): { j: number; shared: number } {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  return { j: union === 0 ? 0 : inter / union, shared: inter };
}

/**
 * Derive + insert edges between `item` and existing items in the same space.
 * Returns the number of edges inserted. Idempotent via q.edgeExists.
 */
export function deriveEdgesForItem(q: Queries, item: ContextItem, now: number): number {
  const siblings = q
    .listItemsBySpace(item.space_id)
    .filter((o) => o.id !== item.id);

  let inserted = 0;

  const add = (
    fromId: string,
    toId: string,
    relationship: Relationship,
    weight: number,
    approval_state: "approved" | "proposed",
  ): void => {
    if (inserted >= MAX_PER_CALL) return;
    if (fromId === toId) return;
    if (q.edgeExists(fromId, toId, relationship)) return;
    q.insertEdge({
      id: crypto.randomUUID(),
      from_id: fromId,
      to_id: toId,
      relationship,
      weight: Math.max(0, Math.min(1, weight)),
      created_by: "system",
      approval_state,
      created_at: now,
    });
    inserted++;
  };

  // Rule 2: tweet parent/child structure. Handle both call orders.
  const extracted = (item.metadata as { extracted?: unknown }).extracted;
  const childLink = (o: ContextItem): Relationship =>
    o.type === "image" ? "derived_from" : "mentions";

  if (extracted && typeof extracted === "object") {
    // called for the tweet, after its children exist
    for (const o of siblings) {
      if ((o.metadata as { derived_from_item_id?: string }).derived_from_item_id === item.id) {
        add(item.id, o.id, childLink(o), 1.0, "approved");
      }
    }
  }
  const parentId = (item.metadata as { derived_from_item_id?: string }).derived_from_item_id;
  if (parentId) {
    // called for a child, before/after the parent's own derive pass
    const parent = siblings.find((o) => o.id === parentId);
    if (parent) add(parent.id, item.id, childLink(item), 1.0, "approved");
  }

  // Rule 1: same source domain -> related_to, 0.6, approved.
  const host = hostname(item.source_url);
  if (host) {
    for (const o of siblings) {
      if (hostname(o.source_url) === host) {
        add(item.id, o.id, "related_to", 0.6, "approved");
      }
    }
  }

  // Rule 3: shared salient words -> related_to, weight min(0.5, jaccard), proposed.
  // jaccard >= 0.18 AND >= 3 shared words. Cap at the 5 strongest.
  const mine = contentWords(item);
  if (mine.size > 0) {
    const scored: { id: string; j: number }[] = [];
    for (const o of siblings) {
      const { j, shared } = jaccard(mine, contentWords(o));
      if (j >= 0.18 && shared >= 3) scored.push({ id: o.id, j });
    }
    scored.sort((a, b) => b.j - a.j);
    for (const s of scored.slice(0, 5)) {
      add(item.id, s.id, "related_to", Math.min(0.5, s.j), "proposed");
    }
  }

  // Rule 4: same region + captured within 10 min -> related_to, 0.3, proposed.
  // Only when no stronger edge (rule 1-3, all "related_to"/"mentions"/"derived_from") links them.
  const TEN_MIN = 10 * 60 * 1000;
  for (const o of siblings) {
    if (o.region_id !== item.region_id) continue;
    if (Math.abs(o.created_at - item.created_at) > TEN_MIN) continue;
    if (
      q.edgeExists(item.id, o.id, "related_to") ||
      q.edgeExists(item.id, o.id, "mentions") ||
      q.edgeExists(item.id, o.id, "derived_from")
    ) {
      continue;
    }
    add(item.id, o.id, "related_to", 0.3, "proposed");
  }

  return inserted;
}

/**
 * Idempotent backfill: run deriveEdgesForItem for every item in the space.
 * Returns the total number of edges inserted across all items.
 */
export function rebuildSpaceEdges(q: Queries, spaceId: string, now: number): number {
  let total = 0;
  for (const item of q.listItemsBySpace(spaceId)) {
    total += deriveEdgesForItem(q, item, now);
  }
  return total;
}
