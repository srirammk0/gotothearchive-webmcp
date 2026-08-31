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
    description: input.pageState.hasPendingProposals
      ? "List the regions currently accessible for this task, with their access level. Something you submitted is currently awaiting human review; it is not yet canonical, and there is no tool to approve it yourself."
      : "List the regions currently accessible for this task, with their access level.",
    inputSchema: { type: "object", properties: {} },
    why: `You can view ${slugs.join(", ")} for this task.`,
  }));

  push("read", (slugs) => ({
    name: "get_context_for_task",
    description: "Retrieve context items relevant to the current task, scoped to accessible regions. Omit region to search every accessible region.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string", enum: slugs },
        query: { type: "string", description: "What context is useful for the current task." },
        limit: { type: "number", description: "Maximum items to return, from 1 to 20." },
      },
    },
    why: `Read access is live on: ${slugs.join(", ")}.`,
  }));

  push("read", (slugs) => ({
    name: "inspect_context_item",
    description: "Look up the full detail of a single context item you already have access to.",
    inputSchema: {
      type: "object",
      properties: { region: { type: "string", enum: slugs }, item_id: { type: "string" } },
      required: ["region", "item_id"],
    },
    why: `Read access is live on: ${slugs.join(", ")}.`,
  }));

  push("read", (slugs) => ({
    name: "inspect_relationships",
    description: "Traverse the context graph around an item, within accessible regions only.",
    inputSchema: {
      type: "object",
      properties: { region: { type: "string", enum: slugs }, item_id: { type: "string" } },
      required: ["region", "item_id"],
    },
    why: `Read access is live on: ${slugs.join(", ")}.`,
  }));

  push("read", (slugs) => ({
    name: "get_taste_for_task",
    description: "Retrieve confirmed and proposed taste signals relevant to this task.",
    inputSchema: { type: "object", properties: {} },
    why: `Read access is live on: ${slugs.join(", ")}.`,
  }));

  push("read", (slugs) =>
    input.pageState.activeArtifactId
      ? {
          name: "trace_artifact_influences",
          description:
            "Get the active artifact's current version, human annotations (including marked regions), and the context that influenced it. Use this before submitting a revision.",
          inputSchema: {
            type: "object",
            properties: {
              version_id: { type: "string", description: "A specific immutable version to inspect." },
              artifact_id: { type: "string", description: "Optional; defaults to the artifact open in Workbench." },
            },
          },
          why: `An artifact is open (${input.pageState.activeArtifactId}) and you can view: ${slugs.join(", ")}.`,
        }
      : null,
  );

  push("propose", (slugs) => ({
    name: "propose_context_change",
    description: "Suggest a new or changed context item or relationship. Stays proposed until a human accepts it.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string", enum: slugs },
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
    description: "Attach feedback or an annotation to an artifact under review.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string", enum: slugs },
        version_id: { type: "string" },
        sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
        dimension: { type: "string" },
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
    description:
      "Submit a new artifact version for human review in an accessible region. It does not become canonical until a person approves it. List the items that shaped the work in used_item_ids so the person reviewing can see what informed it.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string", enum: slugs },
        title: { type: "string" },
        content_html: {
          type: "string",
          description:
            "A complete preview document. For component, include React/ReactDOM UMD scripts from unpkg.com and the Tailwind Play CDN; JSX may use @babel/standalone. The preview has no access to the host app, storage, forms, navigation, or arbitrary network requests.",
        },
        renderer: {
          type: "string",
          enum: ["static_html", "component"],
          description:
            "Use component for a self-contained React/Tailwind UI preview. It runs only in an isolated iframe with no host, storage, navigation, form, or network access.",
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
