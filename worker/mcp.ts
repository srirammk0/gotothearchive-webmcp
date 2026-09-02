/**
 * /api/mcp/call — the only door an agent has into the space.
 *
 * For every call: re-resolve human, agent session, task, and grant, then
 * authorize. The request body is a claim, never a fact — nothing in it is
 * trusted except as input to a fresh authorization check.
 */
import {
  API,
  ARTIFACT_ASPECTS,
  confidenceFrom,
  DENIAL_REASONS,
  grantAtLeast,
  TASTE_DIMENSIONS,
  type ContextItem,
  type DesignProfile,
  type TasteDimension,
  type ToolCallRequest,
  type ToolCallResponse,
} from "@shared/contract";
import type { Queries } from "./db/queries";
import { consumeQuota, quotaPeriod } from "./quota";
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
const MAX_ROWS = 12;
/**
 * Per-field text budget. Was 240, which meant an agent got a title and a
 * truncated sentence and then designed from nothing. A retrieval listing that
 * carries real excerpts costs fewer tokens overall than one that forces a
 * follow-up inspect_context_item call per row.
 */
const MAX_TEXT = 600;
/** Excerpt length inside a LISTING row, where several are returned at once. */
const MAX_LIST_TEXT = 320;
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
 * A captured link/tweet's own extracted preview image (og:image, tweet
 * media) — already validated as a public http(s) URL at capture time
 * (worker/extract.ts's absolutize() runs the same isPublicHttpUrl SSRF
 * check as the source URL itself), so it needs no signing or proxying to
 * be safe to hand an agent directly: it's already just as fetchable by
 * anyone as the tweet/page itself was.
 */
/**
 * The item's extracted design profile, if it has one.
 *
 * This is the field that makes the difference between an agent producing
 * generic output and producing something that belongs in THIS archive: exact
 * hex values it must use, and the typography/layout/texture vocabulary the
 * archive is actually built from. `palette_source` travels with it so the agent
 * knows whether the colours were measured from pixels or estimated by a model.
 */
function designFor(it: ContextItem): DesignProfile | null {
  const d = (it.metadata as { design?: unknown }).design;
  return isDesignProfile(d) ? d : null;
}

function isDesignProfile(d: unknown): d is DesignProfile {
  return (
    typeof d === "object" &&
    d !== null &&
    "typography" in d &&
    "layout" in d &&
    "palette" in d
  );
}

/** The compact form used in listings — the values, without the bookkeeping. */
function slimDesign(d: DesignProfile | null) {
  if (!d) return null;
  return {
    palette: d.palette.map((p) => ({ hex: p.hex, role: p.role, pct: p.pct })),
    palette_source: d.palette_source,
    typography: d.typography,
    layout: d.layout,
    texture: d.texture,
    shape: d.shape,
    imagery: d.imagery,
    mood: d.mood,
  };
}

function extractedImageUrl(it: ContextItem): string | null {
  if (it.type !== "link") return null;
  const extracted = (it.metadata as { extracted?: { images?: unknown } }).extracted;
  const first = Array.isArray(extracted?.images) ? extracted.images[0] : undefined;
  return typeof first === "string" && /^https?:\/\//i.test(first) ? first : null;
}

/**
 * Trimmed view of an archive item for a tool result; every free-text field is
 * fenced. Two different URLs, for two different consumers:
 *
 * `content_url` — something an agent can fetch independently of this
 * session, right now. The mechanism that actually lets an agent view an
 * image, since WebMCP's tool-call transport itself is string-only and can't
 * carry the bytes (see webmcp-capability-layer.md's rule against
 * overclaiming multimodal transport). For an uploaded image/screenshot/PDF
 * this is a signed URL good for ~15 minutes — a real cost (a 64-char
 * signature), so `deepLook` gates it off for list-shaped results the agent
 * hasn't chosen to look closely at yet. A captured link's own extracted
 * image is already a plain public URL with nothing to sign, so it's
 * included unconditionally — there's no per-call cost to gate.
 *
 * `embed_url` — for dropping straight into `<img src>` inside content_html
 * the agent is authoring with record_artifact (a logo, an existing photo,
 * a captured reference image) — that HTML is saved and viewed by the
 * signed-in human later, so it needs a link that still works then, not one
 * that's gone in 15 minutes. For an uploaded blob this is the same plain,
 * permanent /api/blob path this app's own UI already uses; for a captured
 * link it's the same extracted URL as content_url (already permanent).
 *
 * Both are minted only for an item the caller already resolved through this
 * tool's own authorization check — neither re-derives grants on its own.
 */
