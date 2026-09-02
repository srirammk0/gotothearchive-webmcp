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
  GRANT_LEVELS,
  RELATIONSHIPS,
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
      description:
        "Identify which agent product you are so your contributions are attributed correctly. Call this once at the start of the session. Example: { client: \"Cursor\", provider: \"anthropic\", model: \"claude-sonnet-4\" }.",
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
    annotations: { readOnlyHint: true },
    description: input.pageState.hasPendingProposals
      ? "List the regions currently accessible for this task, with their access level. Something you submitted is currently awaiting human review; it is not yet canonical, and there is no tool to approve it yourself."
      : "List the regions currently accessible for this task, with their access level.",
    inputSchema: { type: "object", properties: {} },
    why: `You can view ${slugs.join(", ")} for this task.`,
  }));

  push("read", (slugs) => ({
    name: "get_context_for_task",
    title: "Get context for task",
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    description: "Retrieve context items relevant to the current task, scoped to accessible regions. Omit region to search every accessible region.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string", description: "One of your accessible regions — see get_current_context_scope." },
        query: { type: "string", description: "What context is useful for the current task." },
        limit: { type: "number", description: "Maximum items to return, from 1 to 20." },
      },
    },
    why: `Read access is live on: ${slugs.join(", ")}.`,
  }));

  push("read", (slugs) => ({
    name: "inspect_context_item",
    title: "Inspect context item",
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    description: "Look up the full detail of a single context item you already have access to.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string", description: "One of your accessible regions — see get_current_context_scope." },
        item_id: { type: "string" },
      },
      required: ["region", "item_id"],
    },
    why: `Read access is live on: ${slugs.join(", ")}.`,
  }));

  push("read", (slugs) => ({
    name: "inspect_relationships",
    title: "Inspect relationships",
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    description: "Traverse the context graph around an item, within accessible regions only.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string", description: "One of your accessible regions — see get_current_context_scope." },
        item_id: { type: "string" },
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
      "Retrieve confirmed and proposed taste signals for this task. Each confirmed signal lists the archive items it is grounded in — inspect those to see concretely what the preference means before applying it.",
    inputSchema: { type: "object", properties: {} },
    why: `Read access is live on: ${slugs.join(", ")}.`,
  }));

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

  push("propose", (slugs) => ({
    name: "propose_taste_signal",
    title: "Propose taste signal",
    description:
      "Name a preference you've noticed from the person's own feedback (via trace_artifact_influences), grounded in the annotations or context items that show it. Stays proposed until a person confirms it — this does not teach get_taste_for_task anything by itself. Cite at least one annotation_id or item_id as evidence.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string", description: "One of your accessible regions — see get_current_context_scope." },
        statement: { type: "string", description: "Specific and contextual, e.g. \"prefers left-aligned headings over centered\". Not a vague label." },
        dimensions: { type: "array", items: { type: "string", enum: TASTE_DIMENSIONS } },
        annotation_ids: { type: "array", items: { type: "string" }, description: "Human annotations that support this pattern." },
        item_ids: { type: "array", items: { type: "string" }, description: "Context items that support this pattern." },
      },
      required: ["region", "statement"],
    },
    why: `You can suggest changes on: ${slugs.join(", ")}.`,
  }));

  push("propose", (slugs) => ({
    name: "propose_context_change",
    title: "Propose context change",
    description: "Suggest a new or changed context item or relationship. Stays proposed until a human accepts it.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string", description: "One of your accessible regions — see get_current_context_scope." },
        from_item_id: { type: "string" },
        to_item_id: { type: "string" },
        relationship: { type: "string", enum: RELATIONSHIPS },
      },
      required: ["region", "from_item_id", "to_item_id"],
    },
    why: `You can suggest changes on: ${slugs.join(", ")}.`,
  }));

  push("propose", (slugs) => ({
    name: "record_feedback",
    title: "Record feedback",
    description: "Attach feedback or an annotation to an artifact under review.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string", description: "One of your accessible regions — see get_current_context_scope." },
        version_id: { type: "string" },
        sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
        dimensions: { type: "array", items: { type: "string", enum: TASTE_DIMENSIONS } },
        comment: { type: "string" },
      },
      required: ["region", "version_id", "comment"],
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
      "Submit a new artifact version for human review in an accessible region. It does not become canonical until a person approves it. Call get_taste_for_task first and apply any confirmed signals — this is how the work should already look, not an optional check. List the items that shaped the work in used_item_ids so the person reviewing can see what informed it.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string", description: "One of your accessible regions — see get_current_context_scope." },
        title: { type: "string" },
        content_html: {
          type: "string",
          description:
            "A complete preview document. For component, include React/ReactDOM UMD scripts from unpkg.com and the Tailwind Play CDN; JSX may use @babel/standalone. static_html runs no JavaScript at all, but nothing else is restricted — a real web font (a Google Fonts <link>) and full CSS (grid, gradients, custom properties) both work, and are usually enough for a high-fidelity static visual. Either renderer can use an existing image (a logo, a real photo) instead of a placeholder: drop its embed_url — from get_context_for_task or inspect_context_item — straight into an <img src>. The preview has no access to the host app, storage, forms, navigation, or arbitrary network requests beyond what's named here.",
        },
        renderer: {
          type: "string",
          enum: ["static_html", "component"],
          description:
            "static_html (default): a pure visual document — real fonts and full CSS, no JavaScript. Usually the highest-fidelity choice when nothing needs to actually run. component: a self-contained React/Tailwind UI preview, for genuine interactivity or Tailwind's utility classes specifically. Runs only in an isolated iframe with no host, storage, navigation, form, or network access beyond its approved CDNs.",
        },
        used_item_ids: {
          type: "array",
          items: { type: "string" },
          description:
            "Ids of the context items that actually shaped this artifact. Each is verified against your current access; unreachable items are dropped.",
        },
        artifact_id: { type: "string" },
        parent_version_id: { type: "string" },
      },
      required: ["region", "title", "content_html"],
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
        region: { type: "string", description: "One of your accessible regions — see get_current_context_scope." },
        type: { type: "string", enum: ["note", "link", "document"] },
        title: { type: "string" },
        body: { type: "string", description: "The note text or document body. Plain text." },
        source_url: { type: "string", description: "For a link: the URL." },
      },
      required: ["region", "type", "title"],
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
