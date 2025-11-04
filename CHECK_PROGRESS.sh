#!/bin/bash

# Simple progress check - just shows what's happening

echo "🔍 Checking discovery job progress..."
echo ""

# Show execution status
echo "📊 Job Status:"
gcloud run jobs executions list \
  --job discover-newsletters \
  --region us-central1 \
  --project newsletter-control-center \
  --limit 1 \
  --format="table(EXECUTION,RUNNING,COMPLETE,CREATED)"

echo ""
echo "📝 Latest Activity (last 15 log lines):"
echo "─────────────────────────────────────────"

gcloud logging read \
  "resource.type=cloud_run_job AND resource.labels.job_name=discover-newsletters" \
  --limit 30 \
  --format="value(textPayload)" \
  --project newsletter-control-center 2>/dev/null | \
  grep -E "(Searching|Found|Classifying|Complete|Progress|Stored|Step)" | \
  tail -15

echo ""
echo "💡 View full logs in Console:"
echo "   https://console.cloud.google.com/run/jobs/executions/details/us-central1/discover-newsletters-n6lv4?project=newsletter-control-center"