async function slimItem(it: ContextItem, env: Env | undefined, origin: string | undefined, deepLook = true) {
  const hasBlob = Boolean(it.content_ref) && VIEWABLE_TYPES.has(it.type);
  const extracted = extractedImageUrl(it);
  const content_url =
    extracted ??
    (deepLook && env && origin && hasBlob
      ? await signedBlobUrl(env.BLOB_SIGNING_SECRET, origin, API.blob, it.content_ref!)
      : null);
  const embed_url = extracted ?? (hasBlob ? `${API.blob}?key=${encodeURIComponent(it.content_ref!)}` : null);
  return {
    id: it.id,
    type: it.type,
    region_id: it.region_id,
    source_url: it.source_url ? spotlight(clip(it.source_url, 200)) : null,
    title: spotlight(clip(it.title, 120)),
    semantic_text: it.semantic_text ? spotlight(clip(it.semantic_text, MAX_TEXT)) : null,
    design: slimDesign(designFor(it)),
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
        // The excerpt is the point. Returning id+title only forced a second
        // round-trip per row that agents did not make, so they designed from
        // titles alone.
        text: ret.item.semantic_text
          ? spotlight(clip(ret.item.semantic_text, MAX_LIST_TEXT))
          : null,
        design: slimDesign(designFor(ret.item)),
        why: clip(ret.why, MAX_TEXT),
        embed_url:
          extractedImageUrl(ret.item) ??
          (ret.item.content_ref && VIEWABLE_TYPES.has(ret.item.type)
            ? `${API.blob}?key=${encodeURIComponent(ret.item.content_ref)}`
            : null),
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
      // The graph neighbourhood comes back WITH the item rather than behind a
      // second tool. `inspect_relationships` existed for years of agent-turns
      // and was never called: an agent that has just looked something up does
      // not know to then go asking what it connects to. Handing it over
      // unprompted is what makes the archive read as a graph instead of a list.
      // traverse() re-checks access at every node (invariant #4), so an
      // accessible edge still cannot reveal an inaccessible neighbour.
      const neighbourhood = traverse(q, [item.id], authorizedRegionIds(q, task.id, now));
      const byId = new Map(neighbourhood.nodes.map((n) => [n.id, n]));
      const related: { id: string; title: string; region: string; relationship: string }[] = [];
      for (const edge of neighbourhood.edges) {
        const otherId = edge.from_id === item.id ? edge.to_id : edge.from_id;
        if (otherId === item.id) continue;
        const other = byId.get(otherId);
        if (!other || related.some((r) => r.id === otherId)) continue;
        if (!taskAllowsItem(q, task, other)) continue;
        related.push({
          id: other.id,
          title: spotlight(clip(other.title, 100)),
          region: q.getRegion(other.region_id)?.slug ?? "",
          relationship: edge.relationship,
        });
        if (related.length === MAX_ROWS) break;
      }

      return {
        ok: true,
        result: { item: await slimItem(item, env, origin), related },
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
      // The viewer cannot measure a sandboxed artifact, so the artifact says
      // what shape it is and gets exactly that box. Anything unrecognized falls
      // back to "auto" (the old fixed height) rather than a wrong shape.
      const aspect = (ARTIFACT_ASPECTS as readonly string[]).includes(String(input.aspect))
        ? String(input.aspect)
        : "auto";
      const aspectMarker = `<meta name="gotothearchive-aspect" content="${aspect}">`;
      const contentHtml =
        input.renderer === "component"
          ? `${placementMarker}${aspectMarker}<meta name="gotothearchive-renderer" content="component">${rawContentHtml}`
          : `${placementMarker}${aspectMarker}${rawContentHtml}`;

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
      // One unit per ARTIFACT, not per version. Revising is the core loop here —
      // an agent reads the annotations and submits a better version — and
      // charging each revision made a five-round review cost five slots out of
      // a hundred, i.e. it metered exactly the behaviour the product wants.
      // Versions are cheap (one row); it is the artifact that is the unit.
      let finalArtifactId = existing?.id ?? null;
      if (!finalArtifactId) {
        const budget = consumeQuota(q, human.human_id, "artifacts");
        if (!budget.ok) return denyResult(budget.message);
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

    // Auto-derivation only learns from the human's own annotations (by design:
    // an agent's opinion of its own work is not taste). This is the other
    // route in: an agent that has read back several annotations pointing the
    // same way can name the pattern explicitly, grounded in the annotations
    // that support it. It still lands as "proposed" and still requires a
    // human to confirm — proposing is not learning.
    case "propose_taste_signal": {
      const regionSlug = typeof input.region === "string" ? input.region : "";
      const authResult = authorize(
        q,
        { taskId: task.id, agentSessionId: session.id, regionSlug, need: "propose", toolName: body.tool, requested: input },
        now,
      );
      if (!authResult.ok) return denyResult(authResult.reason);

      const statement = typeof input.statement === "string" ? input.statement.trim().slice(0, 200) : "";
      // A malformed call is not a permission problem. Returning EXCEEDS_HUMAN
      // here wrote "the invoking person does not have this access themselves"
      // into Agent Lens for what is actually a missing argument.
      if (!statement) return denyResult(DENIAL_REASONS.MISSING_INPUT);
      const dimensions = Array.isArray(input.dimensions)
        ? (input.dimensions.filter((d): d is TasteDimension =>
            typeof d === "string" && (TASTE_DIMENSIONS as readonly string[]).includes(d),
          ) as TasteDimension[])
        : [];

      // Every cited annotation is re-verified: it must belong to an artifact
      // version in this task and space, same as record_feedback's own check.
      const annotationIds = Array.isArray(input.annotation_ids)
        ? input.annotation_ids.filter((v): v is string => typeof v === "string").slice(0, 8)
        : [];
      const evidence: { annotation_id: string | null; item_id: string | null }[] = [];
      for (const annotationId of annotationIds) {
        const annotation = q.getAnnotation(annotationId);
        const version = annotation ? q.getArtifactVersion(annotation.version_id) : null;
        const artifact = version ? q.getArtifact(version.artifact_id) : null;
        if (!annotation || !artifact || artifact.task_id !== task.id || artifact.space_id !== task.space_id) continue;
        evidence.push({ annotation_id: annotationId, item_id: null });
      }
      const itemIds = Array.isArray(input.item_ids)
        ? input.item_ids.filter((v): v is string => typeof v === "string").slice(0, 8)
        : [];
      const reachable = authorizedRegionIds(q, task.id, now);
      for (const itemId of itemIds) {
        const item = q.getItem(itemId);
        if (!item || item.space_id !== task.space_id || !reachable.has(item.region_id) || !taskAllowsItem(q, task, item)) continue;
        evidence.push({ annotation_id: null, item_id: itemId });
      }
      if (evidence.length === 0) return denyResult(DENIAL_REASONS.NO_USABLE_EVIDENCE);

      const project = taskProject(q, task);
      const signalId = crypto.randomUUID();
      q.insertTasteSignal({
        id: signalId,
        space_id: task.space_id,
        owner_id: human.human_id,
        statement,
        dimensions,
        scope: project ? "project" : "personal",
        project_id: project?.id ?? null,
        status: "proposed",
        confidence: confidenceFrom(evidence.length, 0),
        // "agent", not "system": an agent naming a pattern it noticed is a
        // different act from the derivation loop finding one in the person's own
        // annotations, and the Taste UI labels them differently. Both still land
        // as `proposed` and still need a human.
        created_by: "agent",
        approved_by: null,
        supersedes: null,
        created_at: now,
      });
      for (const e of evidence) {
        q.insertTasteEvidence({
          id: crypto.randomUUID(),
          signal_id: signalId,
          kind: "supports",
          annotation_id: e.annotation_id,
          version_id: null,
          item_id: e.item_id,
        });
      }
      q.insertTasteEvent({
        id: crypto.randomUUID(),
        signal_id: signalId,
        kind: "proposed",
        actor_type: "agent",
        actor_label: session.id,
        agent_session_id: session.id,
        detail: "Proposed from agent-observed feedback.",
        version_id: null,
        at: now,
      });

      return {
        ok: true,
        result: {
          signal_id: signalId,
          next: "Proposed for the person's review. It will not affect any future work until they confirm it.",
        },
      };
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

    // The exact inverse of add_context_item, and nothing more. An agent may
    // remove an item IT filed into a folder it has write access to — the same
    // authority that let it create the item lets it take it back. The
    // `created_by` check is what keeps this from becoming a tool for deleting
    // the person's archive: a human-authored item, or one another agent added,
    // is refused no matter what the grant says.
    case "remove_context_item": {
      const itemId = typeof input.item_id === "string" ? input.item_id : "";
      const item = itemId ? q.getItem(itemId) : null;
      if (!item || item.space_id !== task.space_id) return denyResult(DENIAL_REASONS.UNKNOWN_ITEM);

      const region = q.getRegion(item.region_id);
      if (!region || region.space_id !== task.space_id) return denyResult(DENIAL_REASONS.UNKNOWN_ITEM);

      const authResult = authorize(
        q,
        { taskId: task.id, agentSessionId: session.id, regionSlug: region.slug, need: "write", toolName: body.tool, requested: input },
        now,
      );
      if (!authResult.ok) return denyResult(authResult.reason);
      if (!taskAllowsItem(q, task, item)) {
        writeDenial(
          q,
          { taskId: task.id, agentSessionId: session.id, toolName: body.tool, requested: input, reason: DENIAL_REASONS.OUT_OF_PROJECT_SCOPE },
          now,
        );
        return denyResult(DENIAL_REASONS.OUT_OF_PROJECT_SCOPE);
      }

      // Only an agent-added item, and only one added by an agent session
      // belonging to THIS human. add_context_item stamps both fields.
      const addedByAgent =
        item.created_by.startsWith("agent:") && item.authority_class === "agent_authored";
      if (!addedByAgent) return denyResult(DENIAL_REASONS.NOT_AGENT_AUTHORED);
      const authorSession = q.getAgentSession(item.created_by.slice("agent:".length));
      if (!authorSession || authorSession.human_id !== human.human_id) {
        return denyResult(DENIAL_REASONS.NOT_AGENT_AUTHORED);
      }

      q.deleteItem(item.id);
      q.insertAuditEvent({
        id: crypto.randomUUID(),
        actor_type: "agent",
        actor_label: session.id,
        agent_session_id: session.id,
        human_id: human.human_id,
        task_id: task.id,
        tool_name: body.tool,
        operation: "remove_context_item",
        payload: { item_id: item.id, title: item.title, region: region.slug },
        at: now,
      });

      return {
        ok: true,
        result: { removed: item.id, next: "Removed from the folder. Only items an agent filed can be removed this way." },
      };
    }

    // Withdrawing agent output is not the same act as deleting human context,
    // and only the first is offered. The guards below are the whole point:
    // this can only remove an artifact THIS task produced, that no person has
    // annotated or decided on. The moment a human touches it, it stops being
    // the agent's to take back. There is deliberately no tool for deleting a
    // context item, an annotation, or an approved artifact — that is the
    // human's context, and an agent that could delete it would make "you own
    // your context" a convention rather than a guarantee.
    case "withdraw_artifact": {
      const artifactId = typeof input.artifact_id === "string" ? input.artifact_id : "";
      const artifact = artifactId ? q.getArtifact(artifactId) : null;
      if (!artifact || artifact.space_id !== task.space_id || artifact.task_id !== task.id) {
        return denyResult(DENIAL_REASONS.UNKNOWN_ARTIFACT);
      }

      const regionSlug = artifact.region_id ? q.getRegion(artifact.region_id)?.slug ?? "" : "";
      const authResult = authorize(
        q,
        { taskId: task.id, agentSessionId: session.id, regionSlug, need: "propose", toolName: body.tool, requested: input },
        now,
      );
      if (!authResult.ok) return denyResult(authResult.reason);

      const versions = q.listArtifactVersions(artifact.id);
      // Every version must have come from this task's own agent sessions.
      const ownedByThisTask = versions.every((v) =>
        versionSessionBelongsToTask(q, v.agent_session_id, task.id, human.human_id),
      );
      if (!ownedByThisTask) return denyResult(DENIAL_REASONS.NOT_YOURS_TO_WITHDRAW);

      // Any human annotation or decision means a person has engaged with this.
      // Withdrawing it would destroy their feedback, so it is refused and they
      // are left to delete it themselves if they want it gone.
      for (const version of versions) {
        const humanAnnotations = q.listAnnotations(version.id).filter((a) => !a.author_id.startsWith("agent:"));
        if (humanAnnotations.length > 0) return denyResult(DENIAL_REASONS.ALREADY_REVIEWED);
        // A review decision moves the version out of ready_for_review, so the
        // state check is also the "has anyone decided on this" check.
        if (version.state !== "ready_for_review" && version.state !== "processing") {
          return denyResult(DENIAL_REASONS.ALREADY_REVIEWED);
        }
      }

      // Give the quota unit back — the artifact is being undone, not consumed.
      // Keyed off quotaPeriod() with no argument, exactly as consumeQuota()
      // does: the counter that was incremented is the one that must be
      // decremented. Only refundable while the artifact's own period is still
      // the live one; an earlier month has no counter left to refund into.
      const period = quotaPeriod();
      if (quotaPeriod(artifact.created_at) === period) {
        const spent = q.usageGet(human.human_id, period, "artifacts");
        if (spent > 0) q.usageAdd(human.human_id, period, "artifacts", -1);
      }
      q.deleteArtifact(artifact.id);

      // The artifact is gone; the ledger of what the agent DID is not. accesses,
      // denials and audit_events are separate records (invariant #5) and stay.
      q.insertAuditEvent({
        id: crypto.randomUUID(),
        actor_type: "agent",
        actor_label: session.id,
        agent_session_id: session.id,
        human_id: human.human_id,
        task_id: task.id,
        tool_name: body.tool,
        operation: "withdraw_artifact",
        payload: { artifact_id: artifact.id, title: artifact.title, versions: versions.length },
        at: now,
      });

      return {
        ok: true,
        result: {
          withdrawn: artifact.id,
          next: "Removed before anyone reviewed it. Your quota unit was returned.",
        },
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
