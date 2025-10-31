# Cloud Shell: Deploy Evaluation Harness

## Step 1: Clone & Setup

```bash
# Clone the repo
cd ~
git clone https://github.com/johnsfesq1/newsletter-control-center.git
cd newsletter-control-center

# Pull latest changes
git pull origin main
```

## Step 2: Build & Deploy

```bash
# Build the Docker image
gcloud builds submit --tag gcr.io/newsletter-control-center/eval-rag --file Dockerfile.eval

# Check if job exists
gcloud run jobs describe eval-rag --region=us-central1 2>&1 | grep -q "not found"

if [ $? -eq 0 ]; then
    # Job doesn't exist - create it
    echo "Creating new eval-rag job..."
    gcloud run jobs create eval-rag \
        --image=gcr.io/newsletter-control-center/eval-rag \
        --region=us-central1 \
        --memory=2Gi \
        --cpu=2 \
        --max-retries=0 \
        --task-timeout=1200 \
        --set-env-vars="BIGQUERY_PROJECT_ID=newsletter-control-center"
else
    # Job exists - update it
    echo "Job exists - updating..."
    gcloud run jobs update eval-rag \
        --image=gcr.io/newsletter-control-center/eval-rag \
        --region=us-central1 \
        --memory=2Gi \
        --cpu=2 \
        --max-retries=0 \
        --task-timeout=1200 \
        --set-env-vars="BIGQUERY_PROJECT_ID=newsletter-control-center"
fi
```

## Step 3: Run Evaluation

```bash
gcloud run jobs execute eval-rag --region=us-central1
```

## Step 4: Monitor Progress

```bash
# Watch logs in real-time
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=eval-rag" --limit 100 --format json
```

## Step 5: Query Results in BigQuery

```sql
-- View all results
SELECT 
  question_id,
  question,
  facts_extracted,
  citations_count,
  latency_ms,
  cost_usd,
  error
FROM `newsletter-control-center.ncc_newsletters.eval_results`
ORDER BY question_id;

-- Summary stats
SELECT 
  COUNT(*) as total_questions,
  SUM(CASE WHEN error IS NULL THEN 1 ELSE 0 END) as successful,
  AVG(facts_extracted) as avg_facts,
  AVG(citations_count) as avg_citations,
  AVG(latency_ms) as avg_latency_ms,
  SUM(cost_usd) as total_cost
FROM `newsletter-control-center.ncc_newsletters.eval_results`;
```

## One-Liner (All Steps)

```bash
cd ~/newsletter-control-center && \
git pull && \
gcloud builds submit --tag gcr.io/newsletter-control-center/eval-rag --file Dockerfile.eval && \
gcloud run jobs update eval-rag --image=gcr.io/newsletter-control-center/eval-rag --region=us-central1 --memory=2Gi --cpu=2 --max-retries=0 --task-timeout=1200 --set-env-vars="BIGQUERY_PROJECT_ID=newsletter-control-center" && \
gcloud run jobs execute eval-rag --region=us-central1
```

