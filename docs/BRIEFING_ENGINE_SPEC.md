# Product Spec: The Daily Intelligence Brief (Briefing Engine)

**Status:** Draft (MVP Phase)  
**Date:** November 25, 2025  
**Parent Project:** Newsletter Control Center

---

## 1. Objective

To transition the system from **Passive Query** (User asks question) to **Active Push** (System proactively briefs User).

We will build an engine that generates two daily briefings (**Morning 8:15 AM, Afternoon 3:00 PM**) summarizing the "Delta" (new information) since the last run.

**Core Philosophy:** "Signal over Noise." We prioritize synthesis, outlier detection, and serendipity over simple summarization.

---

## 2. Architecture Overview

The Briefing Engine is a modular addition to the existing Next.js/BigQuery stack.

```mermaid
graph TD
    A[Trigger (Cron/Manual)] --> B{Get Raw Emails}
    B -->|Time Window > Last Run| C[Map Phase: Gemini 2.5 Flash]
    C -->|Extract Themes| D[Reduce Phase: Gemini 2.5 Pro]
    D -->|Clustering & Synthesis| E[JSON Output]
    E --> F[BigQuery 'briefings' Table]
    F --> G[Dashboard UI]
    F --> H[Email Delivery (Future)]
```

---

## 3. The Data Pipeline

### Step A: The "Delta" Query

We fetch `raw_emails` where `ingested_at` is within the target window.

**SQL Logic:**

```sql
SELECT * FROM `ncc_production.raw_emails`
WHERE ingested_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 18 HOUR) -- Buffer for safety
AND is_processed_for_briefing IS NOT TRUE -- Optional: Prevent double counting
```

### Step B: The "Map" Phase (Compression)

- **Model:** `gemini-2.5-flash-001` (Fast, High Throughput)
- **Input:** Raw Email Body
- **Task:** Extract key themes, entities, and sentiment.
- **Output:** A condensed "Insight Object" for each email.

### Step C: The "Reduce" Phase (The Editor-in-Chief)

- **Model:** `gemini-2.5-pro-001` (High Intelligence, Large Context)
- **Input:** Array of 20-100 "Insight Objects" from Step B.
- **Task:** Cluster narratives, identify outliers, select serendipitous items.
- **Output:** Structured JSON (The Briefing).

---

## 4. The Intelligence Prompts

### The "Editor-in-Chief" System Prompt (Step C)

> "You are the Editor-in-Chief of a high-level geopolitical and market intelligence firm. Your goal is to synthesize the following set of newsletter summaries into a cohesive Daily Briefing. You do not list news; you explain narratives."

### Required Output Structure (JSON):

| Field | Description |
|-------|-------------|
| `executive_summary` | 3 bullet points (max) capturing the absolute dominant themes. |
| `narrative_clusters` | Array of cluster objects (see below) |
| `serendipity_corner` | Array of 2 high-value items completely unrelated to main clusters |
| `radar_signals` | List of 3-5 entities/terms appearing for the first time or with unusual velocity |

### Narrative Cluster Object:

| Field | Description |
|-------|-------------|
| `title` | e.g., "The Nvidia Aftermath" |
| `synthesis` | A 2-3 sentence overview of the consensus. |
| `consensus_sentiment` | `"Positive"` \| `"Negative"` \| `"Mixed"` |
| `counter_point` | "While most sources agreed on X, [Publisher Name] argued Y." *(Crucial: Identify dissent)* |
| `source_ids` | List of `gmail_message_id`s involved. |

### Serendipity Corner:

Find 2 items that are high-value but completely unrelated to the main clusters. Deep tech breakthroughs, obscure regulatory changes, etc.

---

## 5. Storage Schema

We need a new BigQuery table to store the history of briefings.

### Table: `briefings`

| Column | Type | Description |
|--------|------|-------------|
| `briefing_id` | STRING | UUID |
| `generated_at` | TIMESTAMP | When it ran |
| `time_window_start` | TIMESTAMP | |
| `time_window_end` | TIMESTAMP | |
| `content_json` | JSON | The full structured output from Gemini |
| `email_count` | INTEGER | How many emails went into this |

---

## 6. UI Implementation (The Dashboard)

A new tab or view in the Glass Cockpit.

**Header:** "Morning Briefing • Nov 25"

**Layout:**

- **Top:** Executive Summary cards (High visibility).
- **Main Col:** Narrative Clusters (Accordion style - click to expand and see sources).
- **Right Rail:** "Serendipity" and "Radar" widgets.

---

## 7. API Routes

### `POST /api/intelligence/briefing/generate`

- Triggers the pipeline.
- Protected by Admin Key.

### `GET /api/intelligence/briefing/latest`

- Fetches the most recent row from `briefings` table.

---

## 8. MVP Constraints

- **No user-specific personalization** (everyone sees the same briefing).
- **No email sending infrastructure yet** (we will render it on the dashboard first).
- **On-demand trigger** (we will hit the API endpoint manually or via curl cron to start).

