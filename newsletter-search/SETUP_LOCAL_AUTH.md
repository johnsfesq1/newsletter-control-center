# Setting Up Local Authentication

The semantic search API needs Google Cloud authentication. Here's how to fix it:

## Option 1: Application Default Credentials (Recommended)

```bash
gcloud auth application-default login
```

This will open a browser, authenticate, and set up credentials for local development.

## Option 2: Use Service Account Key

1. Create/download service account key from Google Cloud Console
2. Set environment variable:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
   ```

## Option 3: Run in Cloud Shell (Easiest for Testing)

The API will work automatically in Cloud Shell since it uses the project's default service account.

---

**Quick Fix**: Run `gcloud auth application-default login` then restart the dev server.
