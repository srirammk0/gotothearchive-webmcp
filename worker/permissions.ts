/**
 * THE CRITICAL FILE.
 *
 * Effective authority = human access ∩ grant ∩ task scope.
 * authorize() checks in exactly that order so the reason returned is the
 * most specific true one, and writes a denials + audit_events row on every
 * denial.
 */
import { DENIAL_REASONS, grantAtLeast, type GrantLevel } from "@shared/contract";
import type { ContextItem, Project, Task } from "@shared/contract";
import type { Queries } from "./db/queries";

export interface HumanRegionAccess {
  region_id: string;
  slug: string;
  level: GrantLevel;
}

/** Regions a human can reach, and at what level. Space owner gets write on all their regions. */
export function humanRegions(
  q: Queries,
  spaceId: string,
  humanId: string,
): HumanRegionAccess[] {
  const space = q.getSpace(spaceId);
  const regions = q.listRegions(spaceId);
  const isOwner = space?.owner_id === humanId;
  return regions.map((r) => ({
    region_id: r.id,
    slug: r.slug,
    level: isOwner ? "write" : "none",
  }));
}

export interface LiveGrant {
  grant_id: string;
  region_id: string;
  level: GrantLevel;
}

/** A task is live only while it is open and before its optional expiry. */
export function taskIsLive(task: Task | null, now: number): task is Task {
  return Boolean(
    task &&
      task.status === "open" &&
      (task.expires_at === null || task.expires_at > now),
  );
}

/** Grants for a task that are not revoked, not expired, and whose task is still live. */
export function liveGrants(q: Queries, taskId: string, now: number): LiveGrant[] {
  const task = q.getTask(taskId);
  if (!taskIsLive(task, now)) return [];
  const live = q
    .grantsForTask(taskId)
    .filter((g) => g.revoked_at === null)
    .filter((g) => g.expires_at === null || g.expires_at > now);

  // A region should only ever have one live grant — /api/grants revokes the
  // previous one before inserting. If two somehow coexist, take the LEAST
  // permissive rather than the first found. A stale permissive row must never be
  // able to outvote a deliberate restriction.
  const tightest = new Map<string, { grant_id: string; region_id: string; level: GrantLevel }>();
  for (const g of live) {
    const seen = tightest.get(g.region_id);
    if (!seen || !grantAtLeast(g.level, seen.level)) {
      tightest.set(g.region_id, { grant_id: g.id, region_id: g.region_id, level: g.level });
    }
  }
  return [...tightest.values()];
}

export interface AuthorizeInput {
  taskId: string;
  agentSessionId: string | null;
  regionSlug: string;
  need: GrantLevel;
  toolName: string;
  requested: Record<string, unknown>;
}

export type AuthorizeResult =
  | { ok: true; region: { id: string; slug: string; level: GrantLevel } }
  | { ok: false; reason: string };

/** Writes the denials + audit_events rows every denial must produce. */
export function writeDenial(
  q: Queries,
  args: {
    taskId: string | null;
    agentSessionId: string | null;
    toolName: string;
    requested: Record<string, unknown>;
    reason: string;
  },
  now: number,
): void {
  q.insertDenial({
    id: crypto.randomUUID(),
    task_id: args.taskId,
    agent_session_id: args.agentSessionId,
    tool_name: args.toolName,
    requested: args.requested,
    reason: args.reason,
    at: now,
  });
  q.insertAuditEvent({
    id: crypto.randomUUID(),
    actor_type: "agent",
    actor_label: args.agentSessionId ?? "unknown-agent",
    agent_session_id: args.agentSessionId,
    human_id: null,
    task_id: args.taskId,
    tool_name: args.toolName,
    operation: "denial",
    payload: { reason: args.reason, requested: args.requested },
    at: now,
  });
}

