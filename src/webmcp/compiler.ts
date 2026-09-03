/**
 * Capability compiler — pure function, no I/O.
 *
 * Turns human access + live grants + task + page state into the exact set of
 * WebMCP tools that should be registered right now. This is a HINT surface
 * only: the server re-checks every call independently (see transport.ts and
 * BUILD-CONTRACT.md invariant #2). Nothing here is a binding authorization
 * decision.
 */
import {
  ARTIFACT_ASPECTS,
  GRANT_LEVELS,
  TASTE_DIMENSIONS,
  type CapabilityInput,
  type GrantLevel,
  type ToolSpec,
} from "@shared/contract";

function levelIndex(level: GrantLevel): number {
  return GRANT_LEVELS.indexOf(level);
}

function min(a: GrantLevel, b: GrantLevel): GrantLevel {
  return levelIndex(a) <= levelIndex(b) ? a : b;
}

/** Effective per-region level = min(human access, live grant). Missing on either side = "none". */
function effectiveRegions(input: CapabilityInput): { slug: string; level: GrantLevel }[] {
  const humanBySlug = new Map(input.humanRegions.map((r) => [r.slug, r.level]));
  const grantBySlug = new Map(input.grants.map((g) => [g.slug, g.level]));
  const slugs = new Set([...humanBySlug.keys(), ...grantBySlug.keys()]);
  return [...slugs].map((slug) => ({
    slug,
    level: min(humanBySlug.get(slug) ?? "none", grantBySlug.get(slug) ?? "none"),
  }));
}

/** Region slugs whose effective level meets or exceeds `requires`. */
function eligibleSlugs(regions: { slug: string; level: GrantLevel }[], requires: GrantLevel): string[] {
  return regions.filter((r) => levelIndex(r.level) >= levelIndex(requires)).map((r) => r.slug);
}

