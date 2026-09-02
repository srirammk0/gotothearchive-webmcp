import type {
  MemoryDocumentRef,
  MemoryFileInput,
  MemoryIndex,
  MemoryMetadata,
  MemoryRequestOptions,
  MemorySearchDocument,
  MemorySearchHit,
  MemorySearchInput,
  MemorySearchResult,
  MemoryTextInput,
} from "./memory-index";

const DEFAULT_BASE_URL = "https://api.supermemory.ai";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_SEARCH_LIMIT = 100;

export interface SupermemoryConfig {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface RequestSignal {
  signal: AbortSignal;
  abortPromise: Promise<never>;
  dispose: () => void;
}

type JsonResponse = Record<string, unknown>;

function isRecord(value: unknown): value is JsonResponse {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseMetadata(value: unknown): MemoryMetadata {
  if (!isRecord(value)) return {};
  const metadata: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === "string" ||
      typeof item === "number" && Number.isFinite(item) ||
      typeof item === "boolean"
    ) {
      metadata[key] = item;
    }
  }
  return metadata;
}

function parseDocumentRef(value: unknown): MemoryDocumentRef | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.status !== "string") {
    return null;
  }
  return { id: value.id, status: value.status };
}

function parseSearchDocument(value: unknown): MemorySearchDocument | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  if (!id) return null;
  return {
    id,
    createdAt: stringOrNull(value.createdAt),
    updatedAt: stringOrNull(value.updatedAt),
    title: stringOrNull(value.title),
    type: stringOrNull(value.type),
    metadata: parseMetadata(value.metadata),
    summary: stringOrNull(value.summary),
  };
}

function firstSearchDocument(value: unknown): MemorySearchDocument | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const document = parseSearchDocument(item);
    if (document) return document;
  }
  return null;
}

function parseSearchResult(value: unknown): MemorySearchResult | null {
  if (!isRecord(value) || !Array.isArray(value.results)) return null;
  const hits: MemorySearchHit[] = [];

  for (const resultValue of value.results) {
    if (!isRecord(resultValue)) continue;
    const id = nonEmptyString(resultValue.id);
    const content = stringOrNull(resultValue.chunk);
    const document = firstSearchDocument(resultValue.documents);
    if (!id || content === null || !document) continue;
    const similarity = finiteNumberOrNull(resultValue.similarity);
    const filepath = stringOrNull(resultValue.filepath);
    hits.push({
      id,
      documentId: document.id,
      content,
      position: null,
      similarity,
      filepath,
      document,
    });
  }

  const timingMs = finiteNumberOrNull(value.timing);
  const total = finiteNumberOrNull(value.total);
  if (timingMs === null || total === null) return null;
  return { hits, timingMs, total };
}

function jsonBody(input: Record<string, unknown>): string {
  return JSON.stringify(input);
}

function addIfDefined(target: Record<string, unknown>, key: string, value: string | undefined): void {
  if (value !== undefined) target[key] = value;
}

function addFormValue(form: FormData, key: string, value: string | undefined): void {
  if (value !== undefined) form.append(key, value);
}

function addJsonFormValue(form: FormData, key: string, value: MemoryMetadata | undefined): void {
  if (value !== undefined) form.append(key, JSON.stringify(value));
}

function makeRequestSignal(parent: AbortSignal | undefined, timeoutMs: number): RequestSignal | null {
  if (parent?.aborted) return null;
  const controller = new AbortController();
  let rejectAbort: (reason?: unknown) => void;
  const abortPromise = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => {
    controller.abort();
    rejectAbort(new Error("request aborted"));
  };
  parent?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    controller.abort();
    rejectAbort(new Error("request timed out"));
  }, timeoutMs);
  return {
    signal: controller.signal,
    abortPromise,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
    },
  };
}

function normalizedTimeout(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_TIMEOUT_MS;
}

/**
 * Raw-fetch Supermemory adapter. It intentionally exposes no provider SDK
 * types and turns unavailable/malformed provider responses into null.
 */
export class SupermemoryMemoryIndex implements MemoryIndex {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: SupermemoryConfig) {
    const apiKey = config.apiKey?.trim();
    this.apiKey = apiKey || undefined;
    this.baseUrl = (config.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = normalizedTimeout(config.timeoutMs);
    // The Workers runtime's global `fetch` must keep its original `this`. Stored
    // on an instance field and called as `this.fetchImpl(...)` it detaches and
    // throws "Illegal invocation", so bind it (a caller-supplied impl is used
    // as-is — test doubles don't care about `this`).
    this.fetchImpl = config.fetchImpl ?? fetch.bind(globalThis);
  }

