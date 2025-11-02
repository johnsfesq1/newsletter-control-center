# Deployment Guide - Semantic Search System

**Status**: ✅ System working locally, ready to deploy!

---

## 🚀 Quick Deploy Options

### Option 1: Vercel (Recommended - Easiest)

**Time**: 10-15 minutes

```bash
cd newsletter-search
npm install -g vercel
vercel login
vercel --prod
```

**Environment Variables to Set in Vercel:**
- `BIGQUERY_PROJECT_ID=newsletter-control-center`
- `GOOGLE_APPLICATION_CREDENTIALS` (service account JSON, or use ADC)

**Pros:**
- ✅ Easiest deployment
- ✅ Automatic HTTPS
- ✅ Free tier available
- ✅ Automatic deployments from Git

---

### Option 2: Google Cloud Run

**Time**: 30-45 minutes

**Steps:**
1. Build Docker image:
   ```bash
   cd newsletter-search
   gcloud builds submit --tag gcr.io/newsletter-control-center/newsletter-search
   ```

2. Deploy to Cloud Run:
   ```bash
   gcloud run deploy newsletter-search \
     --image gcr.io/newsletter-control-center/newsletter-search \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated
   ```

3. Set environment variables in Cloud Run:
   - `BIGQUERY_PROJECT_ID=newsletter-control-center`
   - Uses service account automatically (no ADC needed)

**Pros:**
- ✅ Same cloud as your BigQuery data
- ✅ Automatic scaling
- ✅ Integrated with Google Cloud

---

## 🔐 Authentication Setup

### For Vercel:
- Use a service account JSON key
- Store in Vercel environment variables as `GOOGLE_APPLICATION_CREDENTIALS`
- Or use Secret Manager with ADC (more complex)

### For Cloud Run:
- Uses default service account automatically
- No additional setup needed if service account has BigQuery access

---

## 🧪 Post-Deployment Testing

1. **Test the endpoint:**
   ```bash
   curl -X POST https://your-domain.com/api/intelligence/query \
     -H "Content-Type: application/json" \
     -d '{"query": "What are recent AI developments?"}'
   ```

2. **Test the frontend:**
   - Open deployed URL in browser
   - Try a search query
   - Verify answers and citations appear

3. **Check logs:**
   - Vercel: Dashboard → Logs
   - Cloud Run: `gcloud logging read`

---

## 📊 What's Already Working

✅ **Local Development**: http://localhost:3000  
✅ **API Endpoint**: `/api/intelligence/query`  
✅ **Frontend UI**: Semantic search interface  
✅ **Authentication**: Application Default Credentials  
✅ **Data**: 938,601 chunks ready to search  

---

## 🎯 After Deployment

1. Share the URL with users
2. Monitor usage and costs (budget: $10/day built in)
3. Check logs for any errors
4. Iterate on UI improvements based on feedback

---

**Ready to deploy? Choose Vercel for speed, or Cloud Run for integration!** 🚀
