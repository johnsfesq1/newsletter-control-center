# OAuth Token Generation Steps

## Step-by-Step Instructions

### Step 1: Open the URL in Your Browser

**Copy and paste this entire URL** into your browser:

```
https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&prompt=consent&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly&redirect_uri=http%3A%2F%2Flocalhost&response_type=code&client_id=[YOUR_CLIENT_ID_HERE]
```

**Note**: Replace `[YOUR_CLIENT_ID_HERE]` with your actual OAuth Client ID

### Step 2: Sign In to Your NEW Inbox

**IMPORTANT**: You MUST sign in with `nsm@internationalintrigue.io` (your new clean inbox)

Do NOT use your existing johnsnewsletters@gmail.com account

### Step 3: Approve Access

- You'll see a screen asking to "Allow access"
- Click "Allow" or "Continue"

### Step 4: Copy the Authorization Code

After approving:
- Your browser will try to open `http://localhost` and fail (expected!)
- Look at the address bar - it will have a URL like:
  ```
  http://localhost/?code=4/1Ab2C3d4Ef5Gh6Ij7Kl8Mn9Op0Qr1St2Uv3Wx4Yz5Aa6Bb7Cc8Dd9Ee0Ff1Gg
  ```

- **Copy ONLY the code part** (everything after `code=` and before any `&`)

Example: If URL is `http://localhost/?code=4/1Ab2C3d4&scope=...`, copy: `4/1Ab2C3d4`

### Step 5: Paste Code in Terminal

- Go back to your terminal where the script is waiting
- Paste the code
- Press Enter

### Step 6: Get Your Refresh Token

The script will output your refresh token. It looks like:
```
1//0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e
```

**Copy this entire token** (placeholder shown above, your actual token will be different)

### Step 7: Add to .env File

Add this line to your `.env` file:
```bash
GMAIL_CLEAN_REFRESH_TOKEN=<paste your token here>
```

---

## Troubleshooting

### "Error: redirect_uri_mismatch"
- Make sure you're using the exact redirect_uri `http://localhost` (no trailing slash)
- Check that the URL in your browser matches exactly

### "No refresh_token returned"
- Make sure you added `nsm@internationalintrigue.io` as a test user in Google Cloud Console
- Make sure you selected the correct Google account
- Try again with the same URL

### Can't sign in with nsm@internationalintrigue.io
- Make sure you have access to that Google Workspace account
- Try logging into Gmail with that account first to verify access

