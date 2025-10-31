#!/bin/bash

# Deploy RAG Evaluation Harness to Cloud Run

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "🚀 DEPLOYING RAG EVALUATION HARNESS"
echo "═══════════════════════════════════════════════════════════════"
echo ""

PROJECT_ID="newsletter-control-center"
REGION="us-central1"
IMAGE="gcr.io/${PROJECT_ID}/eval-rag"
JOB_NAME="eval-rag"

# Step 1: Build the Docker image
echo "📦 Building Docker image..."
gcloud builds submit --tag ${IMAGE} --file Dockerfile.eval

# Step 2: Create or update Cloud Run job
echo ""
echo "☁️  Creating Cloud Run job..."

# Check if job exists
if gcloud run jobs describe ${JOB_NAME} --region=${REGION} &>/dev/null; then
    echo "   ℹ️  Job exists, updating..."
    gcloud run jobs update ${JOB_NAME} \
        --image=${IMAGE} \
        --region=${REGION} \
        --memory=2Gi \
        --cpu=2 \
        --max-retries=0 \
        --task-timeout=1200 \
        --set-env-vars="BIGQUERY_PROJECT_ID=${PROJECT_ID}"
else
    echo "   ℹ️  Creating new job..."
    gcloud run jobs create ${JOB_NAME} \
        --image=${IMAGE} \
        --region=${REGION} \
        --memory=2Gi \
        --cpu=2 \
        --max-retries=0 \
        --task-timeout=1200 \
        --set-env-vars="BIGQUERY_PROJECT_ID=${PROJECT_ID}" \
        --set-secrets="GMAIL_CLIENT_ID=GMAIL_CLIENT_ID:latest,GMAIL_CLIENT_SECRET=GMAIL_CLIENT_SECRET:latest"
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "🏃 TO RUN THE EVALUATION:"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  gcloud run jobs execute ${JOB_NAME} --region=${REGION}"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "📊 TO VIEW RESULTS:"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}\" --limit 50 --format json"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

