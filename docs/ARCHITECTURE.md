# Newsletter Control Center – Production Architecture v2.0

## System Overview

The Newsletter Control Center is a production-grade newsletter intelligence platform that ingests content from two Gmail accounts, processes it through chunking and embedding pipelines, and provides RAG-powered search capabilities. The system uses Gmail History API for efficient incremental updates, content-hash deduplication to handle cross-inbox duplicates, and a robust checkpoint system for failure recovery.

## Data Flow

```mermaid

flowchart LR

  subgraph Sources

    A1[Gmail: johnsfnewsletters@gmail.com]

    A2[Gmail: nsm@internationalintrigue.io]

    noteA[[Labels in both inboxes:<br/>• Paid $ (read-only)<br/>• Ingested (visual-only, app-applied post-success)]]:::note

  end

  subgraph Jobs

    B1[Cloud Run Job: ncc-ingest-gmail\n• Read last_history_id (per inbox)\n• Gmail History API deltas\n• Fallback: in:anywhere newer_than:30d\n• Skip if gmail_id exists in DB\n• Skip heavy work if content_hash seen (cross-inbox)\n• Write raw + parts + labels + is_paid\n• Update last_history_id; JSON logs]

    B2[Cloud Run Job: ncc-process-chunk-embed\n• PARSE → PUBLISHER → CHUNK → EMBED with checkpoints\n• Chunk ~1200 / overlap ~200\n• Vertex text-embedding-004 (768d)\n• On DONE: apply label "Ingested" (idempotent)]

  end

  subgraph BigQuery (ncc_production)

    C1[(control.ingest_state\ninbox, last_history_id, last_success_at)]

    C2[(control.processing_status\ngmail_message_id, stage, error, updated_at)]

    C3[(core.raw_emails\n+ content_hash, list_id, reply_to, is_paid)]

    C4[(core.email_labels\nor labels[])]

    C5[(core.publishers\nUNIQUE(service,site_id))]

    C6[(core.publisher_aliases)]

    C7[(core.chunks\n+ char_start, char_end)]

    C8[(core.chunk_embeddings\nmodel, dim=768, embedding)]

  end

  subgraph Retrieval & AI (later)

    D1[BigQuery Vector Search]

    D2[LLM Answering Layer\n(strict citations, cost logging)]

  end

  A1 --> B1

  A2 --> B1

  B1 --> C1

  B1 --> C3

  B1 --> C4

  B1 --> C2

  B2 --> C7

  B2 --> C8

  C7 --> D1

  C8 --> D1

  D1 --> D2

  classDef note fill:#eef,stroke:#99f,color:#222;

```

## Publisher Canonicalization

```mermaid

flowchart TD

  H[List-ID host?] -->|yes| P1[service=substack, site_id=<subdomain>.substack.com]

  H -->|no| R[Reply-To host recognizable?] -->|yes| P2[service=<svc>, site_id=<host>]

  R -->|no| L[Primary canonical link host?] -->|yes| P3[service=custom, site_id=<host>]

  L -->|no| F[From root domain] --> P4[service=custom, site_id=<root>]

  P1 --> U[UNIQUE(service, site_id)]

  P2 --> U

  P3 --> U

  P4 --> U

```

## Tables

### Control Tables (control.*)

- **ingest_state**: Tracks last Gmail History ID per inbox for incremental sync.
- **processing_status**: Tracks each message through stages (PARSED → PUBLISHERED → CHUNKED → EMBEDDED → DONE) with error logging and resume.

### Core Tables (core.*)

- **raw_emails**: Original email content + content_hash for dedupe, list_id/reply_to for service detection, is_paid from Gmail labels.
- **email_labels**: Normalized label storage (IDs + names) for filtering and categorization (or store labels[] on raw_emails).
- **publishers**: Canonical registry with UNIQUE(service, site_id) preventing duplicates.
- **publisher_aliases**: Optional mapping of variations → canonical publishers for merges.
- **chunks**: Deterministic chunks (~1200 chars, ~200 overlap) with char_start/char_end.
- **chunk_embeddings**: 768-dim vectors from Vertex AI text-embedding-004 with model + dim.

## Migration Path from v1 to v2

### Phase 1: Non-Breaking Additions

- Create control.* tables alongside existing tables.
- Add content_hash to existing messages.
- Add service and site_id to publishers.
- Run the new pipeline in parallel for validation.

### Phase 2: Cutover

- Switch from date-based scanning to Gmail History API.
- Enable content_hash deduplication (cross-inbox).
- Implement new publisher canonicalization logic.
- Switch to control.processing_status for state management.

### Phase 3: Cleanup

- Archive the old discovery system.
- Remove duplicate publishers via UNIQUE(service, site_id) (plus optional aliases).
- Drop deprecated columns/tables.
- Archive test/experimental scripts.

## Runbook

See [docs/RUNBOOK.md](./RUNBOOK.md) for operational procedures.

