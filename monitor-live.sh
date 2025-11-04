#!/bin/bash

# Live monitoring for discovery job
EXEC_ID="discover-newsletters-xxmg5"
PROJECT="newsletter-control-center"
REGION="us-central1"
JOB_NAME="discover-newsletters"
UPDATE_INTERVAL=30

echo "═══════════════════════════════════════════════════════════════"
echo "📊 LIVE DISCOVERY PROGRESS MONITOR"
echo "═══════════════════════════════════════════════════════════════"
echo "Execution: ${EXEC_ID}"
echo "Update Interval: ${UPDATE_INTERVAL} seconds"
echo "Press Ctrl+C to stop"
echo ""

iteration=0

while true; do
  iteration=$((iteration + 1))
  clear
  echo "═══════════════════════════════════════════════════════════════"
  echo "📊 Update #${iteration} - $(date '+%H:%M:%S')"
  echo "═══════════════════════════════════════════════════════════════"
  
  # Get latest execution
  LATEST_EXEC=$(gcloud run jobs executions list \
    --job="${JOB_NAME}" \
    --region="${REGION}" \
    --project="${PROJECT}" \
    --limit=1 \
    --format="value(name)" 2>/dev/null)
  
  if [ ! -z "$LATEST_EXEC" ]; then
    echo "Execution: ${LATEST_EXEC}"
    
    # Get status
    STATUS=$(gcloud run jobs executions describe "${LATEST_EXEC}" \
      --region="${REGION}" \
      --project="${PROJECT}" \
      --format="value(status.conditions[0].type,status.conditions[0].status)" 2>/dev/null)
    echo "Status: ${STATUS}"
  else
    echo "Status: Finding execution..."
  fi
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📋 RECENT LOGS (Last 20 lines):"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  gcloud logging read \
    "resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}" \
    --limit 50 \
    --format="value(textPayload)" \
    --project="${PROJECT}" 2>/dev/null | \
    grep -v "^\[dotenv" | \
    grep -v "^$" | \
    tail -20
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔍 STEP STATUS CHECK:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  # Check for steps
  LOGS=$(gcloud logging read \
    "resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}" \
    --limit 500 \
    --format="value(textPayload)" \
    --project="${PROJECT}" 2>/dev/null)
  
  STEP1=$(echo "$LOGS" | grep -c "Step 1\|Substack.*Search" || echo "0")
  STEP2=$(echo "$LOGS" | grep -c "Step 2\|Recommendation" || echo "0")
  STEP3=$(echo "$LOGS" | grep -c "Step 3\|Directory" || echo "0")
  STEP4=$(echo "$LOGS" | grep -c "Step 4\|Beehiiv\|beehiiv" || echo "0")
  STEP5=$(echo "$LOGS" | grep -c "Step 5\|Web Search\|web search" || echo "0")
  COMPLETE=$(echo "$LOGS" | grep -c "DISCOVERY.*COMPLETE\|FINAL STATISTICS" || echo "0")
  
  echo "Step 1 (Substack Search):      $(if [ "$STEP1" -gt 0 ]; then echo "✅ Executed"; else echo "⏳ Pending"; fi)"
  echo "Step 2 (Recommendations):     $(if [ "$STEP2" -gt 0 ]; then echo "✅ Executed"; else echo "⏳ Pending"; fi)"
  echo "Step 3 (Directories):         $(if [ "$STEP3" -gt 0 ]; then echo "✅ Executed"; else echo "⏳ Pending"; fi)"
  echo "Step 4 (Beehiiv):             $(if [ "$STEP4" -gt 0 ]; then echo "✅ EXECUTING/EXECUTED"; else echo "⏳ Waiting..."; fi)"
  echo "Step 5 (Web Search):          $(if [ "$STEP5" -gt 0 ]; then echo "✅ EXECUTING/EXECUTED"; else echo "⏳ Waiting..."; fi)"
  echo "Final Summary:                $(if [ "$COMPLETE" -gt 0 ]; then echo "✅ COMPLETE"; else echo "⏳ In Progress"; fi)"
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔑 API KEY STATUS:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  API_WARNINGS=$(echo "$LOGS" | grep -c "API.*not configured\|not configured" || echo "0")
  if [ "$API_WARNINGS" -gt 0 ]; then
    echo "⚠️  API Key Warnings: ${API_WARNINGS} (Secrets may not be accessible)"
  else
    echo "✅ No API key warnings found"
  fi
  
  echo ""
  echo "⏱️  Next update in ${UPDATE_INTERVAL} seconds... (Ctrl+C to stop)"
  sleep ${UPDATE_INTERVAL}
done

