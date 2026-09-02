/**
 * Automatic context-graph edge derivation.
 *
 * Derives ContextEdges between a freshly-captured item and the items already in
 * its space, from the items themselves — no agent, no human. Called from the
 * capture flow (deriveEdgesForItem) and from a backfill (rebuildSpaceEdges).
 *
 * All derived edges have created_by = "system". Approval state is per-rule:
 * strong structural facts land "approved"; fuzzy similarity lands "proposed"
 * for a human to confirm in the Connections panel. Every rule is grounded in
 * the items' own content or source — nothing is linked for co-location alone.
 *
 * ponytail: rules 3 and 4 are O(n) per capture over the space's items (token
 * sets + pairwise jaccard). Fine to low hundreds of items per space. The
 * upgrade beyond that is a blocked/indexed similarity pass (e.g. an
 * FTS-driven candidate shortlist) instead of scanning every sibling.
 */
import type { ContextItem, DesignProfile, Relationship } from "@shared/contract";
import { designTokens, hueBucket } from "@shared/contract";
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

function designProfile(item: ContextItem): DesignProfile | null {
  const d = (item.metadata as { design?: DesignProfile }).design;
  return d && typeof d === "object" ? d : null;
}

/** The dominant colour's hue bucket — "ground" role if tagged, else the top palette entry. */
function groundHue(d: DesignProfile): string | null {
  const ground = d.palette.find((p) => p.role === "ground") ?? d.palette[0];
  return ground ? hueBucket(ground.hex) : null;
}

const childRelationship = (item: ContextItem): Relationship =>
  item.type === "image" ? "derived_from" : "mentions";

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
  if (extracted && typeof extracted === "object") {
    // called for the tweet, after its children exist
    for (const o of siblings) {
      if ((o.metadata as { derived_from_item_id?: string }).derived_from_item_id === item.id) {
        add(item.id, o.id, childRelationship(o), 1.0, "approved");
      }
    }
  }
  const parentId = (item.metadata as { derived_from_item_id?: string }).derived_from_item_id;
  if (parentId) {
    // called for a child, before/after the parent's own derive pass
    const parent = siblings.find((o) => o.id === parentId);
    if (parent) add(parent.id, item.id, childRelationship(item), 1.0, "approved");
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
  // jaccard >= 0.18 AND >= 3 shared words. Cap at the 5 strongest. Every derived
  // connection is grounded in the items' own text (or a shared source / tweet
  // structure above) — nothing is linked just for landing in the same folder.
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

  // Rule 4: design-attribute similarity -> related_to. Every image item can carry
  // a DesignProfile (shared/contract.ts); comparing them is the whole point of a
  // design-reference archive — a shared cream ground or a shared Didone display
  // face is an obvious link that rules 1-3 (source/structure/words) can't see at
  // all. `related_to`, not `inspired_by`: a shared attribute is evidence of family
  // resemblance, not a directional claim that one item influenced the other —
  // that provenance claim isn't something raw token overlap can support.
  // Skips entirely when this item has no design profile; never invents one.
  const myDesign = designProfile(item);
  if (myDesign) {
    const myHue = groundHue(myDesign);
    const myTokens = new Set(designTokens(myDesign));
    const hueMatches: string[] = [];
    const tokenScored: { id: string; j: number }[] = [];

    for (const o of siblings) {
      const oDesign = designProfile(o);
      if (!oDesign) continue;

      // 4a) same typography.classification AND same typography.scale -> approved,
      // 0.7. Two independent closed-vocabulary categories matching together is
      // long odds by chance (12 classifications x 5 scales) — as strong a
      // structural fact as rule 1's same-hostname match, so it gets the same
      // auto-approve treatment instead of landing in the proposed queue.
      if (
        myDesign.typography.classification !== "none" &&
        myDesign.typography.classification === oDesign.typography.classification &&
        myDesign.typography.scale !== "none" &&
        myDesign.typography.scale === oDesign.typography.scale
      ) {
        add(item.id, o.id, "related_to", 0.7, "approved");
      }

      // 4b) same ground-colour hue bucket -> proposed, 0.35. "Same colour family"
      // is a real visual link but a single coarse bucket (11 buckets total) is
      // weak evidence on its own, so — like rule 3 — a human confirms it.
      if (myHue && myHue !== "unknown" && groundHue(oDesign) === myHue) {
        hueMatches.push(o.id);
      }

      // 4c) overall designTokens() jaccard -> proposed, weight = min(0.55, j).
      // Same shape as rule 3's word jaccard, but the design vocabulary is a
      // handful of closed enums instead of free text, so incidental overlap is
      // far more likely — the bar is set higher (0.4 vs rule 3's 0.18) to keep
      // this meaning "broadly the same look", not "shares a corner radius".
      const { j } = jaccard(myTokens, new Set(designTokens(oDesign)));
      if (j >= 0.4) tokenScored.push({ id: o.id, j });
    }

    // Cap each fuzzy sub-rule at the 5 strongest, mirroring rule 3's cap — cheap
    // set math over siblings already fetched above, no rescans, and the shared
    // MAX_PER_CALL guard in add() bounds the total regardless.
    for (const id of hueMatches.slice(0, 5)) add(item.id, id, "related_to", 0.35, "proposed");
    tokenScored.sort((a, b) => b.j - a.j);
    for (const s of tokenScored.slice(0, 5)) {
      add(item.id, s.id, "related_to", Math.min(0.55, s.j), "proposed");
    }
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
