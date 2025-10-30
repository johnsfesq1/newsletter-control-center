# Step-by-Step Service Account Setup Guide

Follow these steps **in order**. Take your time - there's no rush!

---

## 📋 BEFORE YOU START

**You need**: Your Google Cloud account that has access to the "newsletter-control-center" project  
**Time needed**: 10-15 minutes  
**Difficulty**: Easy (I'll guide you through every click)

---

## Step 1: Open Google Cloud Console ⚙️

1. Open your web browser (Chrome, Firefox, Safari - any browser works)
2. Go to this website: **https://console.cloud.google.com/**
3. Sign in with your Google account (the one used for this project)

**What you'll see**: A dashboard with various Google Cloud services

---

## Step 2: Find Your Project 🔍

1. Look at the **top of the page** - you'll see a project dropdown (it may show a project name)
2. Click on the **project dropdown** (the blue bar at the very top)
3. You might see a search box - type: **newsletter-control-center**
4. Click on **"newsletter-control-center"** when it appears

**Success**: The top of the page should now say "newsletter-control-center"

---

## Step 3: Go to Service Accounts Page 👤

1. In the **left sidebar**, look for **"IAM & Admin"**
   - If you don't see it, there's a menu icon (☰) at the top left - click it
2. Click on **"IAM & Admin"**
3. In the submenu that appears, click **"Service Accounts"**

**What you'll see**: A list of service accounts (might be empty if this is your first)

---

## Step 4: Create a New Service Account ➕

1. Click the **blue "+ CREATE SERVICE ACCOUNT"** button at the top
2. You'll see a form with these fields:

   **Service account name**: Type exactly: `newsletter-bigquery-sa`  
   
   **Service account ID**: This will auto-fill (just leave it)  
   
   **Description**: Type: `Service account for Newsletter Control Center BigQuery operations`

3. Click **"CREATE AND CONTINUE"** (the blue button at the bottom right)

**Success**: The form will change to show "Grant this service account access to project"

---

## Step 5: Add Permissions (Important!) 🔐

Now you need to give this service account permission to use BigQuery.

1. In the section that says "Grant this service account access to project", you'll see a dropdown
2. Click in the **Role** dropdown box
3. Start typing: `BigQuery Data Editor`
4. You'll see suggestions - click on **"BigQuery Data Editor"**
5. Now click **"ADD ANOTHER ROLE"** (or if there's already an empty dropdown)
6. In the new dropdown, start typing: `BigQuery Job User`
7. Select **"BigQuery Job User"** from the suggestions
8. Click **"CONTINUE"** (blue button at bottom)

**Success**: You'll see a "Grant users access to this service account" screen

---

## Step 6: Skip User Access (Skip This!) ⏭️

1. You can skip this entire step
2. Just click **"DONE"** (blue button at bottom)

**Success**: You'll be taken back to the Service Accounts list and see "newsletter-bigquery-sa" in the list

---

## Step 7: Create a Key File 🔑

This step downloads a special file you'll need.

1. In the list of service accounts, find **"newsletter-bigquery-sa"** (the one you just created)
2. Click on it - it might be a link or you click the row
3. You'll see details about the service account
4. Click on the **"KEYS"** tab at the top
5. Click **"ADD KEY"**
6. From the dropdown, click **"Create new key"**
7. A dialog will appear - make sure **"JSON"** is selected (it should be by default)
8. Click **"CREATE"**

**WHAT HAPPENS**: A JSON file will automatically download to your computer! ⬇️

---

## Step 8: Find the Downloaded File 📁

The file you just downloaded has a name like:
```
newsletter-control-center-XXXXXXXXXXXX.json
```

**Where to find it:**
- **Mac**: Check your **Downloads** folder (click the Downloads icon in your Dock, or open Finder and click Downloads in the sidebar)
- **Check your browser**: Look for the download arrow/icon in your browser - click it to see recent downloads

**IMPORTANT**: Don't close the browser yet! But also write down where this file is.

---

## Step 9: Move the File to a Safe Location 🗂️

Now we need to move this file to a safe place. I'll give you the commands to run in Terminal.

1. Open **Terminal** on your Mac:
   - Press Command + Spacebar
   - Type: `Terminal`
   - Press Enter
   - A Terminal window will open

2. Copy and paste this command (one at a time, pressing Enter after each):

```bash
mkdir -p ~/.config/newsletter-control-center
```

This creates a safe directory for your key file.

3. Now, move the downloaded file. **Replace FILENAME** with your actual file name:

```bash
mv ~/Downloads/newsletter-control-center-*.json ~/.config/newsletter-control-center/service-account-key.json
```

If your file has a different name or location, adjust the path. For example:
```bash
mv ~/Downloads/newsletter-bigquery-sa-*.json ~/.config/newsletter-control-center/service-account-key.json
```

4. Verify it worked:

```bash
ls -lh ~/.config/newsletter-control-center/
```

You should see: `service-account-key.json`

**Success!** ✅ Your key file is now safely stored.

---

## Step 10: Update Your .env File 📝

Now we need to tell your application where to find the key file.

1. Open Finder
2. Navigate to your project folder: **Documents/newsletter-control-center/**
3. Look for a file called **".env"** (it starts with a dot, so it might be hidden)
4. Right-click on it and choose **"Open With"** → **"TextEdit"** (or any text editor)

5. Add this line at the end of the file (on a new line):
```
GOOGLE_APPLICATION_CREDENTIALS=/Users/jsf/.config/newsletter-control-center/service-account-key.json
```

6. Save the file (Command + S)

**Success!** ✅ Your application now knows where the key is.

---

## Step 11: Tell Me You're Done! 🎉

Now that you've completed steps 1-10, let me know by saying:
- "I've completed the setup" or
- "I'm done with the service account setup" or
- "Ready for the next step"

I'll then:
1. Update the code to use the service account
2. Test that it works
3. Confirm we're ready to reprocess

---

## ⚠️ Troubleshooting

### "I can't find the project dropdown"
Look at the very top blue bar - there should be a project selector. If you can't find it, the URL should show the project ID in it.

### "I don't see Service Accounts"
Make sure you clicked "IAM & Admin" first in the left sidebar, then Service Accounts from the submenu.

### "The file didn't download"
Try steps 6-7 again. The download should happen automatically when you click CREATE.

### "I can't find the .env file"
It might be hidden because it starts with a dot. In Finder, press **Command + Shift + .** (period) to show hidden files.

### "Terminal says 'No such file or directory'"
Double-check the file path. You can also drag the file from Finder into Terminal to get its full path.

---

## What This Accomplishes ✅

Once complete, your overnight processing will:
- Never have authentication expire
- Run for 8+ hours without issues
- Work automatically without your intervention
- Be production-ready

**Take your time with each step. When you're ready for help, just let me know!**

