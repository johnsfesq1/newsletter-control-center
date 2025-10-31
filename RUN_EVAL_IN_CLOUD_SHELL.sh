#!/bin/bash
# Run this in Cloud Shell to deploy and execute the evaluation harness

set -e

echo "🚀 Deploying and running RAG evaluation harness..."
echo ""

# Pull latest code
cd ~/newsletter-control-center
git pull origin main

# Build image
echo "📦 Building Docker image..."
gcloud builds submit --tag gcr.io/newsletter-control-center/eval-rag --file Dockerfile.eval

# Update job
echo "☁️  Updating Cloud Run job..."
gcloud run jobs update eval-rag \
    --image=gcr.io/newsletter-control-center/eval-rag \
    --region=us-central1 \
    --memory=2Gi \
    --cpu=2 \
    --max-retries=0 \
    --task-timeout=1200 \
    --set-env-vars="BIGQUERY_PROJECT_ID=newsletter-control-center" 2>/dev/null || \
gcloud run jobs create eval-rag \
    --image=gcr.io/newsletter-control-center/eval-rag \
    --region=us-central1 \
    --memory=2Gi \
    --cpu=2 \
    --max-retries=0 \
    --task-timeout=1200 \
    --set-env-vars="BIGQUERY_PROJECT_ID=newsletter-control-center"

# Execute
echo "🏃 Executing evaluation..."
gcloud run jobs execute eval-rag --region=us-central1

echo ""
echo "✅ Done! Check logs for results:"
echo "  gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=eval-rag\" --limit 100"

