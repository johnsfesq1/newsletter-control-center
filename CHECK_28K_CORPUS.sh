#!/bin/bash

# Quality checks for 28K corpus
# Run this in Cloud Shell

echo "═══════════════════════════════════════════════════════════════"
echo "📊 QUALITY CHECKS FOR 28K CORPUS"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check 1: Total counts
echo "✅ CHECK 1: Total counts"
echo "─────────────────────────────────────────────────────────────"
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as chunks, 
          COUNT(DISTINCT newsletter_id) as newsletters,
          MAX(created_at) as most_recent
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
echo ""

# Check 2: No duplicates
echo "✅ CHECK 2: Duplicate detection"
echo "─────────────────────────────────────────────────────────────"
bq query --use_legacy_sql=false \
  "SELECT newsletter_id, chunk_index, COUNT(*) as dup_count 
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`
   GROUP BY newsletter_id, chunk_index 
   HAVING COUNT(*) > 1 
   LIMIT 10"
echo ""

# Check 3: Chunk distribution
echo "✅ CHECK 3: Chunk distribution"
echo "─────────────────────────────────────────────────────────────"
bq query --use_legacy_sql=false \
  "SELECT MIN(chunk_count) as min_chunks,
          MAX(chunk_count) as max_chunks,
          AVG(chunk_count) as avg_chunks
   FROM (
     SELECT newsletter_id, COUNT(*) as chunk_count
     FROM \`newsletter-control-center.ncc_newsletters.chunks\`
     GROUP BY newsletter_id
   )"
echo ""

# Check 4: Embeddings quality
echo "✅ CHECK 4: Embeddings quality"
echo "─────────────────────────────────────────────────────────────"
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as total_chunks,
          SUM(CASE WHEN chunk_embedding IS NULL THEN 1 ELSE 0 END) as null_embeddings,
          SUM(CASE WHEN ARRAY_LENGTH(chunk_embedding) != 768 THEN 1 ELSE 0 END) as wrong_dim
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
echo ""

# Check 5: Publisher diversity
echo "✅ CHECK 5: Publisher diversity"
echo "─────────────────────────────────────────────────────────────"
bq query --use_legacy_sql=false \
  "SELECT COUNT(DISTINCT publisher_name) as unique_publishers
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
echo ""

# Check 6: Sample content
echo "✅ CHECK 6: Content samples (readability)"
echo "─────────────────────────────────────────────────────────────"
bq query --use_legacy_sql=false \
  "SELECT newsletter_id, 
          chunk_index,
          SUBSTR(chunk_text, 1, 150) as text_sample
   FROM \`newsletter-control-center.ncc_newsletters.chunks\`
   TABLESAMPLE SYSTEM (0.1 PERCENT)
   ORDER BY RAND()
   LIMIT 5"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "✅ ALL CHECKS COMPLETE"
echo "═══════════════════════════════════════════════════════════════"

