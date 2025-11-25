# System Architecture - Newsletter Control Center RAG Pipeline

**Last Updated:** November 23, 2025  
**Status:** Production (Local Dev with ADC)

---

## Overview

The Newsletter Control Center is a **Retrieval Augmented Generation (RAG) system** that enables semantic search across 70,000+ geopolitical newsletters using:
- **BigQuery** for vector + keyword hybrid search
- **Vertex AI** for embeddings (text-embedding-004) and synthesis (Gemini 2.5 Pro)
- **Next.js API Routes** for the backend
- **React/Tailwind** for the frontend

---

## Database Schema

### Dataset Information
- **Project:** `newsletter-control-center`
- **Dataset:** `ncc_production`
- **Location:** `US` (Multi-region)
- **Total Chunks:** ~1,064,000
- **Total Embeddings:** ~1,012,000
- **Total Emails:** ~78,000
- **Publishers:** 181 (but see note below)

### Table Relationships

```
chunk_embeddings (1M rows)
    |
    | JOIN ON chunk_id
    ↓
chunks (1.06M rows)
    |
    | JOIN ON gmail_message_id
    ↓
raw_emails (78K rows)
    ├── subject
    ├── sent_date
    ├── from_email ← Used as publisher name
    └── body_text/html

publishers (181 rows) ⚠️ UNUSED
    └── All publisher_id in chunks are NULL
```

### Table Schemas

#### `chunks`
Primary content storage for chunked newsletter text.

| Column | Type | Description |
|--------|------|-------------|
| `chunk_id` | STRING | Unique identifier (PK) |
| `gmail_message_id` | STRING | Links to raw_emails (FK) |
| `publisher_id` | STRING | ⚠️ Always NULL - DO NOT USE |
| `chunk_index` | INTEGER | Position in original email |
| `chunk_text` | STRING | Actual text content (~500-1000 chars) |
| `is_junk` | BOOLEAN | Low-quality/admin text filter |
| `created_at` | TIMESTAMP | Ingestion timestamp |

#### `chunk_embeddings`
Vector representations for semantic search.

| Column | Type | Description |
|--------|------|-------------|
| `chunk_id` | STRING | Links to chunks (FK) |
| `embedding` | FLOAT[] | 768-dimensional vector (REPEATED) |
| `model` | STRING | e.g., "text-embedding-004" |
| `dim` | INTEGER | 768 |
| `created_at` | TIMESTAMP | Generation timestamp |

#### `raw_emails`
Original newsletter metadata and content.

| Column | Type | Description |
|--------|------|-------------|
| `gmail_message_id` | STRING | Unique Gmail ID (PK) |
| `subject` | STRING | Email subject line |
| `sent_date` | TIMESTAMP | When email was sent |
| `from_email` | STRING | **Used as publisher** (e.g., "crew@morningbrew.com") |
| `from_name` | STRING | Usually NULL |
| `body_html` | STRING | HTML content |
| `body_text` | STRING | Plain text content |
| `ingested_at` | TIMESTAMP | When we ingested it |

#### `publishers` ⚠️
**Status:** Populated but NOT linked to chunks.

| Column | Type | Description |
|--------|------|-------------|
| `publisher_id` | STRING | Publisher identifier |
| `display_name` | STRING | Human-readable name |
| `domain_root` | STRING | Email domain |
| `is_vip` | BOOLEAN | Premium publisher flag |

**Critical Note:** All `publisher_id` values in `chunks` are NULL. We use `raw_emails.from_email` for publisher attribution instead.

---

## Infrastructure Configuration

### BigQuery Configuration
```typescript
const BIGQUERY_LOCATION = 'US';  // Multi-region
const DATASET_ID = 'ncc_production';
```

**Why US multi-region?**
- The dataset was created in `US` location
- All queries MUST specify `location: 'US'`
- Using wrong location (e.g., `us-central1`) causes "Dataset not found" errors

### Vertex AI Configuration
```typescript
const VERTEX_LOCATION = 'us-central1';  // Regional
```

**Why us-central1?**
- Vertex AI models (text-embedding-004, gemini-2.5-pro) require a specific region
- They do NOT work with multi-region locations like `US`
- API endpoints: `https://us-central1-aiplatform.googleapis.com/...`

### Authentication

**Local Development:**
- Uses **Application Default Credentials (ADC)**
- Setup: `gcloud auth application-default login --project newsletter-control-center`
- Credentials stored at: `~/.config/gcloud/application_default_credentials.json`
- No service account key file needed

**Production:** (Future)
- Will use service account with key file
- Required roles:
  - `roles/aiplatform.user` (Vertex AI)
  - `roles/bigquery.dataViewer` (Read data)
  - `roles/bigquery.jobUser` (Run queries)

