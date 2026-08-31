/**
 * retrieve(): permission is a hard pre-filter, never a ranking signal.
 * Inaccessible items are absent from candidate generation — this is an invariant.
 */
import { AUTHORITY_CLASSES } from "@shared/contract";
import type { ContextItem, RetrievalSignals, RetrievedItem } from "@shared/contract";
import type { Queries } from "./db/queries";
import { authorizedRegionIds } from "./permissions";
import { traverse } from "./graph";

export interface RetrieveInput {
  taskId: string;
  query: string;
  regionSlugs: string[] | null;
  limit: number;
}

export function retrieve(q: Queries, input: RetrieveInput, now: number): RetrievedItem[] {
  const task = q.getTask(input.taskId);
  if (!task) return [];

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

  // 2. Candidate generation — FTS, graph neighbourhood, recency — all scoped to allowed regions only.
  const candidates = new Map<string, ContextItem>();

  for (const item of q.searchItems(input.query, candidateRegionIds, input.limit * 3)) {
    candidates.set(item.id, item);
  }

  const recent = q
    .listItemsByRegions(candidateRegionIds)
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(0, input.limit * 2);
  for (const item of recent) candidates.set(item.id, item);

  if (candidates.size > 0) {
    const seedIds = [...candidates.keys()].slice(0, 8);
    const graphResult = traverse(q, seedIds, allowedIds);
    for (const item of graphResult.nodes) {
      if (candidateRegionIds.includes(item.region_id)) candidates.set(item.id, item);
    }
  }

  // 3. Score multiplicatively over every RetrievalSignals field.
  const queryTokens = input.query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored: RetrievedItem[] = [];

  for (const item of candidates.values()) {
    const haystack = `${item.title} ${item.semantic_text ?? ""}`.toLowerCase();
    const text_match =
      queryTokens.length === 0
        ? 0.5
        : queryTokens.filter((t) => haystack.includes(t)).length / queryTokens.length || 0.1;

    const graph_strength = graphStrengthFor(q, item.id, [...candidates.keys()]);

    const taste_relevance = 0.5; // ponytail: no taste-signal matcher yet, add when taste_signals influence scoring
    const curation = item.authority_class === "human_authored" || item.authority_class === "human_confirmed_preference" ? 1 : 0.7;

    const ageMs = Math.max(now - item.updated_at, 0);
    const recency = 1 / (1 + ageMs / (1000 * 60 * 60 * 24 * 30)); // ~30-day half-life-ish decay

    const authority_weight =
      1 - AUTHORITY_CLASSES.indexOf(item.authority_class) / AUTHORITY_CLASSES.length;

    const score = text_match * (0.5 + graph_strength) * taste_relevance * curation * recency * authority_weight;

    const signals: RetrievalSignals = {
      text_match,
      graph_strength,
      taste_relevance,
      curation,
      recency,
      authority_weight,
      score,
    };

    q.insertAccess({
      id: crypto.randomUUID(),
      task_id: input.taskId,
      item_id: item.id,
      tool_name: "retrieve",
      at: now,
    });

    scored.push({
      item,
      region_slug: slugById.get(item.region_id) ?? "",
      signals,
      why: why(item, signals, queryTokens),
    });
  }

  // oxlint(no-array-sort): `scored` is a fresh local array, mutation-in-place is safe here.
  scored.sort((a, b) => b.signals.score - a.signals.score);
  return scored.slice(0, input.limit);
}

function graphStrengthFor(q: Queries, itemId: string, candidateIds: string[]): number {
  const edges = q.edgesFrom(itemId);
  const candidateSet = new Set(candidateIds);
  const connections = edges.filter(
    (e) => candidateSet.has(e.from_id) && candidateSet.has(e.to_id),
  );
  if (connections.length === 0) return 0;
  const total = connections.reduce((sum, e) => sum + e.weight, 0);
  return Math.min(total / connections.length, 1);
}

function why(item: ContextItem, s: RetrievalSignals, queryTokens: string[]): string {
  const parts: string[] = [];
  if (s.text_match > 0.5 && queryTokens.length > 0) parts.push(`matches "${queryTokens.join(" ")}"`);
  if (s.graph_strength > 0.3) parts.push("connected to other candidates");
  if (s.recency > 0.5) parts.push("recently updated");
  if (parts.length === 0) parts.push(`a ${item.type} in this region`);
  return parts.join(", ");
}
