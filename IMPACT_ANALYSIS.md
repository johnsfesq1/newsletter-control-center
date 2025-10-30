# Dual Inbox Implementation - Impact Analysis

**Date**: October 30, 2025  
**Current Status**: Newsletter chunking/embedding running (286/15000 processed)  
**Question**: Can we implement dual inbox WHILE chunking runs?

---

## Files That Will Be Modified/Created

### ✅ SAFE - Won't Affect Running Process

**New Files** (Safe - don't touch existing code):
- `src/lib/deduplication.ts` (NEW)
- `scripts/ingest-legacy.ts` (NEW - copy of existing)
- `scripts/ingest-clean.ts` (NEW)
- `scripts/ingest-all.ts` (NEW)
- `scripts/migration-status.ts` (NEW)
- `config/ingestion-sources.json` (NEW)
- `DUAL_INBOX_IMPLEMENTATION.md` (NEW - docs)

**These are completely isolated** - won't interfere with `process-newsletters.ts`

---

### ⚠️ RISKY - Could Affect Running Process

**Modified Files**:

1. **`src/lib/gmail.ts`**
   - **Current**: Hardcoded single account
   - **Change**: Add multi-account support
   - **Risk**: Medium - if running process imports this, could break
   - **Mitigation**: Check if `process-newsletters.ts` uses this file

2. **`.env` file**
   - **Current**: Has `GMAIL_REFRESH_TOKEN`
   - **Change**: Add `GMAIL_LEGACY_REFRESH_TOKEN` and `GMAIL_CLEAN_REFRESH_TOKEN`
   - **Risk**: Low - process might not reload env vars
   - **Mitigation**: Don't remove old `GMAIL_REFRESH_TOKEN` yet

3. **BigQuery Schema**
   - **Current**: `messages` table has no `source_inbox` column
   - **Change**: Add `source_inbox` column
   - **Risk**: Medium - running process inserts to same table
   - **Mitigation**: Add column as NULLABLE, default existing rows

---

## Checking What Running Process Actually Uses

Need to check if `process-newsletters.ts` imports `src/lib/gmail.ts`.

If it does → **Can't modify that file safely**  
If it doesn't → **Safe to modify**

---

## Recommendation: Phased Approach

### Option 1: Wait Until Chunking Completes (SAFEST)

**Pros**:
- Zero risk to running process
- Can modify any file freely
- No testing complexity

**Cons**:
- Delays dual inbox implementation by days

**When chunking finishes**: Say "start dual inbox implementation" and I'll begin immediately

---

### Option 2: Implement Partial Now (MODERATE RISK)

**Phase A: New Code Only** (Can do NOW - 100% safe)
- Create new files: deduplication.ts, ingest-legacy.ts, ingest-clean.ts
- Create new scripts: ingest-all.ts, migration-status.ts
- Add config file: ingestion-sources.json
- Write all code, don't run it

**Phase B: Modify Existing** (Must wait - risky)
- Modify src/lib/gmail.ts (multi-account support)
- Update .env file (add new tokens)
- Migrate BigQuery schema (add column)

**Then**: When chunking completes, run Phase B quickly

**Pros**:
- Makes progress on dual inbox
- Most work done before chunking finishes
- Phase B only takes 30-60 minutes

**Cons**:
- Still need to wait for some parts
- Can't fully test until Phase B done

---

### Option 3: Check If It's Really Risky (SMART)

First, analyze what running process actually imports:

**If `process-newsletters.ts` does NOT import `src/lib/gmail.ts`**:
- Safe to modify immediately
- Can do Phase A + B now

**If it DOES import it**:
- Follow Option 1 or 2

---

## My Recommendation

**Do this check first**:

Let me examine what `process-newsletters.ts` actually imports. If it doesn't use the Gmail client library, we can proceed safely. If it does, we'll wait.

**Answer**: Should I check this?

