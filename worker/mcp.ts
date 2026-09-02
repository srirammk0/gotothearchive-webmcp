/**
 * /api/mcp/call — the only door an agent has into the space.
 *
 * For every call: re-resolve human, agent session, task, and grant, then
 * authorize. The request body is a claim, never a fact — nothing in it is
 * trusted except as input to a fresh authorization check.
 */
import {
  API,
  DENIAL_REASONS,
  grantAtLeast,
  RELATIONSHIPS,
  TASTE_DIMENSIONS,
  type ContextItem,
  type Relationship,
  type TasteDimension,
  type ToolCallRequest,
  type ToolCallResponse,
} from "@shared/contract";
import type { Queries } from "./db/queries";
import { consumeQuota } from "./quota";
import {
  authorize,
  authorizedRegionIds,
  humanRegions,
  liveGrants,
  taskAllowsItem,
  taskProject,
  taskIsLive,
  writeDenial,
} from "./permissions";
import { retrieve } from "./retrieval";
import { memoryIndexFor } from "./memory-drain";
import { signedBlobUrl } from "./blob-sign";
import { traverse } from "./graph";
import { deriveEdgesForItem } from "./graph-build";
import type { ResolvedHuman } from "./auth";

/** Item kinds a signed content_url is worth minting for — genuinely viewable bytes. */
const VIEWABLE_TYPES = new Set(["image", "screenshot", "pdf"]);

function denyResult(reason: string): ToolCallResponse {
  return { ok: false, error: reason, denial: true, reason };
}

/**
 * WebMCP hygiene: fence untrusted archive text so an agent can't read it as
 * instructions (developer.chrome.com/docs/agents/security §spotlighting).
 * The guillemets are stripped from the value first, so content can't forge or
 * close the fence — a note containing "«/untrusted»" cannot break out.
 */
export function spotlight(s?: string | null): string {
  return s ? `«untrusted»${s.replace(/[«»]/g, "")}«/untrusted»` : "";
}

/**
 * Keep tool outputs small — the Chrome WebMCP guidance caps individual tool
 * output around 1.5K chars, and a big blob just crowds the agent's context.
 * Detail is one inspect_context_item call away.
 */
export function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Max list entries / free-text chars in any one tool result. */
const MAX_ROWS = 8;
const MAX_TEXT = 240;
const MAX_RETRIEVAL_LIMIT = 20;

export function clampRetrievalLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 10;
  return Math.min(MAX_RETRIEVAL_LIMIT, Math.max(1, Math.floor(value)));
}

function versionSessionBelongsToTask(
  q: Queries,
  sessionId: string | null,
  taskId: string,
  humanId: string,
): boolean {
  if (sessionId === null) return true;
  const session = q.getAgentSession(sessionId);
  return session !== null && session.task_id === taskId && session.human_id === humanId;
}

/**
 * Trimmed view of an archive item for a tool result; every free-text field is
 * fenced. Two different URLs, for two different consumers, on an
 * image/screenshot/PDF item only:
 *
 * `content_url` — a signed URL good for ~15 minutes that an agent can fetch
 * independently of this session, right now. The mechanism that actually lets
 * an agent view the bytes, since WebMCP's tool-call transport itself is
 * string-only and can't carry them (see webmcp-capability-layer.md's rule
 * against overclaiming multimodal transport). Costs real tokens (a 64-char
 * signature), so `deepLook` gates it off for list-shaped results the agent
 * hasn't chosen to look closely at yet — call inspect_context_item for that.
 *
 * `embed_url` — the same plain, permanent /api/blob path this app's own UI
 * already uses, no signature, never expires. For dropping straight into
 * `<img src>` inside content_html the agent is authoring with record_artifact
 * (a logo, an existing photo) — that HTML is saved and viewed by the signed-in
 * human later, same-origin, so it needs a link that still works then, not one
 * that's gone in 15 minutes. Cheap (no signing), so always included.
 *
 * Both are minted only for an item the caller already resolved through this
 * tool's own authorization check — neither re-derives grants on its own.
 */
