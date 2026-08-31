# Context model and retrieval

## Model goals

The context model preserves human ownership, source provenance, lightweight relationships, artifact influences, feedback, and scoped taste without requiring a specialized graph database.

The graph is powerful because of its schema and retrieval behavior, not because it is visualized or stored in a graph product.

## Foundational entities

### ContextItem

```text
id
space_id
region_id
owner_id
type
title
source_id
content_ref
semantic_text
embedding_ref
metadata
authority_class
created_by
created_at
updated_at
```

### ContextEdge

```text
id
from_id
to_id
relationship
weight
created_by
approval_state
created_at
metadata
```

Useful relationships include belongs_to, related_to, inspired_by, influenced, created_for, mentions, derived_from, used_in, authored_by, supports, contradicts, approved_by, and rejected_because.

### Other central entities

- Space and Region.
- Project and Task.
- Source.
- Artifact and ArtifactVersion.
- Annotation and ReviewDecision.
- TasteSignal.
- HumanShare and AgentGrant.
- Proposal.
- InfluenceRecord.
- AuditEvent.

See the human-facing vocabulary in [information architecture](../product/information-architecture.md).

## Authority classes

1. Human-authored context.
2. Imported or source-linked context.
3. Agent-created artifacts.
4. Agent proposals.
5. Inferred taste signals.
6. Human-confirmed preferences.

Authority is not a single universal ranking for every query, but retrieval and conflict handling must preserve these distinctions.

## Multimodal processing

Each supported item may have:

```text
original artifact
+ semantic representation
+ optional embedding
+ metadata
+ provenance
+ relationships
```

- Images and screenshots: dimensions, OCR, human description, optional derived description and style signals.
- PDFs: extracted text, page metadata, thumbnails, structural summary, optional embeddings.
- Links and webpages: canonical URL, source metadata, snapshot or excerpt where permitted, semantic representation, provenance.
- X.com posts: canonical post URL and external ID, author/source metadata, text, embedded media metadata, permitted image references or snapshots, semantic representation, and provenance.
- Notes: canonical text, optional embeddings and extracted entities.
- Presentations and code artifacts: format-aware indexing for Workbench review and retrieval.

Derived descriptions never replace originals and remain labeled as machine-generated.

## Source-linked data

Prefer source-linked over blindly source-replicated storage.

Store:

- Source pointer and external ID.
- Canonical URL where applicable.
- Metadata and thumbnails allowed by the source.
- Semantic representation and embedding.
- Relationships and provenance.
- Refresh and revocation state.

For X.com posts, preserve the original post URL and attribution. Treat post text, replies, quoted posts, embedded images, and author metadata as separate related context items when extracted. Store permitted image derivatives separately from the source pointer; never imply that an extracted image is independently authored by the Archive owner.

Fetch canonical content on demand where practical. Material needed for durable artifact provenance may require a permitted snapshot or content hash.

## Retrieval pipeline

Retrieval is not vector similarity alone. Candidate scoring may incorporate:

```text
permission scope
× task intent
× semantic similarity
× graph relationship strength
× taste relevance
× human curation
× feedback history
× recency
× source quality
× project relevance
× authority class
```

The first implementation may use a simpler weighted model, but should log enough structured signals to evolve it.

### Required order

1. Resolve current human identity and access.
2. Resolve current task and agent grant.
3. Exclude inaccessible regions and items before retrieval.
4. Generate candidates from search, graph, project membership, and semantic indexes.
5. Rank and minimize context.
6. Fetch source details only where permitted and necessary.
7. Return traceable results with item identifiers and provenance.
8. Record accessed items for task disclosure.

Permissions are filters, not ranking penalties. An inaccessible item is never a low-ranked candidate; it is absent.

The graph is implemented as explicit relational nodes and edges, not as unrestricted agent-visible traversal. Each retrieval operation first resolves the authorized region set, then queries full-text, project membership, edge neighborhoods, and vector matches inside that set. Results are re-hydrated from canonical records and checked again before any content or media reference is returned.

## Context assembly

Agents should receive the minimum useful context rather than the full Archive, DOM, source account, or file collection.

A context result should identify:

- Item and source.
- Relevant excerpt or semantic representation.
- Why it was selected when available.
- Relationship to task or project.
- Authority class.
- Allowed follow-up inspection operations.

## Artifact influence

Access and influence are separate records.

- Access means the item was retrieved or inspected during the task.
- Influence means the agent or artifact process recorded the item as shaping the result.

Influence records may include role, strength, or affected artifact region when known, but must not claim more causal certainty than exists.

## Graph traversal safety

- Traversal re-checks access at every node.
- An accessible edge does not reveal an inaccessible node.
- Counts, titles, and relationship labels can themselves be sensitive.
- Traversal limits prevent runaway context assembly.
- User-visible provenance follows only paths safe for that viewer.

## Scale assumption

SQLite plus explicit edges and semantic indexes is sufficient for the initial scale of thousands to tens of thousands of items per user or space. Introduce a specialized graph system only when observed query patterns or scale require it.
