/**
 * Bounded traversal from seed item ids. Access is re-checked at EVERY node —
 * an inaccessible node must not appear, be counted, or be hinted at.
 */
import { GRAPH_MAX_DEPTH, GRAPH_MAX_FANOUT, GRAPH_MAX_NODES } from "@shared/contract";
import type { ContextItem, ContextEdge } from "@shared/contract";
import type { Queries } from "./db/queries";

export interface GraphResult {
  nodes: ContextItem[];
  edges: (ContextEdge & { decayed_weight: number })[];
}

/**
 * @param allowedRegionIds region ids the caller is authorized for (read or above).
 *   A node whose region is outside this set is dropped silently at every hop.
 */
export function traverse(
  q: Queries,
  seedItemIds: string[],
  allowedRegionIds: Set<string>,
): GraphResult {
  const nodes = new Map<string, ContextItem>();
  const edgesSeen = new Map<string, ContextEdge & { decayed_weight: number }>();

  const isAccessible = (item: ContextItem | null): item is ContextItem =>
    item !== null && allowedRegionIds.has(item.region_id);

  let frontier: { id: string; depth: number; decay: number }[] = [];
  for (const id of seedItemIds) {
    const item = q.getItem(id);
    if (isAccessible(item) && !nodes.has(id)) {
      nodes.set(id, item);
      frontier.push({ id, depth: 0, decay: 1 });
    }
  }

  while (frontier.length > 0 && nodes.size < GRAPH_MAX_NODES) {
    const next: typeof frontier = [];
    for (const { id, depth, decay } of frontier) {
      if (depth >= GRAPH_MAX_DEPTH) continue;
      const edges = q.edgesFrom(id).slice(0, GRAPH_MAX_FANOUT);
      for (const edge of edges) {
        const neighborId = edge.from_id === id ? edge.to_id : edge.from_id;
        const neighbor = q.getItem(neighborId);
        if (!isAccessible(neighbor)) continue; // inaccessible: absent, not counted, not hinted

        const neighborDecay = decay * edge.weight * 0.7 ** depth;

        if (!edgesSeen.has(edge.id)) {
          edgesSeen.set(edge.id, { ...edge, decayed_weight: neighborDecay });
        }

        if (nodes.size >= GRAPH_MAX_NODES) continue;
        if (!nodes.has(neighborId)) {
          nodes.set(neighborId, neighbor);
          next.push({ id: neighborId, depth: depth + 1, decay: neighborDecay });
        }
      }
    }
    frontier = next;
  }

  // Only keep edges where BOTH endpoints ended up in the accessible node set.
  const finalEdges = [...edgesSeen.values()].filter(
    (e) => nodes.has(e.from_id) && nodes.has(e.to_id),
  );

  return { nodes: [...nodes.values()], edges: finalEdges };
}