export function compile(input: CapabilityInput): ToolSpec[] {
  const regions = effectiveRegions(input);

  // Always offered, before anything else: the client should say which product
  // it is (Claude, Cursor, ChatGPT, Copilot, …) so its work is attributed
  // correctly in this space's stats. Declared identity is ATTRIBUTION ONLY and
  // never influences authorization (BUILD-CONTRACT invariant #9).
  const specs: ToolSpec[] = [
    {
      name: "identify_agent",
      requires: "read",
      title: "Identify agent",
      annotations: { readOnlyHint: false },
      description:
        "Records which agent product is acting in this session (client, and optionally provider and model) so contributions are attributed correctly. Attribution only; the declared identity never affects access. Example argument: { client: \"Cursor\", provider: \"anthropic\", model: \"claude-sonnet-4\" }.",
      inputSchema: {
        type: "object",
        properties: {
          client: { type: "string", description: "Product name, e.g. Claude, Cursor, ChatGPT, Copilot." },
          provider: { type: "string", description: "Model vendor, e.g. anthropic, openai." },
          model: { type: "string", description: "Model id, if known." },
        },
        required: ["client"],
      },
      why: "Attribution only — never used for access decisions.",
    },
  ];

  const push = (requires: GrantLevel, build: (slugs: string[]) => Omit<ToolSpec, "requires"> | null) => {
    const slugs = eligibleSlugs(regions, requires);
    if (slugs.length === 0) return;
    const built = build(slugs);
    if (built === null) return;
    specs.push({ ...built, requires });
  };

  push("read", (slugs) => ({
    name: "get_current_context_scope",
    title: "Context scope",
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    description: input.pageState.hasPendingProposals
      ? "The regions readable for this task, each with its access level. A submission from this task is awaiting human review and is not yet canonical context."
      : "The regions readable for this task, each with its access level.",
    inputSchema: { type: "object", properties: {} },
    why: `You can view ${slugs.join(", ")} for this task.`,
  }));

  push("read", (slugs) => ({
    name: "get_context_for_task",
    title: "Get context for task",
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    description:
      "Context items relevant to the task, ranked, limited to the accessible regions. Each result has an excerpt; image results include a design profile with the measured hex palette, typography classification, layout and texture. With no region, every accessible region is searched.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string", enum: slugs, description: "One of your accessible regions." },
        query: { type: "string", description: "What context is useful for the current task." },
        limit: { type: "number", description: "Maximum items to return, from 1 to 20." },
      },
      required: ["query"],
    },
    why: `Read access is live on: ${slugs.join(", ")}.`,
  }));

  push("read", (slugs) => ({
    name: "inspect_context_item",
    title: "Inspect context item",
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    description:
      "One context item in full: its text, its design profile (measured hex palette, typography, layout, texture), a viewable image URL when it has one, and its related items in the archive graph.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string", enum: slugs, description: "One of your accessible regions." },
        item_id: { type: "string", description: "The id of the item to open, from a get_context_for_task result." },
      },
      required: ["region", "item_id"],
    },
    why: `Read access is live on: ${slugs.join(", ")}.`,
  }));

  push("read", (slugs) => ({
    name: "get_taste_for_task",
    title: "Get taste for task",
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    description:
      "Confirmed and proposed taste signals for this task. Each confirmed signal lists the archive items it is grounded in.",
    inputSchema: { type: "object", properties: {} },
    why: `Read access is live on: ${slugs.join(", ")}.`,
  }));

  // State-dependent: this tool only means anything while an artifact is open in
  // Workbench. With none open it would be an always-failing shell, which
  // BUILD-CONTRACT invariant #8 says to unregister instead.
  if (input.pageState.activeArtifactId) {
      push("read", (slugs) => ({
        name: "trace_artifact_influences",
      title: "Trace artifact influences",
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      description:
        "Get an artifact's current version, its human annotations and feedback (including marked regions), and the context that influenced it. Pass artifact_id or version_id explicitly, or omit both to use the artifact currently open in Workbench, if any. Use this before submitting a revision, or to check whether feedback you recorded has been reviewed.",
      inputSchema: {
        type: "object",
        properties: {
          version_id: { type: "string", description: "A specific immutable version to inspect." },
          artifact_id: { type: "string", description: "An artifact you already know the id of. Defaults to the artifact open in Workbench if omitted." },
        },
      },
      why: input.pageState.activeArtifactId
        ? `An artifact is open (${input.pageState.activeArtifactId}) and you can view: ${slugs.join(", ")}.`
        : `You can view: ${slugs.join(", ")}.`,
    }));
  }

  push("propose", (slugs) => ({
    name: "propose_taste_signal",
    title: "Propose taste signal",
    description:
      "Proposes a preference observed in the person's own feedback, with the annotations or context items that evidence it. It stays proposed until a person confirms it; get_taste_for_task is unaffected until then. At least one annotation_id or item_id is required as evidence.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string", enum: slugs, description: "One of your accessible regions." },
        statement: { type: "string", description: "Specific and contextual, e.g. \"prefers left-aligned headings over centered\". Not a vague label." },
        dimensions: { type: "array", items: { type: "string", enum: TASTE_DIMENSIONS } },
        annotation_ids: { type: "array", items: { type: "string" }, description: "Human annotations that support this pattern." },
        item_ids: { type: "array", items: { type: "string" }, description: "Context items that support this pattern." },
      },
      required: ["region", "statement"],
    },
    why: `You can suggest changes on: ${slugs.join(", ")}.`,
  }));

  // An artifact is agent output deposited for human review, not a mutation of
  // canonical human context — it lands in `ready_for_review` and carries the
  // `agent_artifact` authority class. That is proposal semantics, so this is
  // gated at "propose", not "write". Approving it remains a human act.
  push("propose", (slugs) => ({
    name: "record_artifact",
    title: "Record artifact",
    description:
      "Submits a new artifact version for human review in an accessible region. Not canonical until a person approves it. Image references from get_context_for_task carry a `design` profile — measured hex palette, typography classification, layout, texture — describing what each reference looks like. used_item_ids records which context items shaped the work.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string", enum: slugs, description: "One of your accessible regions." },
        title: { type: "string", description: "A short name for this artifact version." },
        content_html: {
          type: "string",
          description:
            "The full preview document. An image's embed_url from get_context_for_task or inspect_context_item works directly as an <img src>. A component build may load scripts from unpkg.com, cdn.jsdelivr.net, cdnjs.cloudflare.com, esm.sh, cdn.tailwindcss.com and code.jquery.com, and fonts/styles from fonts.googleapis.com / fonts.gstatic.com; connect/fetch is blocked, so it works from the data it is given. static_html runs no JavaScript.",
        },
        renderer: {
          type: "string",
          enum: ["static_html", "component"],
          description:
            "component: a self-contained React/Tailwind UI preview, for a UI component or interactive control — it runs in the Workbench. static_html: a pure visual document with real fonts, full CSS and SVG filters and no JavaScript, for posters and editorial layouts. Both render in an isolated opaque-origin iframe.",
        },
        used_item_ids: {
          type: "array",
          items: { type: "string" },
          description:
            "Ids of the context items that actually shaped this artifact. Each is verified against your current access; unreachable items are dropped.",
        },
        aspect: {
          type: "string",
          enum: ARTIFACT_ASPECTS,
          description:
            "The shape the artifact is meant to be seen at, so the Workbench frames it without clipping. poster = 3:4, portrait = 2:3, square, wide = 16:9, page = A4.",
        },
        artifact_id: { type: "string", description: "Set when revising an existing artifact in this task." },
        parent_version_id: { type: "string", description: "The version this one revises, from trace_artifact_influences." },
      },
      required: ["region", "title", "content_html"],
    },
    why: `You can suggest changes on: ${slugs.join(", ")}.`,
  }));

  // Undo for the agent's OWN unreviewed output. Gated at "propose" because
  // that is the tier that let it create the artifact in the first place —
  // being able to take back something no one has looked at yet is part of
  // submitting it, not a further power. There is no tool for deleting a
  // context item, an annotation, or an approved artifact at any tier.
  push("propose", (slugs) => ({
    name: "withdraw_artifact",
    title: "Withdraw artifact",
    description:
      "Removes an artifact this task produced, when no person has annotated or decided on it yet. Refused once a person has engaged with it. The artifact's quota unit is returned.",
    inputSchema: {
      type: "object",
      properties: {
        artifact_id: { type: "string", description: "The artifact to withdraw. It must be one this task produced." },
      },
      required: ["artifact_id"],
    },
    why: `You can suggest changes on: ${slugs.join(", ")}.`,
  }));

  // Write access is the human saying "this folder is yours to fill" — so the
  // agent can add material straight into it, no review step. Workbench
  // (record_artifact) stays for making something new; this is for filing.
  push("write", (slugs) => ({
    name: "add_context_item",
    title: "Add context item",
    description:
      "Add a note, link, or document straight into a folder you have write access to. It becomes canonical context immediately — no human review. Use record_artifact instead when you're producing something new to be reviewed.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string", enum: slugs, description: "One of your accessible regions." },
        type: { type: "string", enum: ["note", "link", "document"] },
        title: { type: "string" },
        body: { type: "string", description: "The note text or document body. Plain text." },
        source_url: { type: "string", description: "For a link: the URL." },
      },
      required: ["region", "type", "title"],
    },
    why: `You have write access on: ${slugs.join(", ")}.`,
  }));

  // The inverse of add_context_item, at the same tier. Deliberately NOT a
  // general delete: the server refuses anything the agent did not file itself,
  // so a human-authored item is untouchable at every grant level.
  push("write", (slugs) => ({
    name: "remove_context_item",
    title: "Remove context item",
    description:
      "Remove an item YOU filed into a folder with add_context_item — a duplicate, or something you got wrong. Refused for anything the person wrote or captured, and for items filed by another agent, whatever your access level.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "The item to remove. It must be one you filed." },
      },
      required: ["item_id"],
    },
    why: `You have write access on: ${slugs.join(", ")}.`,
  }));

  // `approve_proposed_changes` and `reject_proposed_changes` are deliberately
  // never compiled into the agent's tool surface, at any grant level.
  //
  // Acceptance is the moment a proposal becomes canonical human context. If an
  // agent could call it, "propose" would collapse into "write" with an extra
  // step, and the product's first principle — humans own canonical context —
  // would hold only by convention. We cannot distinguish "the person asked the
  // agent to approve this" from "the agent decided to approve this" across the
  // WebMCP boundary, so we do not offer the capability at all. Approval happens
  // through the human review controls, which post to /api/decisions.
  //
  // The server refuses these tool names independently (worker/mcp.ts). The two
  // enforcement points agree on purpose: the tool is absent AND refused.
  //
  // `pageState.hasPendingProposals` therefore does not gate a tool. It is
  // reported to the agent below so it can tell that its own submission is
  // awaiting a person, rather than retrying or assuming failure.

  return specs;
}
