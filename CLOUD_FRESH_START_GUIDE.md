# Cloud Fresh Start Guide - Step by Step

**You deleted the table by accident. Let's start fresh and do it right.**

---

## ✅ STEP 1: Verify Table is Empty

**What we're doing**: Make sure your chunks table is empty and ready to go.

**In Cloud Shell, run**:
```bash
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as total_chunks, COUNT(DISTINCT newsletter_id) as newsletters 
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
```

**What you should see**:
```
+--------------+-------------+
| total_chunks | newsletters |
+--------------+-------------+
|            0 |           0 |
+--------------+-------------+
```

**If you see 0 and 0**: ✅ Table is empty, proceed to Step 2.

**If you see numbers**: Table isn't empty. Tell me what you see.

---

## ✅ STEP 2: Test with 10 Newsletters

**What we're doing**: Process exactly 10 newsletters as a test.

**In Cloud Shell, run**:
```bash
gcloud run jobs update process-newsletters \
  --update-env-vars PROCESS_LIMIT=10,START_FROM=0 \
  --region us-central1
```

**Then execute**:
```bash
gcloud run jobs execute process-newsletters --region us-central1
```

**Wait 3 minutes** (the job will take 1-2 minutes).

**Check progress** (run this):
```bash
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as chunks, COUNT(DISTINCT newsletter_id) as newsletters 
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
```

**What you should see**:
```
+---------+-------------+
| chunks  | newsletters |
+---------+-------------+
| ~150    | 10          |
+---------+-------------+
```

**If you see ~150 chunks and 10 newsletters**: ✅ Step 2 passed! Go to Step 3.

**If you see 0**: Job failed. Tell me "Step 2 failed" and I'll help debug.

---

## ✅ STEP 3: Run the Three Quality Checks

**What we're doing**: Verify the data looks correct.

### Check 1: Chunk Count & Uniqueness

**In Cloud Shell, run**:
```bash
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as total_chunks, 
          COUNT(DISTINCT newsletter_id) as unique_newsletters,
          MAX(created_at) as most_recent
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
```

**What you should see**:
- `total_chunks`: 100-200 (reasonable range)
- `unique_newsletters`: 10
- `most_recent`: Recent timestamp (today)

**If all look good**: ✅ Check 1 passed!

**If wrong**: Tell me what you see.

---

### Check 2: Verify Embeddings

**In Cloud Shell, run**:
```bash
bq query --use_legacy_sql=false \
  "SELECT ARRAY_LENGTH(chunk_embedding) as embedding_dim
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`
   LIMIT 5"
```

**What you should see**:
```
+---------------+
| embedding_dim |
+---------------+
| 768           |
| 768           |
| 768           |
| 768           |
| 768           |
+---------------+
```

**If all are 768**: ✅ Check 2 passed!

**If different**: Tell me what you see.

---

### Check 3: Verify Content is Readable

**In Cloud Shell, run**:
```bash
bq query --use_legacy_sql=false \
  "SELECT chunk_text, LENGTH(chunk_text) as chunk_length
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`
   ORDER BY created_at DESC
   LIMIT 1"
```

**What you should see**:
```
+--------------+---------------+
| chunk_text   | chunk_length  |
+--------------+---------------+
| [actual text]| 400-1200      |
+--------------+---------------+
```

**Look at the chunk_text**: Does it look like real newsletter content? Not gibberish?

**If yes**: ✅ Check 3 passed!

**If gibberish**: Tell me "Check 3 failed".

---

## ✅ STEP 4: Test Resume Capability (Critical!)

**What we're doing**: Run the same 10-newsletter job AGAIN. It should SKIP them, not add duplicates.

**In Cloud Shell, run**:
```bash
gcloud run jobs execute process-newsletters --region us-central1
```

**Wait 3 minutes**.

**Then check**:
```bash
bq query --use_legacy_sql=false \
  "SELECT COUNT(DISTINCT newsletter_id) as newsletters 
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
```

**What you should see**:
- Still **10** newsletters (NOT 20!)
- This means it skipped the duplicates

**Also check the logs**:
```bash
gcloud logging read \
  "resource.type=cloud_run_job AND logName:\"projects/newsletter-control-center/logs/run.googleapis.com%2Fstdout\"" \
  --limit 50 \
  --format="value(textPayload)" \
  | head -30
```

**What you should see in logs**:
- "⏭️ Skipping already processed: [newsletter name]"
- Should see 10 skip messages

**If count stayed at 10 AND logs show skipping**: ✅ Resume works! Proceed to Step 5.

**If count increased to 20**: ❌ Resume broken. Tell me "Resume failed" and we need to fix it.

---

## ✅ STEP 5: Run 5K Tranche

**What we're doing**: Process 5,000 newsletters to test at scale.

**IMPORTANT**: Only do this if Step 4 passed (resume works).

**In Cloud Shell, run**:
```bash
gcloud run jobs update process-newsletters \
  --update-env-vars PROCESS_LIMIT=5000,START_FROM=0 \
  --region us-central1
```

**Then execute**:
```bash
gcloud run jobs execute process-newsletters --region us-central1
```

**Don't wait**: This will take ~50 hours. Just let it run.

**Check progress** (run this anytime):
```bash
bq query --use_legacy_sql=false \
  "SELECT COUNT(DISTINCT newsletter_id) as processed 
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
```

**Or check logs**:
```bash
gcloud logging tail "resource.type=cloud_run_job AND resource.labels.job_name=process-newsletters" --limit 20
```

---

## 📋 Summary Checklist

Copy this and check off as you go:

- [ ] Step 1: Table verified empty (count = 0)
- [ ] Step 2: 10 newsletter test worked (count = 10)
- [ ] Step 3a: Chunk quality check passed
- [ ] Step 3b: Embedding check passed (all 768)
- [ ] Step 3c: Content check passed (readable)
- [ ] Step 4: Resume check passed (still 10, not 20)
- [ ] Step 5: 5K tranche started

---

## 🆘 If Something Fails

**Tell me exactly which step failed** and what you saw. For example:
- "Step 2: Got 0 newsletters instead of 10"
- "Step 3b: Embeddings are 0 instead of 768"
- "Step 4: Got 20 newsletters instead of 10"

I'll help debug each issue.

---

## 🎯 Final Goal

After 5K tranche succeeds:
1. We have confidence the pipeline works
2. Resume capability is proven
3. Then we can scale to 73K

**Let's start with Step 1!**

