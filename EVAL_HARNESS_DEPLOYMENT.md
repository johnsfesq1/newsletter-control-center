# RAG Evaluation Harness Deployment

## Overview
The evaluation harness runs all 10 gold-standard questions through the RAG system and stores results in BigQuery for analysis.

## Option 1: Cloud Run (Recommended)

### Advantages
- ✅ No local auth issues
- ✅ Already has all dependencies
- ✅ Results automatically in BigQuery
- ✅ Can run unattended

### Steps

1. **Create Cloud Run Job for Evaluation**

```bash
# Build and deploy
gcloud builds submit --tag gcr.io/newsletter-control-center/eval-rag

# Create job
gcloud run jobs create eval-rag \
  --image gcr.io/newsletter-control-center/eval-rag \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --max-retries 0 \
  --task-timeout 600 \
  --set-env-vars="BIGQUERY_PROJECT_ID=newsletter-control-center" \
  --set-secrets="GMAIL_CLIENT_ID=GMAIL_CLIENT_ID:latest,GMAIL_CLIENT_SECRET=GMAIL_CLIENT_SECRET:latest"
```

2. **Run Evaluation**

```bash
gcloud run jobs execute eval-rag --region us-central1
```

3. **Check Results**

```sql
-- Query evaluation results
SELECT 
  question_id,
  facts_extracted,
  citations_count,
  latency_ms,
  cost_usd,
  error
FROM `newsletter-control-center.ncc_newsletters.eval_results`
ORDER BY question_id
```

## Option 2: Local with Fixed Auth

If you want to run locally:

```bash
# Run the auth command manually in YOUR terminal (not Cloud Shell)
gcloud auth application-default login

# Then run evaluation
npm run evaluate-rag
```

## Current Status

- ✅ Script written (`scripts/evaluate-rag.ts`)
- ✅ Gold set created (`config/gold-set.json`)
- ⚠️  Waiting on auth to test locally
- ⏳ Ready to deploy to Cloud Run

## Next Steps

I recommend **Option 1** (Cloud Run) because:
1. No auth headaches
2. Already have infrastructure
3. Can run whenever needed
4. Results go to BigQuery automatically

Should I proceed with Cloud Run deployment?

