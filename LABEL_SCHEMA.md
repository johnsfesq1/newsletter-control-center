# Gmail Label Schema - Final Design

**Last Updated**: October 31, 2025

## Philosophy

**Gmail labels are for organization only.**  
**BigQuery is the source of truth for all intelligence.**

Keep Gmail simple. Keep intelligence in BigQuery.

---

## Label Definitions

### 1. "Ingested"
**What**: Newsletters that have been pulled from Gmail and added to BigQuery

**Applied To**: All newsletters that exist in `messages` table

**When Applied**:
- During ingestion (new newsletters)
- Retro-labeling (historical 73K newsletters)

**Action**:
- If has "paid $" label: Leave in inbox, mark as read
- If no "paid $" label: Archive and mark as read

**Purpose**: Binary tracking - has this been pulled from Gmail?

---

### 2. "paid $"
**What**: Paid newsletter subscriptions

**Applied To**: Newsletters from paid sources

**How Detected**:
- Manual labeling (already done for historical)
- Auto-detection via `config/paid-senders.json` (future)

**Action**: Keep in inbox, don't archive

**Purpose**: Special handling for paid sources

---

## What's NOT in Gmail Labels

All of these are tracked in BigQuery, not Gmail:

- **is_paid**: Boolean flag (auto-detected)
- **is_vip**: Boolean flag (from config)
- **Chunked status**: Check `chunks` table
- **Embedded status**: Check `chunks.chunk_embedding` column
- **Quality scores**: Will be LLM-generated in BigQuery
- **Topics, themes, regions**: Will be LLM-analyzed in BigQuery

**Why?** Gmail API is slower, has rate limits, and shouldn't hold intelligence data.

---

## Retro-Labeling Logic

For historical 73K newsletters:

```typescript
For each newsletter in messages table:
  1. Get message ID
  2. Check Gmail for existing "paid $" label
  3. Apply "Ingested" label
  4. If "paid $" exists:
     - Mark as read only
     - Leave in inbox
  5. Else:
     - Mark as read
     - Archive (remove from inbox)
```

---

## Future Enhancements

All future categorization will be:
- LLM-powered analysis in BigQuery
- Not manual Gmail labels
- Query-able, searchable, programmatic

Examples:
- Reliability scores
- Topic clusters  
- Geographic focus
- Quality ratings

---

## Summary

**Gmail**: Simple binary tracking (ingested or not) + organization (paid or not)  
**BigQuery**: All intelligence, analysis, and categorization

This keeps Gmail lean and BigQuery powerful.

