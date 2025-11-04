#!/bin/bash

# Watch discovery logs - refreshes every 5 seconds

JOB_NAME="discover-newsletters"
PROJECT="newsletter-control-center"

echo "📺 Watching discovery logs (press Ctrl+C to stop)..."
echo "Refreshing every 5 seconds..."
echo ""

while true; do
  clear
  echo "═══════════════════════════════════════════════════════════════"
  echo "📊 Discovery Job Logs (Last 20 lines) - $(date '+%H:%M:%S')"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
  
  gcloud logging read \
    "resource.type=cloud_run_job AND resource.labels.job_name=$JOB_NAME" \
    --limit 20 \
    --format="value(textPayload)" \
    --project="$PROJECT" 2>/dev/null | tail -20
  
  echo ""
  echo "Refreshing in 5 seconds... (Ctrl+C to stop)"
  sleep 5
done

