#!/bin/bash

# Deploy the fixed Cloud Run job
# Run this in Google Cloud Shell after pulling the latest code

set -e  # Exit on error

echo "═══════════════════════════════════════════════════════════════"
echo "🔧 DEPLOYING FIXED VERSION"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "This will:"
echo "  1. Rebuild the Docker image with the cursor-based pagination fix"
echo "  2. Update the Cloud Run job"
echo "  3. Show you how to restart the job"
echo ""

# Step 1: Rebuild Docker image
echo "Step 1: Rebuilding Docker image (this takes ~5 minutes)..."
echo "═══════════════════════════════════════════════════════════════"
gcloud builds submit --tag gcr.io/newsletter-control-center/process-newsletters:latest

echo ""
echo "✅ Image built successfully!"
echo ""

# Step 2: Update Cloud Run job
echo "Step 2: Updating Cloud Run job..."
echo "═══════════════════════════════════════════════════════════════"
gcloud run jobs update process-newsletters \
  --image gcr.io/newsletter-control-center/process-newsletters:latest \
  --region us-central1

echo ""
echo "✅ Job updated successfully!"
echo ""

# Step 3: Check if there's a failed execution
echo "Step 3: Checking for previous failed executions..."
echo "═══════════════════════════════════════════════════════════════"

LATEST_EXEC=$(gcloud run jobs executions list \
  --job=process-newsletters \
  --region=us-central1 \
  --limit=1 \
  --format="value(name)" 2>/dev/null || echo "")

if [ -n "$LATEST_EXEC" ]; then
  FAILED_COUNT=$(gcloud run jobs executions describe "$LATEST_EXEC" \
    --region=us-central1 \
    --format="value(status.failedCount)" 2>/dev/null || echo "0")
  
  if [ "$FAILED_COUNT" = "1" ]; then
    echo "⚠️  Found a failed execution. The job will automatically resume from the last processed ID."
    echo ""
  fi
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ DEPLOYMENT COMPLETE!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🚀 To restart the job:"
echo "   gcloud run jobs execute process-newsletters --region us-central1"
echo ""
echo "📊 To monitor the job:"
echo "   gcloud logging tail \"resource.type=cloud_run_job AND resource.labels.job_name=process-newsletters\""
echo ""
echo "🔍 To check status:"
echo "   ./scripts/monitor-job.sh"
echo ""
echo "═══════════════════════════════════════════════════════════════"
