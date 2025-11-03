# Quick Deployment Checklist

## ✅ Step-by-Step (5 Minutes)

### **Step 1: Commit & Push** (Local Machine)
```bash
cd /Users/jsf/Documents/newsletter-control-center

# Add new files
git add Dockerfile.discovery DEPLOY_DISCOVERY.sh DISCOVERY_DEPLOYMENT_GUIDE.md DEPLOYMENT_CHECKLIST.md

# Commit
git commit -m "Add Cloud Run deployment for discovery system"

# Push to GitHub
git push origin main
```
⏱️ **Time**: 1 minute

---

### **Step 2: Open Cloud Shell**
1. Visit: https://shell.cloud.google.com
2. Select project: `newsletter-control-center`
3. Wait for shell to start

⏱️ **Time**: 30 seconds

---

### **Step 3: Get Code** (Cloud Shell)
```bash
# If first time
git clone https://github.com/YOUR_USERNAME/newsletter-control-center.git
cd newsletter-control-center

# If already cloned
cd ~/newsletter-control-center  # or wherever you put it
git pull origin main
```
⏱️ **Time**: 1 minute

---

### **Step 4: Deploy** (Cloud Shell)
```bash
# Make script executable
chmod +x DEPLOY_DISCOVERY.sh

# Run deployment
./DEPLOY_DISCOVERY.sh
```
⏱️ **Time**: 5-7 minutes (mostly Docker build)

---

### **Step 5: Execute** (Cloud Shell)
```bash
gcloud run jobs execute discover-newsletters \
  --region us-central1 \
  --project newsletter-control-center
```
⏱️ **Time**: Instant (job starts)

---

### **Step 6: Monitor** (Cloud Shell)
```bash
# Watch logs
gcloud logging read \
  "resource.type=cloud_run_job AND resource.labels.job_name=discover-newsletters" \
  --limit 50 \
  --format="value(textPayload)" \
  --project newsletter-control-center \
  --follow
```

Or check in Console:
https://console.cloud.google.com/run/jobs?project=newsletter-control-center

---

## 🎯 That's It!

**Total setup time**: ~8-10 minutes
**Discovery runtime**: 1-2 hours (runs in background)

Once deployed, you can run discovery anytime with:
```bash
gcloud run jobs execute discover-newsletters --region us-central1
```

---

## 📋 Files Created

✅ `Dockerfile.discovery` - Container definition
✅ `DEPLOY_DISCOVERY.sh` - Deployment script  
✅ `DISCOVERY_DEPLOYMENT_GUIDE.md` - Full guide
✅ `DEPLOYMENT_CHECKLIST.md` - This checklist

---

## ⚠️ Important Notes

1. **Environment Variables**: Should already be set if you've deployed other jobs
2. **First Run**: May take longer (2+ hours) if discovering many newsletters
3. **Monitoring**: Use logs to track progress
4. **Costs**: Cloud Run Jobs only charge while running (~$0.10-0.50 per run)

---

## 🔄 Future Updates

When you change discovery code:
1. Commit & push to GitHub
2. In Cloud Shell: `git pull` then `./DEPLOY_DISCOVERY.sh`
3. Execute again

---

Ready to deploy? Start with **Step 1** above! 🚀

