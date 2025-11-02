# Deployment Instructions - Cloud Run Fix

**Date**: November 1, 2025  
**Fix**: Cursor-based pagination to replace OFFSET  
**Status**: Ready to deploy

---

## 🚀 Quick Deploy (Cloud Shell)

### Option 1: Use the Deploy Script (Easiest)

```bash
# 1. Pull latest code
cd ~/newsletter-control-center/newsletter-control-center
git pull

# 2. Run deploy script
chmod +x DEPLOY_FIX.sh
./DEPLOY_FIX.sh
```

### Option 2: Manual Steps

```bash
# 1. Pull latest code
cd ~/newsletter-control-center/newsletter-control-center
git pull

# 2. Rebuild Docker image
gcloud builds submit --tag gcr.io/newsletter-control-center/process-newsletters:latest

# 3. Update Cloud Run job
gcloud run jobs update process-newsletters \
  --image gcr.io/newsletter-control-center/process-newsletters:latest \
  --region us-central1

# 4. Restart the job
gcloud run jobs execute process-newsletters --region us-central1
```

---

## 📊 Monitor the Deployment

### Watch logs in real-time:
```bash
gcloud logging tail "resource.type=cloud_run_job AND resource.labels.job_name=process-newsletters" --project=newsletter-control-center
```

### Check job status:
```bash
./scripts/monitor-job.sh
```

### Or manually:
```bash
# List latest execution
gcloud run jobs executions list \
  --job=process-newsletters \
  --region=us-central1 \
  --limit=1

# Check specific execution
gcloud run jobs executions describe <EXECUTION_NAME> \
  --region=us-central1
```

---

## ✅ What to Look For

### Good Signs:
- ✅ "📍 Resuming from newsletter ID: ..." (if resuming)
- ✅ "✅ Fetched X newsletters from BigQuery"
- ✅ "📍 Last processed ID: ..." (after each batch)
- ✅ Processing continues without memory errors

### Warning Signs:
- ⚠️ Any "Resources exceeded" errors (should retry automatically)
- ⚠️ Jobs failing immediately after start
- ⚠️ No progress after 10+ minutes

---

## 🔄 If Something Goes Wrong

### Job fails immediately:
1. Check logs: `gcloud logging read "resource.type=cloud_run_job..." --limit=50`
2. Look for error messages
3. The job should have saved progress - check if it can resume

### Job hangs:
1. The job saves progress after each batch (every 1000 newsletters)
2. You can safely cancel and restart
3. It will resume from the last processed ID

### Need to start fresh:
```bash
# Delete progress (in Cloud Shell, if accessible)
# Or just let the job run - duplicate prevention will skip already-processed
```

---

## 📝 Expected Behavior

### First Run (or after fixing):
- Loads progress file if exists
- Checks BigQuery for already-processed newsletters
- Starts from beginning (or lastProcessedId if resuming)
- Processes in batches of 1000
- Saves progress after each batch

### On Restart:
- Automatically loads `lastProcessedId` from progress file
- Resumes from that exact position
- No duplicates (checked against BigQuery)

---

## 🎯 Next Steps After Deploy

1. **Monitor first batch**: Watch the logs for the first 1000 newsletters
2. **Verify no duplicates**: Check that skipped count matches already-processed
3. **Let it run**: Once confirmed working, let it process the full 60K
4. **Check periodically**: Use `monitor-job.sh` to check status

---

## 💡 Tips

- **Don't cancel mid-batch**: Wait for "Batch X complete" messages
- **Progress is auto-saved**: Even if job fails, progress is preserved
- **Logs are your friend**: Watch for error patterns
- **Be patient**: Processing 60K newsletters takes time (~20-30 hours estimated)

---

**Ready to deploy!** 🚀