async function slimItem(it: ContextItem, env: Env | undefined, origin: string | undefined, deepLook = true) {
  const viewable = it.content_ref && VIEWABLE_TYPES.has(it.type);
  const content_url =
    deepLook && env && origin && viewable
      ? await signedBlobUrl(env.BLOB_SIGNING_SECRET, origin, API.blob, it.content_ref!)
      : null;
  const embed_url = viewable ? `${API.blob}?key=${encodeURIComponent(it.content_ref!)}` : null;
  return {
    id: it.id,
    type: it.type,
    region_id: it.region_id,
    source_url: it.source_url ? spotlight(clip(it.source_url, 200)) : null,
    title: spotlight(clip(it.title, 120)),
    semantic_text: it.semantic_text ? spotlight(clip(it.semantic_text, MAX_TEXT)) : null,
    content_url,
    embed_url,
  };
}

export async function handleToolCall(
  body: ToolCallRequest,
  q: Queries,
  human: ResolvedHuman,
  now: number,
  env?: Env,
  origin?: string,
): Promise<ToolCallResponse> {
  // Re-resolve session, task, and their linkage. Never trust body.task_id / body.agent_session_id alone.
  const session = q.getAgentSession(body.agent_session_id);
  if (!session) {
    writeDenial(
      q,
      {
        taskId: body.task_id,
        agentSessionId: body.agent_session_id,
        toolName: body.tool,
        requested: body.input,
        reason: DENIAL_REASONS.UNKNOWN_SESSION,
      },
      now,
    );
    return denyResult(DENIAL_REASONS.UNKNOWN_SESSION);
  }
  if (session.task_id !== body.task_id || session.human_id !== human.human_id) {
    writeDenial(
      q,
      {
        taskId: body.task_id,
        agentSessionId: body.agent_session_id,
        toolName: body.tool,
        requested: body.input,
        reason: DENIAL_REASONS.SESSION_MISMATCH,
      },
      now,
    );
    return denyResult(DENIAL_REASONS.SESSION_MISMATCH);
  }

  const task = q.getTask(body.task_id);
  if (!taskIsLive(task, now)) {
    writeDenial(
      q,
      {
        taskId: body.task_id,
        agentSessionId: body.agent_session_id,
        toolName: body.tool,
        requested: body.input,
        reason: DENIAL_REASONS.TASK_CLOSED,
      },
      now,
    );
    return denyResult(DENIAL_REASONS.TASK_CLOSED);
  }

  const input = body.input;

  switch (body.tool) {
    case "get_current_context_scope": {
      const allowedIds = authorizedRegionIds(q, task.id, now);
      const grants = liveGrants(q, task.id, now);
      const project = taskProject(q, task);
      const projectRegionIds = new Set(project ? q.projectRegionIds(project.id) : []);
      const projectItemRegionIds = new Set(
        project
          ? q
              .getItems(q.projectItemIds(project.id))
              .map((item) => item.region_id)
          : [],
      );
      const humanLevels = new Map(
        humanRegions(q, task.space_id, human.human_id).map((r) => [r.region_id, r.level]),
      );
      const regions = q
        .listRegions(task.space_id)
        .filter((r) => allowedIds.has(r.id))
        .filter((r) => project === null || projectRegionIds.has(r.id) || projectItemRegionIds.has(r.id))
        .map((r) => {
          const grant = grants.find((g) => g.region_id === r.id);
          const humanLevel = humanLevels.get(r.id) ?? "none";
          const grantLevel = grant?.level ?? "none";
          const level = grantAtLeast(humanLevel, grantLevel) ? grantLevel : humanLevel;
          return { slug: r.slug, name: r.name, level };
        });
      return {
        ok: true,
        result: {
          regions,
          task: { id: task.id, title: task.title, project_id: task.project_id ?? null },
          project: project
            ? {
                id: project.id,
                name: project.name,
                member_region_ids: [...projectRegionIds],
                member_item_ids: q.projectItemIds(project.id),
              }
            : null,
        },
      };
    }

    case "get_context_for_task": {
      const query = typeof input.query === "string" ? input.query : "";
      const regionSlug = typeof input.region === "string" ? input.region : null;
      const limit = clampRetrievalLimit(input.limit);

      // Naming a region and searching across everything are different acts and
      // get different answers.
      //
      // An explicitly named region is authorized, and refused if the grant is
      // absent, revoked or expired. Returning an empty list instead would be
      // dishonest — it tells the agent "nothing there" when the truth is "not
      // for you" — and it would write no denial record, so a revocation would
      // leave no trace in Agent Lens.
      //
      // An unscoped search stays a silent filter: inaccessible items are simply
      // absent from the candidate set, never present with a low score.
      if (regionSlug !== null) {
        const result = authorize(
          q,
          {
            taskId: task.id,
            agentSessionId: session.id,
            regionSlug,
            need: "read",
            toolName: body.tool,
            requested: input,
          },
          now,
        );
        if (!result.ok) return denyResult(result.reason);
      }

      const items = await retrieve(
        q,
        { taskId: task.id, query, regionSlugs: regionSlug ? [regionSlug] : null, limit },
        now,
        env ? memoryIndexFor(env) : null,
      );

      // A confirmed signal that materially lifted a returned item is a real
      // "this taste shaped the work" record — emit one 'applied' event per pair.
      for (const ret of items) {
        for (const signalId of ret.applied_signal_ids) {
          q.insertTasteEvent({
            id: crypto.randomUUID(),
            signal_id: signalId,
            kind: "applied",
            actor_type: "agent",
            actor_label: "Agent",
            agent_session_id: session.id,
            detail: `Applied while retrieving context for "${task.title}": ${ret.item.title}`,
            version_id: null,
            at: now,
          });
        }
      }

      // A search listing, not a deliberate look at one thing — no signed
      // content_url here (real tokens, up to MAX_ROWS of them); embed_url is
      // free (no signing) and still lets a hit like a logo get used right away.
      const compact = items.slice(0, MAX_ROWS).map((ret) => ({
        id: ret.item.id,
        region: ret.region_slug,
        title: spotlight(clip(ret.item.title, 120)),
        why: clip(ret.why, MAX_TEXT),
        embed_url:
          ret.item.content_ref && VIEWABLE_TYPES.has(ret.item.type)
            ? `${API.blob}?key=${encodeURIComponent(ret.item.content_ref)}`
            : null,
      }));
      return { ok: true, result: { items: compact } };
    }

    case "inspect_context_item": {
      const itemId = typeof input.item_id === "string" ? input.item_id : "";
      const item = q.getItem(itemId);
      if (!item) return denyResult(DENIAL_REASONS.UNKNOWN_ITEM);
      const region = q.getRegion(item.region_id);
      if (!region || region.space_id !== task.space_id || item.space_id !== task.space_id) {
        return denyResult(DENIAL_REASONS.UNKNOWN_ITEM);
      }
      const result = authorize(
        q,
        {
          taskId: task.id,
          agentSessionId: session.id,
          regionSlug: region.slug,
          need: "read",
          toolName: body.tool,
          requested: input,
        },
        now,
      );
      if (!result.ok) return denyResult(result.reason);
      if (!taskAllowsItem(q, task, item)) {
        writeDenial(
          q,
          { taskId: task.id, agentSessionId: session.id, toolName: body.tool, requested: input, reason: DENIAL_REASONS.OUT_OF_PROJECT_SCOPE },
          now,
        );
        return denyResult(DENIAL_REASONS.OUT_OF_PROJECT_SCOPE);
      }
      q.insertAccess({
        id: crypto.randomUUID(),
        task_id: task.id,
        item_id: item.id,
        tool_name: body.tool,
        at: now,
      });
      return { ok: true, result: { item: await slimItem(item, env, origin) } };
    }

    case "inspect_relationships": {
      const itemId = typeof input.item_id === "string" ? input.item_id : "";
      const item = q.getItem(itemId);
      if (!item) return denyResult(DENIAL_REASONS.UNKNOWN_ITEM);
      const region = q.getRegion(item.region_id);
      if (!region || region.space_id !== task.space_id || item.space_id !== task.space_id) {
        return denyResult(DENIAL_REASONS.UNKNOWN_ITEM);
      }
      const result = authorize(
        q,
        {
          taskId: task.id,
          agentSessionId: session.id,
          regionSlug: region.slug,
          need: "read",
          toolName: body.tool,
          requested: input,
        },
        now,
      );
      if (!result.ok) return denyResult(result.reason);
      if (!taskAllowsItem(q, task, item)) {
        writeDenial(
          q,
          { taskId: task.id, agentSessionId: session.id, toolName: body.tool, requested: input, reason: DENIAL_REASONS.OUT_OF_PROJECT_SCOPE },
          now,
        );
        return denyResult(DENIAL_REASONS.OUT_OF_PROJECT_SCOPE);
      }
      const allowedIds = authorizedRegionIds(q, task.id, now);
      const graphResult = traverse(q, [itemId], allowedIds);
      // A neighborhood listing, not a deliberate look at one thing — skip the
      // signed content_url (real tokens) here; embed_url still comes through.
      const slimNodes = await Promise.all(
        graphResult.nodes.slice(0, MAX_ROWS).map((node) => slimItem(node, env, origin, false)),
      );
      return {
        ok: true,
        result: {
          nodes: slimNodes,
          edges: graphResult.edges.slice(0, MAX_ROWS),
        },
      };
    }

    case "get_taste_for_task": {
      const allowedIds = authorizedRegionIds(q, task.id, now);
      if (allowedIds.size === 0) {
        writeDenial(
          q,
          {
            taskId: task.id,
            agentSessionId: session.id,
            toolName: body.tool,
            requested: input,
            reason: DENIAL_REASONS.NO_GRANT,
          },
          now,
        );
        return denyResult(DENIAL_REASONS.NO_GRANT);
      }
      const project = taskProject(q, task);
      const tasteRegionSlug = new Map(q.listRegions(task.space_id).map((r) => [r.id, r.slug]));

      // The archive items behind a confirmed signal — walk evidence → the
      // annotation's artifact version → its influences. Permission-filtered and
      // deduped, capped at 3. Turns "leans toward X" into things the agent can
      // actually inspect.
      const groundingFor = (signalId: string) => {
        const ids = new Set<string>();
        for (const ev of q.listTasteEvidence(signalId)) {
          if (ev.kind !== "supports") continue;
          if (ev.item_id) ids.add(ev.item_id);
          else if (ev.annotation_id) {
            const ann = q.getAnnotation(ev.annotation_id);
            if (ann) for (const inf of q.listInfluences(ann.version_id)) ids.add(inf.item_id);
          }
        }
        return q
          .getItems([...ids])
          .filter((it) => it.space_id === task.space_id && allowedIds.has(it.region_id))
          .filter((it) => taskAllowsItem(q, task, it))
          .slice(0, 3)
          .map((it) => ({ id: it.id, title: clip(it.title, 100), region: tasteRegionSlug.get(it.region_id) ?? "" }));
      };

      const signals = q
        .listTasteSignals(task.space_id)
        .filter((s) => s.owner_id === task.human_id)
        .filter((s) => {
          if (s.scope === "personal") return (s.project_id ?? null) === null;
          return project !== null && s.project_id === project.id;
        })
        .filter((s) => s.status === "confirmed" || s.status === "proposed")
        .slice(0, MAX_ROWS)
        .map((s) => ({
          id: s.id,
          status: s.status,
          scope: s.scope,
          project_id: s.project_id ?? null,
          dimensions: s.dimensions,
          confidence: s.confidence,
          // A confirmed signal has passed human review — it is a directive, not
          // untrusted input. A proposed one is still raw derived-from-annotation
          // text, so it stays spotlighted.
          statement: s.status === "proposed" ? spotlight(clip(s.statement, MAX_TEXT)) : clip(s.statement, MAX_TEXT),
          // Only confirmed signals carry grounding — a proposal isn't a directive yet.
          grounded_in: s.status === "confirmed" ? groundingFor(s.id) : [],
        }));
      return { ok: true, result: { signals } };
    }

    case "trace_artifact_influences": {
      const versionId = typeof input.version_id === "string" ? input.version_id : "";
      const artifactId = typeof input.artifact_id === "string" ? input.artifact_id : "";
      const requestedArtifact = artifactId ? q.getArtifact(artifactId) : null;
      if (artifactId && !requestedArtifact) return denyResult(DENIAL_REASONS.UNKNOWN_REGION);
      const version = versionId
        ? q.getArtifactVersion(versionId)
        : requestedArtifact
          ? q.latestArtifactVersion(requestedArtifact.id)
          : null;
      if (!version) return denyResult(DENIAL_REASONS.UNKNOWN_REGION);
      const artifact = q.getArtifact(version.artifact_id);
      if (
        !artifact ||
        artifact.task_id !== task.id ||
        artifact.space_id !== task.space_id ||
        (requestedArtifact !== null && requestedArtifact.id !== artifact.id) ||
        !versionSessionBelongsToTask(q, version.agent_session_id, task.id, human.human_id)
      ) {
        return denyResult(DENIAL_REASONS.EXCEEDS_HUMAN);
      }
      const allowedIds = authorizedRegionIds(q, task.id, now);
      if (allowedIds.size === 0) return denyResult(DENIAL_REASONS.NO_GRANT);
      const influences = q
        .listInfluences(version.id)
        .filter((inf) => {
          const item = q.getItem(inf.item_id);
          return item !== null && item.space_id === task.space_id && allowedIds.has(item.region_id) && taskAllowsItem(q, task, item);
        })
        .map((inf) => ({ influence: inf, item: q.getItem(inf.item_id) }));
      // This is the revision handoff: the current artifact's immutable version,
      // exact human annotations, and real influences travel together. It gives
      // an agent actionable feedback without exposing unrelated workspace data.
      const slimInfluences = await Promise.all(
        influences.slice(0, MAX_ROWS).map(async (inf) => ({
          influence: inf.influence,
          item: inf.item ? await slimItem(inf.item, env, origin) : null,
        })),
      );
      return {
        ok: true,
        result: {
          artifact: { id: artifact.id, title: artifact.title },
          version: {
            id: version.id,
            version_no: version.version_no,
            parent_version_id: version.parent_version_id,
            state: version.state,
          },
          annotations: q.listAnnotations(version.id).slice(0, MAX_ROWS).map((a) => ({
            id: a.id,
            sentiment: a.sentiment,
            dimensions: a.dimensions,
            status: a.status,
            comment: spotlight(clip(a.comment, MAX_TEXT)),
          })),
          influences: slimInfluences,
        },
      };
    }

    case "record_artifact": {
      const artifactId = typeof input.artifact_id === "string" ? input.artifact_id : null;
      const parentVersionId =
        typeof input.parent_version_id === "string" ? input.parent_version_id : null;

      let existing: ReturnType<typeof q.getArtifact> = null;
      if (artifactId) {
        existing = q.getArtifact(artifactId);
        if (!existing || existing.task_id !== task.id || existing.space_id !== task.space_id) {
          return denyResult(DENIAL_REASONS.EXCEEDS_HUMAN);
        }
      } else if (parentVersionId) {
        return denyResult(DENIAL_REASONS.INVALID_PARENT);
      }

      // An artifact's folder is set once, at creation, and never moves — a
      // revision is authorized and placed against the artifact's OWN existing
      // region, never whatever `region` this particular call happens to send.
      // That's what stops the same artifact from ever landing in a second
      // folder: there's no code path that writes a different one later.
      const regionSlug = existing
        ? q.getRegion(existing.region_id ?? "")?.slug ?? ""
        : typeof input.region === "string"
          ? input.region
          : "";
      const authResult = authorize(
        q,
        {
          taskId: task.id,
          agentSessionId: session.id,
          regionSlug,
          need: "propose",
          toolName: body.tool,
          requested: input,
        },
        now,
      );
      if (!authResult.ok) return denyResult(authResult.reason);

      const title = typeof input.title === "string" ? input.title : "Untitled artifact";
      const rawContentHtml = typeof input.content_html === "string" ? input.content_html : "";
      // A component preview remains a review artifact, not a host-executed app.
      // The marker selects the isolated iframe policy in the Workbench.
      const placementMarker = `<meta name="gotothearchive-region" content="${authResult.region.id}">`;
      const contentHtml =
        input.renderer === "component"
          ? `${placementMarker}<meta name="gotothearchive-renderer" content="component">${rawContentHtml}`
          : `${placementMarker}${rawContentHtml}`;

      let versionNo = 1;
      if (existing) {
        const latest = q.latestArtifactVersion(existing.id);
        if (!latest || parentVersionId !== latest.id) {
          return denyResult(DENIAL_REASONS.INVALID_PARENT);
        }
        versionNo = latest.version_no + 1;
      }
      // A revision must chain to a real version of this same artifact — never a
      // stray id or one from another artifact/task.
      if (parentVersionId) {
        const parent = q.getArtifactVersion(parentVersionId);
        if (
          !parent ||
          !existing ||
          parent.artifact_id !== existing.id ||
          !versionSessionBelongsToTask(q, parent.agent_session_id, task.id, human.human_id)
        ) {
          return denyResult(DENIAL_REASONS.INVALID_PARENT);
        }
      }
      const budget = consumeQuota(q, human.human_id, "artifacts");
      if (!budget.ok) return denyResult(budget.message);
      let finalArtifactId = existing?.id ?? null;
      if (!finalArtifactId) {
        finalArtifactId = crypto.randomUUID();
        q.insertArtifact({
          id: finalArtifactId,
          space_id: task.space_id,
          task_id: task.id,
          kind: "visual_brief",
          title,
          region_id: authResult.region.id,
          created_at: now,
        });
      }

      const versionId = crypto.randomUUID();
      q.insertArtifactVersion({
        id: versionId,
        artifact_id: finalArtifactId,
        version_no: versionNo,
        parent_version_id: parentVersionId,
        content_html: contentHtml,
        agent_session_id: session.id,
        state: "ready_for_review",
        created_at: now,
      });

      // The agent declares which items shaped the work. Every claim is re-checked
      // against the regions it may actually reach.
      //
      // An unchecked claim would be a leak: citing a Personal item would write an
      // influence row, and the Workbench would then render that item's title and
      // thumbnail in "Used these references" — disclosing private material the
      // agent was never allowed to see. Claims that do not survive the check are
      // dropped and recorded as denials rather than silently ignored.
      const claimed = Array.isArray(input.used_item_ids)
        ? input.used_item_ids.filter((v): v is string => typeof v === "string")
        : [];
      const reachable = authorizedRegionIds(q, task.id, now);
      for (const itemId of claimed) {
        const item = q.getItem(itemId);
        if (!item || item.space_id !== task.space_id || !reachable.has(item.region_id) || !taskAllowsItem(q, task, item)) {
          writeDenial(
            q,
            {
              taskId: task.id,
              agentSessionId: session.id,
              toolName: body.tool,
              requested: { claimed_influence: itemId },
              reason: item && !taskAllowsItem(q, task, item) ? DENIAL_REASONS.OUT_OF_PROJECT_SCOPE : DENIAL_REASONS.NO_GRANT,
            },
            now,
          );
          continue;
        }
        q.insertInfluence({
          id: crypto.randomUUID(),
          version_id: versionId,
          item_id: itemId,
          role: "reference",
          strength: 1,
          note: null,
        });
      }

      return {
        ok: true,
        result: {
          artifact_id: finalArtifactId,
          version_id: versionId,
          next: "Awaiting human review in the Workbench. Call trace_artifact_influences to read annotations before submitting a revision.",
        },
      };
    }

    case "record_feedback": {
      const regionSlug = typeof input.region === "string" ? input.region : "";
      const authResult = authorize(
        q,
        {
          taskId: task.id,
          agentSessionId: session.id,
          regionSlug,
          need: "propose",
          toolName: body.tool,
          requested: input,
        },
        now,
      );
      if (!authResult.ok) return denyResult(authResult.reason);

      const versionId = typeof input.version_id === "string" ? input.version_id : "";
      const version = q.getArtifactVersion(versionId);
      const artifact = version ? q.getArtifact(version.artifact_id) : null;
      if (
        !version ||
        !artifact ||
        artifact.task_id !== task.id ||
        artifact.space_id !== task.space_id ||
        !versionSessionBelongsToTask(q, version.agent_session_id, task.id, human.human_id)
      ) {
        return denyResult(DENIAL_REASONS.EXCEEDS_HUMAN);
      }
      const sentiment =
        input.sentiment === "positive" || input.sentiment === "negative" ? input.sentiment : "neutral";
      const comment = typeof input.comment === "string" ? input.comment : "";
      const dimensions = Array.isArray(input.dimensions)
        ? (input.dimensions.filter((d): d is TasteDimension =>
            typeof d === "string" && (TASTE_DIMENSIONS as readonly string[]).includes(d),
          ) as TasteDimension[])
        : [];

      const annotationId = crypto.randomUUID();
      q.insertAnnotation({
        id: annotationId,
        version_id: versionId,
        author_id: `agent:${session.id}`,
        target: null,
        sentiment,
        dimensions,
        comment,
        status: "open",
        created_at: now,
      });

      return {
        ok: true,
        result: {
          annotation_id: annotationId,
          next: "Recorded for review. Personal taste only learns from the person's own feedback.",
        },
      };
    }

    case "propose_context_change": {
      const regionSlug = typeof input.region === "string" ? input.region : "";
      const authResult = authorize(
        q,
        {
          taskId: task.id,
          agentSessionId: session.id,
          regionSlug,
          need: "propose",
          toolName: body.tool,
          requested: input,
        },
        now,
      );
      if (!authResult.ok) return denyResult(authResult.reason);

      const fromId = typeof input.from_item_id === "string" ? input.from_item_id : "";
      const toId = typeof input.to_item_id === "string" ? input.to_item_id : "";
      const from = q.getItem(fromId);
      const to = q.getItem(toId);
      const reachable = authorizedRegionIds(q, task.id, now);
      if (
        !from ||
        !to ||
        from.space_id !== task.space_id ||
        to.space_id !== task.space_id ||
        from.id === to.id ||
        from.region_id !== authResult.region.id ||
        !reachable.has(from.region_id) ||
        !reachable.has(to.region_id) ||
        !taskAllowsItem(q, task, from) ||
        !taskAllowsItem(q, task, to)
      ) {
        writeDenial(
          q,
          {
            taskId: task.id,
            agentSessionId: session.id,
            toolName: body.tool,
            requested: input,
            reason:
              (from && !taskAllowsItem(q, task, from)) || (to && !taskAllowsItem(q, task, to))
                ? DENIAL_REASONS.OUT_OF_PROJECT_SCOPE
                : DENIAL_REASONS.NO_GRANT,
          },
          now,
        );
        return denyResult(DENIAL_REASONS.NO_GRANT);
      }
      const relationship: Relationship =
        typeof input.relationship === "string" &&
        (RELATIONSHIPS as readonly string[]).includes(input.relationship)
          ? (input.relationship as Relationship)
          : "related_to";

      const edgeId = crypto.randomUUID();
      q.insertEdge({
        id: edgeId,
        from_id: fromId,
        to_id: toId,
        relationship,
        weight: 1,
        created_by: `agent:${session.id}`,
        approval_state: "proposed",
        created_at: now,
      });

      return { ok: true, result: { edge_id: edgeId } };
    }

    case "add_context_item": {
      const regionSlug = typeof input.region === "string" ? input.region : "";
      const authResult = authorize(
        q,
        { taskId: task.id, agentSessionId: session.id, regionSlug, need: "write", toolName: body.tool, requested: input },
        now,
      );
      if (!authResult.ok) return denyResult(authResult.reason);

      const type = input.type === "link" || input.type === "document" ? input.type : "note";
      const title = (typeof input.title === "string" ? input.title : "").trim().slice(0, 200) || "Untitled";
      const bodyText = typeof input.body === "string" ? input.body.slice(0, 20_000) : null;
      const sourceUrl =
        type === "link" && typeof input.source_url === "string" && /^https?:\/\//i.test(input.source_url)
          ? input.source_url.slice(0, 2000)
          : null;

      const itemId = crypto.randomUUID();
      q.insertItem({
        id: itemId,
        space_id: task.space_id,
        region_id: authResult.region.id,
        owner_id: human.human_id,
        type,
        title,
        source_url: sourceUrl,
        content_ref: null,
        semantic_text: bodyText,
        metadata: { added_by_agent: session.id },
        authority_class: "agent_authored",
        created_by: `agent:${session.id}`,
        created_at: now,
        updated_at: now,
      });
      const created = q.getItem(itemId);
      if (created) deriveEdgesForItem(q, created, now);

      q.insertAccess({ id: crypto.randomUUID(), task_id: task.id, item_id: itemId, tool_name: body.tool, at: now });
      return {
        ok: true,
        result: { item_id: itemId, region: authResult.region.slug, next: "Filed into the folder — it's canonical context now and visible in the Archive." },
      };
    }

    case "identify_agent": {
      // Attribution only. Recorded against the authenticated session; never read
      // for any authorization decision (BUILD-CONTRACT invariant #9).
      const client = typeof input.client === "string" ? input.client.trim().slice(0, 60) : "";
      if (!client) return denyResult("client name required");
      q.setAgentSessionDeclared(session.id, {
        client,
        provider: typeof input.provider === "string" ? input.provider.trim().slice(0, 60) : undefined,
        model: typeof input.model === "string" ? input.model.trim().slice(0, 60) : undefined,
      });
      return { ok: true, result: { attributed_as: client } };
    }

    case "approve_proposed_changes":
    case "reject_proposed_changes":
      // Not surfaced to agents: acceptance is a human act, never inferred from a tool call.
      return denyResult(DENIAL_REASONS.INSUFFICIENT_LEVEL);

    default:
      return denyResult(DENIAL_REASONS.UNKNOWN_TOOL);
  }
}
