#!/bin/bash

# Monitor overnight processing progress

echo "📊 Monitoring Newsletter Processing"
echo "===================================="
echo ""

# Check if process is running
if pgrep -f "process-newsletters.ts" > /dev/null; then
    echo "✅ Process is running"
    
    # Show last few lines of log
    if [ -f overnight-run.log ]; then
        echo ""
        echo "📝 Last 20 lines of log:"
        echo "-----------------------------------"
        tail -20 overnight-run.log
    fi
    
    # Check progress file
    if [ -f processing-progress.json ]; then
        echo ""
        echo "💾 Progress file exists (process can be resumed if needed)"
    fi
else
    echo "❌ Process is not running"
    
    # Show final output if log exists
    if [ -f overnight-run.log ]; then
        echo ""
        echo "📝 Final output:"
        echo "-----------------------------------"
        tail -50 overnight-run.log
    fi
fi

echo ""
echo "To view full log: tail -f overnight-run.log"
echo "To check progress: cat processing-progress.json"

