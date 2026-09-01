/**
 * /api/mcp/call — the only door an agent has into the space.
 *
 * For every call: re-resolve human, agent session, task, and grant, then
 * authorize. The request body is a claim, never a fact — nothing in it is
 * trusted except as input to a fresh authorization check.
 */
import {
  DENIAL_REASONS,
  GRANT_LEVELS,
  RELATIONSHIPS,
  type ContextItem,
  type Relationship,
  type ToolCallRequest,
  type ToolCallResponse,
} from "@shared/contract";
import type { Queries } from "./db/queries";
import { consumeQuota } from "./quota";
import { authorize, authorizedRegionIds, writeDenial } from "./permissions";
import { retrieve } from "./retrieval";
import { traverse } from "./graph";
import { deriveEdgesForItem } from "./graph-build";
import { deriveTasteSignals } from "./taste/derive";
import type { ResolvedHuman } from "./auth";

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

/** Trimmed view of an archive item for a tool result; every free-text field is fenced. */
function slimItem(it: ContextItem) {
  return {
    id: it.id,
    type: it.type,
    region_id: it.region_id,
    source_url: it.source_url ? spotlight(clip(it.source_url, 200)) : null,
    title: spotlight(clip(it.title, 120)),
    semantic_text: it.semantic_text ? spotlight(clip(it.semantic_text, MAX_TEXT)) : null,
  };
}

