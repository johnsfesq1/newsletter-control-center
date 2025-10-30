# Complete Cloud Shell Setup Guide

**Zero local installation. All from your browser.**

---

## 🎯 Step 1: Open Cloud Shell (30 seconds)

**Visit**: https://shell.cloud.google.com

**If prompted**:
1. Click "Activate Cloud Shell"
2. Wait 30 seconds for it to start
3. Select project: `newsletter-control-center`

You now have a terminal with everything pre-installed!

---

## 📦 Step 2: Get Your Code into Cloud Shell

### Option A: GitHub (if your code is on GitHub)

**Check if you have a repo**:
Look at your package.json:
```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/johnsfesq1/newsletter-control-center.git"
}
```

**Clone it** (in Cloud Shell terminal):
```bash
git clone https://github.com/johnsfesq1/newsletter-control-center.git
cd newsletter-control-center
```

**Done!** Your code is now in Cloud Shell.

---

### Option B: Upload Files (if not on GitHub)

**Cloud Shell has a file browser!**

1. In Cloud Shell, click the **☁️ folders icon** (top right)
2. Click **"Upload file"** button
3. Drag-and-drop files or click to browse

**Upload these files**:
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `Dockerfile`
- `scripts/` folder (entire folder)
- `newsletter-search/src/lib/` folder (entire folder)

**Create folder structure**:
```bash
mkdir -p newsletter-search/src/lib
```

Then upload files to the right locations.

---

## 🔧 Step 3: Enable Google Cloud APIs (2 minutes)

**Cloud Shell already has gcloud installed!**

Run these commands in Cloud Shell:

```bash
# Enable Cloud Build
gcloud services enable cloudbuild.googleapis.com

# Enable Cloud Run
gcloud services enable run.googleapis.com

# Enable Secret Manager
gcloud services enable secretmanager.googleapis.com

# Enable Artifact Registry (for storing Docker images)
gcloud services enable artifactregistry.googleapis.com
```

**Wait 30 seconds** for APIs to enable.

---

## 🐳 Step 4: Build Docker Image in Cloud (5 minutes)

**This uploads your code and builds the image in Google's cloud.**

```bash
# Make sure you're in the project directory
pwd
# Should show: .../newsletter-control-center

# Build the image (Google builds it in the cloud, not on your computer!)
gcloud builds submit --tag gcr.io/newsletter-control-center/process-newsletters:latest
```

**What happens**:
1. Google uploads your code
2. Builds a Docker image using your Dockerfile
3. Stores it in Google Container Registry
4. Takes 5-10 minutes the first time

**You'll see**:
```
Creating temporary tarball archive of X files...
Uploading tarball to Cloud Storage...
Starting build...
Successfully completed.
```

---

## 🔐 Step 5: Store Secrets (10 minutes)

**Important**: Replace the values below with YOUR actual values from `.env`.

### Get your secrets ready

You need these from your `.env`:
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_LEGACY_REFRESH_TOKEN`
- `GMAIL_CLEAN_REFRESH_TOKEN`
- `BIGQUERY_PROJECT_ID` (should be "newsletter-control-center")

### Create secrets

**Replace the values in the commands below!**

```bash
# Gmail OAuth Client ID
echo -n "YOUR_ACTUAL_CLIENT_ID_HERE" | gcloud secrets create gmail-client-id --data-file=-

# Gmail OAuth Client Secret
echo -n "YOUR_ACTUAL_CLIENT_SECRET_HERE" | gcloud secrets create gmail-client-secret --data-file=-

# Gmail Legacy Refresh Token
echo -n "YOUR_ACTUAL_LEGACY_TOKEN_HERE" | gcloud secrets create gmail-legacy-token --data-file=-

# Gmail Clean Refresh Token
echo -n "YOUR_ACTUAL_CLEAN_TOKEN_HERE" | gcloud secrets create gmail-clean-token --data-file=-

# BigQuery Project ID
echo -n "newsletter-control-center" | gcloud secrets create bigquery-project --data-file=-
```

### Grant access to Cloud Run

```bash
# Get your project number
PROJECT_NUMBER=$(gcloud projects describe newsletter-control-center --format="value(projectNumber)")

# Grant access to each secret
gcloud secrets add-iam-policy-binding gmail-client-id \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding gmail-client-secret \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding gmail-legacy-token \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding gmail-clean-token \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding bigquery-project \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Grant BigQuery and Vertex AI access

