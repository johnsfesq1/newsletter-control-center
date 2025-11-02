#!/bin/bash

# Redeploy and run the fixed job
# Run this in Google Cloud Shell

echo "═══════════════════════════════════════════════════════════════"
echo "🔧 REBUILDING & REDEPLOYING FIXED VERSION"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Step 1: Pull latest code
echo "Step 1: Pulling latest code..."
cd ~/newsletter-control-center/newsletter-control-center
git pull

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Step 2: Rebuild Docker image
echo "Step 2: Rebuilding Docker image (this takes ~5 minutes)..."
gcloud builds submit --tag gcr.io/newsletter-control-center/process-newsletters

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Step 3: Update Cloud Run job
echo "Step 3: Updating Cloud Run job..."
gcloud run jobs update process-newsletters \
  --image gcr.io/newsletter-control-center/process-newsletters:latest \
  --region us-central1

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Step 4: Start the job
echo "Step 4: Starting the job..."
gcloud run jobs execute process-newsletters --region us-central1

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Job started!"
echo ""
echo "Monitor with:"
echo "  gcloud logging read 'resource.type=cloud_run_job AND logName:\"projects/newsletter-control-center/logs/run.googleapis.com%2Fstdout\"' --limit 50 --format=\"value(textPayload)\""
echo ""
echo "═══════════════════════════════════════════════════════════════"

