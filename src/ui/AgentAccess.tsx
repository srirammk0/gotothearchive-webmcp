import { useCallback, useEffect, useState } from "react";
import { GRANT_GLYPH, GRANT_LABEL, GRANT_LEVELS, type GrantLevel, type Region } from "@shared/contract";
import { getCapabilities, getLens, setGrant } from "../api/client";
import { useCapabilities } from "../webmcp/useCapabilities";
import { Disclosure } from "./primitives/Disclosure";
import { HairlineRule } from "./primitives/HairlineRule";
import { Spinner } from "./primitives/Spinner";
import type { AgentAccessViewModel, AgentLensViewModel } from "./viewmodels";

function nextLevel(level: GrantLevel): GrantLevel {
  const i = GRANT_LEVELS.indexOf(level);
  return GRANT_LEVELS[(i + 1) % GRANT_LEVELS.length];
}

interface Row {
  regionId: string;
  slug: string;
  label: string;
  level: GrantLevel;
}

interface DenialView {
  id: string;
  tool_name: string;
  reason: string;
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
  /** Legacy static-render path, kept for callers not yet wired to a live task (e.g. Workbench). */
  model?: AgentAccessViewModel;
  lens?: AgentLensViewModel;
}

/** Static fallback render for a caller passing pre-computed view models instead of a live task. */
function StaticAgentAccess({ model, lens }: { model: AgentAccessViewModel; lens?: AgentLensViewModel }) {
  return (
    <aside className="flex flex-col gap-4 font-sans" aria-label="Agent access">
      <p className="text-[length:var(--text-micro)] uppercase tracking-[0.14em] text-stone">Agent Access</p>
      <p className="text-[length:var(--text-body)] text-ink">This agent can currently use</p>
      <ul className="flex flex-col gap-2">
        {model.rows.map((row) => (
          <li key={row.regionId} className="flex items-center justify-between gap-3">
            <span className="text-[length:var(--text-body)] text-ink">
              {row.level === "none" ? "–" : "✓"} {row.label}
              <span className="text-stone"> — {GRANT_LABEL[row.level].toLowerCase()}</span>
            </span>
            <span
              aria-label={`${row.label}: ${GRANT_LABEL[row.level]}`}
              className="shrink-0 rounded-[var(--radius-sm)] border border-hairline px-2 py-1 text-[length:var(--text-item)]"
              title={GRANT_LABEL[row.level]}
            >
              {GRANT_GLYPH[row.level]}
            </span>
          </li>
        ))}
      </ul>
      <HairlineRule />
      <p className="text-[length:var(--text-meta)] text-stone">{model.scopeNote}</p>
      {lens ? (
        <>
          <HairlineRule />
          <Disclosure summary="Agent Lens">
            <div className="flex flex-col gap-3 py-2 font-mono text-[length:var(--text-micro)] text-ink-soft">
              <p>identity: {lens.declaredIdentity ?? "unknown (unverified)"}</p>
              <p>task: {lens.taskTitle ?? "none"}</p>
              <p>expires: {lens.expiresAt ? new Date(lens.expiresAt).toLocaleString() : "—"}</p>
              <div>
                <p className="text-stone">registered tools</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {lens.registeredTools.map((t) => (
                    <li key={t.name}>
                      {t.name} — {t.why}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-stone">recent retrievals</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {lens.recentRetrievals.map((r, i) => (
                    <li key={i}>
                      {r.itemTitle} — {r.why}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-stone">denied or stale calls</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {lens.denials.map((d) => (
                    <li key={d.id} className="text-bad">
                      {d.tool_name} — {d.reason}
                    </li>
                  ))}
                  {lens.denials.length === 0 ? <li>none</li> : null}
                </ul>
              </div>
            </div>
          </Disclosure>
        </>
      ) : null}
    </aside>
  );
}

/** A persistent contextual panel, not a destination. */
export function AgentAccess({ taskId, regions, model, lens: legacyLens }: AgentAccessProps) {
  if (!taskId || !regions) {
    if (model) return <StaticAgentAccess model={model} lens={legacyLens} />;
    return null;
  }
  return <LiveAgentAccess taskId={taskId} regions={regions} />;
}

function LiveAgentAccess({ taskId, regions }: { taskId: string; regions: Region[] }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ regionId: string; message: string } | null>(null);
  const [denials, setDenials] = useState<DenialView[]>([]);
  const { registered, refresh } = useCapabilities(taskId);

  const loadCapabilities = useCallback(async () => {
    const { capabilities } = await getCapabilities(taskId);
    const bySlug = new Map(capabilities.grants.map((g) => [g.slug, g.level]));
    setRows(
      regions.map((region) => ({
        regionId: region.id,
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

  return (
    <aside className="flex flex-col gap-4 font-sans" aria-label="Agent access">
      <p className="text-[length:var(--text-micro)] uppercase tracking-[0.14em] text-stone">Agent Access</p>

      {rows === null ? (
        <Spinner label="Loading access…" />
      ) : (
        <>
          <p className="text-[length:var(--text-body)] text-ink">This agent can currently use</p>
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li key={row.regionId} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[length:var(--text-body)] text-ink">
                    {row.level === "none" ? "–" : "✓"} {row.label}
                    <span className="text-stone"> — {GRANT_LABEL[row.level].toLowerCase()}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void cycleLevel(row)}
                    disabled={pending === row.regionId}
                    aria-label={`${row.label}: ${GRANT_LABEL[row.level]}. Activate to change.`}
                    className="shrink-0 rounded-[var(--radius-sm)] border border-hairline px-2 py-1 text-[length:var(--text-item)] hover:border-ink disabled:opacity-40"
                    title={GRANT_LABEL[row.level]}
                  >
                    {GRANT_GLYPH[row.level]}
                  </button>
                </div>
                {rowError?.regionId === row.regionId ? (
                  <p role="alert" className="text-[length:var(--text-micro)] text-bad">
                    {rowError.message}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          <HairlineRule />

          <p className="text-[length:var(--text-meta)] text-stone">{expiryNote}</p>
        </>
      )}

      <HairlineRule />
      <Disclosure summary="Agent Lens">
        <div className="flex flex-col gap-3 py-2 font-mono text-[length:var(--text-micro)] text-ink-soft">
          <div>
            <p className="text-stone">registered tools</p>
            <ul className="mt-1 flex flex-col gap-1">
              {registered.map((t) => {
                const scopedRegions = toolRegions(t.inputSchema);
                return (
                  <li key={t.name}>
                    {t.name}
                    {scopedRegions.length ? ` [${scopedRegions.join(", ")}]` : ""} — {t.why}
                  </li>
                );
              })}
              {registered.length === 0 ? <li>none registered</li> : null}
            </ul>
          </div>

          <div>
            <p className="text-stone">denied or stale calls</p>
            <ul className="mt-1 flex flex-col gap-1">
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
    </aside>
  );
}
