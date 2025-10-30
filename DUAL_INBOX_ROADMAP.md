# Dual Inbox Migration - Implementation Roadmap

**Status**: Planning phase (not started)  
**Estimated effort**: 3-5 hours  
**Risk level**: Low  

---

## Overview

Implement parallel ingestion from two Gmail inboxes:
1. **Legacy**: `johnsnewsletters@gmail.com` (existing, keep running)
2. **Clean**: New dedicated newsletter inbox (new, future-proof)

With automatic deduplication and source tracking.

---

## Prerequisites (Manual Steps - YOU DO THIS FIRST)

### Step 1: Create Clean Inbox ✅
**Action**: Create new email address  
**Recommended**: `ncc@yourdomain.com` or `newsletters@yourdomain.com`  
**Where**: Any email provider (Gmail, custom domain, etc.)

**Note**: If using Gmail, create completely new account (not a Gmail alias)

### Step 2: Get OAuth Credentials for New Inbox ✅
**Action**: Set up Gmail API access for new inbox  
**Follow**: Same process as existing account
1. Go to Google Cloud Console
2. Create OAuth credentials (or reuse existing)
3. Generate refresh token using `scripts/get-gmail-token.js`
4. Add to `.env` as separate credentials

**Result**: You'll have:
- `GMAIL_CLIENT_ID` (can reuse)
- `GMAIL_CLIENT_SECRET` (can reuse)  
- `GMAIL_LEGACY_REFRESH_TOKEN` (existing)
- `GMAIL_CLEAN_REFRESH_TOKEN` (new)

### Step 3: Subscribe First Newsletter to New Inbox ✅
**Action**: Pick one high-value newsletter and subscribe with new email  
**Why**: Need sample data for testing  
**Good candidates**: Newsletters you read daily (Axios, Semafor, etc.)

---

## Technical Implementation (AUTOMATED - CODE)

### Phase 1: Schema Updates (30 min)

**File**: BigQuery schema  
**Task**: Add `source_inbox` field

**Details**:
```sql
ALTER TABLE `ncc_newsletters.messages`
ADD COLUMN source_inbox STRING OPTIONS(description="Source: legacy or clean");

-- Set all existing rows to 'legacy'
UPDATE `ncc_newsletters.messages`
SET source_inbox = 'legacy'
WHERE source_inbox IS NULL;
```

**Testing**: Verify column exists and is populated

---

### Phase 2: Gmail Client Refactor (45 min)

**File**: `src/lib/gmail.ts`  
**Task**: Make authentication configurable per inbox

**Current**: Hardcoded to single account  
**New**: Support multiple accounts via config

**Details**:
```typescript
export function getGmail(inboxType: 'legacy' | 'clean' = 'legacy'): gmail_v1.Gmail {
  const envVar = inboxType === 'legacy' 
    ? process.env.GMAIL_LEGACY_REFRESH_TOKEN
    : process.env.GMAIL_CLEAN_REFRESH_TOKEN;
  
  // ... rest of existing logic
}
```

**Testing**: Both inboxes can be accessed

---

### Phase 3: Deduplication Logic (1 hour)

**File**: `src/lib/deduplication.ts` (NEW)  
**Task**: Identify duplicate messages across inboxes

**Logic**:
```typescript
interface DedupeKey {
  messageId: string;      // Gmail Message-ID header
  listId?: string;        // List-Id header (newsletter unique)
  sender: string;
  subject: string;
  sentDate: string;
}

function generateDedupeKey(message: gmail_v1.Schema$Message): DedupeKey {
  // Extract headers
  // Generate canonical key
  // Return unique identifier
}

function isDuplicate(key: DedupeKey, existingKeys: Set<string>): boolean {
  // Check if key exists in BigQuery
  // Return true if found
}
```

**Testing**: Identifies duplicates correctly

---

### Phase 4: Dual Ingestion Scripts (1 hour)

**Files**: 
- `scripts/ingest-legacy.ts` (refactor existing)
- `scripts/ingest-clean.ts` (NEW, copy of existing with clean inbox)

**Task**: Two separate ingestion jobs

**Details**:

**Legacy** (`scripts/ingest-legacy.ts`):
```typescript
const gmail = getGmail('legacy');
const messages = await fetchMessages(gmail);
for (const message of messages) {
  if (!isDuplicate(message, existingKeys)) {
    await insertToBigQuery({
      ...message,
      source_inbox: 'legacy'
    });
  }
}
```

**Clean** (`scripts/ingest-clean.ts`):
```typescript
const gmail = getGmail('clean');
const messages = await fetchMessages(gmail);
for (const message of messages) {
  if (!isDuplicate(message, existingKeys)) {
    await insertToBigQuery({
      ...message,
      source_inbox: 'clean'
    });
  }
}
```

**Testing**: Both scripts run independently

---

### Phase 5: Unified Orchestration (45 min)

**File**: `scripts/ingest-all.ts` (NEW)  
**Task**: Single entry point for dual ingestion

**Details**:
```typescript
async function ingestAll() {
  const config = {
    legacy: { enabled: true, refreshToken: '...' },
    clean: { enabled: true, refreshToken: '...' }
  };
  
  const results = await Promise.all([
    config.legacy.enabled && ingestFromInbox('legacy'),
    config.clean.enabled && ingestFromInbox('clean')
  ]);
  
  // Merge results
  // Log summary
}
```

**Testing**: Runs both inboxes in parallel

---

### Phase 6: Migration Dashboard (1 hour)

**File**: `scripts/migration-status.ts` (NEW)  
**Task**: Show which newsletters are where

