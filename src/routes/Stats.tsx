import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { getStats, getQuota, type QuotaInfo, type SpaceStats } from "../api/client";
import { EmptyState } from "../ui/primitives/EmptyState";
import { EmptyRow } from "../ui/primitives/EmptyRow";
import { Spinner } from "../ui/primitives/Spinner";
import { Icon, type IconName } from "../ui/primitives/Icon";
import { BrandMark } from "../ui/primitives/BrandMark";
import { ArtifactThumb } from "../ui/workbench/ArtifactThumb";
import { useTrail } from "../ui/Breadcrumbs";

const DAY = 86_400_000;
const WEEKS = 14;

/** GitHub-style contribution grid over the last ~14 weeks. */
function Heatmap({
  counts,
  tint = "var(--color-accent)",
  unit = "action",
}: {
  counts: Record<string, number>;
  tint?: string;
  unit?: string;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - (WEEKS * 7 - 1) * DAY);
  start.setDate(start.getDate() - start.getDay());

  const max = Math.max(1, ...Object.values(counts));
  const cols: { key: string; n: number; future: boolean }[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const col: { key: string; n: number; future: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getTime() + (w * 7 + d) * DAY);
      const key = date.toISOString().slice(0, 10);
      col.push({ key, n: counts[key] ?? 0, future: date.getTime() > today.getTime() });
    }
    cols.push(col);
  }

  const shade = (n: number, future: boolean) => {
    if (future) return "transparent";
    if (n === 0) return "var(--color-line-soft)";
    const t = n / max;
    const pct = t <= 0.25 ? 25 : t <= 0.5 ? 50 : t <= 0.75 ? 75 : 100;
    return `color-mix(in srgb, ${tint} ${pct}%, var(--color-line-soft))`;
  };

  const fmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
  const tip = (cell: { key: string; n: number; future: boolean }) => {
    if (cell.future) return "";
    const label = fmt.format(new Date(`${cell.key}T00:00:00`));
    return `${label} — ${cell.n} ${unit}${cell.n === 1 ? "" : "s"}`;
  };

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex gap-[3px]">
        {cols.map((col, w) => (
          <div key={w} className="flex flex-col gap-[3px]">
            {col.map((cell) => (
              <div
                key={cell.key}
                title={tip(cell)}
                className="h-3 w-3 rounded-[2px]"
                style={{ background: shade(cell.n, cell.future) }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function BarList({
  rows,
  tint = "bg-accent",
  labelWidth = "w-32",
}: {
  rows: { label: string; value: number }[];
  tint?: string;
  labelWidth?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3">
          <span className={`${labelWidth} shrink-0 truncate text-[length:var(--text-meta)] text-muted`}>{r.label}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-soft">
            <span className={`block h-full rounded-full ${tint}`} style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="w-7 shrink-0 text-right text-[length:var(--text-micro)] tabular-nums text-faint">
            {r.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Section({
  icon,
  title,
  blurb,
  children,
}: {
  icon: IconName;
  title: string;
  blurb: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-surface text-muted">
          <Icon name={icon} size={15} />
        </span>
        <div>
          <h2 className="text-[length:var(--text-headline)] text-text">{title}</h2>
          <p className="text-[length:var(--text-meta)] text-faint">{blurb}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[length:var(--text-display)] leading-none tabular-nums text-text">{value}</span>
      <span className="text-[length:var(--text-micro)] uppercase tracking-wide text-faint">{label}</span>
    </div>
  );
}

const QUOTA_LABEL: Record<string, string> = {
  agent_calls: "Agent tool calls",
  uploads: "File uploads",
  artifacts: "Artifacts generated",
  ai_ops: "AI operations",
};

const OUTCOME_TONE: Record<string, string> = {
  approved: "bg-good",
  approved_with_notes: "bg-good",
  changes_requested: "bg-accent",
  rejected: "bg-bad",
  in_review: "bg-line",
  ready_for_review: "bg-line",
  processing: "bg-line",
};

export function Stats() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [stats, setStats] = useState<SpaceStats | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  useTrail([{ label: "Stats" }]);

  useEffect(() => {
    let cancelled = false;

    // Initial load owns the loading/error screen.
    getStats()
      .then(({ stats: s }) => {
        if (cancelled) return;
        setStats(s);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    getQuota()
      .then((r) => !cancelled && setQuota(r.quota))
      .catch(() => undefined);

    // Background refresh: usage moves from actions taken elsewhere (an agent
    // call from ChatGPT, an upload on another tab). Silent — a failed refresh
    // keeps the last good data on screen and never flips to the error state.
    const refresh = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      getStats().then(({ stats: s }) => !cancelled && setStats(s)).catch(() => undefined);
      getQuota().then((r) => !cancelled && setQuota(r.quota)).catch(() => undefined);
    };
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    const poll = window.setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      window.clearInterval(poll);
    };
  }, []);

  if (status === "loading") return <Spinner label="Reading the trail…" />;
  if (status === "error" || !stats) {
    return <EmptyState title="Couldn't load stats" body="Something went wrong reaching the server. Try again shortly." />;
  }

  const { totals, agents, outcomes, taste } = stats;
  const outcomeTotal = Math.max(1, outcomes.reduce((n, o) => n + o.value, 0));
  const maxAgent = Math.max(1, ...agents.map((a) => a.actions));
  const acceptRate = taste.total > 0 ? Math.round((taste.confirmed / taste.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-5">
        <div>
          <h1 className="text-[length:var(--text-display)] leading-tight text-text">Stats</h1>
          <p className="mt-1 max-w-prose text-[length:var(--text-meta)] leading-relaxed text-faint">
            Everything an agent does in this space is logged — what it read, which tools it called, which taste
            signals shaped its work. This is that trail, rolled up.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-12 gap-y-4">
          <Stat label="Logged actions" value={totals.actions} />
          <Stat label="Items" value={totals.items} />
          <Stat label="Artifacts" value={totals.artifacts} />
          <Stat label="Taste uses" value={taste.applications} />
        </div>
      </header>

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* main column */}
        <div className="flex flex-col gap-10">
      <Section
        icon="bolt"
        title="Agent activity"
        blurb="Every tool call and retrieval by day, and which clients did the work."
      >
        {totals.actions === 0 ? (
          <EmptyRow>No agent activity logged yet</EmptyRow>
        ) : (
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:gap-10">
            <div className="shrink-0">
              <Heatmap counts={stats.activity_by_day} />
            </div>
            <div className="min-w-0 flex-1 xl:border-l xl:border-line-soft xl:pl-8">
              <p className="mb-3 text-[length:var(--text-micro)] uppercase tracking-wide text-faint">Agents</p>
              {agents.length === 0 ? (
                <p className="text-[length:var(--text-meta)] text-faint">No client has run identify_agent yet.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {agents.map((a) => {
                    return (
                      <li key={a.label} className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2.5">
                          <BrandMark name={`${a.label} ${a.provider}`} size={18} className="shrink-0 text-text" />
                          <span className="truncate text-[length:var(--text-meta)] text-text">{a.label}</span>
                          <span className="ml-auto flex shrink-0 items-center gap-3 text-[length:var(--text-micro)] tabular-nums text-faint">
                            <span className="flex items-center gap-1" title="tool calls">
                              <Icon name="bolt" size={11} />
                              {a.actions}
                            </span>
                            <span className="flex items-center gap-1" title="artifacts">
                              <Icon name="file" size={11} />
                              {a.artifacts}
                            </span>
                            <span className="flex items-center gap-1" title="taste uses">
                              <Icon name="sparkle" size={11} />
                              {a.taste}
                            </span>
                          </span>
                        </div>
                        <span className="h-1.5 overflow-hidden rounded-full bg-line-soft">
                          <span
                            className="block h-full rounded-full bg-accent"
                            style={{ width: `${(a.actions / maxAgent) * 100}%` }}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </Section>

      <Section
        icon="sparkle"
        title="Taste learning"
        blurb="Signals this space has formed from your feedback, and how often agents lean on them."
      >
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          <Stat label="Signals" value={taste.total} />
          <Stat label="Confirmed" value={taste.confirmed} />
          <Stat label="Still proposed" value={taste.proposed} />
          <Stat label="Accept rate" value={`${acceptRate}%`} />
        </div>

        {taste.applications > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-[length:var(--text-micro)] uppercase tracking-wide text-faint">Applied over time</p>
            <Heatmap counts={taste.applied_by_day} tint="var(--color-good)" unit="taste use" />
          </div>
        ) : null}

        {taste.dimensions.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-[length:var(--text-micro)] uppercase tracking-wide text-faint">By dimension</p>
            <BarList rows={taste.dimensions} tint="bg-good" />
          </div>
        ) : null}

        {taste.top_applied.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-[length:var(--text-micro)] uppercase tracking-wide text-faint">Most-leaned-on signals</p>
            <ul className="flex flex-col gap-2">
              {taste.top_applied.map((s) => (
                <li key={s.label} className="flex items-start gap-2.5 text-[length:var(--text-meta)]">
                  <span className="mt-px shrink-0 rounded-[var(--radius-sm)] bg-good/15 px-1.5 py-px text-[length:var(--text-micro)] text-good">
                    {s.value}×
                  </span>
                  <span className="text-muted">{s.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      <Section icon="file" title="Latest work" blurb="The most recent artifact versions. Click through to review.">
        {stats.latest.length === 0 ? (
          <EmptyRow>Nothing produced yet</EmptyRow>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {stats.latest.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(`/workbench/${a.id}`)}
                className="group flex flex-col gap-1.5 text-left"
              >
                <ArtifactThumb html={a.preview_html} className="aspect-[4/3] w-full group-hover:border-line" />
                <p className="truncate text-[length:var(--text-micro)] text-muted">{a.title}</p>
              </button>
            ))}
          </div>
        )}
      </Section>
        </div>

        {/* right rail — the compact readouts */}
        <div className="flex flex-col gap-8 lg:sticky lg:top-20 lg:h-fit">
          <Section
            icon="check"
            title="Beta quota"
            blurb={
              quota
                ? `${quota.beta.taken}/${quota.beta.max} seats taken${
                    quota.beta.slot ? `, you're #${quota.beta.slot}` : ""
                  }. A fixed monthly budget per seat so the beta never runs up a bill. Resets on the 1st.`
                : "A fixed monthly budget per seat so the beta never runs up a bill."
            }
          >
            <ul className="flex flex-col gap-3">
              {(quota?.metrics ?? []).map((m) => {
                const used = Number.isFinite(m.used) ? m.used : 0;
                const limit = Number.isFinite(m.limit) && m.limit > 0 ? m.limit : 1;
                const pct = Math.max(0, Math.min(100, (used / limit) * 100));
                return (
                  <li key={m.metric} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2 text-[length:var(--text-meta)]">
                      <span className="text-muted">{QUOTA_LABEL[m.metric] ?? m.metric}</span>
                      <span className="text-[length:var(--text-micro)] tabular-nums text-faint">
                        {used}/{m.limit}
                      </span>
                    </div>
                    <span className="block h-1.5 w-full overflow-hidden rounded-full border border-line-soft bg-surface">
                      <span
                        className={`block h-full rounded-full ${pct >= 80 ? "bg-accent" : "bg-good"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  </li>
                );
              })}
              {!quota ? <li className="text-[length:var(--text-micro)] text-faint">Loading usage…</li> : null}
            </ul>
          </Section>

          <Section icon="wrench" title="Tool use" blurb="Which WebMCP tools get reached for.">
            {stats.tools.length === 0 ? (
              <EmptyRow>No tool calls yet</EmptyRow>
            ) : (
              <BarList rows={stats.tools} labelWidth="w-24" />
            )}
          </Section>

          <Section icon="check" title="Review outcomes" blurb="How submitted work was received.">
            {outcomes.length === 0 ? (
              <EmptyRow>Nothing reviewed yet</EmptyRow>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex h-2.5 overflow-hidden rounded-full bg-line-soft">
                  {outcomes.map((o) => (
                    <span
                      key={o.label}
                      className={OUTCOME_TONE[o.label] ?? "bg-line"}
                      style={{ width: `${(o.value / outcomeTotal) * 100}%` }}
                    />
                  ))}
                </div>
                <ul className="flex flex-col gap-1 text-[length:var(--text-micro)] text-muted">
                  {outcomes.map((o) => (
                    <li key={o.label} className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${OUTCOME_TONE[o.label] ?? "bg-line"}`} />
                      {o.label.replace(/_/g, " ")} · {o.value}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          <Section icon="folder" title="Folders" blurb="Where captured context lives.">
            {stats.folders.length === 0 ? (
              <EmptyRow>Nothing captured yet</EmptyRow>
            ) : (
              <BarList rows={stats.folders} labelWidth="w-24" />
            )}
          </Section>

          <Section icon="link" title="Sources" blurb="Hosts the material came from.">
            {stats.sources.length === 0 ? (
              <EmptyRow>No linked sources</EmptyRow>
            ) : (
              <BarList rows={stats.sources} labelWidth="w-24" />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
