#!/bin/bash

# Start 25K Newsletter Batch Processing Job
# Run this in Google Cloud Shell

echo "═══════════════════════════════════════════════════════════════"
echo "🚀 Starting 25K Newsletter Batch"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Configuration:"
echo "  - Starting from: Newsletter #5,000"
echo "  - Processing: 25,000 newsletters"
echo "  - Ending at: Newsletter #30,000"
echo "  - Expected duration: ~8 hours"
echo "  - Final corpus: ~30,000 newsletters processed (40% of 73K)"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Step 1: Update job configuration
echo "Step 1: Updating Cloud Run job configuration..."
gcloud run jobs update process-newsletters \
  --update-env-vars PROCESS_LIMIT=25000,START_FROM=5000 \
  --region us-central1

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Step 2: Execute the job
echo "Step 2: Starting job execution..."
gcloud run jobs execute process-newsletters --region us-central1

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Job started successfully!"
echo ""
echo "To monitor progress:"
echo "  gcloud logging read \\"
echo "    \"resource.type=cloud_run_job AND logName:\\\"projects/newsletter-control-center/logs/run.googleapis.com%2Fstdout\\\"\" \\"
echo "    --limit 50 \\"
echo "    --format=\"value(textPayload)\""
echo ""
echo "To check status:"
echo "  gcloud run jobs executions list \\"
echo "    --job process-newsletters \\"
echo "    --region us-central1"
echo ""
echo "═══════════════════════════════════════════════════════════════"

