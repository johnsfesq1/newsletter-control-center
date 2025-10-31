# Tomorrow Morning Checklist

## First Thing: Verify Full Corpus Processing

### 1. Check Execution Status

```bash
gcloud run jobs executions list --job=process-newsletters --region=us-central1 --limit=1
```

Look for:
- Status: `✔` (Completed)
- Execution: `process-newsletters-89brw`

### 2. Verify Final Chunk Count

```bash
bq query --use_legacy_sql=false "
SELECT 
  COUNT(DISTINCT newsletter_id) as newsletters,
  COUNT(*) as total_chunks,
  ROUND(COUNT(*) / COUNT(DISTINCT newsletter_id), 1) as avg_chunks_per_newsletter
FROM \`newsletter-control-center.ncc_newsletters.chunks\`
"
```

**Expected:**
- newsletters: ~73,000
- total_chunks: ~550,000-700,000
- avg_chunks_per_newsletter: ~8-10

### 3. Check Processing Statistics

```bash
bq query --use_legacy_sql=false "
SELECT 
  COUNT(*) as total,
  COUNTIF(chunk_embedding IS NOT NULL) as with_embeddings,
  COUNT(DISTINCT publisher_name) as unique_publishers,
  MIN(sent_date) as oldest,
  MAX(sent_date) as newest
FROM \`newsletter-control-center.ncc_newsletters.chunks\`
"
```

### 4. Run RAG Test on Full Corpus

Test 2-3 queries to verify the system works with the expanded corpus:

```bash
# Test query 1
curl -X POST http://localhost:3000/api/intelligence/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What are analysts saying about climate change?"}'

# Test query 2
curl -X POST http://localhost:3000/api/intelligence/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What did Bloomberg report about the stock market recently?"}'
```

### 5. Check for Errors in Logs

```bash
gcloud logging read \
  "resource.type=cloud_run_job AND resource.labels.job_name=process-newsletters AND severity>=ERROR" \
  --limit 100 \
  --format="table(timestamp,severity,textPayload)"
```

## If Processing Failed

### Check Last Execution Logs

```bash
gcloud run jobs executions describe process-newsletters-89brw --region=us-central1
```

### Check for Auth Errors

If you see `invalid_grant` errors:
- Run: `gcloud auth application-default login`
- Re-execute the job

### Check Progress Recovery

The job saves progress automatically. Check `processing-progress.json` if available.

## Success Criteria ✅

- [ ] Job completed successfully
- [ ] Chunk count > 500,000
- [ ] Newsletter count ~73,000
- [ ] All chunks have embeddings
- [ ] RAG queries return relevant answers
- [ ] No critical errors in logs

## Next Steps (If Successful)

1. Run evaluation harness on full corpus
2. Test retrieval quality across different topics
3. Build retro-labeling script (if needed)
4. Start thinking about UI/UX

## If You Need Help

All monitoring commands are in: `CLOUD_SHELL_COMMANDS.md`
Quality checks are in: `POST_5K_QUALITY_CHECKS.md`

