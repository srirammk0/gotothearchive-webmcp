import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { getStats, type SpaceStats } from "../api/client";
import { EmptyState } from "../ui/primitives/EmptyState";
import { EmptyRow } from "../ui/primitives/EmptyRow";
import { Spinner } from "../ui/primitives/Spinner";
import { ArtifactThumb } from "../ui/workbench/ArtifactThumb";
import { useTrail } from "../ui/Breadcrumbs";

const DAY = 86_400_000;
const WEEKS = 14;

/** GitHub-style contribution grid of agent actions over the last ~14 weeks. */
function Heatmap({ counts }: { counts: Record<string, number> }) {
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
    if (t <= 0.25) return "color-mix(in srgb, var(--color-accent) 25%, var(--color-line-soft))";
    if (t <= 0.5) return "color-mix(in srgb, var(--color-accent) 50%, var(--color-line-soft))";
    if (t <= 0.75) return "color-mix(in srgb, var(--color-accent) 75%, var(--color-line-soft))";
    return "var(--color-accent)";
  };

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1">
        {cols.map((col, w) => (
          <div key={w} className="flex flex-col gap-1">
            {col.map((cell) => (
              <div
                key={cell.key}
                title={`${cell.key}: ${cell.n} action${cell.n === 1 ? "" : "s"}`}
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

function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-[length:var(--text-meta)] text-muted">{r.label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-line-soft">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="w-8 shrink-0 text-right text-[length:var(--text-micro)] text-faint">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-line-soft bg-surface p-5">
      <h2 className="text-[length:var(--text-headline)] text-text">{title}</h2>
      {children}
    </section>
  );
}

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

  useTrail([{ label: "Stats" }]);

  useEffect(() => {
    let cancelled = false;
    getStats()
      .then(({ stats: s }) => {
        if (cancelled) return;
        setStats(s);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loading") return <Spinner label="Reading the trail…" />;
  if (status === "error" || !stats) {
    return <EmptyState title="Couldn't load stats" body="Something went wrong reaching the server. Try again shortly." />;
  }

  const { totals, agents, outcomes } = stats;
  const outcomeTotal = Math.max(1, outcomes.reduce((n, o) => n + o.value, 0));
  const maxAgent = Math.max(1, ...agents.map((a) => a.actions));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-[length:var(--text-display)] leading-tight text-text">Stats</h1>
        <p className="mt-1 text-[length:var(--text-meta)] text-faint">
          How agents have been using this space — {totals.actions} logged action{totals.actions === 1 ? "" : "s"} ·{" "}
          {totals.items} items · {totals.artifacts} artifacts
        </p>
      </header>

      <Panel title="Agent activity">
        {totals.actions === 0 ? (
          <EmptyRow>No agent activity logged yet</EmptyRow>
        ) : (
          <Heatmap counts={stats.activity_by_day} />
        )}
      </Panel>

      <Panel title="Agents using your taste">
        {agents.length === 0 ? (
          <EmptyRow>No agent has identified itself yet</EmptyRow>
        ) : (
          <ul className="flex flex-col gap-4">
            {agents.map((a) => (
              <li key={a.label} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[length:var(--text-meta)] text-text">
                    {a.label}
                    {a.provider ? (
                      <span className="ml-1.5 text-[length:var(--text-micro)] text-faint">{a.provider}</span>
                    ) : null}
                  </span>
                  <span className="text-[length:var(--text-micro)] text-faint">
                    {a.actions} actions · {a.artifacts} artifacts · {a.taste} taste uses
                  </span>
                </div>
                <span className="h-2 overflow-hidden rounded-full bg-line-soft">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${(a.actions / maxAgent) * 100}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Most-used folders">
          {stats.folders.length === 0 ? <EmptyRow>Nothing captured yet</EmptyRow> : <BarList rows={stats.folders} />}
        </Panel>
        <Panel title="Top sources">
          {stats.sources.length === 0 ? <EmptyRow>No linked sources yet</EmptyRow> : <BarList rows={stats.sources} />}
        </Panel>
        <Panel title="Tool use">
          {stats.tools.length === 0 ? <EmptyRow>No tool calls logged yet</EmptyRow> : <BarList rows={stats.tools} />}
        </Panel>
        <Panel title="Review outcomes">
          {outcomes.length === 0 ? (
            <EmptyRow>No artifacts reviewed yet</EmptyRow>
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
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--text-micro)] text-muted">
                {outcomes.map((o) => (
                  <li key={o.label} className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${OUTCOME_TONE[o.label] ?? "bg-line"}`} />
                    {o.label.replace(/_/g, " ")} · {o.value}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Latest work">
        {stats.latest.length === 0 ? (
          <EmptyRow>Nothing produced yet</EmptyRow>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
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
      </Panel>
    </div>
  );
}