**Details**:
```typescript
// Query BigQuery for source distribution
const stats = await getSourceDistribution();

console.log(`
Migration Status:
- Legacy only: ${stats.legacyOnly} newsletters
- Clean only: ${stats.cleanOnly} newsletters  
- In both: ${stats.inBoth} newsletters

Top Senders Still Only in Legacy:
${topSendersLegacyOnly.map(s => `  - ${s}`).join('\n')}
`);
```

**Output**: CLI dashboard showing migration progress

---

### Phase 7: Configuration Files (30 min)

**File**: `config/ingestion-sources.json` (NEW)

**Details**:
```json
{
  "sources": {
    "legacy": {
      "enabled": true,
      "type": "gmail",
      "description": "Original newsletter inbox",
      "refresh_token_env": "GMAIL_LEGACY_REFRESH_TOKEN"
    },
    "clean": {
      "enabled": true,
      "type": "gmail",
      "description": "New dedicated newsletter inbox",
      "refresh_token_env": "GMAIL_CLEAN_REFRESH_TOKEN"
    }
  },
  "deduplication": {
    "enabled": true,
    "method": "message_id_and_list_id"
  }
}
```

**Purpose**: Easy toggle of which sources to ingest

---

### Phase 8: Environment Variables (15 min)

**File**: `.env`

**Add**:
```bash
# Legacy inbox (existing)
GMAIL_LEGACY_REFRESH_TOKEN=[YOUR_LEGACY_REFRESH_TOKEN_HERE]

# Clean inbox (new)
GMAIL_CLEAN_REFRESH_TOKEN=[YOUR_CLEAN_REFRESH_TOKEN_HERE]

# Reuse these across both
GMAIL_CLIENT_ID=[YOUR_CLIENT_ID_HERE]
GMAIL_CLIENT_SECRET=[YOUR_CLIENT_SECRET_HERE]
```

---

### Phase 9: Testing (1 hour)

**Test plan**:

1. ✅ Schema migration works
2. ✅ Legacy ingestion still works with new schema
3. ✅ Clean ingestion works
4. ✅ Deduplication catches duplicates
5. ✅ Both inboxes can run in parallel
6. ✅ Migration dashboard shows correct stats
7. ✅ Config toggle enables/disables sources

---

### Phase 10: Documentation (30 min)

**File**: `DUAL_INBOX_MIGRATION.md`

**Content**:
- How it works
- How to add new sources
- How to check migration status
- How to toggle sources
- Future cut-off strategy

---

## File Structure After Implementation

```
scripts/
  ├── ingest-to-bigquery.ts (keep for reference, deprecated)
  ├── ingest-legacy.ts (refactored existing)
  ├── ingest-clean.ts (new)
  ├── ingest-all.ts (new - orchestrator)
  └── migration-status.ts (new - dashboard)

src/lib/
  ├── gmail.ts (refactored - multi-account support)
  └── deduplication.ts (new)

config/
  ├── vip.json (existing)
  └── ingestion-sources.json (new)

.env (updated with dual credentials)
```

---

## Rollout Strategy

**Week 1**: 
- You complete manual steps (inbox setup, credentials)
- I implement Phases 1-5 (core functionality)
- Test with sample data

**Week 2**:
- Implement Phases 6-7 (dashboard, config)
- End-to-end testing
- You start subscribing newsletters to clean inbox

**Week 3**:
- Production deployment
- Monitor for issues
- Run migration dashboard weekly

**Week 4+**:
- Gradually migrate high-value newsletters
- Monitor clean vs legacy ratios
- Plan eventual legacy deprecation

---

## Success Criteria

✅ Both inboxes ingest in parallel  
✅ Zero duplicates across sources  
✅ All messages tagged with source_inbox  
✅ Migration dashboard shows accurate stats  
✅ Can toggle sources via config  
✅ No impact on existing legacy ingestion  
✅ New subscriptions go to clean inbox  

---

## Future Considerations

**Month 6**: 
- Migration dashboard shows 80%+ coverage in clean inbox
- Consider deprecating legacy ingestion

**Month 12**:
- 95%+ coverage in clean inbox
- Legacy inbox becomes read-only
- Cut off legacy ingestion

**Public Launch**:
- Users connect their own dedicated inbox
- Same architecture, clean separation

---

## Estimated Timeline

**Manual Steps** (You): 1-2 hours  
**Implementation** (Me): 3-5 hours  
**Testing** (Both): 1 hour  
**Total**: 5-8 hours over 2-3 days  

---

## Risk Mitigation

**Risk**: Breaking existing ingestion  
**Mitigation**: Keep legacy path identical, only add new path

**Risk**: Duplicate ingestion  
**Mitigation**: Robust deduplication logic, Message-ID + List-Id

**Risk**: Complex orchestration  
**Mitigation**: Simple parallel execution, independent jobs

**Risk**: Migration drag  
**Mitigation**: Dashboard shows progress, clear targets

---

## Questions to Answer Before Starting

1. ✅ What's the clean inbox email address?
2. ✅ Is Gmail the right provider (or custom domain)?
3. ✅ Do you want monthly/weekly ingestion cadence for both?
4. ⚠️ How aggressive should dedup be? (conservative vs permissive)
5. ⚠️ Should we blocklist specific senders?

---

## Ready to Start?

**Your prerequisites**:
1. Create clean inbox email
2. Get OAuth credentials
3. Subscribe 1 test newsletter

**Then say**: "Start dual inbox implementation"

**I'll handle**: Everything else

