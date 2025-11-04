#!/bin/bash

# Deploy Newsletter Discovery to Cloud Run Job
# Run this in Google Cloud Shell after pulling latest code

set -e  # Exit on error

echo "═══════════════════════════════════════════════════════════════"
echo "🚀 DEPLOYING NEWSLETTER DISCOVERY TO CLOUD RUN"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Project configuration
PROJECT_ID="newsletter-control-center"
REGION="us-central1"
JOB_NAME="discover-newsletters"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${JOB_NAME}"

# Step 1: Build Docker image
echo "Step 1: Building Docker image (this takes ~5-7 minutes)..."
echo "   Image: ${IMAGE_NAME}"
echo ""
# Temporarily rename Dockerfile.discovery to Dockerfile for build
if [ -f "Dockerfile" ]; then
  mv Dockerfile Dockerfile.backup
  RESTORE_DOCKERFILE=true
else
  RESTORE_DOCKERFILE=false
fi

cp Dockerfile.discovery Dockerfile

gcloud builds submit \
  --tag "${IMAGE_NAME}" \
  --project "${PROJECT_ID}"

# Restore original Dockerfile
rm Dockerfile
if [ "$RESTORE_DOCKERFILE" = "true" ]; then
  mv Dockerfile.backup Dockerfile
fi

echo ""
echo "✅ Docker image built successfully"
echo ""

# Step 2: Create or update Cloud Run job
echo "═══════════════════════════════════════════════════════════════"
echo "Step 2: Creating/updating Cloud Run job..."
echo ""

# Check if job exists
if gcloud run jobs describe "${JOB_NAME}" --region="${REGION}" --project="${PROJECT_ID}" &>/dev/null; then
  echo "   Job exists - updating..."
  gcloud run jobs update "${JOB_NAME}" \
    --image "${IMAGE_NAME}:latest" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --memory 2Gi \
    --cpu 2 \
    --max-retries 0 \
    --task-timeout 10800 \
    --set-secrets=GOOGLE_CUSTOM_SEARCH_API_KEY=google-custom-search-api-key:latest,GOOGLE_CUSTOM_SEARCH_ENGINE_ID=google-custom-search-engine-id:latest
else
  echo "   Job doesn't exist - creating..."
  gcloud run jobs create "${JOB_NAME}" \
    --image "${IMAGE_NAME}:latest" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --memory 2Gi \
    --cpu 2 \
    --max-retries 0 \
    --task-timeout 10800 \
    --set-secrets=GOOGLE_CUSTOM_SEARCH_API_KEY=google-custom-search-api-key:latest,GOOGLE_CUSTOM_SEARCH_ENGINE_ID=google-custom-search-engine-id:latest
fi

echo ""
echo "✅ Cloud Run job ready"
echo ""

# Step 3: Show execution command
echo "═══════════════════════════════════════════════════════════════"
echo "✅ DEPLOYMENT COMPLETE!"
echo ""
echo "To execute the discovery job, run:"
echo ""
echo "  gcloud run jobs execute ${JOB_NAME} --region ${REGION} --project ${PROJECT_ID}"
echo ""
echo "To monitor logs, run:"
echo ""
echo "  gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}\" --limit 50 --format=\"value(textPayload)\" --project ${PROJECT_ID}"
echo ""
echo "Or view in Console:"
echo "  https://console.cloud.google.com/run/jobs?project=${PROJECT_ID}"
echo ""
echo "═══════════════════════════════════════════════════════════════"

