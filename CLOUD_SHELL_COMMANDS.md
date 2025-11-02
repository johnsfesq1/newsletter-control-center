# Quality Checks for 28K Corpus

Run these commands one at a time in Cloud Shell:

## Check 1: Total counts
```bash
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as chunks, 
          COUNT(DISTINCT newsletter_id) as newsletters,
          MAX(created_at) as most_recent
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
```

## Check 2: Duplicate detection
```bash
bq query --use_legacy_sql=false \
  "SELECT newsletter_id, chunk_index, COUNT(*) as dup_count 
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`
   GROUP BY newsletter_id, chunk_index 
   HAVING COUNT(*) > 1 
   LIMIT 10"
```

## Check 3: Chunk distribution
```bash
bq query --use_legacy_sql=false \
  "SELECT MIN(chunk_count) as min_chunks,
          MAX(chunk_count) as max_chunks,
          AVG(chunk_count) as avg_chunks
   FROM (
     SELECT newsletter_id, COUNT(*) as chunk_count
     FROM \`newsletter-control-center.ncc_newsletters.chunks\`
     GROUP BY newsletter_id
   )"
```

## Check 4: Embeddings quality
```bash
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as total_chunks,
          SUM(CASE WHEN chunk_embedding IS NULL THEN 1 ELSE 0 END) as null_embeddings,
          SUM(CASE WHEN ARRAY_LENGTH(chunk_embedding) != 768 THEN 1 ELSE 0 END) as wrong_dim
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
```

## Check 5: Publisher diversity
```bash
bq query --use_legacy_sql=false \
  "SELECT COUNT(DISTINCT publisher_name) as unique_publishers
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
```

## Check 6: Content samples
```bash
bq query --use_legacy_sql=false \
  "SELECT newsletter_id, 
          chunk_index,
          SUBSTR(chunk_text, 1, 150) as text_sample
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`
   TABLESAMPLE SYSTEM (0.1 PERCENT)
   ORDER BY RAND()
   LIMIT 5"
```
