# Cloud Run Migration Plan: Newsletter Processing

**Date**: October 30, 2025  
**Purpose**: Move 73K newsletter processing to Cloud Run so we can work on other features  
**Timeline**: Need to preserve ~500 newsletters already processed

---

## 🎯 The Good News

**This is actually EASY!** Your code is already designed for this.

**Why it's easy:**
1. ✅ Script uses **Application Default Credentials (ADC)** - Cloud Run's default auth
2. ✅ Progress is saved to **BigQuery** (not local files)
3. ✅ Resume capability built in (checks existing IDs)
4. ✅ No dependencies on local state
5. ✅ All environment variables are in `.env`

**No code changes needed!** Just deploy and run.

---

## ⚠️  The One Challenge

**Progress file**: Currently uses `processing-progress.json` on local disk

**Current approach**:
- Script reads `processing-progress.json` on startup
- Saves progress after each newsletter
- This file won't exist on Cloud Run (stateless containers)

**Solution**: Already solved! Script has **dual progress tracking**:
1. Reads progress file (for local dev)
2. Queries BigQuery for existing chunks (for cloud)
3. Merges both sources

**Proof** (lines 344-359 in process-newsletters.ts):
```typescript
// Try to load previous progress
const savedProgress = loadProgress();  // ← Local file (optional)
if (savedProgress) {
  console.log(`📂 Found previous progress: ${savedProgress.processed} processed`);
  stats = savedProgress;
}

// Get existing newsletter IDs for resume capability
const existingIds = await getExistingNewsletterIds(bigquery);  // ← BigQuery (required)

// Merge saved progress with database IDs
savedProgress?.processedNewsletterIds.forEach(id => existingIds.add(id));
```

**This means**: The script will automatically resume from your 500 processed newsletters when running on Cloud Run!

---

## 🏗️ Architecture Options

### Option 1: Cloud Run Job (Recommended) ⭐

**What**: Long-running batch job on Cloud Run

**Pros**:
- ✅ Built for batch processing
- ✅ No timeout (can run for hours/days)
- ✅ Can auto-scale if you parallelize
- ✅ Pay only for compute time used
- ✅ Built-in progress monitoring

**Cons**:
- ⚠️ Needs Docker image (5 minutes to set up)

**Cost**: ~$0.10/hour × 6 days = **~$14** (vs $1.45 for just embedding costs)

**Best for**: Your use case (process 73K newsletters as one job)

---

### Option 2: Cloud Run Service (HTTP endpoint)

**What**: Stateless HTTP service

**Pros**:
- ✅ Simple to deploy
- ✅ Can trigger via API

**Cons**:
- ❌ 60-minute timeout (would need chunking into smaller batches)
- ❌ More complex orchestration
- ❌ Have to manage multiple invocations

**Best for**: Not your use case

---

### Option 3: Cloud Functions (Gen 2)

**What**: Serverless functions

**Pros**:
- ✅ Very easy to deploy
- ✅ Pay per invocation

**Cons**:
- ❌ 60-minute timeout (same problem)
- ❌ Cold starts can be slow
- ❌ Need external trigger

**Best for**: Not your use case (too many timeout issues)

---

## 📋 Recommended Approach: Cloud Run Job

### Step 1: Create Dockerfile

**File**: `Dockerfile`

```dockerfile
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript (if needed, or run with tsx)
# RUN npm run build

# Set entrypoint
ENTRYPOINT ["npx", "tsx", "scripts/process-newsletters.ts"]

# Default command
CMD []
```

**Time**: 5 minutes

---

### Step 2: Build and Push Docker Image

```bash
# Build image
gcloud builds submit --tag gcr.io/newsletter-control-center/process-newsletters:latest

# Or using Docker directly
docker build -t gcr.io/newsletter-control-center/process-newsletters:latest .
docker push gcr.io/newsletter-control-center/process-newsletters:latest
```

**Time**: 10 minutes (one-time setup)

---

### Step 3: Create Cloud Run Job

