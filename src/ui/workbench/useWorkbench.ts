import { useCallback, useEffect, useState } from "react";
import type { Annotation, Artifact, ArtifactVersion, ReviewDecision } from "@shared/contract";
import {
  ApiError,
  createAnnotation,
  getArtifact,
  getProvenance,
  listAnnotations,
  recordDecision,
  updateAnnotation,
  type Provenance,
} from "../../api/client";

export interface WorkbenchData {
  artifact: Artifact;
  versions: ArtifactVersion[];
  version: ArtifactVersion;
  provenance: Provenance;
  annotations: Annotation[];
}

type Status = "loading" | "error" | "denied" | "ready";

/** Loads one artifact + its current version's provenance and annotations. */
export function useWorkbench(artifactId: string | undefined) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<WorkbenchData | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const load = useCallback(
    async (versionOverride?: string, opts?: { silent?: boolean }) => {
      if (!artifactId) {
        setStatus("ready");
        setData(null);
        return;
      }
      if (!opts?.silent) setStatus("loading");
        setError(null);
      try {
        const { artifact, versions } = await getArtifact(artifactId);
        const sorted = versions.slice();
        // oxlint-disable-next-line unicorn/no-array-sort -- sorted is a fresh copy
        sorted.sort((a, b) => a.version_no - b.version_no);
        const target = versionOverride ? sorted.find((v) => v.id === versionOverride) : undefined;
        const current = target ?? sorted[sorted.length - 1];
        if (!current) throw new ApiError("This artifact has no versions", 404);
        const [{ provenance }, { annotations }] = await Promise.all([
          getProvenance(current.id),
          listAnnotations(current.id),
        ]);
        setData({ artifact, versions: sorted, version: current, provenance, annotations });
        setSelectedVersionId(current.id);
        setStatus("ready");
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) {
          setStatus("denied");
          setError(e.message);
          return;
        }
        setStatus("error");
        setError(e instanceof Error ? e.message : "Something went wrong loading this artifact.");
      }
    },
    [artifactId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const selectVersion = useCallback(
    (versionId: string) => {
      void load(versionId);
    },
    [load],
  );

  /** Annotations render optimistically; comment creation is low-risk per product spec. */
  const addAnnotation = useCallback(
    async (input: {
      sentiment: Annotation["sentiment"];
      comment: string;
      target?: Annotation["target"];
    }) => {
      if (!data) return;
      const target = input.target ?? null;
      const optimistic: Annotation = {
        id: `optimistic_${crypto.randomUUID()}`,
        version_id: data.version.id,
        author_id: "me",
        target,
        sentiment: input.sentiment,
        dimensions: [],
        comment: input.comment,
        status: "open",
        created_at: Date.now(),
      };
      setData((prev) => (prev ? { ...prev, annotations: [...prev.annotations, optimistic] } : prev));
      try {
        await createAnnotation({
          version_id: data.version.id,
          sentiment: input.sentiment,
          comment: input.comment,
          target,
        });
        const { annotations } = await listAnnotations(data.version.id);
        setData((prev) => (prev ? { ...prev, annotations } : prev));
      } catch {
        // Roll back the optimistic entry; the persisted list is the source of truth.
        setData((prev) =>
          prev ? { ...prev, annotations: prev.annotations.filter((a) => a.id !== optimistic.id) } : prev,
        );
      }
    },
    [data],
  );

  const editAnnotation = useCallback(
    async (
      id: string,
      changes: { comment?: string; sentiment?: Annotation["sentiment"] },
    ) => {
      if (!data) return;
      await updateAnnotation(id, changes);
      const { annotations } = await listAnnotations(data.version.id);
      setData((prev) => (prev ? { ...prev, annotations } : prev));
    },
    [data],
  );

  /**
   * Decisions are never optimistic. After the state lands, silently re-pull the
   * whole artifact so the version badges, provenance, and any promoted item all
   * reflect the new state without a spinner or a manual refresh.
   */
  const decide = useCallback(
    async (decision: ReviewDecision, note?: string) => {
      if (!data) return;
      const viewing = data.version.id;
      await recordDecision(viewing, decision, note);
      await load(viewing, { silent: true });
    },
    [data, load],
  );

  return { status, error, data, selectedVersionId, selectVersion, addAnnotation, editAnnotation, decide, reload: load };
}
