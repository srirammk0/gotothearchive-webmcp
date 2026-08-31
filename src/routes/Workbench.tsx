import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { REVIEW_DECISIONS, type ReviewDecision } from "@shared/contract";
import type { Artifact } from "@shared/contract";
import { ApiError, listArtifacts } from "../api/client";
import { Button } from "../ui/primitives/Button";
import { HairlineRule } from "../ui/primitives/HairlineRule";
import { Disclosure } from "../ui/primitives/Disclosure";
import { EmptyState } from "../ui/primitives/EmptyState";
import { Spinner } from "../ui/primitives/Spinner";
import { AgentAccess } from "../ui/AgentAccess";
import { mockAgentAccess, mockAgentLens } from "../ui/mockData";
import { ArtifactViewer } from "../ui/workbench/ArtifactViewer";
import { AnnotationRail } from "../ui/workbench/AnnotationRail";
import { ProvenanceStrip } from "../ui/workbench/ProvenanceStrip";
import { useWorkbench } from "../ui/workbench/useWorkbench";

const DECISION_LABEL: Record<ReviewDecision, string> = {
  approve: "Approve",
  approve_with_notes: "Approve with notes",
  request_changes: "Request changes",
  reject: "Reject",
};

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Shown at /workbench with no id: pick an artifact to review. */
function ArtifactList() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

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

  if (status === "loading") return <Spinner label="Loading artifacts…" />;
  if (status === "error") {
    return <EmptyState title="Couldn't load artifacts" body="Something went wrong reaching the server. Try again shortly." />;
  }
  if (artifacts.length === 0) {
    return (
      <EmptyState
        title="No artifacts yet"
        body="Start a task from the Archive and an agent's work will land here for review."
      />
    );
  }
  return (
    <div className="flex flex-col gap-14">
      <header>
        <p className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.18em] text-stone">Workbench</p>
        <h1 className="mt-2 font-serif text-[length:var(--text-display)] leading-[1.05] text-ink">Artifacts</h1>
      </header>
      <ul className="flex flex-col gap-4">
        {artifacts.map((a) => (
          <li key={a.id} className="border-t border-hairline pt-4">
            <button
              type="button"
              onClick={() => navigate(`/workbench/${a.id}`)}
              className="text-left font-serif text-[length:var(--text-item)] text-ink hover:text-accent"
            >
              {a.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Workbench() {
  const { artifactId } = useParams();
  const { status, error, data, selectVersion, addAnnotation, decide } = useWorkbench(artifactId);
  const [decisionPending, setDecisionPending] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  if (!artifactId) return <ArtifactList />;

  if (status === "loading") return <Spinner label="Loading artifact…" />;

  if (status === "denied") {
    return (
      <EmptyState
        title="Access denied"
        body={error ?? "You don't currently have access to this artifact."}
      />
    );
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
    <div className="grid grid-cols-1 gap-16 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex flex-col gap-10">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.18em] text-stone">
              v{version.version_no} · {version.state.replace(/_/g, " ")}
            </p>
            <h1 className="mt-1 font-serif text-[length:var(--text-headline)] text-ink">{artifact.title}</h1>
          </div>
          <Disclosure summary="Version history" className="w-full max-w-xs sm:w-auto">
            <ul className="flex flex-col gap-2 py-2">
              {versions
                .slice()
                .reverse()
                .map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-4 font-sans text-[length:var(--text-meta)]">
                    <button
                      type="button"
                      onClick={() => selectVersion(v.id)}
                      className={`text-left hover:text-accent ${v.id === version.id ? "text-ink" : "text-stone"}`}
                    >
                      v{v.version_no} — {v.state.replace(/_/g, " ")}
                      {v.parent_version_id ? null : " (initial)"}
                    </button>
                    <span className="text-stone">{formatTime(v.created_at)}</span>
                  </li>
                ))}
            </ul>
          </Disclosure>
        </header>

        {/* Versions are immutable — no edit affordance, only view + review. */}
        <ArtifactViewer version={version} />

        <ProvenanceStrip provenance={provenance} />

        <HairlineRule />

        {/* Anchored review controls — never optimistic. */}
        <div className="flex flex-wrap items-center gap-3">
          {REVIEW_DECISIONS.map((d) => (
            <Button
              key={d}
              variant={d === "approve" ? "primary" : d === "reject" ? "danger" : "secondary"}
              disabled={decisionPending}
              onClick={() => void handleDecide(d)}
            >
              {DECISION_LABEL[d]}
            </Button>
          ))}
          {decisionPending ? <Spinner label="Recording…" /> : null}
          {decisionError ? (
            <span role="alert" className="font-sans text-[length:var(--text-meta)] text-bad">
              {decisionError}
            </span>
          ) : null}
        </div>
      </div>

      {/* Right rail: annotations + collapsible Agent Access */}
      <div className="flex flex-col gap-10">
        <AnnotationRail annotations={annotations} onAdd={(input) => void addAnnotation(input)} />

        <HairlineRule />

        {/* Agent Access is owned by another track — this slot passes through
            the shared demo view models it already renders elsewhere. */}
        <Disclosure summary="Agent Access" defaultOpen>
          <div className="pt-2">
            <AgentAccess model={mockAgentAccess} lens={mockAgentLens()} />
          </div>
        </Disclosure>
      </div>
    </div>
  );
}
