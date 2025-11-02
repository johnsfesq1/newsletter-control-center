# Chunk Deduplication Guide

**Date**: November 1, 2025  
**Issue**: 219,692 duplicate chunk records (18.4% of chunks)  
**Solution**: Safe deduplication script

---

## 🔍 Problem Analysis

**Duplicates Found:**
- **219,692 duplicate chunks** across 16,092 newsletters
- Pattern: Same `(newsletter_id, chunk_index)` appearing 2-4 times
- Cause: Likely from job retries/restarts during processing
- Impact: Extra storage, slightly skewed search relevance

**Example:**
- Newsletter `192e886a132d880b`, chunk_index 0: appears 4 times
- Different `created_at` timestamps (same newsletter processed multiple times)

---

## ✅ Solution: Safe Deduplication

**Strategy**: Keep the **latest version** of each duplicate (most recent `created_at`)

**Safety Measures:**
1. ✅ Dry-run mode by default (no changes until you approve)
2. ✅ Creates backup table before deletion
3. ✅ Verifies results after deletion
4. ✅ Uses BigQuery's built-in window functions (efficient)

---

## 🚀 How to Run

### Step 1: Dry Run (See What Would Happen)

```bash
# See what would be deleted (no changes made)
npx tsx scripts/deduplicate-chunks.ts
```

This will show:
- How many duplicates found
- How many newsletters affected
- How many chunks would be deleted

### Step 2: Actual Deduplication (Delete Duplicates)

```bash
# Actually delete duplicates
DRY_RUN=false npx tsx scripts/deduplicate-chunks.ts
```

**What happens:**
1. Creates backup table of all duplicates
2. Identifies chunks to keep (latest version per newsletter_id + chunk_index)
3. Deletes duplicate chunks
4. Verifies no duplicates remain
5. Reports results

---

## 📊 Expected Results

**Before:**
- Total chunks: 1,194,887
- Duplicates: 219,692 (18.4%)

**After:**
- Total chunks: ~975,195 (estimated)
- Duplicates: 0
- Reduction: ~219,692 chunks removed

---

## ⚠️ Important Notes

1. **Backup Created**: A backup table is created automatically
   - Table name: `chunks_duplicates_backup_[timestamp]`
   - Contains all duplicate chunks (for safety/recovery)

2. **No Data Loss**: Only duplicate chunks are deleted
   - One version of each chunk is kept (the latest)
   - All unique chunks remain untouched

3. **BigQuery Cost**: 
   - Dry run: ~$0.01 (queries only)
   - Actual deletion: ~$0.10-0.50 (depends on deletions)

4. **Time**: 
   - Dry run: ~10-30 seconds
   - Actual deletion: ~1-3 minutes

---

## ✅ Verification

After running, verify with:

```sql
-- Should return 0
SELECT COUNT(*) as remaining_duplicates
FROM (
  SELECT newsletter_id, chunk_index, COUNT(*) as dup_count
  FROM `newsletter-control-center.ncc_newsletters.chunks`
  GROUP BY newsletter_id, chunk_index
  HAVING COUNT(*) > 1
)
```

---

## 🔄 Rollback (If Needed)

If something goes wrong, you can restore from backup:

```sql
-- View backup table
SELECT COUNT(*) FROM `newsletter-control-center.ncc_newsletters.chunks_duplicates_backup_[timestamp]`

-- Restore if needed (manual process - contact if needed)
```

---

## 🎯 Recommendation

**Run the deduplication now** - it's safe, fast, and will:
- ✅ Reduce storage costs
- ✅ Improve search accuracy
- ✅ Clean up data quality
- ✅ Take < 5 minutes total

**Command:**
```bash
DRY_RUN=false npx tsx scripts/deduplicate-chunks.ts
```
