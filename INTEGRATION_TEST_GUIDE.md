# Integration Test Guide

## Goal
Test the three new features we just built:
1. Citations UX (improved format)
2. Gmail Labeling (auto-label processed newsletters)
3. Paid Newsletter Detection (is_paid flag)

## Test Plan

### Test 1: Citations Format (Quick - 5 min)
**Run in Cloud Shell:**

```bash
# Build and deploy latest image
cd ~/newsletter-control-center || git clone https://github.com/johnsfesq1/newsletter-control-center.git
cd newsletter-control-center

# Build Docker image
gcloud builds submit --tag gcr.io/newsletter-control-center/newsletter-processor

# Update Cloud Run job
gcloud run jobs update process-newsletters \
  --image gcr.io/newsletter-control-center/newsletter-processor \
  --region us-central1 \
  --set-env-vars "PROCESS_LIMIT=10,START_FROM=0"

# Execute small test batch
gcloud run jobs execute process-newsletters --region us-central1

# Watch logs
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=process-newsletters" \
  --limit 50 \
  --format json | grep -E '(step|error|citation|paid)' --color
```

**Expected Results:**
- ✅ Processing completes without errors
- ✅ 10 newsletters processed
- ✅ is_paid column populated (likely NULL for existing)
- ✅ Chunks created successfully

### Test 2: Query RAG Citations (5 min)
**Run in Cloud Shell:**

```bash
# Test citation format via API
# First, let's query existing data to see new citation format
gcloud logging read "resource.type=cloud_run_job" --limit 20
```

**Or test locally** (if auth is working):
```bash
# After reauthing
npx tsx scripts/test-rag-simple.ts "What are newsletters saying about climate change?"
```

**Expected Results:**
- ✅ Citations format: "Publisher · Date · Subject"
- ✅ Not just chunk IDs anymore
- ✅ Answer includes properly formatted citations

### Test 3: Verify Schema (2 min)
**Run in BigQuery Console or Cloud Shell:**

```bash
# Check that new columns exist
bq query --use_legacy_sql=false "
SELECT 
  id, 
  subject, 
  publisher_name, 
  is_paid,
  source_inbox
FROM \`newsletter-control-center.ncc_newsletters.messages\`
LIMIT 5"
```

**Expected Results:**
- ✅ is_paid column exists
- ✅ source_inbox column exists
- ✅ No errors

### Test 4: Full Integration Test (Optional - 20 min)
**If test 1-3 all pass, run full integration:**

```bash
# Process 100 newsletters from start
gcloud run jobs update process-newsletters \
  --set-env-vars "PROCESS_LIMIT=100,START_FROM=0"

gcloud run jobs execute process-newsletters --region us-central1

# Monitor logs
gcloud logging read "resource.type=cloud_run_job" --limit 100 --follow
```

**Expected Results:**
- ✅ All 100 newsletters processed
- ✅ No errors in logs
- ✅ Paid detection working (if any paid senders in sample)
- ✅ Gmail labeling working (if using clean inbox)

## Success Criteria

- ✅ Citations format improved and readable
- ✅ is_paid column added to messages and chunks
- ✅ No errors in processing
- ✅ Backward compatible (existing data works)
- ✅ Ready for 52K processing

## If Tests Fail

1. Check Cloud Run logs for specific errors
2. Verify environment variables are set correctly
3. Confirm BigQuery schema changes were applied
4. Check that paid-senders.json is valid JSON
5. Review GitHub commit diff for any issues

## Clean Up

After successful test:
```bash
# Remove test data if needed
# (Optional - we can also just keep it)

# Reset for full run
gcloud run jobs update process-newsletters \
  --set-env-vars "PROCESS_LIMIT=25000,START_FROM=28000"
```

## Next Steps After Successful Test

1. ✅ Mark all completed tasks as done
2. ✅ Continue with remaining todo items
3. ✅ Start processing remaining 52K newsletters
4. 🎉 Celebrate progress!

