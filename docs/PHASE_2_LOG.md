# Phase 2 Completion Log: The Intelligence Briefing Engine

**Status:** ✅ Complete (MVP)  
**Date:** November 25, 2025  
**Build Time:** ~4 hours

---

## Overview

Phase 2 delivers the "Daily Intelligence Briefing" feature—an active push system that generates synthesized intelligence reports from the newsletter corpus. This transitions the system from **Passive Query** (user asks) to **Active Push** (system briefs user).

---

## New Architecture: The Map-Reduce Pipeline

The Briefing Engine uses a two-phase LLM pipeline inspired by MapReduce:

```
┌─────────────────────────────────────────────────────────────────┐
│                        BRIEFING ENGINE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │  Delta   │───▶│  MAP PHASE   │───▶│ REDUCE PHASE │          │
│  │  Query   │    │ (Gemini 2.0  │    │ (Gemini 2.5  │          │
│  │          │    │    Flash)    │    │    Pro)      │          │
│  └──────────┘    └──────────────┘    └──────────────┘          │
│       │                │                    │                   │
│       ▼                ▼                    ▼                   │
│  [raw_emails]    [InsightObjects]    [BriefingContent]         │
│                                             │                   │
│                                             ▼                   │
│                                    ┌──────────────┐            │
│                                    │   BigQuery   │            │
│                                    │  'briefings' │            │
│                                    └──────────────┘            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Phase Details

| Phase | Model | Purpose | Output |
|-------|-------|---------|--------|
| **Map** | `gemini-2.0-flash` | Extract themes, entities, sentiment, summary from each email | `InsightObject[]` (one per email) |
| **Reduce** | `gemini-2.5-pro` | Synthesize all insights into cohesive briefing | `BriefingContent` (structured JSON) |

### Delta Logic

The system uses intelligent time-windowing to avoid reprocessing:

1. **Query** `MAX(time_window_end)` from the `briefings` table
2. **Fetch** emails where `ingested_at > last_window_end`
3. **Fallback:** If no previous briefing exists, default to **last 24 hours**
4. **Override:** Pass `windowHours` parameter to force a specific lookback (useful for testing)

---

## New Files Created

### Core Logic (`src/lib/briefing/`)

| File | Purpose |
|------|---------|
| `types.ts` | TypeScript interfaces: `InsightObject`, `BriefingContent`, `NarrativeCluster`, `StoredBriefing` |
| `generator.ts` | Main pipeline: Delta query, Map phase, Reduce phase, BigQuery storage |
| `index.ts` | Module exports |

### API Routes (`src/app/api/intelligence/briefing/`)

| Route | Method | Purpose |
|-------|--------|---------|
| `generate/route.ts` | POST | Triggers pipeline (admin key protected) |
| `latest/route.ts` | GET | Fetches most recent briefing |
| `archive/route.ts` | GET | Returns list of all briefings |
| `[id]/route.ts` | GET | Fetches specific briefing by ID |

### UI Components (`src/components/briefing/`)

| Component | Purpose |
|-----------|---------|
| `executive-summary.tsx` | 3 high-visibility cards (Playfair Display font) |
| `narrative-cluster.tsx` | Accordion with sentiment badges, dissent highlighting |
| `serendipity-widget.tsx` | Purple-tinted outlier insights |
| `radar-widget.tsx` | Emerging terms with pulse animation |
| `archive-sidebar.tsx` | Date list with "Today" highlighting |
| `briefing-header.tsx` | Title, stats, back navigation |

### Dashboard Page (`src/app/briefing/`)

| File | Purpose |
|------|---------|
| `page.tsx` | Standalone dashboard with archive sidebar |

### Scripts (`scripts/`)

| File | Purpose |
|------|---------|
| `setup-briefings-table.ts` | Creates/updates BigQuery `briefings` table |

---

## Known Issues & Technical Debt

### 1. The "Hallucination" Issue (Generic Trope Collapse)

**Problem:** The current "Editor-in-Chief" prompt is too creative. The LLM produces:
- Overly dramatic narrative titles ("The Pro-Russia 'Peace Plan' Fiasco")
- Generic geopolitical tropes that may not reflect actual newsletter content
- Speculative synthesis that extrapolates beyond source material

**Root Cause:** The prompt encourages "narrative explanation" without sufficient grounding constraints.

**Impact:** The briefings read well but may not accurately represent the source newsletters.

**Fix Required:** Prompt calibration in `src/lib/briefing/generator.ts` to:
- Add explicit grounding rules ("Only state what sources explicitly claim")
- Require direct quotes for key claims
- Reduce creative license in synthesis

### 2. JSON Truncation

**Problem:** Gemini occasionally returns truncated JSON responses.

**Mitigation:** Added JSON repair logic that attempts to close unclosed braces/brackets.

**Status:** Working but fragile. Consider streaming responses in future.

---

## First Successful Run

| Metric | Value |
|--------|-------|
| **Briefing ID** | `b46c4af1-2365-41f3-b11a-36d2cbd54c8e` |
| **Emails Processed** | 500 |
| **Time Window** | 72 hours |
| **Processing Time** | ~3m 52s |
| **Narrative Clusters** | 6 |
| **Serendipity Items** | 2 |
| **Radar Signals** | 5 |

---

## Configuration

### Environment Variables

| Variable | Purpose | Location |
|----------|---------|----------|
| `BRIEFING_ADMIN_KEY` | Protects generate endpoint | `.env.local` |

### BigQuery

| Setting | Value |
|---------|-------|
| Table | `ncc_production.briefings` |
| Location | `US` (multi-region) |

### Vertex AI

| Setting | Value |
|---------|-------|
| Location | `us-central1` |
| Flash Model | `gemini-2.0-flash` |
| Pro Model | `gemini-2.5-pro` |

---

## Next Steps (Phase 3)

### P0 - Must Do

1. **Prompt Calibration**
   - File: `src/lib/briefing/generator.ts`
   - Goal: Reduce hallucination, increase grounding, require citations
   - Method: Add explicit rules about only stating what sources claim

2. **Email Rendering**
   - Enable clicking on `source_ids` to view original newsletter
   - Link narrative clusters to their source emails

### P1 - Should Do

3. **Streaming Responses**
   - Stream the Reduce phase for better UX on long generations

4. **Scheduled Runs**
   - Add cron trigger for 8:15 AM daily briefings

5. **Cost Tracking**
   - Log token usage per briefing run

---

## Commands Reference

```bash
# Start dev server
cd newsletter-search && npm run dev

# Trigger briefing generation (72h window)
curl -X POST http://localhost:3000/api/intelligence/briefing/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-secret-123" \
  -d '{"windowHours": 72}'

# Fetch latest briefing
curl http://localhost:3000/api/intelligence/briefing/latest

# View in browser
open http://localhost:3000/briefing
```

---

**Phase 2 Complete. System Operational.**

