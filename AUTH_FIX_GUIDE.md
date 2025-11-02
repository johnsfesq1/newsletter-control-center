# Authentication Fix - Step by Step

## The Problem

Your Gmail OAuth refresh token expired. This is normal - Google requires periodic re-authentication for security.

## The Fix (10 minutes)

### Option 1: Refresh Legacy Token (Recommended)

This refreshes your existing `GMAIL_LEGACY_REFRESH_TOKEN`.

1. **Check your .env file** - Find the values:
   ```bash
   GMAIL_CLIENT_ID=<your client id>
   GMAIL_CLIENT_SECRET=<your client secret>
   ```

2. **Generate new token**:
   ```bash
   node scripts/get-gmail-token.js
   ```

3. **Follow prompts**:
   - Script prints OAuth URL
   - Open in browser
   - Sign in with `johnsnewsletters@gmail.com` (legacy inbox)
   - Approve access
   - Copy code from browser
   - Paste in terminal

4. **Update .env**:
   ```bash
   GMAIL_LEGACY_REFRESH_TOKEN=<new token from script>
   ```

5. **Test**:
   ```bash
   npx tsx scripts/whoami.ts
   ```

### Option 2: Use Cloud Run for Everything

If you're okay only running things in Cloud Run:
- All Gmail operations run in Cloud Run (has auth working)
- Local testing uses BigQuery via gcloud (also works)
- Skip local Gmail testing

## Which Approach?

**Recommendation**: Do Option 1 - refresh the token once, then you can test locally.

It's worth it because:
- Faster local development
- Can test Gmail features quickly
- Don't need to deploy to test
- Cloud Run auth will eventually expire too

## Long-Term Solution

Consider setting up:
- Service account for BigQuery (already working)
- Keep user OAuth for Gmail
- Auto-refresh logic (advanced, defer for now)

## After Fix

Once you refresh the token:
- Local scripts will work again
- Can test evaluation harness locally
- Can run retro-labeling script
- Cloud Run will continue working (separate auth)

