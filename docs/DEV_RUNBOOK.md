# Developer Runbook - Newsletter Control Center RAG

**Quick Reference Guide for Development, Debugging, and Deployment**

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+ installed
- `gcloud` CLI installed and configured
- Access to `newsletter-control-center` GCP project

### Setup (First Time)

```bash
# 1. Navigate to the Next.js app
cd newsletter-search

# 2. Install dependencies
npm install

# 3. Authenticate with Google Cloud (ADC)
gcloud auth application-default login --project newsletter-control-center

# 4. Start the dev server
npm run dev
```

**Server URL:** http://localhost:3000

### Daily Startup

```bash
cd newsletter-search
npm run dev
```

That's it! ADC credentials persist, so you only need to re-authenticate if they expire (~1 hour).

---

## Common Errors & Solutions

### ❌ Error: `invalid_grant` or `invalid_rapt`

**Symptoms:**
- API returns 500 error
- Server logs: `❌ Query failed: Error: {"error":"invalid_grant"...`

**Root Cause:** ADC credentials expired or invalid

**Solution:**
```bash
# Re-authenticate
gcloud auth application-default login --project newsletter-control-center

# Restart server
kill -9 $(lsof -t -i:3000)
cd newsletter-search && npm run dev
```

---

### ❌ Error: `404 Not Found` (Vertex AI)

**Symptoms:**
- Error mentions `.../locations/US/...` or `.../locations/us-central1/...`
- API fails during embedding or synthesis

**Root Cause:** Using wrong location constant for Vertex AI

**Solution:**
Check `route.ts` constants:
```typescript
const BIGQUERY_LOCATION = 'US';           // ✅ Correct for BigQuery
const VERTEX_LOCATION = 'us-central1';    // ✅ Correct for Vertex AI
```

**Vertex AI endpoints MUST use `us-central1`:**
```typescript
const endpoint = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/...`;
```

---

### ❌ Error: `Dataset not found in location`

**Symptoms:**
- `Not found: Dataset newsletter-control-center:ncc_production was not found in location us-central1`

**Root Cause:** Using wrong location for BigQuery queries

**Solution:**
Ensure ALL BigQuery queries use `BIGQUERY_LOCATION` (`US`):

```typescript
const bigquery = new BigQuery({ 
  projectId: PROJECT_ID,
  location: 'US'  // ✅ Must be 'US', not 'us-central1'
});

const [rows] = await bigquery.query({
  query: sqlQuery,
  location: 'US'  // ✅ Must specify here too
});
```

---

### ❌ Error: `0 Results Returned`

**Symptoms:**
- Search completes but returns empty citations
- Server logs: `✅ Found 0 relevant chunks`

**Possible Causes & Fixes:**

**1. Joining to `publishers` table (most common)**
```sql
-- ❌ BROKEN: publisher_id is NULL in chunks
JOIN `ncc_production.publishers` p ON c.publisher_id = p.publisher_id

-- ✅ FIXED: Use from_email directly
SELECT re.from_email AS publisher_name FROM ...
```

**2. Wrong dataset name**
```typescript
// ❌ BROKEN
const DATASET_ID = 'ncc_newsletters';

// ✅ FIXED
const DATASET_ID = 'ncc_production';
```

**3. Overly restrictive filters**
```sql
-- Check if is_junk filter is too aggressive
WHERE c.is_junk IS NOT TRUE  -- Try removing temporarily
```

**Debug Query:**
```bash
# Test if data exists
bq query --use_legacy_sql=false "
SELECT count(*) FROM \`newsletter-control-center.ncc_production.chunks\`
JOIN \`newsletter-control-center.ncc_production.raw_emails\` re
  ON chunks.gmail_message_id = re.gmail_message_id
"
```

---

### ❌ Error: `JSON Parse Error` (Truncation)

**Symptoms:**
- Server logs: `Failed to parse facts as JSON`
- Error mentions incomplete JSON like `[{..., "chunk_id":`

**Root Cause:** Gemini output exceeded token limit and was truncated

**Solution:**
Check `maxOutputTokens` in `route.ts`:

```typescript
// ✅ Should be 8192 (not 4096)
generationConfig: {
  maxOutputTokens: 8192,  // Prevents truncation
  ...
}
```