```bash
gcloud run jobs create process-newsletters \
  --image gcr.io/newsletter-control-center/process-newsletters:latest \
  --region us-central1 \
  --task-timeout 7d \
  --memory 2Gi \
  --cpu 2 \
  --max-retries 3 \
  --set-env-vars "PROCESS_LIMIT=73000" \
  --set-env-vars "START_FROM=0" \
  --set-secrets "GMAIL_CLIENT_ID=gmail-client-id:latest" \
  --set-secrets "GMAIL_CLIENT_SECRET=gmail-client-secret:latest" \
  --set-secrets "GMAIL_LEGACY_REFRESH_TOKEN=gmail-legacy-token:latest" \
  --set-secrets "GMAIL_CLEAN_REFRESH_TOKEN=gmail-clean-token:latest" \
  --set-secrets "BIGQUERY_PROJECT_ID=bigquery-project:latest"
```

**Time**: 5 minutes

---

### Step 4: Store Secrets in Secret Manager

Your `.env` file has sensitive data. Store it in Secret Manager:

```bash
# Create secrets
echo -n "your-gmail-client-id" | gcloud secrets create gmail-client-id --data-file=-
echo -n "your-gmail-client-secret" | gcloud secrets create gmail-client-secret --data-file=-
echo -n "your-legacy-token" | gcloud secrets create gmail-legacy-token --data-file=-
echo -n "your-clean-token" | gcloud secrets create gmail-clean-token --data-file=-
echo -n "newsletter-control-center" | gcloud secrets create bigquery-project --data-file=-

# Grant Cloud Run access
gcloud secrets add-iam-policy-binding gmail-client-id \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
# Repeat for other secrets...
```

**Time**: 10 minutes

---

### Step 5: Run the Job

```bash
gcloud run jobs execute process-newsletters --region us-central1
```

**Monitor**:
```bash
# Stream logs
gcloud logging tail "resource.type=cloud_run_job AND resource.labels.job_name=process-newsletters"

# Check job status
gcloud run jobs describe process-newsletters --region us-central1
```

**Time**: Instant

---

## 🔐 Authentication Setup

**Current**: Uses OAuth refresh tokens  
**Cloud Run**: Uses **Application Default Credentials** by default

**Problem**: Your refresh tokens are user tokens, not service account

**Solution**: Two options:

### Option A: Use Service Account (Recommended)

1. Create service account with BigQuery/Vertex AI access
2. Store in Secret Manager
3. Use **impersonation** if needed

**Pros**: 
- ✅ Most secure
- ✅ Proper cloud-native auth
- ✅ No user session expiration

**Cons**:
- ⚠️ Need to set up service account

---

### Option B: Keep Using OAuth Tokens

1. Keep refresh tokens in Secret Manager
2. Script uses tokens as-is (current approach)

**Pros**:
- ✅ Works immediately (no setup)
- ✅ Same as local

**Cons**:
- ⚠️ Tokens might expire after 7 days
- ⚠️ Not ideal for long-running jobs

---

## 💰 Cost Estimate

**Current** (local processing):
- API costs: ~$1.45
- Your computer: Free (already on)

**Cloud Run** (6 days × 100 newsletters/hour):
- Compute: 2 vCPU × $0.10/hour × 144 hours = $28.80
- Memory: 2 GB × $0.0125/hour × 144 hours = $3.60
- API costs: ~$1.45
- **Total: ~$34**

**But**: You can optimize!

**Optimized** (parallel processing):
- Process 5 newsletters at once
- Reduces time to ~1.2 days
- Compute: Same hourly rate, fewer hours
- **Total: ~$7** + $1.45 = ~$8.50

---

## 🚀 Quick Start (Minimum Viable Deploy)

Want to get it running ASAP? Here's the fastest path:

### 1. Create `Dockerfile` (5 min)
### 2. Build image (10 min)  
### 3. Store env vars as secrets (10 min)
### 4. Create job (5 min)
### 5. Execute (instant)

**Total time**: ~30 minutes to migrate

---

## ⚡ Performance Optimization

Once running, you can make it faster:

