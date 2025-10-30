# Getting Your BigQuery Refresh Token

The script is now running and waiting for you. Follow these steps:

## Steps to Get Your Token

1. **Copy this URL** (it's displayed in your terminal):

```
https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&prompt=consent&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fbigquery%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcloud-platform&response_type=code&client_id=[YOUR_CLIENT_ID_HERE]&redirect_uri=urn%3Aietf%3Awg%3Aoauth%3A2.0%3Aoob
```

**Note**: Replace `[YOUR_CLIENT_ID_HERE]` with your actual OAuth Client ID

2. **Paste it into your browser** and press Enter

3. **Sign in** with your Google account

4. You'll see a page asking for permission - click **"Allow"**

5. Your browser will show **"Connection Error"** - THIS IS EXPECTED AND NORMAL!

6. **Copy the ENTIRE URL** from your browser's address bar (it will start with `urn:ietf:wg:oauth:2.0:oob?...`)

7. Go back to your **Terminal window** where the script is running

8. **Paste the URL** and press Enter

9. The script will give you a refresh token - **copy it**

10. **Update your .env file** with this new refresh token

---

## Quick Commands

After you get your new token, run these:

```bash
# Update .env with the new token (or do it manually)
# Then run:
npx tsx scripts/refresh-auth.ts

# Then test:
npx tsx scripts/test-bigquery-auth-simple.ts
```

---

**Tip**: The URL in your terminal is already formatted correctly. Just copy it from there!

