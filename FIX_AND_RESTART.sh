#!/bin/bash

# Stop the currently running job and restart with fixed code
# Run this in Google Cloud Shell

echo "═══════════════════════════════════════════════════════════════"
echo "🛑 STOPPING CURRENT JOB"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# List running executions
echo "Checking for running executions..."
EXECUTIONS=$(gcloud run jobs executions list \
  --job process-newsletters \
  --region us-central1 \
  --filter="status=Succeeded OR status=Running OR status=Pending" \
  --limit=1 \
  --format="value(name)" 2>/dev/null || echo "")

if [ -n "$EXECUTIONS" ]; then
  echo "Found running/pending executions (this is OK, Cloud Run will stop them)"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Pull latest code
echo "Step 1: Pulling latest code..."
cd ~/newsletter-control-center/newsletter-control-center
git pull

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Rebuild
echo "Step 2: Rebuilding Docker image (takes ~5 minutes)..."
gcloud builds submit --tag gcr.io/newsletter-control-center/process-newsletters

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Update job
echo "Step 3: Updating Cloud Run job..."
gcloud run jobs update process-newsletters \
  --image gcr.io/newsletter-control-center/process-newsletters:latest \
  --region us-central1

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Wait a moment for updates to propagate
echo "Waiting 10 seconds for updates to propagate..."
sleep 10

# Start new execution
echo "Step 4: Starting new job execution..."
gcloud run jobs execute process-newsletters --region us-central1

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Job started with fixed code!"
echo ""
echo "Monitor with:"
echo "  gcloud logging read 'resource.type=cloud_run_job AND logName:\"projects/newsletter-control-center/logs/run.googleapis.com%2Fstdout\"' --limit 50 --format=\"value(textPayload)\""
echo ""
echo "═══════════════════════════════════════════════════════════════"

