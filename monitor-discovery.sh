#!/bin/bash
# Monitor discovery progress

echo "🔍 Monitoring Discovery Progress..."
echo "Press Ctrl+C to stop"
echo ""

while true; do
  clear
  echo "╔═══════════════════════════════════════════════════════╗"
  echo "║      Newsletter Discovery Progress Monitor            ║"
  echo "╚═══════════════════════════════════════════════════════╝"
  echo ""
  npm run discovery:progress 2>/dev/null | tail -20
  echo ""
  echo "Process running: $(ps aux | grep -i 'discover-orchestrator' | grep -v grep | wc -l | xargs)"
  echo ""
  echo "Last updated: $(date '+%H:%M:%S')"
  echo "Checking again in 30 seconds..."
  sleep 30
done

