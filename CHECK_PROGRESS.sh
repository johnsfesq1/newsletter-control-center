#!/bin/bash

# Quick progress checker for newsletter processing

echo "📊 NEWSLETTER PROCESSING STATUS"
echo "================================="
echo ""

# Check if process is running
if pgrep -f "process-newsletters.ts" > /dev/null; then
    echo "✅ Process is running"
    echo ""
    
    # Show recent progress
    if [ -f overnight-run-v3.log ]; then
        echo "📝 Recent activity (last 15 lines):"
        echo "-----------------------------------"
        tail -15 overnight-run-v3.log
    fi
    
    # Check for progress file
    if [ -f processing-progress.json ]; then
        echo ""
        echo "💾 Progress saved (can resume if interrupted)"
        echo ""
        echo "📈 Summary from progress file:"
        cat processing-progress.json | grep -E "processed|failed|skipped" | head -4
    fi
else
    echo "❌ Process is not running"
    echo ""
    
    # Show final output
    if [ -f overnight-run-v3.log ]; then
        echo "📝 Final output:"
        echo "-----------------------------------"
        tail -50 overnight-run-v3.log
    fi
fi

echo ""
echo "💡 Commands:"
echo "   Watch live: tail -f overnight-run-v3.log"
echo "   Check progress: cat processing-progress.json"
echo "   Check process: ps aux | grep process-newsletters"

