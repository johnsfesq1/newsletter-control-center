# Manual Steps Checklist - Dual Inbox Setup

Complete these steps BEFORE we start implementation.

---

## ✅ Step 1: Create Clean Inbox (30 min)

**What to do**:
1. Choose email provider (Gmail recommended for consistency)
2. Create new email address (e.g., `ncc@yourdomain.com` or `newsletters@yourdomain.com`)
3. Sign up and verify the account

**Important**: Use a completely new account, NOT a Gmail alias or forwarding address

**Status**: ✅ Completed

---

## ✅ Step 2: Get OAuth Credentials (20 min)

**What to do**:

### Option A: Use Existing Google Cloud Project
1. Go to Google Cloud Console → Your existing project
2. APIs & Services → Credentials
3. Use EXISTING OAuth credentials (same ones as legacy inbox)
4. Note: You can reuse the same Client ID and Secret

### Option B: Create New Credentials (Not Recommended)
Only if you want separate credentials for some reason

### Get Refresh Token for New Inbox
1. Add to `.env`:
   ```bash
   GMAIL_CLEAN_CLIENT_ID=<same as legacy>
   GMAIL_CLEAN_CLIENT_SECRET=<same as legacy>
   ```

2. Run token generation:
   ```bash
   npx tsx scripts/get-gmail-token.js
   ```

3. When prompted, use the CLEAN inbox (new email address)

4. Copy the refresh token

5. Add to `.env`:
   ```bash
   GMAIL_LEGACY_REFRESH_TOKEN=<existing>
   GMAIL_CLEAN_REFRESH_TOKEN=<new token here>
   ```

**Status**: ✅ Completed

---

## ✅ Step 3: Subscribe Test Newsletter (5 min)

**What to do**:
1. Pick a high-value newsletter you read regularly
2. Visit their website
3. Subscribe using your NEW clean inbox email
4. Confirm subscription
5. Wait for first email to arrive

**Good test candidates**:
- Axios (daily)
- Semafor (frequent)
- Any newsletter you check often

**Why**: We need sample data to test dual ingestion

**Status**: ✅ Completed

---

## ✅ Step 4: Update .env File Template

**Current `.env`** (you have):
```bash
GMAIL_CLIENT_ID=[YOUR_CLIENT_ID_HERE]
GMAIL_CLIENT_SECRET=[YOUR_CLIENT_SECRET_HERE]
GMAIL_REFRESH_TOKEN=[YOUR_LEGACY_REFRESH_TOKEN_HERE]
BIGQUERY_PROJECT_ID=newsletter-control-center
```

**New `.env`** (after steps 1-3):
```bash
# These stay the same
GMAIL_CLIENT_ID=[YOUR_CLIENT_ID_HERE]
GMAIL_CLIENT_SECRET=[YOUR_CLIENT_SECRET_HERE]
BIGQUERY_PROJECT_ID=newsletter-control-center

# Legacy inbox (existing, keep as-is)
GMAIL_LEGACY_REFRESH_TOKEN=<your existing refresh token>

# Clean inbox (NEW, from step 2)
GMAIL_CLEAN_REFRESH_TOKEN=<new refresh token from step 2>

# Clean inbox email (for reference/testing)
CLEAN_INBOX_EMAIL=your-new-inbox@example.com
```

**Status**: ✅ Completed

---

## ✅ Verification Steps

After completing all steps, verify:

### Check 1: Can access legacy inbox
```bash
npx tsx scripts/whoami.ts
```
Should show: `johnsnewsletters@gmail.com` or similar

### Check 2: Clean inbox credentials saved
Look at `.env` file - should have both `GMAIL_LEGACY_REFRESH_TOKEN` and `GMAIL_CLEAN_REFRESH_TOKEN`

### Check 3: Test newsletter received
Log into clean inbox - should see at least 1 newsletter email

### Check 4: Both inboxes accessible via Gmail API
(This will be tested during implementation)

**Status**: ✅ Completed

---

## ⏱️ Estimated Time

- Step 1 (Create inbox): 30 minutes
- Step 2 (Get credentials): 20 minutes  
- Step 3 (Subscribe test): 5 minutes
- Step 4 (Update .env): 5 minutes
- Verification: 10 minutes

**Total**: ~1 hour

---

## 🚀 Ready to Build

Once all boxes are checked, say:

**"Start dual inbox implementation"**

I'll take over and implement the technical side.

---

## 📝 Notes Section

Use this space to track your progress:

**Clean inbox email**: nsm@internationalintrigue.io ✅

**Refresh token obtained**: ✅ Yes ([REDACTED])

**Test newsletter subscribed**: ✅ Yes (3 messages found)

**Completion date**: October 30, 2025

