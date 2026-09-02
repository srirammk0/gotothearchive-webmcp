import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { GRANT_LABEL, GRANT_LEVELS, type GrantLevel, type Region } from "@shared/contract";
import { duration, ease } from "./tokens";
import { errorMessage, getCapabilities, getLens, setGrant } from "../api/client";
import { useCapabilities } from "../webmcp/useCapabilities";
import { isWebMcpAvailable } from "../webmcp/registrar";
import { Disclosure } from "./primitives/Disclosure";
import { Spinner } from "./primitives/Spinner";
import { Icon } from "./primitives/Icon";

function nextLevel(level: GrantLevel): GrantLevel {
  const i = GRANT_LEVELS.indexOf(level);
  return GRANT_LEVELS[(i + 1) % GRANT_LEVELS.length];
}

/**
 * Line-weight glyphs for the four grant states — never emoji, never a filled
 * chip. State must read from the icon shape AND the accompanying word, so it
 * never depends on colour alone (visual-system.md, WCAG AA).
 */
function GrantGlyph({ level }: { level: GrantLevel }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (level) {
    case "none":
      // Closed padlock outline.
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="9" rx="1.5" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "read":
      // Eye outline.
      return (
        <svg {...common}>
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.75" />
        </svg>
      );
    case "propose":
      // Pencil with a small suggestion dot.
      return (
        <svg {...common}>
          <path d="M4 20h4l10-10-4-4L4 16v4Z" />
          <path d="M13 5.5 17.5 10" />
          <circle cx="19.5" cy="4.5" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "write":
      // Solid pencil — the most permissive state.
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M4 20h4l10.3-10.3-4-4L4 16v4Z" />
          <path d="m15.7 4.3 4 4 1.6-1.6a1.8 1.8 0 0 0 0-2.5l-1.5-1.5a1.8 1.8 0 0 0-2.5 0Z" />
        </svg>
      );
  }
}

function GrantIcon({ level, className = "" }: { level: GrantLevel; className?: string }) {
  return (
    <span className={className}>
      <GrantGlyph level={level} />
    </span>
  );
}

interface Row {
  regionId: string;
  parentId: string | null;
  slug: string;
  label: string;
  level: GrantLevel;
}

interface DenialView {
  id: string;
  tool_name: string;
  reason: string;
}

