#!/bin/bash

JOB_NAME="discover-newsletters"
PROJECT="newsletter-control-center"
REGION="us-central1"
INTERVAL=10 # seconds between refreshes

echo "═══════════════════════════════════════════════════════════════"
echo "📊 LIVE DISCOVERY MONITORING"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Job: ${JOB_NAME}"
echo "Refresh interval: ${INTERVAL}s"
echo "Press Ctrl+C to stop"
echo ""
echo "Looking for latest execution..."
sleep 2

# Get the latest execution
LATEST_EXECUTION=$(gcloud run jobs executions list \
  --job "${JOB_NAME}" \
  --region "${REGION}" \
  --project "${PROJECT}" \
  --limit 1 \
  --format="value(name)" 2>/dev/null)

if [ -z "$LATEST_EXECUTION" ]; then
  echo "❌ No executions found. Job may still be starting..."
  echo "Will check again in 10 seconds..."
  sleep 10
  LATEST_EXECUTION=$(gcloud run jobs executions list \
    --job "${JOB_NAME}" \
    --region "${REGION}" \
    --project "${PROJECT}" \
    --limit 1 \
    --format="value(name)" 2>/dev/null)
fi

EXECUTION_ID=$(echo "$LATEST_EXECUTION" | awk -F'/' '{print $NF}')
echo "✅ Monitoring execution: ${EXECUTION_ID}"
echo ""

# Function to get job status
get_status() {
  gcloud run jobs executions describe "${LATEST_EXECUTION}" \
    --region "${REGION}" \
    --project "${PROJECT}" \
    --format="value(status.conditions[0].type,status.conditions[0].status)" 2>/dev/null
}

# Main monitoring loop
ITERATION=0
while true; do
  ITERATION=$((ITERATION + 1))
  clear
  
  echo "═══════════════════════════════════════════════════════════════"
  echo "📊 DISCOVERY PROGRESS - Update #${ITERATION}"
  echo "═══════════════════════════════════════════════════════════════"
  echo "Time: $(date '+%H:%M:%S')"
  echo ""
  
  # Check execution status
  STATUS=$(get_status)
  if [ ! -z "$STATUS" ]; then
    echo "Status: ${STATUS}"
  else
    echo "Status: Running..."
  fi
  echo ""
  
  # Get recent logs (last 30 lines)
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📋 RECENT LOGS (latest first):"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  gcloud logging read \
    "resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME} AND resource.labels.location=${REGION}" \
    --limit 30 \
    --format="value(textPayload)" \
    --project="${PROJECT}" 2>/dev/null | tail -30
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Next update in ${INTERVAL}s... (Ctrl+C to stop)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  sleep ${INTERVAL}
done

