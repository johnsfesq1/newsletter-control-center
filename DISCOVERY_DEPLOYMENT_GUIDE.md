# Newsletter Discovery - Cloud Deployment Guide

Complete step-by-step guide to deploy discovery system to Cloud Run via GitHub.

---

## 📋 Prerequisites Checklist

Before starting, make sure you have:
- ✅ GitHub repository set up
- ✅ Code committed and pushed to GitHub
- ✅ Google Cloud project: `newsletter-control-center`
- ✅ Cloud Shell access (or gcloud CLI locally)
- ✅ Cloud Run API enabled
- ✅ Cloud Build API enabled

---

## 🚀 Step-by-Step Deployment

### **Step 1: Commit and Push to GitHub** (Local)

1. **Add the new files**:
   ```bash
   git add Dockerfile.discovery DEPLOY_DISCOVERY.sh DISCOVERY_DEPLOYMENT_GUIDE.md
   ```

2. **Commit**:
   ```bash
   git commit -m "Add Cloud Run deployment for discovery system"
   ```

3. **Push to GitHub**:
   ```bash
   git push origin main
   ```

✅ **Step 1 Complete**: Your code is now on GitHub.

---

### **Step 2: Open Cloud Shell**

1. **Visit**: https://shell.cloud.google.com
2. **Select project**: `newsletter-control-center` (if prompted)
3. **Wait** for Cloud Shell to initialize (~30 seconds)

✅ **Step 2 Complete**: You're now in Cloud Shell with all tools ready.

---

### **Step 3: Clone/Update Your Repository** (Cloud Shell)

**If you haven't cloned yet**:
```bash
git clone https://github.com/YOUR_USERNAME/newsletter-control-center.git
cd newsletter-control-center
```

**If you already have it cloned**:
```bash
cd ~/newsletter-control-center  # or wherever you cloned it
git pull origin main
```

✅ **Step 3 Complete**: Latest code is now in Cloud Shell.

---

### **Step 4: Set Up Environment Variables** (Cloud Shell)

Discovery needs these environment variables. They should already be set if you've deployed other jobs, but let's verify:

```bash
# Check if you have a .env file or secrets set up
# If using Secret Manager, secrets are auto-injected
# If using .env file, make sure it's in the repo (or use Secret Manager)
```

**Required variables** (already set if you have other Cloud Run jobs working):
- `BIGQUERY_PROJECT_ID` (usually `newsletter-control-center`)
- `GOOGLE_CUSTOM_SEARCH_API_KEY` (optional, for web search)
- `GOOGLE_CUSTOM_SEARCH_ENGINE_ID` (optional, for web search)
- `PERPLEXITY_API_KEY` (optional, for web search)

**Note**: Discovery will work without the search API keys (web search just won't find anything).

✅ **Step 4 Complete**: Environment is ready.

---

### **Step 5: Build and Deploy** (Cloud Shell)

1. **Make the script executable**:
   ```bash
   chmod +x DEPLOY_DISCOVERY.sh
   ```

2. **Run the deployment script**:
   ```bash
   ./DEPLOY_DISCOVERY.sh
   ```

   This will:
   - Build the Docker image (~5-7 minutes)
   - Create/update the Cloud Run job
   - Show you how to execute it

✅ **Step 5 Complete**: Discovery is deployed to Cloud Run!

---

### **Step 6: Execute Discovery Job** (Cloud Shell)

Run the discovery job:

```bash
gcloud run jobs execute discover-newsletters \
  --region us-central1 \
  --project newsletter-control-center
```

This starts the discovery process. It will:
- Discover newsletters from all sources
- Classify them
- Store results in BigQuery
- Take 1-2 hours for a full run

✅ **Step 6 Complete**: Discovery is running!

---

### **Step 7: Monitor Progress** (Cloud Shell)

**Watch logs in real-time**:
```bash
gcloud logging read \
  "resource.type=cloud_run_job AND resource.labels.job_name=discover-newsletters" \
  --limit 100 \
  --format="value(textPayload)" \
  --project newsletter-control-center \
  --follow
```

**Or check job status**:
```bash
gcloud run jobs executions list \
  --job discover-newsletters \
  --region us-central1 \
  --project newsletter-control-center
```

**Or view in Console**:
- Visit: https://console.cloud.google.com/run/jobs?project=newsletter-control-center
- Click on `discover-newsletters`
- Click on the latest execution
- View logs tab

---

## 📊 Verify Results

After the job completes, check discoveries in BigQuery:

```bash
# In Cloud Shell, run:
npx ts-node scripts/discovery/check-discovery-progress.ts
```

Or check manually:
```bash
gcloud logging read \
  "resource.type=cloud_run_job AND resource.labels.job_name=discover-newsletters AND textPayload:\"FINAL STATISTICS\"" \
  --limit 1 \
  --format="value(textPayload)" \
  --project newsletter-control-center
```

---

## 🔄 Future Updates

When you make changes to discovery code:

1. **Local**: Commit and push to GitHub
   ```bash
   git add .
   git commit -m "Update discovery..."
   git push origin main
   ```

2. **Cloud Shell**: Pull and redeploy
   ```bash
   cd ~/newsletter-control-center
   git pull origin main
   ./DEPLOY_DISCOVERY.sh
   ```

3. **Execute**:
   ```bash
   gcloud run jobs execute discover-newsletters --region us-central1
   ```

---

## ⚙️ Configuration Options

### Adjust Resources (if needed)

If you need more memory or CPU, edit `DEPLOY_DISCOVERY.sh`:
- `--memory 2Gi` (change to 4Gi if needed)
- `--cpu 2` (change to 4 if needed)
- `--timeout 3600` (1 hour, increase if runs take longer)

### Schedule Automatic Runs

To run discovery weekly:
```bash
gcloud scheduler jobs create http discover-newsletters-weekly \
  --location us-central1 \
  --schedule "0 2 * * 0" \
  --uri "https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/newsletter-control-center/jobs/discover-newsletters:run" \
  --http-method POST \
  --oauth-service-account-email YOUR_SERVICE_ACCOUNT@newsletter-control-center.iam.gserviceaccount.com
```

---

## 🐛 Troubleshooting

### Build fails
- Check that `Dockerfile.discovery` is in the repo
- Verify all dependencies are in `package.json`

### Job fails with auth errors
- Make sure Application Default Credentials are set
- Check that BigQuery API is enabled
- Verify project ID is correct

### Puppeteer issues
- The Dockerfile installs Chromium system dependencies
- If issues persist, check logs for specific Puppeteer errors

### Timeout issues
- Increase `--timeout` in deployment script (currently 3600 seconds = 1 hour)
- Full discovery runs may take 1-2 hours

---

## ✅ Success Checklist

After deployment, you should have:
- ✅ Docker image built and pushed to GCR
- ✅ Cloud Run job `discover-newsletters` created
- ✅ Job executable via `gcloud run jobs execute`
- ✅ Logs accessible via `gcloud logging read`
- ✅ Results stored in BigQuery `discovered_newsletters` table

---

## 📝 Summary

**What we built:**
1. `Dockerfile.discovery` - Container for discovery system
2. `DEPLOY_DISCOVERY.sh` - Automated deployment script
3. Cloud Run Job - Scheduled or on-demand execution

**Deployment flow:**
```
GitHub → Cloud Shell → Build → Deploy → Execute → Monitor
```

**Execution:**
- Manual: `gcloud run jobs execute discover-newsletters`
- Scheduled: Set up Cloud Scheduler (optional)

---

🎉 **You're all set!** Discovery can now run in the cloud, freeing up your local machine.