export async function handleToolCall(
  body: ToolCallRequest,
  q: Queries,
  human: ResolvedHuman,
  now: number,
  env?: Env,
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
  if (!task || task.status !== "open") {
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
      const grants = q.grantsForTask(task.id);
      const regions = q
        .listRegions(task.space_id)
        .filter((r) => allowedIds.has(r.id))
        .map((r) => {
          const grant = grants.find((g) => g.region_id === r.id);
          const humanLevel = q.getSpace(task.space_id)?.owner_id === human.human_id ? "write" : "none";
          const grantLevel = grant?.level ?? "none";
          const level = GRANT_LEVELS.indexOf(humanLevel) <= GRANT_LEVELS.indexOf(grantLevel) ? humanLevel : grantLevel;
          return { slug: r.slug, name: r.name, level };
        });
      return { ok: true, result: { regions, task: { id: task.id, title: task.title } } };
    }

    case "get_context_for_task": {
      const query = typeof input.query === "string" ? input.query : "";
      const regionSlug = typeof input.region === "string" ? input.region : null;
      const limit = typeof input.limit === "number" ? input.limit : 10;

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

      const items = retrieve(
        q,
        { taskId: task.id, query, regionSlugs: regionSlug ? [regionSlug] : null, limit },
        now,
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

      const compact = items.slice(0, MAX_ROWS).map((ret) => ({
        id: ret.item.id,
        region: ret.region_slug,
        title: spotlight(clip(ret.item.title, 120)),
        why: clip(ret.why, MAX_TEXT),
      }));
      return { ok: true, result: { items: compact } };
    }

    case "inspect_context_item": {
      const itemId = typeof input.item_id === "string" ? input.item_id : "";
      const item = q.getItem(itemId);
      if (!item) return denyResult(DENIAL_REASONS.UNKNOWN_REGION);
      const region = q.getRegion(item.region_id);
      if (!region) return denyResult(DENIAL_REASONS.UNKNOWN_REGION);
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
      q.insertAccess({
        id: crypto.randomUUID(),
        task_id: task.id,
        item_id: item.id,
        tool_name: body.tool,
        at: now,
      });
      return { ok: true, result: { item: slimItem(item) } };
    }

    case "inspect_relationships": {
      const itemId = typeof input.item_id === "string" ? input.item_id : "";
      const item = q.getItem(itemId);
      if (!item) return denyResult(DENIAL_REASONS.UNKNOWN_REGION);
      const region = q.getRegion(item.region_id);
      if (!region) return denyResult(DENIAL_REASONS.UNKNOWN_REGION);
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
      const allowedIds = authorizedRegionIds(q, task.id, now);
      const graphResult = traverse(q, [itemId], allowedIds);
      return {
        ok: true,
        result: {
          nodes: graphResult.nodes.slice(0, MAX_ROWS).map(slimItem),
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
      const signals = q
        .listTasteSignals(task.space_id)
        .filter((s) => s.status === "confirmed" || s.status === "proposed")
        .slice(0, MAX_ROWS)
        .map((s) => ({
          id: s.id,
          status: s.status,
          scope: s.scope,
          dimensions: s.dimensions,
          confidence: s.confidence,
          // A confirmed signal has passed human review — it is a directive, not
          // untrusted input. A proposed one is still raw derived-from-annotation
          // text, so it stays spotlighted.
          statement: s.status === "proposed" ? spotlight(clip(s.statement, MAX_TEXT)) : clip(s.statement, MAX_TEXT),
        }));
      return { ok: true, result: { signals } };
    }

    case "trace_artifact_influences": {
      const versionId = typeof input.version_id === "string" ? input.version_id : "";
      const artifactId = typeof input.artifact_id === "string" ? input.artifact_id : "";
      const version = versionId ? q.getArtifactVersion(versionId) : artifactId ? q.latestArtifactVersion(artifactId) : null;
      if (!version) return denyResult(DENIAL_REASONS.UNKNOWN_REGION);
      const artifact = q.getArtifact(version.artifact_id);
      if (!artifact || artifact.task_id !== task.id) {
        return denyResult(DENIAL_REASONS.EXCEEDS_HUMAN);
      }
      const allowedIds = authorizedRegionIds(q, task.id, now);
      if (allowedIds.size === 0) return denyResult(DENIAL_REASONS.NO_GRANT);
      const influences = q
        .listInfluences(versionId)
        .filter((inf) => {
          const item = q.getItem(inf.item_id);
          return item !== null && allowedIds.has(item.region_id);
        })
        .map((inf) => ({ influence: inf, item: q.getItem(inf.item_id) }));
      // This is the revision handoff: the current artifact's immutable version,
      // exact human annotations, and real influences travel together. It gives
      // an agent actionable feedback without exposing unrelated workspace data.
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
            dimension: a.dimension,
            status: a.status,
            comment: spotlight(clip(a.comment, MAX_TEXT)),
          })),
          influences: influences.slice(0, MAX_ROWS).map((inf) => ({
            influence: inf.influence,
            item: inf.item ? slimItem(inf.item) : null,
          })),
        },
      };
    }

    case "record_artifact": {
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

      const budget = consumeQuota(q, human.human_id, "artifacts");
      if (!budget.ok) return denyResult(budget.message);

      const title = typeof input.title === "string" ? input.title : "Untitled artifact";
      const rawContentHtml = typeof input.content_html === "string" ? input.content_html : "";
      // A component preview remains a review artifact, not a host-executed app.
      // The marker selects the isolated iframe policy in the Workbench.
      const placementMarker = `<meta name="gotothearchive-region" content="${authResult.region.id}">`;
      const contentHtml =
        input.renderer === "component"
          ? `${placementMarker}<meta name="gotothearchive-renderer" content="component">${rawContentHtml}`
          : `${placementMarker}${rawContentHtml}`;
      const parentVersionId =
        typeof input.parent_version_id === "string" ? input.parent_version_id : null;

      let artifactId = typeof input.artifact_id === "string" ? input.artifact_id : null;
      let versionNo = 1;
      if (artifactId) {
        const existing = q.getArtifact(artifactId);
        if (!existing) artifactId = null;
        else if (existing.task_id !== task.id) return denyResult(DENIAL_REASONS.EXCEEDS_HUMAN);
        else versionNo = (q.latestArtifactVersion(artifactId)?.version_no ?? 0) + 1;
      }
      if (!artifactId) {
        artifactId = crypto.randomUUID();
        q.insertArtifact({
          id: artifactId,
          space_id: task.space_id,
          task_id: task.id,
          kind: "visual_brief",
          title,
          created_at: now,
        });
      }

      const versionId = crypto.randomUUID();
      q.insertArtifactVersion({
        id: versionId,
        artifact_id: artifactId,
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
        if (!item || !reachable.has(item.region_id)) {
          writeDenial(
            q,
            {
              taskId: task.id,
              agentSessionId: session.id,
              toolName: body.tool,
              requested: { claimed_influence: itemId },
              reason: DENIAL_REASONS.NO_GRANT,
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
          artifact_id: artifactId,
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
      if (!version || !artifact || artifact.task_id !== task.id) {
        return denyResult(DENIAL_REASONS.EXCEEDS_HUMAN);
      }
      const sentiment =
        input.sentiment === "positive" || input.sentiment === "negative" ? input.sentiment : "neutral";
      const comment = typeof input.comment === "string" ? input.comment : "";
      const dimension = typeof input.dimension === "string" ? input.dimension : null;

      const annotationId = crypto.randomUUID();
      q.insertAnnotation({
        id: annotationId,
        version_id: versionId,
        author_id: `agent:${session.id}`,
        target: null,
        sentiment,
        dimension,
        comment,
        status: "open",
        created_at: now,
      });

      // Agent-authored feedback feeds the same taste-derivation loop as human annotations.
      await deriveTasteSignals(q, task.space_id, now, env);

      return {
        ok: true,
        result: {
          annotation_id: annotationId,
          next: "Recorded. This may surface a proposed taste signal for the person to confirm.",
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
        from.id === to.id ||
        from.region_id !== authResult.region.id ||
        !reachable.has(from.region_id) ||
        !reachable.has(to.region_id)
      ) {
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
      const body_ = typeof input.body === "string" ? input.body.slice(0, 20_000) : null;
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
        semantic_text: body_,
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
      return denyResult(DENIAL_REASONS.UNKNOWN_REGION);
  }
}
