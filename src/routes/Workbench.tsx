import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { motion } from "motion/react";
import { REVIEW_DECISIONS, type ArtifactState, type Region, type ReviewDecision } from "@shared/contract";
import { ApiError, deleteArtifact, listArtifacts, type WorkbenchArtifact } from "../api/client";
import { Button } from "../ui/primitives/Button";
import { Modal } from "../ui/primitives/Modal";
import { EmptyState } from "../ui/primitives/EmptyState";
import { EmptyRow } from "../ui/primitives/EmptyRow";
import { Spinner } from "../ui/primitives/Spinner";
import { Icon } from "../ui/primitives/Icon";
import { useTrail } from "../ui/Breadcrumbs";
import { useAsync } from "../ui/hooks/useAsync";
import { useSpace } from "../ui/hooks/useSpace";
import { duration, ease } from "../ui/tokens";
import { ArtifactViewer } from "../ui/workbench/ArtifactViewer";
import { ArtifactThumb } from "../ui/workbench/ArtifactThumb";
import { AnnotationRail } from "../ui/workbench/AnnotationRail";
import { ProvenanceStrip } from "../ui/workbench/ProvenanceStrip";
import { Disclosure } from "../ui/primitives/Disclosure";
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
      className={`shrink-0 rounded-[var(--radius-sm)] px-1.5 py-px text-micro ${
        STATE_STYLE[state as ArtifactState] ?? "bg-hover text-muted"
      }`}
    >
      {stateLabel(state)}
    </span>
  );
}

/** Invisible: keeps the open artifact's review tools (trace_artifact_influences) in the WebMCP surface. */
function ArtifactCapabilitySync({ taskId, artifactId }: { taskId: string; artifactId: string }) {
  useCapabilities(taskId, artifactId);
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
          <span className="shrink-0 rounded-[var(--radius-sm)] bg-accent/15 px-1.5 py-px text-micro text-accent">
            Agent
          </span>
          <p className="truncate text-meta text-text">{artifact.title}</p>
        </div>
        <div className="flex items-center gap-2 text-micro text-faint">
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
  const { status, data } = useAsync(() => listArtifacts().then((r) => r.artifacts), [], "");
  const artifacts = data ?? [];

  useTrail([{ label: "Workbench" }]);

  // An artifact belongs to exactly one folder (its region_id, set once at
  // creation — see worker/mcp.ts's record_artifact), so this groups into
  // exactly one bucket per artifact, never more.
  const groups = useMemo(() => {
    const nameById = new Map(regions.map((r) => [r.id, r.name]));
    const bucket = new Map<string, { name: string; items: WorkbenchArtifact[] }>();
    for (const a of artifacts) {
      const key = a.region_id ?? "_none";
      const name = a.region_id ? (nameById.get(a.region_id) ?? "Unknown folder") : "Not yet attributed";
      if (!bucket.has(key)) bucket.set(key, { name, items: [] });
      bucket.get(key)!.items.push(a);
    }
    const regionGroups = [...bucket.values()];
    // oxlint-disable-next-line unicorn/no-array-sort -- regionGroups is a fresh local array
    regionGroups.sort((x, y) => x.name.localeCompare(y.name));
    return regionGroups;
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
          <h1 className="text-display leading-tight text-text">Workbench</h1>
          <p className="mt-1 text-meta text-faint">
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
              <h2 className="text-headline text-text">{g.name}</h2>
              <span className="text-micro text-faint">{g.items.length}</span>
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
  const navigate = useNavigate();
  const { regions } = useSpace();
  const { status, error, data, selectVersion, addAnnotation, editAnnotation, decide } = useWorkbench(artifactId);
  const [decisionPending, setDecisionPending] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  // An open artifact gets a back link above its own title instead of a breadcrumb.
  useTrail(artifactId ? null : [{ label: "Workbench" }]);

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

  const handleDelete = async () => {
    setDeletePending(true);
    try {
      await deleteArtifact(artifact.id);
      navigate("/workbench", { replace: true });
    } catch (e) {
      setDecisionError(e instanceof ApiError ? e.message : "Couldn't delete that artifact.");
      setDeletePending(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-7">
        <ArtifactCapabilitySync taskId={artifact.task_id} artifactId={artifact.id} />
        <header className="flex flex-col gap-4">
          <Link
            to="/workbench"
            className="-ml-1 -mb-1 inline-flex w-fit items-center gap-1 rounded-[var(--radius-sm)] px-1 py-0.5 text-meta text-faint transition-colors duration-[var(--duration-fast)] hover:text-text"
          >
            <Icon name="chevronRight" size={14} className="rotate-180" />
            Back
          </Link>
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div>
            <h1 className="text-display leading-tight text-text">{artifact.title}</h1>
            <p className="mt-1 text-meta text-faint">
              Viewing v{version.version_no} of {versions.length} · {stateLabel(version.state)}
            </p>
            </div>
            <button type="button" aria-label="Delete artifact" onClick={() => setDeleteOpen(true)} className="mt-1 rounded-[var(--radius-sm)] p-1.5 text-faint hover:bg-hover hover:text-bad">
              <Icon name="trash" size={15} />
            </button>
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
                    className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-micro transition-colors duration-[var(--duration-fast)] ${
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
          onAddRegion={(target, { comment, sentiment }) =>
            void addAnnotation({ sentiment, comment, target })
          }
          onAddComment={({ comment, sentiment }) =>
            void addAnnotation({ sentiment, comment })
          }
        />

        <AnnotationRail annotations={annotations} onEdit={editAnnotation} />

        <Disclosure className="border-t border-line-soft pt-1" summary="Context & access">
          <div className="pt-3">
            <ProvenanceStrip provenance={provenance} />
          </div>
        </Disclosure>

        {/* A compact decision strip keeps the artifact—not review chrome—primary. */}
        <div className="sticky bottom-4 z-10 flex w-fit max-w-full self-center rounded-[var(--radius-md)] border border-line bg-surface/90 p-1.5 shadow-lg shadow-black/5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {REVIEW_DECISIONS.map((d) => {
              const decided = STATE_DECISION[version.state] === d;
              return (
                <Button
                  key={d}
                  variant={decided ? "primary" : d === "reject" ? "danger" : "secondary"}
                  disabled={decisionPending}
                  onClick={() => void handleDecide(d)}
                >
                  {decided ? <Icon name="check" size={13} /> : null}
                  {DECISION_LABEL[d]}
                </Button>
              );
            })}
            {decisionPending ? <Spinner label="Recording…" /> : null}
          </div>
          {decisionError ? (
            <span role="alert" className="sr-only text-meta text-bad">
              {decisionError}
            </span>
          ) : null}
        </div>
        {version.state === "changes_requested" ? (
          <p className="self-center text-meta text-muted">
            Changes requested — the agent can read these notes via trace_artifact_influences and submit v
            {version.version_no + 1}.
          </p>
        ) : null}
        <Modal open={deleteOpen} onClose={() => !deletePending && setDeleteOpen(false)} title="Delete artifact">
          <div className="flex flex-col gap-4">
            <p className="text-body leading-relaxed text-muted">Delete “{artifact.title}” and its version history? This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={deletePending} onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button variant="danger" disabled={deletePending} onClick={() => void handleDelete()}>{deletePending ? "Deleting…" : "Delete artifact"}</Button>
            </div>
          </div>
        </Modal>
    </div>
  );
}