  async addText(
    input: MemoryTextInput,
    options?: MemoryRequestOptions,
  ): Promise<MemoryDocumentRef | null> {
    if (typeof input.content !== "string" || input.content.trim().length === 0) return null;
    const body: Record<string, unknown> = { content: input.content, taskType: "superrag" };
    addIfDefined(body, "containerTag", input.containerTag);
    addIfDefined(body, "customId", input.customId);
    addIfDefined(body, "filepath", input.filepath);
    addIfDefined(body, "entityContext", input.entityContext);
    if (input.metadata !== undefined) body.metadata = input.metadata;
    if (input.filterByMetadata !== undefined) body.filterByMetadata = input.filterByMetadata;
    return this.postJson("/v3/documents", body, options, parseDocumentRef);
  }

  async addFile(
    input: MemoryFileInput,
    options?: MemoryRequestOptions,
  ): Promise<MemoryDocumentRef | null> {
    if (!(input.file instanceof Blob) || input.filename?.trim() === "") return null;
    const form = new FormData();
    if (input.filename === undefined) form.append("file", input.file);
    else form.append("file", input.file, input.filename);
    addFormValue(form, "containerTag", input.containerTag);
    addFormValue(form, "customId", input.customId);
    addFormValue(form, "filepath", input.filepath);
    addFormValue(form, "entityContext", input.entityContext);
    addFormValue(form, "fileType", input.fileType);
    addFormValue(form, "mimeType", input.mimeType);
    addFormValue(form, "taskType", "superrag");
    addJsonFormValue(form, "metadata", input.metadata);
    addJsonFormValue(form, "filterByMetadata", input.filterByMetadata);
    return this.postForm("/v3/documents/file", form, options, parseDocumentRef);
  }

  async deleteDocument(id: string, options?: MemoryRequestOptions): Promise<boolean | null> {
    if (id.trim().length === 0 || !this.apiKey) return null;
    return this.request(
      "DELETE",
      `/v3/documents/${encodeURIComponent(id)}`,
      undefined,
      options,
      (response) => response.status === 204 ? true : null,
    );
  }

  async search(
    input: MemorySearchInput,
    options?: MemoryRequestOptions,
  ): Promise<MemorySearchResult | null> {
    const query = input.query.trim();
    if (query.length === 0) return null;
    if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 2 || input.limit > MAX_SEARCH_LIMIT)) {
      return null;
    }
    const body: Record<string, unknown> = {
      q: query,
      searchMode: "documents",
      include: { documents: true },
    };
    if (input.containerTag !== undefined) body.containerTag = input.containerTag;
    if (input.limit !== undefined) body.limit = input.limit;
    return this.postJson("/v4/search", body, options, parseSearchResult);
  }

  private async postJson<T>(
    path: string,
    body: Record<string, unknown>,
    options: MemoryRequestOptions | undefined,
    parse: (value: unknown) => T | null,
  ): Promise<T | null> {
    return this.requestJson("POST", path, body, options, parse);
  }

  private async postForm<T>(
    path: string,
    body: FormData,
    options: MemoryRequestOptions | undefined,
    parse: (value: unknown) => T | null,
  ): Promise<T | null> {
    return this.request("POST", path, body, options, (response) => this.parseJsonResponse(response, parse));
  }

  private async requestJson<T>(
    method: string,
    path: string,
    body: Record<string, unknown> | undefined,
    options: MemoryRequestOptions | undefined,
    parse: (value: unknown) => T | null,
  ): Promise<T | null> {
    return this.request(
      method,
      path,
      body === undefined ? undefined : jsonBody(body),
      options,
      (response) => this.parseJsonResponse(response, parse),
    );
  }

  private async parseJsonResponse<T>(
    response: Response,
    parse: (value: unknown) => T | null,
  ): Promise<T | null> {
    if (!response.ok) {
      let detail = "";
      try {
        detail = ` — ${(await response.text()).slice(0, 200)}`;
      } catch {
        /* body unreadable */
      }
      console.warn(`supermemory: HTTP ${response.status}${detail}`);
      return null;
    }
    try {
      return parse(await response.json());
    } catch (e) {
      console.warn(`supermemory: response parse failed — ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body: BodyInit | undefined,
    options: MemoryRequestOptions | undefined,
    consume: (response: Response) => Promise<T | null> | T | null,
  ): Promise<T | null> {
    if (!this.apiKey) return null;
    const requestSignal = makeRequestSignal(
      options?.signal,
      normalizedTimeout(options?.timeoutMs ?? this.timeoutMs),
    );
    if (!requestSignal) return null;

    const headers = new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    });
    if (typeof body === "string") headers.set("Content-Type", "application/json");
    try {
      const operation = this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body,
        signal: requestSignal.signal,
      }).then((response) => consume(response));
      return await Promise.race([operation, requestSignal.abortPromise]);
    } catch (e) {
      console.warn(`supermemory: ${method} ${path} — ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
      return null;
    } finally {
      requestSignal.dispose();
    }
  }
}

export function createSupermemoryMemoryIndex(config: SupermemoryConfig): MemoryIndex {
  return new SupermemoryMemoryIndex(config);
}