**Fallback:** The code has automatic truncation repair:
1. Tries to parse JSON as-is
2. If fails, finds last `}]` and slices
3. If still fails, returns empty array (won't crash)

---

### ❌ Error: `Port 3000 already in use`

**Symptoms:**
- Server won't start
- Error: `EADDRINUSE: address already in use :::3000`

**Solution:**
```bash
# Find and kill process on port 3000
kill -9 $(lsof -t -i:3000)

# Restart server
npm run dev
```

---

### ❌ Error: `The file at .../newsletter-local-dev-key.json does not exist`

**Symptoms:**
- Query fails with 500 error
- Server logs: `Error: The file at /Users/.../.gcloud/newsletter-local-dev-key.json does not exist`

**Root Cause:** Conflict between `GOOGLE_APPLICATION_CREDENTIALS` in `.env.local` (or shell environment) and the system Application Default Credentials (ADC).

**Solution:**
1. Remove `GOOGLE_APPLICATION_CREDENTIALS` from `.env.local`:
   ```bash
   # .env.local should only contain:
   NEXT_PUBLIC_API_KEY=placeholder-token
   ```

2. Ensure you've authenticated with ADC:
   ```bash
   gcloud auth application-default login --project newsletter-control-center
   ```

3. Restart the server:
   ```bash
   kill -9 $(lsof -t -i:3000)
   cd newsletter-search && npm run dev
   ```

**Note:** The app will automatically use ADC credentials from `~/.config/gcloud/application_default_credentials.json`.

---

### ❌ Error: `Syntax error: Unexpected ')'`

**Symptoms:**
- BigQuery error about SQL syntax
- Mentions `WHERE chunk_id IN ()`

**Root Cause:** `getFullChunks()` called with empty array

**Solution:**
Already fixed with guard clause:
```typescript
if (!chunkIds || chunkIds.length === 0) {
  console.warn('⚠️  getFullChunks called with empty chunk ID array');
  return [];
}
```

If you still see this, check that the guard clause exists in `route.ts`.

---

## Debugging Workflow

### Step 1: Check Server Logs

Watch the terminal where `npm run dev` is running. Look for:

```
✅ Good:
🔑 Using Application Default Credentials (ADC)
🔍 Processing query: "..."
📊 Generating query embedding...
🔎 Performing hybrid search...
✅ Found 10 relevant chunks

❌ Bad:
❌ Query failed: Error: ...
⚠️  getFullChunks called with empty chunk ID array
```

### Step 2: Check Browser Console

Open DevTools (F12) and look for:
- `🚀 Sending search request`
- `📥 API Response Status: 200 OK` (good) or `500` (bad)
- `❌ API Error Response` (if failed)

### Step 3: Test BigQuery Directly

```bash
# Test dataset access
bq ls --project_id=newsletter-control-center

# Test chunk count
bq query --use_legacy_sql=false "
SELECT count(*) FROM \`newsletter-control-center.ncc_production.chunks\`
"

# Test JOIN (should return ~1M)
bq query --use_legacy_sql=false "
SELECT count(*) 
FROM \`newsletter-control-center.ncc_production.chunks\` c
JOIN \`newsletter-control-center.ncc_production.raw_emails\` re
  ON c.gmail_message_id = re.gmail_message_id
"
```

### Step 4: Test Vertex AI Auth

```bash
# Test if ADC works
gcloud auth application-default print-access-token

# Should print a long token like: ya29.c.c0ASRK0Ga...
# If error, re-run: gcloud auth application-default login
```

---

## Configuration Reference

### Critical Constants (`route.ts`)

```typescript
// ✅ Correct Configuration
const PROJECT_ID = 'newsletter-control-center';
const DATASET_ID = 'ncc_production';
const BIGQUERY_LOCATION = 'US';
const VERTEX_LOCATION = 'us-central1';
```

### Model Configurations

**Embeddings (text-embedding-004):**
```typescript
// No special config needed
// Auto-generates 768-dim vectors
```

**Fact Extraction (gemini-2.5-pro):**
```typescript
generationConfig: {
  temperature: 0.1,           // Low for factual extraction
  maxOutputTokens: 8192,      // High to prevent truncation
  responseMimeType: 'application/json'  // Forces JSON output
}
```

**Answer Synthesis (gemini-2.5-pro):**
```typescript
generationConfig: {
  temperature: 0.3,           // Slightly higher for natural language
  maxOutputTokens: 8192,      // High for long answers
  // No MIME type = natural text
}
```

---

## Testing a Query

### Via UI (Recommended)
1. Open http://localhost:3000
2. You should see the dark "Intelligence Console" with centered search input
3. Enter query: `"What is the outlook for Taiwan semiconductors?"`
4. Watch the **Process Theater** animation sequence:
   - Stage 1: "Scanning Vector Space..." (radar sweep)
   - Stage 2: "Triangulating Sources..." (chunk counter)
   - Stage 3: "Extracting Facts..." (analyzing pulse)
   - Stage 4: "Synthesizing Narrative..." (fade to results)
5. Verify the results view:
   - **Left panel (60%):** Narrative in serif font with inline citations
   - **Right panel (40%):** Evidence cards with publisher, date, snippet
   - **Header:** Status badge showing cost (e.g., "$0.0234 • Gemini 2.5 Pro")

### Via curl (For Automation)

```bash
curl -X POST http://localhost:3000/api/intelligence/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the outlook for Taiwan semiconductors?"}'
```

**Expected Response:**
```json
{
  "query": "What is the outlook for Taiwan semiconductors?",
  "answer": "According to recent newsletters...",
  "citations": [
    {
      "chunk_id": "...",
      "gmail_message_id": "...",
      "publisher": "crew@morningbrew.com",
      "subject": "...",
      "date": "..."
    }
  ],
  "chunks_used": 10,
  "cost_usd": 0.0234
}
```

---

## Performance Tuning

### Reduce Query Time
```typescript
// Reduce chunks retrieved (faster but less accurate)
await hybridSearch(bigquery, query, queryEmbedding, 5);  // Was: 10
```

### Reduce Cost
```typescript
// Use smaller model for synthesis (not recommended)
const endpoint = `...gemini-1.5-flash:generateContent`;  // Cheaper

// Or reduce token limits
maxOutputTokens: 4096  // Was: 8192 (may cause truncation)
```

### Increase Quality
```typescript
// Retrieve more chunks
await hybridSearch(bigquery, query, queryEmbedding, 20);  // Was: 10

// Adjust hybrid search weights (in hybridSearch function)
combined_score = vector_score * 0.8 + keyword_score * 0.2;  // More semantic
```

---

## Deployment Checklist (Future)

When deploying to production:

- [ ] Switch from ADC to service account key
- [ ] Set `GOOGLE_APPLICATION_CREDENTIALS` env var
- [ ] Verify service account has required roles:
  - `roles/aiplatform.user`
  - `roles/bigquery.dataViewer`
  - `roles/bigquery.jobUser`
- [ ] Update `NEXT_PUBLIC_API_KEY` for frontend auth
- [ ] Move daily budget tracking to persistent storage
- [ ] Add structured logging (e.g., Winston, Pino)
- [ ] Set up monitoring/alerts (e.g., Google Cloud Monitoring)
- [ ] Configure CORS if needed
- [ ] Test with production data
- [ ] Load test query performance

---

## Useful Commands

### Server Management
```bash
# Start dev server
npm run dev

# Kill process on port 3000
kill -9 $(lsof -t -i:3000)

# Check what's using port 3000
lsof -i :3000
```

### Google Cloud
```bash
# Login with ADC
gcloud auth application-default login

# Check current project
gcloud config get-value project

# Set project
gcloud config set project newsletter-control-center

# Test BigQuery access
bq ls

# Test Vertex AI access
gcloud ai models list --region=us-central1
```

### Database Queries
```bash
# Count chunks
bq query --use_legacy_sql=false "SELECT count(*) FROM \`newsletter-control-center.ncc_production.chunks\`"

# Count embeddings
bq query --use_legacy_sql=false "SELECT count(*) FROM \`newsletter-control-center.ncc_production.chunk_embeddings\`"

# Check publisher data
bq query --use_legacy_sql=false "
SELECT from_email, count(*) as cnt 
FROM \`newsletter-control-center.ncc_production.raw_emails\` 
GROUP BY from_email 
ORDER BY cnt DESC 
LIMIT 10
"
```

---

## File Locations

### Key Files
- **Main API Logic:** `newsletter-search/src/app/api/intelligence/query/route.ts`
- **Frontend UI:** `newsletter-search/src/app/page.tsx`
- **Environment:** `newsletter-search/.env.local` (optional)
- **Service Account Key:** `secrets/gcp/ncc-local-dev.json` (not used in dev)

### Documentation
- **Architecture:** `docs/SYSTEM_ARCHITECTURE.md` (The Book of Truth)
- **This File:** `docs/DEV_RUNBOOK.md` (You are here)
- **Historical:** `docs/PHASE2_COMPLETION.md`, `docs/RAG_*.md`

---

## Getting Help

### If Stuck:
1. ✅ Check this runbook for your error
2. ✅ Check `docs/SYSTEM_ARCHITECTURE.md` for system design
3. ✅ Check server logs and browser console
4. ✅ Test BigQuery and Vertex AI access directly
5. ✅ Ask the team in Slack/Discord/etc.

### Common Questions:

**Q: Why is my query taking 15+ seconds?**  
A: Check if you're retrieving too many chunks or if BigQuery is slow. Try reducing `topK` parameter.

**Q: Why are my citations showing email addresses instead of publisher names?**  
A: That's expected! We use `from_email` (e.g., "crew@morningbrew.com") because `publisher_id` is NULL. See `SYSTEM_ARCHITECTURE.md` for details.

**Q: Can I use a different Gemini model?**  
A: Yes, but test carefully. `gemini-2.5-pro` is recommended for accuracy. `gemini-1.5-flash` is cheaper but lower quality.

**Q: How do I clear the daily budget tracker?**  
A: Restart the server. Budget is stored in-memory and resets on restart.

---

**Last Updated:** November 25, 2025  
**Status:** ✅ Complete and tested (Glass Cockpit UI)
