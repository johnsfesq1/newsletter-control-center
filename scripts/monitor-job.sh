#!/bin/bash

# Monitor Cloud Run Job for Newsletter Processing
# This script checks job status and can auto-restart on failure

JOB_NAME="process-newsletters"
REGION="us-central1"
PROJECT_ID="newsletter-control-center"

echo "═══════════════════════════════════════════════════════════════"
echo "📊 Cloud Run Job Monitor: $JOB_NAME"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check latest execution
echo "🔍 Checking latest job execution..."
LATEST_EXEC=$(gcloud run jobs executions list \
  --job=$JOB_NAME \
  --region=$REGION \
  --limit=1 \
  --format="value(name)")

if [ -z "$LATEST_EXEC" ]; then
  echo "❌ No executions found"
  exit 1
fi

echo "   Latest execution: $LATEST_EXEC"
echo ""

# Get execution status
STATUS=$(gcloud run jobs executions describe "$LATEST_EXEC" \
  --region=$REGION \
  --format="value(status.conditions[0].type)")

echo "📋 Status: $STATUS"

# Check if failed
FAILED_COUNT=$(gcloud run jobs executions describe "$LATEST_EXEC" \
  --region=$REGION \
  --format="value(status.failedCount)")

SUCCEEDED_COUNT=$(gcloud run jobs executions describe "$LATEST_EXEC" \
  --region=$REGION \
  --format="value(status.succeededCount)")

if [ "$FAILED_COUNT" = "1" ]; then
  echo ""
  echo "❌ Job FAILED!"
  echo ""
  echo "📝 Recent error logs:"
  gcloud logging read \
    "resource.type=cloud_run_job AND resource.labels.job_name=$JOB_NAME AND severity>=ERROR" \
    --limit=5 \
    --format="table(timestamp,severity,textPayload)" \
    --project=$PROJECT_ID | head -20
  
  echo ""
  echo "💡 The job should automatically resume from the last processed ID on restart."
  echo ""
  read -p "🔄 Restart the job now? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Restarting job..."
    gcloud run jobs execute $JOB_NAME --region $REGION
    echo ""
    echo "✅ Job restarted! Monitor with:"
    echo "   gcloud logging tail \"resource.type=cloud_run_job AND resource.labels.job_name=$JOB_NAME\""
  fi
elif [ "$SUCCEEDED_COUNT" = "1" ]; then
  echo ""
  echo "✅ Job SUCCEEDED!"
  echo ""
  echo "📊 Check results in BigQuery:"
  echo "   bq query --use_legacy_sql=false \\"
  echo "     \"SELECT COUNT(DISTINCT newsletter_id) as processed FROM \`$PROJECT_ID.ncc_newsletters.chunks\`\""
else
  echo ""
  echo "⏳ Job is RUNNING or PENDING"
  echo ""
  echo "📊 View live logs:"
  echo "   gcloud logging tail \"resource.type=cloud_run_job AND resource.labels.job_name=$JOB_NAME\""
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
