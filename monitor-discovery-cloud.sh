#!/bin/bash

# Monitor Discovery Job Progress
# Run this to check if discovery is working or stuck

JOB_NAME="discover-newsletters"
PROJECT="newsletter-control-center"
REGION="us-central1"

echo "═══════════════════════════════════════════════════════════════"
echo "📊 DISCOVERY JOB STATUS"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check latest execution
LATEST_EXEC=$(gcloud run jobs executions list \
  --job="$JOB_NAME" \
  --region="$REGION" \
  --project="$PROJECT" \
  --limit=1 \
  --format="value(name)" 2>/dev/null)

if [ -z "$LATEST_EXEC" ]; then
  echo "❌ No executions found. Job may not have started yet."
  exit 1
fi

echo "Latest Execution: $(basename $LATEST_EXEC)"
echo ""

# Get execution status
STATUS=$(gcloud run jobs executions describe "$LATEST_EXEC" \
  --region="$REGION" \
  --project="$PROJECT" \
  --format="value(status.conditions[0].type,status.conditions[0].status)" 2>/dev/null)

if echo "$STATUS" | grep -q "Ready.*True"; then
  echo "✅ Status: RUNNING"
elif echo "$STATUS" | grep -q "Complete.*True"; then
  echo "✅ Status: COMPLETED"
elif echo "$STATUS" | grep -q "Failed"; then
  echo "❌ Status: FAILED"
else
  echo "⏳ Status: $STATUS"
fi

echo ""

# Get recent logs (last 10 lines)
echo "═══════════════════════════════════════════════════════════════"
echo "📝 RECENT LOGS (Last 10 lines)"
echo "═══════════════════════════════════════════════════════════════"
echo ""

gcloud logging read \
  "resource.type=cloud_run_job AND resource.labels.job_name=$JOB_NAME" \
  --limit 10 \
  --format="value(textPayload)" \
  --project="$PROJECT" 2>/dev/null | tail -10

if [ $? -ne 0 ]; then
  echo "⚠️  No logs yet (job may still be starting)"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "💡 To watch logs continuously:"
echo "   ./WATCH_LOGS.sh"
echo "   (or run CHECK_PROGRESS.sh repeatedly)"
echo ""
echo "💡 To check progress in BigQuery:"
echo "   npm run discovery:progress"
echo ""
echo "═══════════════════════════════════════════════════════════════"

