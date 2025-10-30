# Manual Service Account Setup (No Coding Required)

This guide walks you through creating a service account for automated BigQuery access using the Google Cloud Console web interface.

---

## Step 1: Open Google Cloud Console

1. Open your web browser
2. Go to: **https://console.cloud.google.com/**
3. Sign in with your Google account (the one that has access to "newsletter-control-center" project)

---

## Step 2: Select Your Project

1. At the top of the page, click the **project dropdown** (it may say "My First Project" or another project name)
2. In the search box, type: **newsletter-control-center**
3. Click on **"newsletter-control-center"** to select it

---

## Step 3: Navigate to Service Accounts

1. In the left sidebar, click **"IAM & Admin"** (or search for "IAM & Admin" in the top search bar)
2. Click **"Service Accounts"** from the menu

---

## Step 4: Create a New Service Account

1. Click the **"+ CREATE SERVICE ACCOUNT"** button at the top
2. Fill in the details:
   - **Service account name**: `newsletter-bigquery-sa`
   - **Service account ID**: (auto-filled, should be `newsletter-bigquery-sa`)
   - **Description**: `Service account for Newsletter Control Center BigQuery operations`
3. Click **"CREATE AND CONTINUE"**

---

## Step 5: Grant Permissions

1. In the "Grant this service account access to project" section, you need to add **two roles**:
   
   **For Role #1:**
   - Click **"ADD ANOTHER ROLE"** if it doesn't show automatically
   - Type: `BigQuery Data Editor` in the dropdown
   - Select **"BigQuery Data Editor"** from the suggestions
   
   **For Role #2:**
   - Click **"ADD ANOTHER ROLE"**
   - Type: `BigQuery Job User` in the dropdown  
   - Select **"BigQuery Job User"** from the suggestions

2. Click **"CONTINUE"**

---

## Step 6: Grant User Access (Optional - Skip This Step)

1. You can skip this step for now
2. Click **"DONE"**

The service account should now be created and visible in your Service Accounts list.

---

## Step 7: Create a Service Account Key

1. In the Service Accounts list, find **"newsletter-bigquery-sa"** (the one you just created)
2. Click on the **email address** of the service account (e.g., `newsletter-bigquery-sa@newsletter-control-center.iam.gserviceaccount.com`)
3. Click on the **"KEYS"** tab at the top
4. Click **"ADD KEY"** → **"Create new key"**
5. Select **"JSON"** as the key type
6. Click **"CREATE"**

**Important**: This will automatically download a JSON file to your computer. **Don't lose this file!**

---

## Step 8: Find the Downloaded File

The file should have a name like:
```
newsletter-control-center-XXXXX-XXXXX.json
```
or 
```
newsletter-bigquery-sa-XXXXX-XXXXX.json
```

**Locations to check** (depending on your browser):
- **Downloads folder** (`~/Downloads/` on Mac, or check your Downloads folder)
- **Desktop** (sometimes Chrome/Firefox saves there)

**Write down the full path to this file** - you'll need it in the next step.

---

## Step 9: Move the Key File to a Safe Location

Open Terminal (Applications → Utilities → Terminal) and run these commands:

```bash
# This creates a safe directory for the key
mkdir -p ~/.config/newsletter-control-center

# This moves the key file from your Downloads (replace FILENAME with actual filename)
mv ~/Downloads/newsletter-control-center-*.json ~/.config/newsletter-control-center/service-account-key.json

# Check it worked
ls -lh ~/.config/newsletter-control-center/service-account-key.json
```

You should see output showing the file exists.

---

## Step 10: Update Your .env File

1. Open the `.env` file in your project directory (in the newsletter-control-center folder)
2. Add this line at the end (replace the path if you put the file somewhere else):

```
GOOGLE_APPLICATION_CREDENTIALS=/Users/jsf/.config/newsletter-control-center/service-account-key.json
```

3. Save the file

---

## Step 11: Update the Processing Script

We need to tell the script to use the service account key. This requires modifying the code.

**Don't worry** - I'll do this for you in the next step. You just need to let me know when you've completed steps 1-10.

---

## What This Accomplishes

Once complete, your authentication will:
- ✅ Never expire automatically
- ✅ Work for automated overnight runs
- ✅ Not require daily re-authentication
- ✅ Be production-ready

---

## Security Reminder

⚠️ **Important**: Keep the JSON key file secure!
- Never share it
- Never commit it to Git (it's already in `.gitignore`)
- If you ever lose it, you can create a new one and delete the old one

---

## Troubleshooting

### "I can't find the project"
Make sure you're signed in with the correct Google account that has access to the project.

### "I don't see Service Accounts option"
Try clicking "IAM & Admin" → "Service Accounts" (not just "IAM")

### "The file downloaded but I can't find it"
Check your browser's download history or recent files.

### "Permission denied when moving the file"
The file might still be downloading or your browser might have it locked. Close your browser first.

---

**Once you've completed Steps 1-10, let me know and I'll help with Step 11!**

