import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { motion } from "motion/react";
import { REVIEW_DECISIONS, type ArtifactState, type Region, type ReviewDecision } from "@shared/contract";
import { ApiError, listArtifacts, type WorkbenchArtifact } from "../api/client";
import { Button } from "../ui/primitives/Button";
import { EmptyState } from "../ui/primitives/EmptyState";
import { EmptyRow } from "../ui/primitives/EmptyRow";
import { Spinner } from "../ui/primitives/Spinner";
import { Icon } from "../ui/primitives/Icon";
import { useTrail } from "../ui/Breadcrumbs";
import { useSpace } from "../ui/hooks/useSpace";
import { duration, ease } from "../ui/tokens";
import { ArtifactViewer } from "../ui/workbench/ArtifactViewer";
import { ArtifactThumb } from "../ui/workbench/ArtifactThumb";
import { AnnotationRail } from "../ui/workbench/AnnotationRail";
import { ProvenanceStrip } from "../ui/workbench/ProvenanceStrip";
import { useWorkbench } from "../ui/workbench/useWorkbench";
import { useCapabilities } from "../webmcp/useCapabilities";

const DECISION_LABEL: Record<ReviewDecision, string> = {
  approve: "Approve",
  approve_with_notes: "Approve with notes",
  request_changes: "Request changes",
  reject: "Reject",
};

/** Which decision produced a given version state, so decided state reads back on the buttons. */
const STATE_DECISION: Record<string, ReviewDecision> = {
  approved: "approve",
  approved_with_notes: "approve_with_notes",
  changes_requested: "request_changes",
  rejected: "reject",
};

const STATE_STYLE: Record<ArtifactState, string> = {
  processing: "bg-hover text-muted",
  ready_for_review: "bg-hover text-text",
  in_review: "bg-hover text-text",
  approved: "bg-good/15 text-good",
  approved_with_notes: "bg-good/15 text-good",
  changes_requested: "bg-accent/15 text-accent",
  rejected: "bg-bad/15 text-bad",
};

function stateLabel(s: string): string {
  return s.replace(/_/g, " ");
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function relTime(at: number): string {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function StateBadge({ state }: { state: string }) {
  return (
    <span
      className={`shrink-0 rounded-[var(--radius-sm)] px-1.5 py-px text-[length:var(--text-micro)] ${
        STATE_STYLE[state as ArtifactState] ?? "bg-hover text-muted"
      }`}
    >
      {stateLabel(state)}
    </span>
  );
}

/** Registers page-specific review context only while an artifact is open. */
function ArtifactCapabilitySync({ taskId, artifactId, agentSessionId }: { taskId: string; artifactId: string; agentSessionId: string | null }) {
  const { refresh } = useCapabilities(taskId, artifactId);
  useEffect(() => {
    if (agentSessionId) void refresh();
  }, [agentSessionId, refresh]);
  return null;
}

function ArtifactCard({ artifact, onOpen }: { artifact: WorkbenchArtifact; onOpen: () => void }) {
  return (
    <motion.button
      layout
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base, ease }}
      className="group flex flex-col gap-2.5 text-left"
    >
      <ArtifactThumb
        html={artifact.preview_html}
        className="aspect-[4/3] w-full transition-colors duration-[var(--duration-fast)] group-hover:border-line"
      />
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 rounded-[var(--radius-sm)] bg-accent/15 px-1.5 py-px text-[length:var(--text-micro)] text-accent">
            Agent
          </span>
          <p className="truncate text-[length:var(--text-meta)] text-text">{artifact.title}</p>
        </div>
        <div className="flex items-center gap-2 text-[length:var(--text-micro)] text-faint">
          <StateBadge state={artifact.state} />
          <span>
            v{artifact.version_count} · {artifact.influence_count} refs · {relTime(artifact.updated_at)}
          </span>
        </div>
      </div>
    </motion.button>
  );
}