---

## RAG Pipeline Flow

### 1. Query Embedding (Vertex AI)
```
User Query → text-embedding-004 → 768-dim vector
```
- **Location:** `us-central1`
- **Model:** `text-embedding-004`
- **Cost:** ~$0.00001 per query

### 2. Hybrid Search (BigQuery)
```
Vector Search (cosine similarity) ← 70% weight
    +
Keyword Search (SQL LIKE) ← 30% weight
    ↓
Top 10 chunks (deduplicated)
```
- **Location:** `US` multi-region
- **Query Time:** ~1-2 seconds
- **Filters:** `is_junk IS NOT TRUE`

### 3. Fact Extraction (Vertex AI)
```
Top 10 chunks → Gemini 2.5 Pro → JSON array of facts
```
- **Location:** `us-central1`
- **Model:** `gemini-2.5-pro`
- **Config:** `maxOutputTokens: 8192` (prevents truncation)
- **Output:** `[{fact: "...", chunk_id: "..."}]`

### 4. Answer Synthesis (Vertex AI)
```
Facts + Context → Gemini 2.5 Pro → Natural language answer
```
- **Location:** `us-central1`
- **Model:** `gemini-2.5-pro`
- **Config:** `maxOutputTokens: 8192`
- **Output:** Paragraph with inline citations

### 5. Response Format
```json
{
  "answer": "Synthesized answer...",
  "citations": [
    {
      "chunk_id": "...",
      "gmail_message_id": "...",
      "publisher": "crew@morningbrew.com",
      "subject": "Newsletter title",
      "date": "2024-11-15T..."
    }
  ],
  "cost_usd": 0.0234,
  "chunks_used": 10
}
```

---

## Performance & Costs

### Query Performance
- **Embedding Generation:** ~200-300ms
- **BigQuery Search:** ~1-2 seconds
- **Fact Extraction:** ~2-3 seconds
- **Answer Synthesis:** ~2-3 seconds
- **Total:** ~6-8 seconds per query

### Cost Breakdown (per query)
- **Embeddings:** $0.000013 (768-dim)
- **BigQuery:** $0.000001 (negligible)
- **Gemini (extract):** $0.01-0.02 (varies by chunk count)
- **Gemini (synthesis):** $0.01-0.02 (varies by answer length)
- **Total:** ~$0.02-0.04 per query

### Daily Budget
- **Max Spend:** $10/day
- **Max Queries:** ~250-500/day
- **Tracking:** In-memory (resets on server restart)
- **Production TODO:** Store in BigQuery or Redis

---

## Known Issues & Workarounds

### Issue 1: `publisher_id` is NULL
**Symptoms:** JOINing to `publishers` table returns 0 rows

**Root Cause:** The `chunks` table was ingested without populating `publisher_id`

**Workaround:** Use `raw_emails.from_email` as publisher name

**Status:** Working as intended

### Issue 2: JSON Truncation
**Symptoms:** `extractFacts` returns truncated JSON like `[{..., "chunk_id":`

**Root Cause:** Gemini output exceeded `maxOutputTokens: 4096`

**Fix:** Increased to `maxOutputTokens: 8192` + added truncation repair logic

**Status:** Fixed

### Issue 3: Location Confusion
**Symptoms:** "Dataset not found" or "404 URL not found"

**Root Cause:** Using wrong location constant for BigQuery vs Vertex AI

**Fix:** Separate constants: `BIGQUERY_LOCATION = 'US'` and `VERTEX_LOCATION = 'us-central1'`

**Status:** Fixed

---

## API Endpoint

### `POST /api/intelligence/query`

**Request:**
```json
{
  "query": "What is the outlook for Taiwan semiconductors?"
}
```

**Response (Success):**
```json
{
  "query": "What is the outlook for Taiwan semiconductors?",
  "answer": "According to recent newsletters...",
  "citations": [...],
  "chunks_used": 10,
  "cost_usd": 0.0234,
  "tokens_in": 15234,
  "tokens_out": 845
}
```

**Response (Error):**
```json
{
  "error": "Query failed",
  "message": "Detailed error message",
  "hint": "Suggested fix"
}
```

---

## File Structure

