import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { getStats, getQuota, type QuotaInfo, type SpaceStats } from "../api/client";
import { EmptyState } from "../ui/primitives/EmptyState";
import { EmptyRow } from "../ui/primitives/EmptyRow";
import { Spinner } from "../ui/primitives/Spinner";
import { Icon, type IconName } from "../ui/primitives/Icon";
import { ArtifactThumb } from "../ui/workbench/ArtifactThumb";
import { useTrail } from "../ui/Breadcrumbs";

const DAY = 86_400_000;
const WEEKS = 14;

/**
 * Monochrome logo for an agent product that connects over WebMCP.
 *
 * SVG glyphs only — no image assets to ship, decode, or 404. Matched by a loose
 * substring on the declared client / provider; unknown agents get a terminal mark.
 * Marks are the official OpenAI and Anthropic ones (via reicon.dev), drawn in
 * `currentColor` so they sit in the surrounding text colour on either theme.
 */
const BRAND_MARKS: { label: string; match: RegExp; viewBox: string; path: string }[] = [
  {
    label: "ChatGPT",
    match: /openai|chatgpt|\bgpt\b/i,
    viewBox: "0 0 256 260",
    path: "M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z",
  },
  {
    label: "Claude",
    match: /anthropic|claude/i,
    viewBox: "0 0 24 24",
    path: "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z",
  },
];

function BrandMark({ name, size = 16, className = "" }: { name: string; size?: number; className?: string }) {
  const mark = BRAND_MARKS.find((m) => m.match.test(name));
  if (mark) {
    return (
      <svg width={size} height={size} viewBox={mark.viewBox} fill="currentColor" aria-label={mark.label} className={className}>
        <path d={mark.path} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M7 9l3 3-3 3M13 15h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
    const label = fmt.format(new Date(`${cell.key}T00:00:00`));
    return `${label} — ${cell.n} ${unit}${cell.n === 1 ? "" : "s"}`;
  };

  const [hover, setHover] = useState<{ text: string; x: number; y: number } | null>(null);

  return (
    <div className="relative overflow-x-auto pb-1">
      <div className="flex gap-[3px]" onMouseLeave={() => setHover(null)}>
        {cols.map((col, w) => (
          <div key={w} className="flex flex-col gap-[3px]">
            {col.map((cell) => (
              <div
                key={cell.key}
                className="h-3 w-3 rounded-[2px]"
                style={{ background: shade(cell.n, cell.future) }}
                onMouseEnter={(e) =>
                  !cell.future && setHover({ text: tip(cell), x: e.clientX, y: e.clientY })
                }
                onMouseMove={(e) =>
                  !cell.future && setHover({ text: tip(cell), x: e.clientX, y: e.clientY })
                }
              />
            ))}
          </div>
        ))}
      </div>
      {hover ? (
        <span
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[var(--radius-sm)] bg-text px-2 py-1 text-micro text-canvas shadow-sm"
          style={{ left: hover.x, top: hover.y - 8 }}
        >
          {hover.text}
        </span>
      ) : null}
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
          <span className={`${labelWidth} shrink-0 truncate text-meta text-muted`}>{r.label}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-soft">
            <span className={`block h-full rounded-full ${tint}`} style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="w-7 shrink-0 text-right text-micro tabular-nums text-faint">
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
          <h2 className="text-headline text-text">{title}</h2>
          <p className="text-meta text-faint">{blurb}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-display leading-none tabular-nums text-text">{value}</span>
      <span className="text-micro uppercase tracking-wide text-faint">{label}</span>
    </div>
  );
}

const QUOTA_LABEL: Record<string, string> = {
  agent_calls: "Agent tool calls",
  uploads: "File uploads",
  artifacts: "Artifacts generated",
  vision_calls: "Design extractions",
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
    // A same-tab mutation (e.g. deleting an artifact refunds quota) should
    // reflect here right away, not wait for the 30s poll.
    window.addEventListener("api:mutated", refresh);
    const poll = window.setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("api:mutated", refresh);
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
          <h1 className="text-display leading-tight text-text">Stats</h1>
          <p className="mt-1 max-w-prose text-meta leading-relaxed text-faint">
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
              <p className="mb-3 text-micro uppercase tracking-wide text-faint">Agents</p>
              {agents.length === 0 ? (
                <p className="text-meta text-faint">No client has run identify_agent yet.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {agents.map((a) => {
                    return (
                      <li key={a.label} className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2.5">
                          <BrandMark name={`${a.label} ${a.provider}`} size={18} className="shrink-0 text-text" />
                          <span className="truncate text-meta text-text">{a.label}</span>
                          <span className="ml-auto flex shrink-0 items-center gap-3 text-micro tabular-nums text-faint">
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
            <p className="text-micro uppercase tracking-wide text-faint">Applied over time</p>
            <Heatmap counts={taste.applied_by_day} tint="var(--color-good)" unit="taste use" />
          </div>
        ) : null}

        {taste.dimensions.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-micro uppercase tracking-wide text-faint">By dimension</p>
            <BarList rows={taste.dimensions} tint="bg-good" />
          </div>
        ) : null}

        {taste.top_applied.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-micro uppercase tracking-wide text-faint">Most-leaned-on signals</p>
            <ul className="flex flex-col gap-2">
              {taste.top_applied.map((s) => (
                <li key={s.label} className="flex items-start gap-2.5 text-meta">
                  <span className="mt-px shrink-0 rounded-[var(--radius-sm)] bg-good/15 px-1.5 py-px text-micro text-good">
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
                <p className="truncate text-micro text-muted">{a.title}</p>
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
                    <div className="flex items-baseline justify-between gap-2 text-meta">
                      <span className="text-muted">{QUOTA_LABEL[m.metric] ?? m.metric}</span>
                      <span className="text-micro tabular-nums text-faint">
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
              {!quota ? <li className="text-micro text-faint">Loading usage…</li> : null}
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
                <ul className="flex flex-col gap-1 text-micro text-muted">
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
