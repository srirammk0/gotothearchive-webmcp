import { useMemo, useState } from "react";
import { REVIEW_DECISIONS, type ReviewDecision } from "@shared/contract";
import { Button } from "../ui/primitives/Button";
import { HairlineRule } from "../ui/primitives/HairlineRule";
import { Disclosure } from "../ui/primitives/Disclosure";
import { EmptyState } from "../ui/primitives/EmptyState";
import { AgentAccess } from "../ui/AgentAccess";
import { mockAgentAccess, mockAgentLens, mockWorkbench } from "../ui/mockData";

const DECISION_LABEL: Record<ReviewDecision, string> = {
  approve: "Approve",
  approve_with_notes: "Approve with notes",
  request_changes: "Request changes",
  reject: "Reject",
};

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function Workbench() {
  const model = useMemo(() => mockWorkbench(), []);
  const lens = useMemo(() => mockAgentLens(), []);
  const [decisionSent, setDecisionSent] = useState<ReviewDecision | null>(null);

  if (!model.artifact) {
    return (
      <EmptyState
        title="No artifact open"
        body="Start a task from the Archive, or open an artifact awaiting review, and it will appear here."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-16 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex flex-col gap-10">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.18em] text-stone">
              v{model.version.version_no} · {model.state.replace(/_/g, " ")}
            </p>
            <h1 className="mt-1 font-serif text-[length:var(--text-headline)] text-ink">{model.artifact.title}</h1>
          </div>
          <Disclosure summary="Version history" className="w-full max-w-xs sm:w-auto">
            <ul className="flex flex-col gap-2 py-2">
              {model.versions
                .slice()
                .reverse()
                .map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-4 font-sans text-[length:var(--text-meta)]">
                    <span className={v.id === model.version.id ? "text-ink" : "text-stone"}>
                      v{v.version_no} — {v.state.replace(/_/g, " ")}
                    </span>
                    <span className="text-stone">{formatTime(v.created_at)}</span>
                  </li>
                ))}
            </ul>
          </Disclosure>
        </header>

        {/* Artifact viewer */}
        <article
          className="border border-hairline bg-paper-raised p-8 font-serif text-[length:var(--text-body)] leading-relaxed text-ink"
          // ponytail: mock content is trusted first-party data, not user HTML — real fetch layer must sanitize before this dangerouslySetInnerHTML stays safe
          dangerouslySetInnerHTML={{ __html: model.version.content_html }}
        />

        {/* Provenance strip — three groups, never merged */}
        <div className="flex flex-col gap-6 border-t border-hairline pt-6 sm:flex-row sm:gap-10">
          <div className="flex-1">
            <p className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.14em] text-stone">
              Used these references
            </p>
            <ul className="mt-2 flex flex-col gap-1 font-sans text-[length:var(--text-meta)] text-ink">
              {model.provenance.influences.length === 0 ? (
                <li className="text-stone">None</li>
              ) : (
                model.provenance.influences.map((inf) => (
                  <li key={inf.id}>
                    {inf.item?.title ?? "Unknown item"} <span className="text-stone">— {inf.role}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="flex-1">
            <p className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.14em] text-stone">
              Accessed for this task
            </p>
            <ul className="mt-2 flex flex-col gap-1 font-sans text-[length:var(--text-meta)] text-ink">
              {model.provenance.accesses.length === 0 ? (
                <li className="text-stone">None</li>
              ) : (
                model.provenance.accesses.map((acc) => (
                  <li key={acc.id}>{acc.item?.title ?? "Unknown item"}</li>
                ))
              )}
            </ul>
          </div>
          <div className="flex-1">
            <p className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.14em] text-stone">
              Unavailable or denied
            </p>
            <ul className="mt-2 flex flex-col gap-1 font-sans text-[length:var(--text-meta)] text-bad">
              {model.provenance.denials.length === 0 ? (
                <li className="text-stone">None</li>
              ) : (
                model.provenance.denials.map((d) => <li key={d.id}>{d.reason}</li>)
              )}
            </ul>
          </div>
        </div>

        <HairlineRule />

        {/* Anchored review controls */}
        <div className="flex flex-wrap items-center gap-3">
          {REVIEW_DECISIONS.map((d) => (
            <Button
              key={d}
              variant={d === "approve" ? "primary" : d === "reject" ? "danger" : "secondary"}
              onClick={() => setDecisionSent(d)}
            >
              {DECISION_LABEL[d]}
            </Button>
          ))}
          {decisionSent ? (
            <span role="status" className="font-sans text-[length:var(--text-meta)] text-good">
              Recorded: {DECISION_LABEL[decisionSent]}
            </span>
          ) : null}
        </div>
      </div>

      {/* Right rail: annotations + collapsible Agent Access */}
      <div className="flex flex-col gap-10">
        <section aria-label="Annotations" className="flex flex-col gap-4">
          <p className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.14em] text-stone">
            Annotations
          </p>
          {model.annotations.length === 0 ? (
            <EmptyState title="No annotations yet" body="Select part of the artifact to leave one." />
          ) : (
            <ul className="flex flex-col gap-4">
              {model.annotations.map((a) => (
                <li key={a.id} className="border-t border-hairline pt-3">
                  <p className="font-sans text-[length:var(--text-meta)] text-stone">
                    {a.sentiment === "positive" ? "+ " : a.sentiment === "negative" ? "− " : "· "}
                    {a.dimension ?? "general"} · {a.status}
                  </p>
                  <p className="mt-1 font-sans text-[length:var(--text-body)] text-ink">{a.comment}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <HairlineRule />

        <Disclosure summary="Agent Access" defaultOpen>
          <div className="pt-2">
            <AgentAccess model={mockAgentAccess} lens={lens} />
          </div>
        </Disclosure>
      </div>
    </div>
  );
}
