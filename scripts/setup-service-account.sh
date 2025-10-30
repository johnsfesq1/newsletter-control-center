#!/bin/bash

# Service Account Setup Script for Newsletter Control Center
# This script creates a service account for BigQuery with proper permissions

set -e  # Exit on any error

PROJECT_ID="newsletter-control-center"
SERVICE_ACCOUNT_NAME="newsletter-bigquery-sa"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_FILE="$HOME/newsletter-bigquery-key.json"

echo "🚀 Setting up Service Account for BigQuery authentication..."
echo "Project: $PROJECT_ID"
echo "Service Account: $SERVICE_ACCOUNT_EMAIL"
echo ""

# Check if gcloud is installed and authenticated
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Please install it first:"
    echo "   https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "❌ Not authenticated with gcloud. Please run:"
    echo "   gcloud auth login"
    exit 1
fi

# Set the project
echo "📋 Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

# Create service account (ignore error if it already exists)
echo "👤 Creating service account..."
gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
    --display-name="Newsletter BigQuery Service Account" \
    --description="Service account for Newsletter Control Center BigQuery operations" \
    2>/dev/null || echo "   (Service account already exists)"

# Grant BigQuery permissions
echo "🔐 Granting BigQuery permissions..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/bigquery.dataEditor" \
    --quiet

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/bigquery.jobUser" \
    --quiet

# Create and download service account key
echo "🔑 Creating service account key..."
gcloud iam service-accounts keys create $KEY_FILE \
    --iam-account=$SERVICE_ACCOUNT_EMAIL \
    --quiet

echo ""
echo "✅ Service Account setup complete!"
echo ""
echo "📁 Key file created at: $KEY_FILE"
echo "📧 Service Account: $SERVICE_ACCOUNT_EMAIL"
echo ""
echo "🔧 Next steps:"
echo "1. Add this line to your .env file:"
echo "   GOOGLE_APPLICATION_CREDENTIALS=$KEY_FILE"
echo ""
echo "2. Update your BigQuery code to use the service account"
echo "3. Test with: npx ts-node scripts/test-bigquery-auth.ts"
echo ""
echo "⚠️  Keep the key file secure and never commit it to version control!"
