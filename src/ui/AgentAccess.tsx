import { useCallback, useEffect, useState } from "react";
import { GRANT_LABEL, GRANT_LEVELS, type GrantLevel, type Region } from "@shared/contract";
import { getCapabilities, getLens, setGrant } from "../api/client";
import { useCapabilities } from "../webmcp/useCapabilities";
import { isWebMcpAvailable } from "../webmcp/registrar";
import { Disclosure } from "./primitives/Disclosure";
import { Spinner } from "./primitives/Spinner";
import { GrantIcon } from "./primitives/GrantIcon";

function nextLevel(level: GrantLevel): GrantLevel {
  const i = GRANT_LEVELS.indexOf(level);
  return GRANT_LEVELS[(i + 1) % GRANT_LEVELS.length];
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

function AccessRow({ row, pending, onCycle }: { row: Row; pending: string | null; onCycle: (row: Row) => void }) {
  const isWrite = row.level === "write";
  const isNone = row.level === "none";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft py-2.5">
      <span className="text-[length:var(--text-body)] text-text">{row.label}</span>
      <button
        type="button"
        onClick={() => onCycle(row)}
        disabled={pending === row.regionId}
        aria-label={`${row.label}: ${GRANT_LABEL[row.level]}. Activate to change.`}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-[length:var(--text-meta)] transition-colors duration-[var(--duration-fast)] hover:bg-raised disabled:opacity-40 ${
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
      setRowError({ regionId: row.regionId, message: err instanceof Error ? err.message : "Could not change access." });
    } finally {
      setPending(null);
    }
  }

  const expiryNote = "For this task · expires when the task ends";
  const childRows = (parentId: string) => rows?.filter((row) => row.parentId === parentId) ?? [];

  return (
    <aside
      aria-label="Agent access"
      className="flex h-fit flex-col gap-4 border-t border-line pt-4 lg:sticky lg:top-20"
    >
      <p className="text-[length:var(--text-section)] text-text">Agent Access</p>

      {rows === null ? (
        <Spinner label="Loading access…" />
      ) : (
        <>
          <p className="text-[length:var(--text-micro)] text-faint">This agent can currently use</p>
          <ul className="flex flex-col">
            {rows.filter((row) => row.parentId === null).map((row) => {
              const children = childRows(row.regionId);
              return (
                <li key={row.regionId}>
                  <AccessRow row={row} pending={pending} onCycle={(next) => void cycleLevel(next)} />
                  {rowError?.regionId === row.regionId ? <p role="alert" className="pb-2 text-[length:var(--text-micro)] text-bad">{rowError.message}</p> : null}
                  {children.length > 0 ? (
                    <details className="ml-3 border-l border-line-soft pl-3">
                      <summary className="cursor-pointer py-2 text-[length:var(--text-micro)] text-faint hover:text-text">Folders · {children.length}</summary>
                      {children.map((child) => <AccessRow key={child.regionId} row={child} pending={pending} onCycle={(next) => void cycleLevel(next)} />)}
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <p className="text-[length:var(--text-micro)] text-faint">{expiryNote}</p>
        </>
      )}

      <div className="border-t border-line-soft">
        <Disclosure summary="Agent Lens">
          <div className="flex flex-col gap-4 py-2 font-mono text-[length:var(--text-micro)] leading-relaxed text-muted">
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
