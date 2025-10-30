# Step-by-Step Migration to Cloud Run

**Date**: October 30, 2025  
**Skill Level**: Novice (guided walkthrough)

---

## 🎯 What We're Building

A Docker container that runs your newsletter processing script on Google Cloud Run, so it runs in the background while you work on other features.

---

## ✅ Prerequisites Check

Before we start, let's verify you have what we need:

### Already Have ✅
- [x] Google Cloud Project: `newsletter-control-center`
- [x] BigQuery dataset: `ncc_newsletters`  
- [x] Working processing script
- [x] Environment variables in `.env`
- [x] 500 processed newsletters (safe!)

### Need to Install
- [ ] Google Cloud CLI (`gcloud`)
- [ ] Docker Desktop (to build/test locally)

---

## 📦 Step 1: Install Prerequisites (15 minutes)

### 1A. Install Google Cloud CLI

**On macOS** (your system):
```bash
# Install via Homebrew (if you have it)
brew install google-cloud-sdk

# OR download from Google
# Visit: https://cloud.google.com/sdk/docs/install
# Download and run the installer
```

**After installation**:
```bash
# Verify it worked
gcloud --version

# Login to Google Cloud
gcloud auth login

# Set your project
gcloud config set project newsletter-control-center
```

### 1B. Install Docker Desktop

**On macOS**:
```bash
# Download from: https://www.docker.com/products/docker-desktop
# Or via Homebrew:
brew install --cask docker
```

**After installation**:
```bash
# Start Docker Desktop app
# Wait until it shows "Docker is running" in menu bar

# Verify it worked
docker --version
```

---

## 🐳 Step 2: Create Dockerfile (5 minutes)

I'll create this for you. This tells Docker how to package your script.

**File**: `Dockerfile` (in project root)

```dockerfile
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Install tsx for running TypeScript directly
RUN npm install -g tsx

# Copy source code
COPY scripts/ scripts/
COPY newsletter-search/src/lib/ newsletter-search/src/lib/
COPY . .

# Set entrypoint to run the processing script
ENTRYPOINT ["tsx", "scripts/process-newsletters.ts"]

# Default command (empty)
CMD []
```

**What this does**:
- Starts with Node.js 20
- Installs your dependencies
- Copies your code
- Runs your script when container starts

---

## 🔧 Step 3: Build Docker Image (10 minutes)

**Test locally first** (so you can see if it works):

```bash
# Build the image
docker build -t process-newsletters:latest .

# This will take a few minutes the first time
# Future builds will be faster
```

**If build succeeds**, you'll see:
```
Successfully tagged process-newsletters:latest
```

**If build fails**, we'll debug together. Common issues:
- Missing files in Docker context
- npm install problems
- TypeScript compilation errors

---

## 🌐 Step 4: Push to Google Container Registry (5 minutes)

**Configure Docker to use GCR**:
```bash
gcloud auth configure-docker
```

**Tag your image**:
```bash
docker tag process-newsletters:latest \
  gcr.io/newsletter-control-center/process-newsletters:latest
```

**Push the image**:
```bash
docker push gcr.io/newsletter-control-center/process-newsletters:latest
```

**This uploads your container to Google's servers** so Cloud Run can access it.

---

## 🔐 Step 5: Store Secrets in Secret Manager (10 minutes)

Your `.env` file has sensitive data. We need to store it securely in Google Cloud.

**Create each secret**:
```bash
# Gmail OAuth credentials
gcloud secrets create gmail-client-id --data-file=<(echo -n "your-actual-client-id")
gcloud secrets create gmail-client-secret --data-file=<(echo -n "your-actual-secret")
gcloud secrets create gmail-legacy-token --data-file=<(echo -n "your-actual-legacy-token")
gcloud secrets create gmail-clean-token --data-file=<(echo -n "your-actual-clean-token")

# BigQuery project
gcloud secrets create bigquery-project --data-file=<(echo -n "newsletter-control-center")
```

**Replace the values** with your actual `.env` values.

**Get your service account email**:
```bash
gcloud projects get-iam-policy newsletter-control-center \
  --flatten="bindings[].members" \
  --filter="bindings.role:roles/editor" \
  --format="table(bindings.members)"
```

**Grant Cloud Run access**:
```bash
PROJECT_NUMBER=$(gcloud projects describe newsletter-control-center --format="value(projectNumber)")

gcloud secrets add-iam-policy-binding gmail-client-id \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
  
# Repeat for other secrets...
```

---

## 🚀 Step 6: Create Cloud Run Job (10 minutes)

**Create the job**:
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
  --set-env-vars PROCESS_LIMIT=73000 \
  --set-env-vars START_FROM=0
