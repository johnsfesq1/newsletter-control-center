# Post-5K Quality Checks & Next Steps

**Date**: October 30, 2025  
**Goal**: Verify 5K tranche quality, then scale to next batch

---

## ✅ STEP 1: Check Progress (When 5K Completes)

**In Cloud Shell, run**:
```bash
bq query --use_legacy_sql=false \
  "SELECT COUNT(DISTINCT newsletter_id) as processed,
          COUNT(*) as total_chunks,
          MIN(created_at) as first_chunk,
          MAX(created_at) as last_chunk
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
```

**Expected**:
- `processed`: ~5,000 newsletters
- `total_chunks`: ~50,000 chunks
- `last_chunk`: Very recent (within last hour)

---

## ✅ STEP 2: Quality Check 1 - No Duplicates

**Critical**: Make sure we didn't duplicate any newsletters.

**Run**:
```bash
bq query --use_legacy_sql=false \
  "SELECT newsletter_id, COUNT(*) as chunk_count
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`
   GROUP BY newsletter_id
   HAVING COUNT(DISTINCT newsletter_id) > 1"
```

**Expected**: 0 rows (no newsletters have duplicates)

**If you see rows**: Something went wrong with resume logic.

---

## ✅ STEP 3: Quality Check 2 - Chunk Distribution

**Check**: Are chunk counts reasonable? (should be 5-30 per newsletter)

**Run**:
```bash
bq query --use_legacy_sql=false \
  "SELECT 
    MIN(chunk_count) as min_chunks,
    MAX(chunk_count) as max_chunks,
    AVG(chunk_count) as avg_chunks,
    STDDEV(chunk_count) as stddev_chunks
   FROM (
     SELECT newsletter_id, COUNT(*) as chunk_count
     FROM \`newsletter-control-center.ncc_newsletters.chunks\`
     GROUP BY newsletter_id
   )"
```

**Expected**:
- `min_chunks`: 1-5 (reasonable)
- `max_chunks`: 20-50 (reasonable)
- `avg_chunks`: ~10 (reasonable)
- `stddev_chunks`: Low (consistent)

---

## ✅ STEP 4: Quality Check 3 - Embeddings Quality

**Check**: All embeddings are 768 dimensions and not null.

**Run**:
```bash
bq query --use_legacy_sql=false \
  "SELECT 
    COUNT(*) as total_chunks,
    SUM(CASE WHEN chunk_embedding IS NULL THEN 1 ELSE 0 END) as null_embeddings,
    SUM(CASE WHEN ARRAY_LENGTH(chunk_embedding) != 768 THEN 1 ELSE 0 END) as wrong_dim
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
```

**Expected**:
- `null_embeddings`: 0
- `wrong_dim`: 0
- All chunks have valid 768-dim embeddings

---

## ✅ STEP 5: Quality Check 4 - Content Samples

**Check**: Sample random chunks to verify they're readable.

**Run**:
```bash
bq query --use_legacy_sql=false \
  "SELECT newsletter_id, 
          chunk_index,
          SUBSTR(chunk_text, 1, 200) as text_sample,
          LENGTH(chunk_text) as length
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`
   TABLESAMPLE SYSTEM (1 PERCENT)
   ORDER BY RAND()
   LIMIT 10"
```

**What to look for**:
- Text looks like actual newsletter content
- Not gibberish or HTML tags
- Proper spacing and punctuation
- Different publishers visible

---

## ✅ STEP 6: Quality Check 5 - Publisher Diversity

**Check**: Did we process newsletters from many different sources?

**Run**:
```bash
bq query --use_legacy_sql=false \
  "SELECT publisher_name, 
          COUNT(DISTINCT newsletter_id) as count
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`
   GROUP BY publisher_name
   ORDER BY count DESC
   LIMIT 20"
```

**Expected**:
- 20+ different publishers
- Variety of sources (news, finance, tech, etc.)
- No single publisher dominating

---

## ✅ STEP 7: Quality Check 6 - No Empty Chunks

**Check**: Make sure no chunks are too short.

**Run**:
```bash
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as too_short_chunks
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`
   WHERE LENGTH(chunk_text) < 200"
```

**Expected**: 0 or very few (<10)

**If many**: Cleaning might be too aggressive.

---

## 🚀 STEP 8: If All Checks Pass, Scale to Next 25K

### Option A: Process Next 25K (Recommended)

**Start at position 5,000** (skip the ones we just did):

```bash
# Update job to process next 25K
gcloud run jobs update process-newsletters \
  --update-env-vars PROCESS_LIMIT=25000,START_FROM=5000 \
  --region us-central1

# Execute
gcloud run jobs execute process-newsletters --region us-central1
```

**Estimated time**: ~19 hours (25K ÷ ~1,300/hour)

---

### Option B: Process Remaining 68K (Full Remaining)

**Process everything left** in one go:

```bash
# Update job to process remaining 68K
gcloud run jobs update process-newsletters \
  --update-env-vars PROCESS_LIMIT=68000,START_FROM=5000 \
  --region us-central1

# Execute
gcloud run jobs execute process-newsletters --region us-central1
```

**Estimated time**: ~52 hours (68K ÷ ~1,300/hour = ~2.2 days)

---

## ⚠️  DECISION POINT

**After quality checks pass**, you need to decide:

**Conservative approach**:
- ✅ Run 25K tranche
- ✅ Check quality again
- ✅ Then do another 25K
- ⏱️ Takes longer but safer

**Aggressive approach**:
- ✅ Run remaining 68K all at once
- ✅ Done in ~2 days
- ⚠️ Higher risk if something goes wrong

**My recommendation**: Start with 25K, check quality, then decide.

---

## 📊 Progress Tracking

**Current progress** (after 5K):
- Total newsletters: 73,468
- Processed: ~5,000 (7%)
- Remaining: ~68,000 (93%)

**After next 25K**:
- Processed: ~30,000 (41%)
- Remaining: ~43,000 (59%)

**After full run**:
- Processed: 73,468 (100%)
- Ready for: RAG query engine testing!

---

## 🎯 Success Criteria (After Each Tranche)

- [ ] No duplicate newsletters
- [ ] All chunks have 768-dim embeddings
- [ ] Content is readable (not gibberish)
- [ ] Chunk counts are reasonable
- [ ] Publisher diversity is good
- [ ] No empty/too-short chunks
- [ ] Processing rate is consistent
- [ ] Cost is on track

If all ✅: Proceed to next tranche  
If any ❌: Stop and debug

---

## 💰 Cost Tracking

**Completed**:
- 5K tranche: ~$2-5 (estimated)

**Next tranches**:
- 25K tranche: ~$10-25
- 68K tranche: ~$27-68

**Total for full 73K**: ~$39-98

Still well within budget!

---

## 🎉 Summary

**Right now**: 5K tranche running, ~3h 52m remaining

**After 5K completes**:
1. Run 6 quality checks
2. If all pass: Scale to 25K
3. Repeat until 73K complete

**Then**: Test RAG query engine on full corpus!

---

## 📝 Checklist for After 5K Completes

- [ ] Run Check 1: Progress verification
- [ ] Run Check 2: Duplicate detection
- [ ] Run Check 3: Chunk distribution
- [ ] Run Check 4: Embeddings quality
- [ ] Run Check 5: Content samples
- [ ] Run Check 6: Publisher diversity
- [ ] Run Check 7: Empty chunk detection
- [ ] Review all results
- [ ] Decide: 25K or 68K next?
- [ ] Update and execute job

---

**Let the 5K run finish first, then we'll do these checks together!**

