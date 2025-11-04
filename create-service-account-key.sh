#!/bin/bash
# Script to create service account key
# Policies can take 5-10 minutes to propagate, so this will retry

SA_EMAIL="newsletter-local-dev@newsletter-control-center.iam.gserviceaccount.com"
KEY_FILE="$HOME/.gcloud/newsletter-local-dev-key.json"

echo "═══════════════════════════════════════════════════════════════"
echo "Creating Service Account Key"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Service Account: $SA_EMAIL"
echo "Key File: $KEY_FILE"
echo ""
echo "Note: If org policy was just changed, it can take 5-10 minutes"
echo "      to propagate. This script will retry every 30 seconds."
echo ""

MAX_ATTEMPTS=10
ATTEMPT=1

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
  echo "[Attempt $ATTEMPT/$MAX_ATTEMPTS] Trying to create key..."
  
  if gcloud iam service-accounts keys create "$KEY_FILE" --iam-account="${SA_EMAIL}" 2>&1; then
    echo ""
    echo "🎉 SUCCESS! Key created!"
    
    if [ -f "$KEY_FILE" ] && [ -s "$KEY_FILE" ]; then
      KEY_SIZE=$(wc -c < "$KEY_FILE")
      echo "   File: $KEY_FILE"
      echo "   Size: $KEY_SIZE bytes"
      
      if command -v jq >/dev/null 2>&1; then
        EMAIL=$(jq -r '.client_email' "$KEY_FILE" 2>/dev/null)
        echo "   Service Account: $EMAIL"
      fi
      
      echo ""
      echo "✅ Key created successfully!"
      echo ""
      echo "Environment variable is already set in ~/.zshrc"
      echo "Run: source ~/.zshrc (or restart terminal)"
      echo ""
      exit 0
    fi
  fi
  
  if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
    echo "   Still blocked (policy may still be propagating...)"
    echo "   Waiting 30 seconds before retry..."
    sleep 30
  fi
  
  ATTEMPT=$((ATTEMPT + 1))
done

echo ""
echo "⚠️  Key creation still blocked after $MAX_ATTEMPTS attempts"
echo ""
echo "Possible reasons:"
echo "  1. Policy hasn't propagated yet (wait 10-15 minutes total)"
echo "  2. Managed constraint still enforced (check console)"
echo "  3. Cached policy (might need to wait longer)"
echo ""
echo "Check policy status:"
echo "  https://console.cloud.google.com/iam-admin/org-policies?organizationId=454540305091"
echo ""
exit 1

