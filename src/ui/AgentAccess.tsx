import { GRANT_GLYPH, GRANT_LABEL, GRANT_LEVELS, type GrantLevel } from "@shared/contract";
import { Disclosure } from "./primitives/Disclosure";
import { HairlineRule } from "./primitives/HairlineRule";
import type { AgentAccessViewModel, AgentLensViewModel } from "./viewmodels";

function nextLevel(level: GrantLevel): GrantLevel {
  const i = GRANT_LEVELS.indexOf(level);
  return GRANT_LEVELS[(i + 1) % GRANT_LEVELS.length];
}

export interface AgentAccessProps {
  model: AgentAccessViewModel;
  /** Called with the region id and the level it should become. Owner persists it. */
  onChangeLevel?: (regionId: string, next: GrantLevel) => void;
  /** Agent Lens shell — render from props only, no fetching here. */
  lens?: AgentLensViewModel;
}

/** A persistent contextual panel, not a destination. */
export function AgentAccess({ model, onChangeLevel, lens }: AgentAccessProps) {
  return (
    <aside className="flex flex-col gap-4 font-sans" aria-label="Agent access">
      <p className="text-[length:var(--text-micro)] uppercase tracking-[0.14em] text-stone">Agent Access</p>

      <ul className="flex flex-col gap-2">
        {model.rows.map((row) => (
          <li key={row.regionId} className="flex items-center justify-between gap-3">
            <span className="text-[length:var(--text-body)] text-ink">
              {row.level === "none" ? "–" : "✓"} {row.label}
              <span className="text-stone"> — {GRANT_LABEL[row.level].toLowerCase()}</span>
            </span>
            <button
              type="button"
              onClick={() => onChangeLevel?.(row.regionId, nextLevel(row.level))}
              aria-label={`${row.label}: ${GRANT_LABEL[row.level]}. Activate to change.`}
              className="shrink-0 rounded-[var(--radius-sm)] border border-hairline px-2 py-1 text-[length:var(--text-item)] hover:border-ink"
              title={GRANT_LABEL[row.level]}
            >
              {GRANT_GLYPH[row.level]}
            </button>
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