export function authorize(q: Queries, input: AuthorizeInput, now: number): AuthorizeResult {
  const deny = (reason: string): AuthorizeResult => {
    writeDenial(
      q,
      {
        taskId: input.taskId,
        agentSessionId: input.agentSessionId,
        toolName: input.toolName,
        requested: input.requested,
        reason,
      },
      now,
    );
    return { ok: false, reason };
  };

  const task = q.getTask(input.taskId);
  if (!taskIsLive(task, now)) return deny(DENIAL_REASONS.TASK_CLOSED);

  const region = q.getRegionBySlug(task.space_id, input.regionSlug);
  if (!region) return deny(DENIAL_REASONS.UNKNOWN_REGION);

  // 1. Human access — the ceiling. Grants can never exceed what the human themselves has.
  const human = humanRegions(q, task.space_id, task.human_id).find(
    (r) => r.region_id === region.id,
  );
  const humanLevel = human?.level ?? "none";
  if (!grantAtLeast(humanLevel, input.need)) {
    return deny(DENIAL_REASONS.EXCEEDS_HUMAN);
  }

  // 2. Grant — must exist, be live, and cover the region.
  const grants = liveGrants(q, input.taskId, now);
  const grant = grants.find((g) => g.region_id === region.id);
  if (!grant) {
    // Distinguish "never existed" from "revoked" / "expired" for a more specific reason.
    const raw = q.grantsForTask(input.taskId).find((g) => g.region_id === region.id);
    if (!raw) return deny(DENIAL_REASONS.NO_GRANT);
    if (raw.revoked_at !== null) return deny(DENIAL_REASONS.REVOKED);
    if (raw.expires_at !== null && raw.expires_at <= now) return deny(DENIAL_REASONS.EXPIRED);
    return deny(DENIAL_REASONS.TASK_CLOSED);
  }

  // 3. Task scope — the grant's own level must meet the need.
  if (!grantAtLeast(grant.level, input.need)) {
    return deny(DENIAL_REASONS.INSUFFICIENT_LEVEL);
  }

  // Effective = min(human, grant), already both >= need, but region-level surfaced to caller is the tighter of the two.
  const effectiveLevel = grantAtLeast(humanLevel, grant.level) ? grant.level : humanLevel;

  return { ok: true, region: { id: region.id, slug: region.slug, level: effectiveLevel } };
}

/** The set of region ids an authorized (human ∩ grant ∩ task) actor may touch for a task, at >= level. */
function authorizedRegionIdsAtLevel(
  q: Queries,
  taskId: string,
  level: GrantLevel,
  now: number,
): Set<string> {
  const task = q.getTask(taskId);
  if (!task) return new Set();
  const human = new Map(humanRegions(q, task.space_id, task.human_id).map((r) => [r.region_id, r.level]));
  const grants = liveGrants(q, taskId, now);
  const ids = new Set<string>();
  for (const g of grants) {
    const humanLevel = human.get(g.region_id) ?? "none";
    if (grantAtLeast(humanLevel, level) && grantAtLeast(g.level, level)) {
      ids.add(g.region_id);
    }
  }
  return ids;
}

/** The set of region ids an authorized (human ∩ grant ∩ task) actor may touch for a task, at >= "read". */
export function authorizedRegionIds(q: Queries, taskId: string, now: number): Set<string> {
  return authorizedRegionIdsAtLevel(q, taskId, "read", now);
}

/** Resolve a task project only when it still belongs to the task's owner/space. */
export function taskProject(q: Queries, task: Task): Project | null {
  const projectId = task.project_id ?? null;
  if (projectId === null) return null;
  const project = q.getProject(projectId);
  return project && project.space_id === task.space_id && project.owner_id === task.human_id ? project : null;
}

/** Project membership is an additional scope filter; graphs never widen it. */
export function taskAllowsItem(q: Queries, task: Task, item: ContextItem): boolean {
  if ((task.project_id ?? null) === null) return true;
  const project = taskProject(q, task);
  return project !== null && q.projectContainsItem(project.id, item.id);
}

/** Readable item ids are the intersection of live grants and the task project. */
export function authorizedItemIds(q: Queries, taskId: string, now: number): Set<string> {
  const task = q.getTask(taskId);
  if (!task) return new Set();
  const regionIds = authorizedRegionIds(q, taskId, now);
  return new Set(
    q
      .listItemsByRegions([...regionIds])
      .filter((item) => taskAllowsItem(q, task, item))
      .map((item) => item.id),
  );
}
