/**
 * retrieve(): permission is a hard pre-filter, never a ranking signal.
 * Inaccessible items are absent from candidate generation — this is an invariant.
 *
 * Pipeline: three ranked candidate lists (FTS, recency, graph) fused with
 * reciprocal rank fusion, then priors applied as multipliers. No signal-weight
 * tuning. Everything here is a SQLite read or string work in JS — no I/O, sync.
 */
import { AUTHORITY_CLASSES, RRF_K } from "@shared/contract";
import type {
  ContextItem,
  Id,
  RetrievalSignals,
  RetrievedItem,
  TasteSignal,
} from "@shared/contract";
import type { Queries } from "./db/queries";
import { authorizedItemIds, authorizedRegionIds, taskProject } from "./permissions";
import { traverse } from "./graph";

export interface RetrieveInput {
  taskId: string;
  query: string;
  regionSlugs: string[] | null;
  limit: number;
}

/** Contribution below this counts as taste staying silent, not lifting an item. */
const TASTE_APPLIED_MIN = 0.1;

export async function retrieve(
  q: Queries,
  input: RetrieveInput,
  now: number,
): Promise<RetrievedItem[]> {
  const task = q.getTask(input.taskId);
  if (!task) return [];

  const project = (task.project_id ?? null) === null ? null : taskProject(q, task);
  if ((task.project_id ?? null) !== null && project === null) return [];

  // 1. Resolve the authorized region set FIRST. Hard pre-filter.
  const allowedIds = authorizedRegionIds(q, input.taskId, now);
  const allRegions = q.listRegions(task.space_id);
  const slugById = new Map(allRegions.map((r) => [r.id, r.slug]));
  let candidateRegionIds = [...allowedIds];
  if (input.regionSlugs && input.regionSlugs.length > 0) {
    const wanted = new Set(input.regionSlugs);
    candidateRegionIds = candidateRegionIds.filter((id) => wanted.has(slugById.get(id) ?? ""));
  }
  if (candidateRegionIds.length === 0) return [];
  const inScope = new Set(candidateRegionIds);
  const allowedItemIdSet = project ? authorizedItemIds(q, input.taskId, now) : null;

  // 2. Three ranked candidate lists, all scoped to allowed regions only.
  const items = new Map<string, ContextItem>();
  const remember = (list: ContextItem[]) => {
    for (const it of list) {
      if (inScope.has(it.region_id) && (allowedItemIdSet === null || allowedItemIdSet.has(it.id))) {
        items.set(it.id, it);
      }
    }
  };

  // A — full-text match, best first.
  const ftsList = q.searchItems(
    input.query,
    candidateRegionIds,
    input.limit * 3,
    allowedItemIdSet === null ? undefined : [...allowedItemIdSet],
  );
  remember(ftsList);

  // A non-empty lexical query must not be padded with unrelated recent items.
  // Recency becomes the fallback candidate source only when text search has no
  // hit (or the caller intentionally sends an empty query).
  const recentFallback = q
    .listItemsByRegions(candidateRegionIds)
    .filter((item) => allowedItemIdSet === null || allowedItemIdSet.has(item.id))
    // oxlint-disable-next-line unicorn/no-array-sort -- query returns a fresh array
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(0, input.limit * 3);
  if (ftsList.length === 0) remember(recentFallback);

  // C — graph neighbourhood. Real text hits seed graph expansion when present;
  // otherwise the recency fallback provides a useful browse-like result.
  const seedIds = (ftsList.length > 0 ? ftsList : recentFallback).map((it) => it.id);
  const graph = traverse(q, seedIds, allowedIds);
  const graphList = orderGraphNodes(graph);
  remember(graphList);

  // B — recency ranks only the candidates already justified by text/graph (or
  // the explicit fallback set). It is a prior, never an independent source of
  // unrelated results for a successful query.
  const recencyList = [...items.values()];
  // oxlint-disable-next-line unicorn/no-array-sort -- recencyList is a fresh local array
  recencyList.sort((a, b) => b.updated_at - a.updated_at);

  const ftsRank = rankMap(ftsList);
  const recencyRank = rankMap(recencyList);
  const graphRank = rankMap(graphList);

  // 3. Fuse with reciprocal rank fusion, then apply priors as multipliers.
  const confirmed = q.confirmedTasteSignals(task.space_id).filter((signal) => {
    if (signal.owner_id !== task.human_id) return false;
    if (signal.scope === "personal") return (signal.project_id ?? null) === null;
    return project !== null && signal.project_id === project.id;
  });
  type Row = {
    entry: RetrievedItem;
    contributingSignalIds: Id[];
  };
  const rows: Row[] = [];

  for (const item of items.values()) {
    if (!inScope.has(item.region_id)) continue;

    const rFts = ftsRank.get(item.id) ?? null;
    const rRecency = recencyRank.get(item.id) ?? null;
    const rGraph = graphRank.get(item.id) ?? null;
    // Re-populated from local embeddings; always null until that lands.
    const rSemantic: number | null = null;

    const fused =
      (rFts === null ? 0 : 1 / (RRF_K + rFts)) +
      (rRecency === null ? 0 : 1 / (RRF_K + rRecency)) +
      (rGraph === null ? 0 : 1 / (RRF_K + rGraph)) +
      (rSemantic === null ? 0 : 1 / (RRF_K + rSemantic));

    const authority_weight =
      1 - AUTHORITY_CLASSES.indexOf(item.authority_class) / AUTHORITY_CLASSES.length;

    const curation =
      item.authority_class === "human_authored" ||
      item.authority_class === "human_confirmed_preference"
        ? 1
        : 0.7;

    const taste = tasteRelevanceFor(item, confirmed);

    const ageMs = Math.max(now - item.updated_at, 0);
    const recency = 1 / (1 + ageMs / (1000 * 60 * 60 * 24 * 30)); // ~30-day decay

    // Explicit readout only — the graph LIST already feeds RRF; this never enters `score`.
    const graph_strength = graphStrengthFor(graph.edges, item.id, items);

    const score =
      fused * authority_weight * curation * (1 + taste.value) * (0.75 + 0.25 * recency);

    const signals: RetrievalSignals = {
      fused,
      ranks: { fts: rFts, recency: rRecency, graph: rGraph, semantic: rSemantic },
      graph_strength,
      taste_relevance: taste.value,
      curation,
      recency,
      authority_weight,
      score,
    };

    rows.push({
      contributingSignalIds: taste.contributingSignalIds,
      entry: {
        item,
        region_slug: slugById.get(item.region_id) ?? "",
        signals,
        applied_signal_ids: [],
        why: why(item, signals, taste, confirmed),
      },
    });
  }

  // oxlint(no-array-sort): `rows` is a fresh local array, mutation-in-place is safe here.
  rows.sort(
    (a, b) =>
      b.entry.signals.score - a.entry.signals.score ||
      a.entry.item.id.localeCompare(b.entry.item.id),
  );
  const top = rows.slice(0, input.limit);

  // 4. applied_signal_ids: confirmed signals that materially lifted an item that landed in the top N.
  // ponytail: one access row per returned item. Fine as an audit trail at beta
  // scale; if reads get hot, move this to a queue. Batched into one insert below.
  for (const row of top) row.entry.applied_signal_ids = row.contributingSignalIds;
  q.insertAccesses(
    top.map((row) => ({
      id: crypto.randomUUID(),
      task_id: input.taskId,
      item_id: row.entry.item.id,
      tool_name: "retrieve",
      at: now,
      why: row.entry.why,
      applied_signal_ids: row.entry.applied_signal_ids,
    })),
  );

  return top.map((r) => r.entry);
}

