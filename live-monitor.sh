#!/bin/bash

JOB_NAME="discover-newsletters"
PROJECT="newsletter-control-center"
REGION="us-central1"
INTERVAL=10

echo "═══════════════════════════════════════════════════════════════"
echo "📊 LIVE DISCOVERY MONITORING"
echo "═══════════════════════════════════════════════════════════════"
echo "Refreshing every ${INTERVAL} seconds. Press Ctrl+C to stop."
echo ""

# Get latest execution
LATEST_EXEC=$(gcloud run jobs executions list \
  --job "${JOB_NAME}" \
  --region "${REGION}" \
  --project "${PROJECT}" \
  --limit 1 \
  --format="value(name)" 2>/dev/null)

EXEC_ID=$(echo "$LATEST_EXEC" | awk -F'/' '{print $NF}')
echo "Monitoring execution: ${EXEC_ID}"
echo ""

ITERATION=0
while true; do
  ITERATION=$((ITERATION + 1))
  clear
  
  echo "═══════════════════════════════════════════════════════════════"
  echo "📊 Update #${ITERATION} - $(date '+%H:%M:%S')"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
  
  # Check execution status
  STATUS_OUTPUT=$(gcloud run jobs executions describe "${LATEST_EXEC}" \
    --region "${REGION}" \
    --project "${PROJECT}" \
    --format="value(status.conditions[0].type,status.conditions[0].status,status.startTime,status.completionTime)" 2>/dev/null)
  
  if [ ! -z "$STATUS_OUTPUT" ]; then
    echo "Execution Status: ${STATUS_OUTPUT}"
  fi
  echo ""
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📋 RECENT LOGS:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  gcloud logging read \
    "resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME} AND resource.labels.location=${REGION}" \
    --limit 40 \
    --format="value(textPayload)" \
    --project="${PROJECT}" \
    --freshness=5m 2>/dev/null | tail -35
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Next update in ${INTERVAL}s..."
  
  sleep ${INTERVAL}
done

