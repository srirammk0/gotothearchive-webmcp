/** Provider-neutral contracts for optional external memory indexes. */

export type MemoryScalar = string | number | boolean;
export type MemoryMetadata = Readonly<Record<string, MemoryScalar>>;

export interface MemoryRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface MemoryDocumentRef {
  id: string;
  status: string;
}

export interface MemorySearchDocument {
  id: string;
  createdAt: string | null;
  updatedAt: string | null;
  title: string | null;
  type: string | null;
  metadata: MemoryMetadata;
  summary: string | null;
}

export interface MemorySearchHit {
  id: string;
  documentId: string;
  content: string;
  position: number | null;
  similarity: number | null;
  filepath: string | null;
  document: MemorySearchDocument | null;
}

export interface MemorySearchResult {
  hits: readonly MemorySearchHit[];
  timingMs: number;
  total: number;
}

export interface MemoryTextInput {
  content: string;
  containerTag?: string;
  customId?: string;
  metadata?: MemoryMetadata;
  filepath?: string;
  entityContext?: string;
  filterByMetadata?: MemoryMetadata;
}

export interface MemoryFileInput {
  file: Blob;
  filename?: string;
  containerTag?: string;
  customId?: string;
  metadata?: MemoryMetadata;
  filepath?: string;
  entityContext?: string;
  filterByMetadata?: MemoryMetadata;
  fileType?: string;
  mimeType?: string;
}

export interface MemorySearchInput {
  query: string;
  containerTag?: string;
  limit?: number;
}

/** The smallest useful surface an external memory provider must implement. */
export interface MemoryIndex {
  addText(
    input: MemoryTextInput,
    options?: MemoryRequestOptions,
  ): Promise<MemoryDocumentRef | null>;
  addFile(
    input: MemoryFileInput,
    options?: MemoryRequestOptions,
  ): Promise<MemoryDocumentRef | null>;
  deleteDocument(id: string, options?: MemoryRequestOptions): Promise<boolean | null>;
  search(
    input: MemorySearchInput,
    options?: MemoryRequestOptions,
  ): Promise<MemorySearchResult | null>;
}