```
newsletter-search/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── intelligence/
│   │   │       └── query/
│   │   │           └── route.ts       ← Main RAG logic (769 lines)
│   │   ├── page.tsx                   ← Glass Cockpit UI (3-zone layout)
│   │   ├── layout.tsx                 ← Root layout with fonts
│   │   └── globals.css                ← Dark theme + prose styles
│   ├── components/
│   │   ├── search-input.tsx           ← Animated Command Deck (hero-to-sticky)
│   │   ├── process-theater.tsx        ← 4-stage latency visualization
│   │   ├── narrative-panel.tsx        ← Markdown synthesis display
│   │   └── evidence-card.tsx          ← Citation card component
│   └── lib/
│       └── utils.ts                   ← cn() helper for Tailwind
├── .env.local                         ← API config (no credentials needed)
├── package.json
└── next.config.js

docs/
├── SYSTEM_ARCHITECTURE.md             ← This file
├── DEV_RUNBOOK.md                     ← Developer guide
├── VISION_NORTH_STAR.md               ← Intelligence Engine philosophy
├── UI_GLASS_COCKPIT.md                ← UI design system spec
├── PHASE_1_LOG.md                     ← Phase 1 completion log
└── (archived docs)

secrets/
└── gcp/
    └── ncc-local-dev.json             ← Service account key (not used in dev)
```

---

## Technology Stack

- **Frontend:** Next.js 16 (App Router), Tailwind CSS v4, Framer Motion
- **UI Components:** React 19, Lucide React (icons), React Markdown
- **Backend:** Next.js API Routes (Node.js)
- **Database:** Google BigQuery (US multi-region)
- **AI/ML:** Google Vertex AI (us-central1)
  - text-embedding-004 (embeddings)
  - gemini-2.5-pro (LLM)
- **Auth:** Google Cloud ADC (local) / Service Account (production)
- **Deployment:** Local dev (production TBD)

---

## Environment Variables

### `.env.local` (Local Development)
```bash
# Optional: For client-side API key (currently unused)
NEXT_PUBLIC_API_KEY=placeholder-token

# Optional: BigQuery project (defaults to 'newsletter-control-center')
BIGQUERY_PROJECT_ID=newsletter-control-center

# Optional: If using service account instead of ADC
# GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json
```

**Note:** Most local development uses ADC, so no `.env.local` is strictly required.

---

## Data Ingestion Pipeline

**Status:** Separate system (not covered in this document)

**Overview:**
- Gmail API pulls newsletters
- Cloud Run jobs chunk and embed content
- BigQuery stores chunks and embeddings
- Runs on schedule (daily/hourly)

**See:** (Future documentation for ingestion pipeline)

---

## Future Improvements

1. **Fix `publisher_id`:** Populate during ingestion to use proper `publishers` table
2. **Caching:** Cache embeddings for common queries
3. **Streaming:** Stream Gemini responses for better UX
4. **Reranking:** Add cross-encoder reranking after hybrid search
5. **Monitoring:** Add structured logging and metrics
6. **Production Auth:** Switch to service account for deployment
7. **Budget Tracking:** Move to persistent storage (BigQuery/Redis)

---

## UI Architecture (The Glass Cockpit)

The frontend implements a "Glass Cockpit" design inspired by Bloomberg Terminal and Linear.app.

### 3-Zone Layout

```
┌─────────────────────────────────────────────────────────┐
│  ZONE A: Command Deck (Sticky Header)                   │
│  - SearchInput component with hero-to-sticky animation  │
│  - Status badge showing cost/model info                 │
├─────────────────────────────────┬───────────────────────┤
│  ZONE B: Synthesis Plane (60%)  │  ZONE C: Evidence     │
│  - NarrativePanel component     │  Rail (40%)           │
│  - Serif typography (Playfair)  │  - EvidenceCard list  │
│  - Markdown rendering           │  - Darker background  │
│  - Citation anchors [1] [2]     │  - Scrollable feed    │
└─────────────────────────────────┴───────────────────────┘
```

### Process Theater (Latency Visualization)

The 8-second query latency is visualized as a 4-stage "thinking" animation:

| Stage | Time | Label | Visual |
|-------|------|-------|--------|
| 1 | 0-2s | "Scanning Vector Space..." | Radar sweep animation |
| 2 | 2-5s | "Triangulating Sources..." | Chunk counter ticking up |
| 3 | 5-7s | "Extracting Facts..." | Analyzing pulse effect |
| 4 | 7-8s | "Synthesizing Narrative..." | Fade to results |

### Design Tokens

- **Background:** `zinc-950` (near-black)
- **Borders:** `zinc-800` (subtle)
- **Accent:** `emerald-500` (green highlights)
- **Narrative Font:** Playfair Display (serif)
- **UI Font:** Geist Sans
- **Mono Font:** Geist Mono

---

## Contact & Maintenance

**Owner:** Newsletter Control Center Team  
**Last Major Update:** November 25, 2025 (Glass Cockpit UI implementation)  
**Status:** ✅ Operational in local development

For questions or issues, see `docs/DEV_RUNBOOK.md` for troubleshooting.