```

**This creates**:
- A job named `process-newsletters`
- Runs in `us-central1` region
- Has 7-day timeout (plenty of time)
- Uses 2GB RAM and 2 CPUs
- Will retry 3 times if it fails
- Loads secrets from Secret Manager
- Set to process all 73K newsletters

---

## 🧪 Step 7: Test with 10 Newsletters (5 minutes)

**Before running the full job, test it**:

```bash
# Update the job to process only 10 newsletters
gcloud run jobs update process-newsletters \
  --update-env-vars PROCESS_LIMIT=10 \
  --region us-central1

# Execute the job
gcloud run jobs execute process-newsletters --region us-central1

# Watch the logs in real-time
gcloud logging tail "resource.type=cloud_run_job AND resource.labels.job_name=process-newsletters"
```

**What to look for**:
- ✅ "✅ Fetched 10 newsletters"
- ✅ "⏭️  Skipping already processed" (your 500 newsletters)
- ✅ "✅ Created X chunks" (for new newsletters)
- ❌ Any errors (we'll debug if needed)

**If test succeeds**, you're ready for the full run!

---

## 🎬 Step 8: Execute Full Job (instant)

**Update to process all 73K**:
```bash
gcloud run jobs update process-newsletters \
  --update-env-vars PROCESS_LIMIT=73000 \
  --region us-central1
```

**Start the job**:
```bash
gcloud run jobs execute process-newsletters --region us-central1
```

**Monitor progress**:
```bash
# Tail logs in real-time
gcloud logging tail "resource.type=cloud_run_job AND resource.labels.job_name=process-newsletters"

# OR check BigQuery for progress
bq query --use_legacy_sql=false \
  "SELECT COUNT(DISTINCT newsletter_id) as processed 
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
```

**And you're done!** The job runs in the background. You can close your terminal, even shut down your computer. Google Cloud handles it.

---

## 📊 Step 9: Monitor Progress

**Check logs** (anytime):
```bash
gcloud logging tail "resource.type=cloud_run_job"
```

**Check BigQuery progress**:
```bash
bq query --use_legacy_sql=false \
  "SELECT COUNT(DISTINCT newsletter_id) as processed,
          COUNT(*) as total_chunks,
          MAX(created_at) as last_update
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
```

**Check job status**:
```bash
gcloud run jobs describe process-newsletters --region us-central1
```

**View in Cloud Console**:
- Visit: https://console.cloud.google.com/run/jobs
- Click on `process-newsletters`
- See logs, status, execution history

---

## 🆘 Troubleshooting

### "Permission denied" errors

**Problem**: Cloud Run doesn't have access to resources

**Fix**:
```bash
# Grant Cloud Run service account permissions
PROJECT_NUMBER=$(gcloud projects describe newsletter-control-center --format="value(projectNumber)")

gcloud projects add-iam-policy-binding newsletter-control-center \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"

gcloud projects add-iam-policy-binding newsletter-control-center \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

### "OAuth token expired" errors

**Problem**: Your Gmail refresh token expired

**Fix**: Generate new tokens (takes 5 minutes)
```bash
# Use the existing script
npx tsx scripts/get-gmail-token.js

# Update the secret
gcloud secrets versions add gmail-legacy-token --data-file=<(echo -n "new-token-here")
```

### "Image not found" errors

**Problem**: Image wasn't pushed to GCR

**Fix**:
```bash
# Rebuild and push
docker build -t process-newsletters:latest .
docker tag process-newsletters:latest gcr.io/newsletter-control-center/process-newsletters:latest
docker push gcr.io/newsletter-control-center/process-newsletters:latest
```

### Job fails immediately

**Problem**: Script crashes on startup

**Fix**: Check logs to see the error
```bash
gcloud logging read "resource.type=cloud_run_job AND severity>=ERROR" --limit 50
```

---

## 🎉 Success Criteria

**You'll know it's working when**:
1. ✅ Test run processes 10 newsletters successfully
2. ✅ Logs show "⏭️  Skipping already processed" for your 500 newsletters
3. ✅ Logs show "✅ Created X chunks" for new newsletters
4. ✅ BigQuery count increases over time
5. ✅ Job runs without errors for hours/days

---

## 📝 Estimated Timeline

| Step | Task | Time |
|------|------|------|
| 1 | Install prerequisites | 15 min |
| 2 | Create Dockerfile | 5 min (me) |
| 3 | Build Docker image | 10 min |
| 4 | Push to GCR | 5 min |
| 5 | Store secrets | 10 min |
| 6 | Create job | 10 min |
| 7 | Test run | 5 min |
| 8 | Full run | instant |
| **Total** | | **~60 minutes** |

---

## 🎯 Next Steps

**Tell me when you're ready** and I'll:
1. Create the Dockerfile
2. Help with each step
3. Debug any issues
4. Verify it's working

**Questions?** Just ask! I'll guide you through everything.

