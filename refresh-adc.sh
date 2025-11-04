#!/bin/bash
# Helper script to refresh Application Default Credentials
# Use this when you see "invalid_grant" errors

echo "Checking Application Default Credentials..."

if gcloud auth application-default print-access-token >/dev/null 2>&1; then
  echo "✅ ADC is valid"
  EXPIRY=$(gcloud auth application-default print-access-token 2>&1 | head -1)
  echo "   Token is valid"
else
  echo "⚠️  ADC expired or missing"
  echo "   Refreshing credentials..."
  gcloud auth application-default login
  echo ""
  echo "✅ ADC refreshed! Good for ~24 hours."
fi
