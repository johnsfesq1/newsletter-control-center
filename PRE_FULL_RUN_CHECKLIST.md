# Pre-Full Run Checklist

**Before running the full 73K newsletter job, verify these items:**

---

## ✅ Check 1: Verify Test Output in BigQuery

**Run in Cloud Shell**:
```bash
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as total_chunks, 
          COUNT(DISTINCT newsletter_id) as unique_newsletters,
          MAX(created_at) as most_recent
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
```

**What to look for**:
- `unique_newsletters` should be > 500 (your existing + new test ones)
- `most_recent` should be within the last few minutes
- `total_chunks` should reflect all your processed newsletters

---

## ✅ Check 2: Verify Chunk Quality

**Run in Cloud Shell**:
```bash
bq query --use_legacy_sql=false \
  "SELECT newsletter_id, 
          chunk_text,
          LENGTH(chunk_text) as chunk_length,
          created_at
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`
   WHERE created_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
   ORDER BY created_at DESC
   LIMIT 5"
```

**What to look for**:
- Chunk text should be readable (not gibberish)
- Chunk length should be ~400-1200 characters
- Should look like actual newsletter content

---

## ✅ Check 3: Verify Embeddings Generated

**Run in Cloud Shell**:
```bash
bq query --use_legacy_sql=false \
  "SELECT newsletter_id,
          chunk_index,
          ARRAY_LENGTH(chunk_embedding) as embedding_dim,
          created_at
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`
   WHERE created_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
   ORDER BY created_at DESC
   LIMIT 5"
```

**What to look for**:
- `embedding_dim` should be `768` (text-embedding-004 dimension)
- All recent chunks should have embeddings (not NULL)

---

## ✅ Check 4: Check for Duplicates

**Run in Cloud Shell**:
```bash
bq query --use_legacy_sql=false \
  "SELECT newsletter_id, 
          COUNT(*) as chunk_count
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`
   GROUP BY newsletter_id
   HAVING chunk_count > 50
   ORDER BY chunk_count DESC
   LIMIT 10"
```

**What to look for**:
- Most newsletters should have 5-30 chunks (reasonable)
- If any have >100 chunks, might indicate an issue
- This checks for potential infinite loops

---

## ✅ Check 5: Verify Resume Capability

**Run in Cloud Shell**:
```bash
bq query --use_legacy_sql=false \
  "SELECT newsletter_id
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`
   GROUP BY newsletter_id
   ORDER BY MIN(created_at) DESC
   LIMIT 10"
```

**Copy these newsletter IDs**

**Check if they're in the test output**: Look at your test job logs - did it skip these existing newsletters?

---

## ✅ Check 6: Monitor Cloud Run Job Limits

**Check current quotas**:
```bash
gcloud compute project-info describe --project newsletter-control-center
```

**What to look for**:
- Cloud Run quotas (requests per second, concurrent instances, etc.)
- Should be fine for sequential processing

---

## ✅ Check 7: Estimate Cost

**Run in Cloud Shell**:
```bash
# Calculate based on test run
bq query --use_legacy_sql=false \
  "SELECT 
    COUNT(*) as test_chunks,
    SUM(LENGTH(chunk_text)) as total_chars
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`
   WHERE created_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)"
```

**Estimate**:
- 73K newsletters × ~7 chunks each = ~500K chunks
- Embedding cost: ~$1.50 (as calculated before)
- Compute cost: ~$8-34 (for 6 days of processing)

---

## ✅ Check 8: Verify BigQuery Table Size

**Run in Cloud Shell**:
```bash
bq query --use_legacy_sql=false \
  "SELECT 
    COUNT(*) as total_rows,
    COUNT(DISTINCT newsletter_id) as unique_newsletters,
    ROUND(SUM(LENGTH(chunk_text)) / 1024 / 1024, 2) as text_mb,
    ROUND(SUM(ARRAY_LENGTH(chunk_embedding)) * 8 / 1024 / 1024, 2) as embeddings_mb
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
```

**What to look for**:
- Current size should be reasonable
- Estimate: Full run will be ~10-20GB (acceptable)

---

## ⚠️ Final Pre-Flight Checklist

Before running the full job, confirm:

- [ ] Test run processed at least 5 new newsletters
- [ ] Existing newsletters were skipped (resume working)
- [ ] Chunks look readable and correct
- [ ] Embeddings are 768 dimensions
- [ ] No duplicate chunks in test data
- [ ] Cost estimate is acceptable
- [ ] Cloud Run job has 7-day timeout
- [ ] Memory set to 2Gi, CPU to 2
- [ ] You're ready to let it run for 6 days

---

## 🚀 Ready to Launch?

If all checks pass:

```bash
# Update to process all 73K
gcloud run jobs update process-newsletters \
  --update-env-vars PROCESS_LIMIT=73000 \
  --region us-central1

# Execute
gcloud run jobs execute process-newsletters --region us-central1
```

---

## 📊 Expected Timeline

- **Newsletters to process**: ~72,500 (73K - 500 existing)
- **Rate**: ~100 newsletters/hour
- **Time**: ~6 days
- **Cost**: ~$8-34 + API costs

---

## 🎯 Success Criteria

After 24 hours, check:
- ~2,400 newsletters processed
- No failures
- Logs show steady progress
- BigQuery count increasing

**Then**: Let it run! Check back in 6 days.

