/**
 * Region-scoped taste revocation (implementation-plan-2026-09 §F1).
 *
 * A taste signal is a compression of the archive material behind its evidence,
 * so surfacing it after that material is revoked leaks exactly what the
 * revocation withheld. A signal reaches a task only when EVERY region grounding
 * it is currently readable — `every`, not `some`: a signal partly taught by a
 * revoked folder is still partly that folder's content. A signal with no
 * resolvable grounding was taught by no folder and stays available.
 *
 * Agent-facing only: `get_taste_for_task` and the retrieval boost narrow. The
 * human's own Taste page (`/api/taste`) is untouched — revocation constrains the
 * agent, not the person (BUILD-CONTRACT invariant #10).
 */
import type { Id } from "@shared/contract";
import type { Queries } from "../db/queries";

/** Regions of the archive material behind a signal's supporting evidence. */
export function groundingRegionIds(q: Queries, signalId: Id): Set<string> {
  // ponytail: walks evidence per signal on each call. Evidence is capped at 8
  // rows per signal and signals per space are bounded (~18), so this is tens of
  // indexed reads. If it ever gets hot, denormalize into a
  // `taste_signal_regions` table maintained on evidence insert.
  const itemIds = new Set<string>();
  for (const ev of q.listTasteEvidence(signalId)) {
    if (ev.item_id) {
      itemIds.add(ev.item_id);
    } else if (ev.annotation_id) {
      const ann = q.getAnnotation(ev.annotation_id);
      if (ann) for (const inf of q.listInfluences(ann.version_id)) itemIds.add(inf.item_id);
    }
  }
  const regionIds = new Set<string>();
  for (const item of q.getItems([...itemIds])) regionIds.add(item.region_id);
  return regionIds;
}

/** every() grounding region readable ⇒ the signal may reach this task. */
export function signalIsInScope(q: Queries, signalId: Id, readable: Set<string>): boolean {
  const grounding = groundingRegionIds(q, signalId);
  if (grounding.size === 0) return true;
  for (const regionId of grounding) if (!readable.has(regionId)) return false;
  return true;
}