/** 1-based rank of each item id in a list, first occurrence wins. */
function rankMap(list: ContextItem[]): Map<string, number> {
  const m = new Map<string, number>();
  list.forEach((it, i) => {
    if (!m.has(it.id)) m.set(it.id, i + 1);
  });
  return m;
}

/** Graph nodes ordered by the strongest decayed edge that touches each one. */
function orderGraphNodes(graph: ReturnType<typeof traverse>): ContextItem[] {
  const strongest = new Map<string, number>();
  for (const e of graph.edges) {
    strongest.set(e.from_id, Math.max(strongest.get(e.from_id) ?? 0, e.decayed_weight));
    strongest.set(e.to_id, Math.max(strongest.get(e.to_id) ?? 0, e.decayed_weight));
  }
  const nodes = [...graph.nodes];
  // oxlint-disable-next-line unicorn/no-array-sort -- nodes is a fresh local array
  nodes.sort((a, b) => (strongest.get(b.id) ?? 0) - (strongest.get(a.id) ?? 0));
  return nodes;
}

/** Avg decayed weight of traversal edges whose endpoints are both candidates. Signal readout only. */
function graphStrengthFor(
  edges: ReturnType<typeof traverse>["edges"],
  itemId: string,
  candidates: Map<string, ContextItem>,
): number {
  const touching = edges.filter(
    (e) =>
      (e.from_id === itemId || e.to_id === itemId) &&
      candidates.has(e.from_id) &&
      candidates.has(e.to_id),
  );
  if (touching.length === 0) return 0;
  const total = touching.reduce((sum, e) => sum + e.decayed_weight, 0);
  return Math.min(total / touching.length, 1);
}

