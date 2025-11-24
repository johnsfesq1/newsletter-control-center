#!/bin/bash

# Newsletter Control Center - Tranche 1 Processing Script
# Processes 15,000 newsletters overnight
# Est. time: ~8 hours
# Est. cost: ~$1.50

echo "🌙 Starting Tranche 1 Processing"
echo "================================="
echo "Newsletters: 0 to 14,999"
echo "Expected completion: ~8 hours"
echo "Expected cost: ~\$1.50"
echo ""
echo "Press Ctrl+C to pause (progress will be saved)"
echo ""
read -p "Press Enter to start..." -n 1

cd "$(dirname "$0")/.."

# Set environment variables
export START_FROM=0
export PROCESS_LIMIT=15000

# Run the processing script
npx tsx scripts/process-newsletters.ts

echo ""
echo "✅ Processing complete!"