```bash
# Grant BigQuery access
gcloud projects add-iam-policy-binding newsletter-control-center \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"

# Grant Vertex AI access
gcloud projects add-iam-policy-binding newsletter-control-center \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

---

## 🚀 Step 6: Create Cloud Run Job (5 minutes)

**Create the job that will run your script:**

```bash
gcloud run jobs create process-newsletters \
  --image gcr.io/newsletter-control-center/process-newsletters:latest \
  --region us-central1 \
  --task-timeout 7d \
  --memory 2Gi \
  --cpu 2 \
  --max-retries 3 \
  --set-secrets GMAIL_CLIENT_ID=gmail-client-id:latest \
  --set-secrets GMAIL_CLIENT_SECRET=gmail-client-secret:latest \
  --set-secrets GMAIL_LEGACY_REFRESH_TOKEN=gmail-legacy-token:latest \
  --set-secrets GMAIL_CLEAN_REFRESH_TOKEN=gmail-clean-token:latest \
  --set-secrets BIGQUERY_PROJECT_ID=bigquery-project:latest \
  --set-env-vars PROCESS_LIMIT=10 \
  --set-env-vars START_FROM=0
```

**What this does**:
- Creates job named `process-newsletters`
- Uses the image you just built
- Runs in `us-central1` region
- Has 7-day timeout (plenty!)
- Uses 2GB RAM and 2 CPUs
- Loads your secrets
- Sets to process 10 newsletters (test run)

---

## 🧪 Step 7: Test with 10 Newsletters (5 minutes)

**Execute the job:**

```bash
gcloud run jobs execute process-newsletters --region us-central1
```

**Watch the logs** (in a new Cloud Shell tab):

```bash
gcloud logging tail "resource.type=cloud_run_job AND resource.labels.job_name=process-newsletters"
```

**What to look for**:
- ✅ "✅ Fetched 10 newsletters"
- ✅ "⏭️  Skipping already processed" (should see this for your 500!)
- ✅ "✅ Created X chunks"
- ✅ No errors

**If you see errors**, tell me what they say and we'll debug.

---

## 🎬 Step 8: Run Full Job (instant)

**Once test succeeds, update to process all 73K:**

```bash
gcloud run jobs update process-newsletters \
  --update-env-vars PROCESS_LIMIT=73000 \
  --region us-central1
```

**Execute full job:**

```bash
gcloud run jobs execute process-newsletters --region us-central1
```

**Monitor progress:**

```bash
# Watch logs
gcloud logging tail "resource.type=cloud_run_job AND resource.labels.job_name=process-newsletters"

# Or check BigQuery
bq query --use_legacy_sql=false \
  "SELECT COUNT(DISTINCT newsletter_id) as processed 
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
```

**Close the browser.** The job keeps running in Google's cloud!

---

## 📊 Step 9: Monitor Anytime

**Reopen Cloud Shell** and run:

```bash
# Check job status
gcloud run jobs describe process-newsletters --region us-central1

# View logs
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=process-newsletters" --limit 50

# Check BigQuery progress
bq query --use_legacy_sql=false \
  "SELECT COUNT(DISTINCT newsletter_id) as processed,
          COUNT(*) as total_chunks,
          MAX(created_at) as last_update
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
```

**Or view in browser**:
- Cloud Run Jobs: https://console.cloud.google.com/run/jobs?project=newsletter-control-center
- Logs: https://console.cloud.google.com/logs?project=newsletter-control-center
- BigQuery: https://console.cloud.google.com/bigquery?project=newsletter-control-center

---

## 🎉 Success Checklist

**You're done when**:
- ✅ Test run processes 10 newsletters
- ✅ Logs show your 500 newsletters being skipped
- ✅ Logs show new newsletters being processed
- ✅ BigQuery count increases over time
- ✅ Job runs without errors

---

## 🆘 Troubleshooting

### "Permission denied"

**Fix**:
```bash
# Make sure you ran Step 5 (Grant access)
```

### "Secret not found"

**Fix**:
```bash
# List secrets to verify they exist
gcloud secrets list

# If missing, re-run Step 5
```

### "Image not found"

**Fix**:
```bash
# Re-build the image
gcloud builds submit --tag gcr.io/newsletter-control-center/process-newsletters:latest
```

### Job fails with "OAuth error"

**Fix**: Your refresh token might be expired
```bash
# Generate new token (I'll help with this)
# Then update the secret
echo -n "NEW_TOKEN" | gcloud secrets versions add gmail-legacy-token --data-file=-
```

---

## ⏱️ Timeline

| Step | Task | Time |
|------|------|------|
| 1 | Open Cloud Shell | 30 sec |
| 2 | Get code into shell | 2-5 min |
| 3 | Enable APIs | 2 min |
| 4 | Build image | 5-10 min |
| 5 | Store secrets | 10 min |
| 6 | Create job | 5 min |
| 7 | Test run | 5 min |
| 8 | Full run | instant |
| **Total** | | **30-40 min** |

---

## 🎯 Ready to Start?

**Tell me when you have**:
1. Cloud Shell open
2. Your code in the shell (either cloned from GitHub or uploaded)

Then I'll guide you through each step!