const WORD = /[a-z0-9]{3,}/g;

function contentWords(s: string): Set<string> {
  return new Set(s.toLowerCase().match(WORD) ?? []);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

/** taste-learning.md §Authority order: project taste outranks personal. */
function authorityOrderWeight(signal: TasteSignal): number {
  return signal.scope === "project" ? 1.0 : 0.7;
}

function itemDimensionTokens(item: ContextItem): Set<string> {
  const tokens = new Set<string>([item.type]);
  const dims = (item.metadata as { dimensions?: unknown }).dimensions;
  if (Array.isArray(dims)) for (const d of dims) if (typeof d === "string") tokens.add(d);
  return tokens;
}

function overlap(signal: TasteSignal, item: ContextItem): number {
  const itemDims = itemDimensionTokens(item);
  const sharedDims = signal.dimensions.filter((d) => itemDims.has(d)).length;
  const dimScore = signal.dimensions.length === 0 ? 0 : sharedDims / signal.dimensions.length;

  const lexical = jaccard(
    contentWords(signal.statement),
    contentWords(`${item.title} ${item.semantic_text ?? ""}`),
  );

  return 0.5 * dimScore + 0.5 * lexical;
}

/**
 * §2.1 — max over confirmed in-scope signals of
 *   confidence · authorityOrderWeight · overlap(signal, item), clamped [0, 0.6].
 * The lever rides on lexical Jaccard of short strings, so the cap keeps the
 * (1 + taste.value) multiplier under ~1.6x. 0 when no confirmed signal is in
 * scope: taste stays silent rather than inventing a boost.
 */
function tasteRelevanceFor(
  item: ContextItem,
  confirmed: TasteSignal[],
): { value: number; contributingSignalIds: Id[] } {
  if (confirmed.length === 0) return { value: 0, contributingSignalIds: [] };

  let best = 0;
  const contributing: Id[] = [];
  for (const signal of confirmed) {
    const c = signal.confidence * authorityOrderWeight(signal) * overlap(signal, item);
    if (c > best) best = c;
    if (c > TASTE_APPLIED_MIN) contributing.push(signal.id);
  }
  return { value: Math.max(0, Math.min(0.6, best)), contributingSignalIds: contributing };
}

/**
 * Names which lists placed the item, whether taste lifted it (and on which
 * dimension), and its authority class in plain words. Never hides the class.
 */
function why(
  item: ContextItem,
  s: RetrievalSignals,
  taste: { value: number; contributingSignalIds: Id[] },
  confirmed: TasteSignal[],
): string {
  const placements: string[] = [];
  if (s.ranks.fts !== null) {
    placements.push(s.ranks.fts <= 3 ? "top text match" : "a text match");
  }
  if (s.ranks.semantic !== null) {
    placements.push(s.ranks.semantic <= 3 ? "a top semantic match" : "a semantic match");
  }
  if (s.ranks.recency !== null && s.ranks.recency <= 5) placements.push("recently updated");
  if (s.ranks.graph !== null) placements.push("a graph neighbour of another hit");

  const parts: string[] = [];
  if (placements.length === 0) {
    parts.push(`a ${AUTHORITY_LABEL[item.authority_class]} ${item.type} in this region`);
  } else {
    parts.push(joinList(placements));
  }

  if (taste.value > TASTE_APPLIED_MIN && taste.contributingSignalIds.length > 0) {
    const dims = new Set<string>();
    for (const sig of confirmed) {
      if (taste.contributingSignalIds.includes(sig.id)) for (const d of sig.dimensions) dims.add(d);
    }
    parts.push(
      dims.size > 0
        ? `taste lifted it (${[...dims].join(", ")})`
        : "taste lifted it",
    );
  }

  parts.push(`authority: ${AUTHORITY_LABEL[item.authority_class]}`);
  return parts.join("; ");
}

const AUTHORITY_LABEL: Record<string, string> = {
  human_authored: "human-authored",
  imported_source_linked: "imported, source-linked",
  human_confirmed_preference: "human-confirmed preference",
  agent_authored: "agent-authored",
  agent_artifact: "agent artifact",
  agent_proposal: "agent proposal",
  inferred_taste_signal: "inferred taste signal",
};

function joinList(xs: string[]): string {
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(", ")}, also ${xs[xs.length - 1]}`;
}