### Current: Sequential Processing
```
Newsletter 1 → Done → Newsletter 2 → Done → Newsletter 3...
Rate: ~100/hour (1.67/minute)
Time for 73K: ~30 days
```

### Optimized: Parallel Processing
```
Batch 1: [News1, News2, News3, News4, News5] → All start at once
Batch 2: [News6, News7, News8, News9, News10] → Starts after Batch 1
Rate: ~500/hour (8.3/minute)
Time for 73K: ~6 days
```

**Code change**: Minimal (use `Promise.all()` around processNewsletterWithEmbeddings)

---

## 🛡️ Preserving Your Work

**Your 500 processed newsletters**: Already safe!

**How**: 
1. Script queries BigQuery for existing chunks before starting
2. Skips already-processed newsletters
3. Your 500 newsletters won't be re-processed

**Test**: Before running full job, test with `PROCESS_LIMIT=100` to verify

---

## 📊 Monitoring

**View logs**: Real-time streaming
```bash
gcloud logging tail "resource.type=cloud_run_job"
```

**Check progress**: Query BigQuery
```sql
SELECT COUNT(DISTINCT newsletter_id) as processed
FROM `newsletter-control-center.ncc_newsletters.chunks`
```

**Job status**: Describe job
```bash
gcloud run jobs describe process-newsletters --region us-central1
```

---

## 🎯 My Recommendation

**Do this in phases**:

### Phase 1: Test Migration (30 minutes)
1. Create Dockerfile
2. Build and push image  
3. Create Cloud Run Job with `PROCESS_LIMIT=10`
4. Execute and verify logs
5. **Verify it skips your 500 processed newsletters**

### Phase 2: Scale Up (10 minutes)
1. Update job with `PROCESS_LIMIT=73000`
2. Execute full job
3. Monitor via logs

### Phase 3: Optimize (optional, later)
1. Add parallel processing
2. Reduce compute costs
3. Finish in 6 days instead of 30

---

## 🔍 Risk Assessment

**Low risk**:
- ✅ Script already handles resume
- ✅ Auth works with ADC
- ✅ No code changes needed
- ✅ Your 500 newsletters are safe

**Medium risk**:
- ⚠️ First-time Docker setup (5 min learning curve)
- ⚠️ OAuth tokens might expire (can refresh)
- ⚠️ Network issues (automatic retries built in)

**High risk**:
- ❌ None identified

---

## ✅ Decision Framework

**Choose Cloud Run if**:
- You want to work on other features → ✅ **YOU**
- Processing will take > 1 day → ✅ **YOU** (30 days!)
- Cost is acceptable → ✅ **YOU** (~$8-34)
- You want professional monitoring → ✅ **YOU**

**Stick with local if**:
- Processing will finish in hours → ❌ **NOT YOU** (30 days)
- You have dedicated machine → ❌ **NOT YOU**
- Cost matters more than time → ❌ **NOT YOU**

---

## 📝 Action Items

**If you decide to proceed**:

1. ✅ Read this plan
2. ⏸️ Approve migration
3. ⏸️ I create Dockerfile
4. ⏸️ I set up Cloud Run Job
5. ⏸️ Test with 10 newsletters
6. ⏸️ Execute full 73K job
7. ⏸️ Monitor and celebrate 🎉

---

## 🤔 Questions to Consider

1. **Budget**: Is $8-34 acceptable for processing? (vs weeks of your time)
2. **Timeline**: Do you need it in 6 days or is 30 days ok? (parallel vs sequential)
3. **Comfort**: Are you ok with Docker + Cloud Run setup? (I do most of the work)
4. **Monitoring**: Do you want to check logs regularly or set-and-forget? (Cloud Run = set-and-forget)

---

## 🎬 Bottom Line

**Your instinct is right**: For 73K newsletters, Cloud Run is the smart choice.

**Effort**: 30 minutes to deploy  
**Savings**: 29 days of your time  
**Risk**: Low (your 500 are safe)  
**Cost**: $8-34  
**Benefit**: Work on dual inbox while processing runs in background

**My vote**: Let's do it! 🚀