function AccessRow({
  row,
  child = false,
  hasChildren = false,
  open = false,
  onToggleOpen,
  pending,
  onCycle,
}: {
  row: Row;
  child?: boolean;
  hasChildren?: boolean;
  open?: boolean;
  onToggleOpen?: () => void;
  pending: string | null;
  onCycle: (row: Row) => void;
}) {
  const isWrite = row.level === "write";
  const isNone = row.level === "none";
  return (
    <div
      className={`flex items-center justify-between gap-3 ${child ? "py-1 pl-1" : "py-2.5"}`}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {!child && hasChildren ? (
          <button
            type="button"
            onClick={onToggleOpen}
            aria-label={open ? `Collapse ${row.label}` : `Expand ${row.label}`}
            aria-expanded={open}
            className="-ml-1 shrink-0 text-faint transition-colors hover:text-text"
          >
            <Icon
              name="chevronDown"
              size={13}
              className={`transition-transform duration-[var(--duration-base)] ${open ? "rotate-180" : "rotate-0"}`}
            />
          </button>
        ) : null}
        <span className={`truncate text-body ${child ? "text-muted" : "text-text"}`}>
          {row.label}
        </span>
      </span>
      <button
        type="button"
        onClick={() => onCycle(row)}
        disabled={pending === row.regionId}
        aria-label={`${row.label}: ${GRANT_LABEL[row.level]}. Activate to change.`}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-meta transition-colors duration-[var(--duration-fast)] hover:bg-raised disabled:opacity-40 ${
          isWrite ? "text-accent" : isNone ? "text-faint hover:text-text" : "text-muted hover:text-text"
        }`}
      >
        <GrantIcon level={row.level} />
        {GRANT_LABEL[row.level]}
      </button>
    </div>
  );
}

/** Region enum a tool's schema is currently scoped to, if it has one. */
function toolRegions(inputSchema: { properties: Record<string, unknown> }): string[] {
  const region = inputSchema.properties.region as { enum?: unknown } | undefined;
  const values = region?.enum;
  return Array.isArray(values) ? values.filter((v): v is string => typeof v === "string") : [];
}

export interface AgentAccessProps {
  taskId?: string;
  regions?: Region[];
}

/** A persistent contextual panel, not a destination. */
export function AgentAccess({ taskId, regions }: AgentAccessProps) {
  // No mock fallback on purpose. A panel that can render made-up permission
  // state is a panel that can lie about what an agent may do, which is the one
  // failure this product cannot afford.
  if (!taskId || !regions) return null;
  return <LiveAgentAccess taskId={taskId} regions={regions} />;
}

function LiveAgentAccess({ taskId, regions }: { taskId: string; regions: Region[] }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ regionId: string; message: string } | null>(null);
  const [denials, setDenials] = useState<DenialView[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { specs, registered, refresh } = useCapabilities(taskId);
  const webMcpAvailable = isWebMcpAvailable();

  const loadCapabilities = useCallback(async () => {
    const { capabilities } = await getCapabilities(taskId);
    const bySlug = new Map(capabilities.grants.map((g) => [g.slug, g.level]));
    setRows(
      regions.map((region) => ({
        regionId: region.id,
        parentId: region.parent_id,
        slug: region.slug,
        label: region.name,
        level: bySlug.get(region.slug) ?? "none",
      })),
    );
  }, [taskId, regions]);

  useEffect(() => {
    void loadCapabilities();
  }, [loadCapabilities]);

  useEffect(() => {
    getLens(taskId)
      .then(({ lens }) => setDenials(lens.denials.map((d) => ({ id: d.id, tool_name: d.tool_name, reason: d.reason }))))
      .catch(() => setDenials([]));
  }, [taskId]);

  async function cycleLevel(row: Row) {
    const target = nextLevel(row.level);
    const previous = row.level;
    setRows((prev) => prev?.map((r) => (r.regionId === row.regionId ? { ...r, level: target } : r)) ?? prev);
    setPending(row.regionId);
    setRowError(null);
    try {
      await setGrant(taskId, row.slug, target);
      // Server is the authority — re-register the WebMCP tool surface now.
      await refresh();
      getLens(taskId)
        .then(({ lens }) => setDenials(lens.denials.map((d) => ({ id: d.id, tool_name: d.tool_name, reason: d.reason }))))
        .catch(() => undefined);
    } catch (err) {
      setRows((prev) => prev?.map((r) => (r.regionId === row.regionId ? { ...r, level: previous } : r)) ?? prev);
      setRowError({ regionId: row.regionId, message: errorMessage(err, "Could not change access.") });
    } finally {
      setPending(null);
    }
  }

  const expiryNote = "For this task · expires when the task ends";
  const childRows = (parentId: string) => rows?.filter((row) => row.parentId === parentId) ?? [];
  const toggleOpen = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <aside
      aria-label="Agent access"
      className="flex h-fit flex-col gap-4 border-t border-line pt-4 lg:sticky lg:top-20"
    >
      <p className="text-section text-text">Agent Access</p>

      {rows === null ? (
        <Spinner label="Loading access…" />
      ) : (
        <>
          <p className="text-micro text-faint">This agent can currently use</p>
          <ul className="flex flex-col">
            {rows.filter((row) => row.parentId === null).map((row) => {
              const children = childRows(row.regionId);
              const open = !collapsed.has(row.regionId);
              return (
                <li key={row.regionId} className="border-b border-line-soft">
                  <AccessRow
                    row={row}
                    hasChildren={children.length > 0}
                    open={open}
                    onToggleOpen={() => toggleOpen(row.regionId)}
                    pending={pending}
                    onCycle={(next) => void cycleLevel(next)}
                  />
                  {rowError?.regionId === row.regionId ? <p role="alert" className="py-1 text-micro text-bad">{rowError.message}</p> : null}
                  <AnimatePresence initial={false}>
                    {children.length > 0 && open ? (
                      <motion.div
                        key="children"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: duration.base, ease }}
                        className="overflow-hidden"
                      >
                        <div className="pb-3">
                          {children.map((c) => (
                            <AccessRow
                              key={c.regionId}
                              row={c}
                              child
                              pending={pending}
                              onCycle={(next) => void cycleLevel(next)}
                            />
                          ))}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>

          <p className="text-micro text-faint">{expiryNote}</p>
        </>
      )}

      <div className="border-t border-line-soft">
        <Disclosure summary="Agent Lens">
          <div className="flex flex-col gap-4 py-2 font-mono text-micro leading-relaxed text-muted">
            <div>
              {/*
                Show the compiled tool surface, not just what the browser managed to
                register. On a browser without WebMCP the registrar correctly no-ops,
                and listing only registered tools would read as "this is broken"
                rather than "your browser cannot see these yet".
              */}
              <p className="text-faint">{webMcpAvailable ? "registered tools" : "tools this agent would see"}</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {specs.map((t) => {
                  const scopedRegions = toolRegions(t.inputSchema);
                  return (
                    <li key={t.name}>
                      {t.name}
                      {scopedRegions.length ? ` [${scopedRegions.join(", ")}]` : ""} — {t.why}
                    </li>
                  );
                })}
                {specs.length === 0 ? <li>no tools — nothing is currently shared</li> : null}
              </ul>
              {!webMcpAvailable ? (
                <p className="mt-2 text-faint">
                  This browser does not expose WebMCP, so nothing is registered here. Open in the
                  ChatGPT desktop browser, or enable chrome://flags/#enable-webmcp-testing, to let an
                  agent call these. Permission state is live either way.
                </p>
              ) : (
                <p className="mt-2 text-faint">{registered.length} registered with the browser</p>
              )}
            </div>

            <div>
              <p className="text-faint">denied or stale calls</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {denials.map((d) => (
                  <li key={d.id} className="text-bad">
                    {d.tool_name} — {d.reason}
                  </li>
                ))}
                {denials.length === 0 ? <li>none</li> : null}
              </ul>
            </div>
          </div>
        </Disclosure>
      </div>
    </aside>
  );
}