/** Shown at /workbench with no id: artifacts grouped by the folder that shaped them. */
function ArtifactList({ regions }: { regions: Region[] }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [artifacts, setArtifacts] = useState<WorkbenchArtifact[]>([]);

  useTrail([{ label: "Workbench" }]);

  useEffect(() => {
    let cancelled = false;
    listArtifacts()
      .then(({ artifacts: loaded }) => {
        if (!cancelled) {
          setArtifacts(loaded);
          setStatus("ready");
        }
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    const nameBySlug = new Map(regions.map((r) => [r.slug, r.name]));
    const bucket = new Map<string, { name: string; items: WorkbenchArtifact[] }>();
    for (const a of artifacts) {
      const slugs = a.regions.length ? a.regions : ["_none"];
      for (const slug of slugs) {
        const name = slug === "_none" ? "Not yet attributed" : (nameBySlug.get(slug) ?? slug);
        if (!bucket.has(slug)) bucket.set(slug, { name, items: [] });
        bucket.get(slug)!.items.push(a);
      }
    }
    return [...bucket.values()].sort((x, y) => x.name.localeCompare(y.name));
  }, [artifacts, regions]);

  if (status === "loading") return <Spinner label="Loading artifacts…" />;
  if (status === "error") {
    return (
      <EmptyState title="Couldn't load artifacts" body="Something went wrong reaching the server. Try again shortly." />
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[length:var(--text-display)] leading-tight text-text">Workbench</h1>
          <p className="mt-1 text-[length:var(--text-meta)] text-faint">
            {artifacts.length} {artifacts.length === 1 ? "artifact" : "artifacts"} · grouped by source folder
          </p>
        </div>
      </header>

      {artifacts.length === 0 ? (
        <EmptyState
          title="No artifacts yet"
          body="Start a task from the Archive and an agent's work lands here for review."
        />
      ) : (
        groups.map((g) => (
          <section key={g.name} className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-4 border-b border-line-soft pb-2.5">
              <h2 className="text-[length:var(--text-headline)] text-text">{g.name}</h2>
              <span className="text-[length:var(--text-micro)] text-faint">{g.items.length}</span>
            </div>
            {g.items.length === 0 ? (
              <EmptyRow />
            ) : (
              <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((a) => (
                  <ArtifactCard key={`${g.name}-${a.id}`} artifact={a} onOpen={() => navigate(`/workbench/${a.id}`)} />
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}

export function Workbench() {
  const { artifactId } = useParams();
  const { regions, agentSessionId } = useSpace();
  const { status, error, data, selectVersion, addAnnotation, decide } = useWorkbench(artifactId);
  const [decisionPending, setDecisionPending] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  useTrail(
    artifactId
      ? [{ label: "Workbench", to: "/workbench" }, { label: data?.artifact.title ?? "Artifact" }]
      : [{ label: "Workbench" }],
  );

  if (!artifactId) return <ArtifactList regions={regions} />;

  if (status === "loading") return <Spinner label="Loading artifact…" />;

  if (status === "denied") {
    return <EmptyState title="Access denied" body={error ?? "You don't currently have access to this artifact."} />;
  }

  if (status === "error" || !data) {
    return (
      <EmptyState
        title="Couldn't load this artifact"
        body={error ?? "Something went wrong reaching the server. Try again shortly."}
      />
    );
  }

  const { artifact, version, versions, provenance, annotations } = data;

  const handleDecide = async (decision: ReviewDecision) => {
    setDecisionPending(true);
    setDecisionError(null);
    try {
      await decide(decision);
    } catch (e) {
      setDecisionError(e instanceof ApiError ? e.message : "Couldn't record that decision. Try again.");
    } finally {
      setDecisionPending(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-7">
      <ArtifactCapabilitySync taskId={artifact.task_id} artifactId={artifact.id} agentSessionId={agentSessionId} />
        <header className="flex flex-col gap-4">
          <div className="min-w-0">
            <h1 className="text-[length:var(--text-display)] leading-tight text-text">{artifact.title}</h1>
            <p className="mt-1 text-[length:var(--text-meta)] text-faint">
              Viewing v{version.version_no} of {versions.length} · {stateLabel(version.state)}
            </p>
          </div>

          {/* Every version is a reviewable variant — pick one, then decide on it. */}
          {versions.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {versions.map((v) => {
                const active = v.id === version.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => selectVersion(v.id)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-[length:var(--text-micro)] transition-colors duration-[var(--duration-fast)] ${
                      active ? "border-line bg-surface text-text" : "border-line-soft text-muted hover:border-line hover:text-text"
                    }`}
                  >
                    <span>v{v.version_no}</span>
                    <StateBadge state={v.state} />
                    <span className="text-faint">{formatTime(v.created_at)}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </header>

        {/* Versions are immutable — no edit affordance, only view + review. */}
        <ArtifactViewer
          version={version}
          annotations={annotations}
          onAddRegion={(target, comment) =>
            void addAnnotation({ sentiment: "neutral", comment, dimension: null, target })
          }
          onAddComment={(comment) => void addAnnotation({ sentiment: "neutral", comment, dimension: null })}
        />

        <AnnotationRail annotations={annotations} />

        <details className="border-t border-line-soft pt-3">
          <summary className="cursor-pointer text-[length:var(--text-meta)] text-muted hover:text-text">Context & access</summary>
          <div className="pt-4">
            <ProvenanceStrip provenance={provenance} />
          </div>
        </details>

        {/* Anchored review controls — never optimistic. Primary decision leads,
            reject sits at the trailing edge with equal button weight so it
            reads as a fourth option, not an alarm next to a form. */}
        <div className="sticky bottom-4 flex flex-col gap-2 rounded-[var(--radius-md)] border border-line bg-surface/90 px-3 py-2.5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-2">
            {REVIEW_DECISIONS.map((d) => {
              const decided = STATE_DECISION[version.state] === d;
              return (
                <Button
                  key={d}
                  variant={decided ? "primary" : d === "reject" ? "danger" : "secondary"}
                  disabled={decisionPending}
                  onClick={() => void handleDecide(d)}
                  className={d === "reject" ? "ml-auto" : undefined}
                >
                  {decided ? <Icon name="check" size={13} /> : null}
                  {DECISION_LABEL[d]}
                </Button>
              );
            })}
            {decisionPending ? <Spinner label="Recording…" /> : null}
          </div>
          {decisionError ? (
            <span role="alert" className="text-[length:var(--text-meta)] text-bad">
              {decisionError}
            </span>
          ) : STATE_DECISION[version.state] ? (
            <span className="text-[length:var(--text-meta)] text-good">
              {version.state.replace(/_/g, " ")} — v{version.version_no}
            </span>
          ) : null}
        </div>
    </div>
  );
}
