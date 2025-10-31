#!/bin/bash

# Start Remaining Newsletter Batch Processing (51K newsletters)
# This will process the remaining newsletters to complete the corpus

echo "═══════════════════════════════════════════════════════════════"
echo "🚀 Starting Remaining Newsletter Batch"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Configuration:"
echo "  - Starting from: 0"
echo "  - Processing: 60,000 newsletters (will skip already processed)"
echo "  - Already processed: ~22K newsletters"
echo "  - Expected new: ~51K newsletters"
echo "  - Expected duration: ~8-9 hours"
echo "  - Final corpus: ~73K newsletters"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Step 1: Update job configuration
echo "Step 1: Updating Cloud Run job configuration..."
gcloud run jobs update process-newsletters \
  --update-env-vars PROCESS_LIMIT=60000,START_FROM=0 \
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
echo "Expected completion: ~6-7 hours from now"
echo ""
echo "To monitor progress:"
echo "  gcloud logging read \\"
echo "    \"resource.type=cloud_run_job AND resource.labels.job_name=process-newsletters AND logName:\\\"projects/newsletter-control-center/logs/run.googleapis.com%2Fstdout\\\"\" \\"
echo "    --limit 50 \\"
echo "    --format=\"value(textPayload)\""
echo ""
echo "To check status:"
echo "  gcloud run jobs executions list \\"
echo "    --job process-newsletters \\"
echo "    --region us-central1"
echo ""
echo "═══════════════════════════════════════════════════════════════"

