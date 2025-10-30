# Service Account Setup for BigQuery Authentication

This guide shows you how to set up Service Account authentication for BigQuery so your credentials don't expire daily.

## Why Service Account Authentication?

- ✅ **No daily re-authentication needed** - Service account keys don't expire
- ✅ **More secure** - Separate credentials for each service
- ✅ **Production ready** - Standard practice for server applications
- ✅ **Long-term solution** - Keys last until manually rotated

## Quick Setup (Automated)

Run the setup script:

```bash
./scripts/setup-service-account.sh
```

This will:
1. Create a service account
2. Grant BigQuery permissions
3. Generate a key file
4. Show you what to add to your `.env` file

## Manual Setup (Step-by-Step)

### Step 1: Create Service Account

```bash
# Set your project ID
PROJECT_ID="newsletter-control-center"

# Create service account
gcloud iam service-accounts create newsletter-bigquery-sa \
    --display-name="Newsletter BigQuery Service Account" \
    --description="Service account for Newsletter Control Center BigQuery operations"

# Grant BigQuery permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:newsletter-bigquery-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:newsletter-bigquery-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/bigquery.jobUser"
```

### Step 2: Create Service Account Key

```bash
# Create and download the key file
gcloud iam service-accounts keys create ~/newsletter-bigquery-key.json \
    --iam-account=newsletter-bigquery-sa@newsletter-control-center.iam.gserviceaccount.com
```

### Step 3: Update Your .env File

Add this line to your `.env` file:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/Users/jsf/newsletter-bigquery-key.json
```

Your complete `.env` file should look like:

```bash
# Gmail API Configuration
GMAIL_CLIENT_ID=your_gmail_client_id_here
GMAIL_CLIENT_SECRET=your_gmail_client_secret_here
GMAIL_REFRESH_TOKEN=your_gmail_refresh_token_here

# BigQuery Configuration
BIGQUERY_PROJECT_ID=newsletter-control-center
GOOGLE_APPLICATION_CREDENTIALS=/Users/jsf/newsletter-bigquery-key.json
```

### Step 4: Test the Setup

Run the test script to verify everything works:

```bash
npx ts-node scripts/test-bigquery-auth.ts
```

You should see:
```
Initializing BigQuery client...
Running test query...
Query result: { count: '1234' }
✅ BigQuery authentication successful!
```

## What Changed in the Code

The BigQuery client initialization now uses the service account key:

```typescript
// Before (using Application Default Credentials - expires daily)
const bigquery = new BigQuery({ projectId: PROJECT_ID });

// After (using Service Account - never expires)
const bigquery = new BigQuery({ 
  projectId: PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});
```

## Security Best Practices

1. **Keep the key file secure** - Never commit it to version control
2. **Store in a safe location** - Use `~/.config/` or similar secure directory
3. **Rotate keys periodically** - Create new keys every 90 days
4. **Use least privilege** - Only grant necessary BigQuery permissions

## Troubleshooting

### Error: "Could not load the default credentials"
- Make sure `GOOGLE_APPLICATION_CREDENTIALS` points to the correct file path
- Verify the key file exists and is readable

### Error: "Permission denied"
- Check that the service account has the correct BigQuery roles
- Verify the project ID is correct

### Error: "Invalid key file"
- Recreate the service account key
- Make sure the key file is valid JSON

## Key File Location

The setup script creates the key file at:
```
~/newsletter-bigquery-key.json
```

You can move it to a more secure location if desired:
```bash
mkdir -p ~/.config/newsletter-control-center
mv ~/newsletter-bigquery-key.json ~/.config/newsletter-control-center/
```

Then update your `.env` file accordingly:
```bash
GOOGLE_APPLICATION_CREDENTIALS=/Users/jsf/.config/newsletter-control-center/newsletter-bigquery-key.json
```

## Verification

After setup, your authentication should work without daily re-authentication. The service account key will remain valid until you manually rotate it or delete the service account.
