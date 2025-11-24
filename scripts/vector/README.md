# Vector Search Scripts

This directory contains scripts for managing and testing BigQuery vector search functionality.

## Quick Start

```bash
# 1. Check if index exists
npm run vector:status

# 2. Test semantic search
npm run vector:test

# 3. Try a custom query
npm run vector:test -- --query "artificial intelligence"
```

## Available Scripts

### `check-index-status.ts`

Checks the current status of vector search indexes.

**Usage:**
```bash
npm run vector:status
```

**Output:**
- Index name and status (ACTIVE/PENDING/ERROR)
- Coverage percentage
- Table statistics (row counts, dimensions)

**Exit Codes:**
- `0`: Index exists and is active
- `1`: Index does not exist or has errors

---

### `build-index.ts`

Creates a new BigQuery vector search index.

**Usage:**
```bash
# Preview (shows configuration, requires confirmation)
npm run vector:build

# Actually build the index (skips confirmation)
npm run vector:build -- --force
```

**⚠️ WARNING**: 
- Takes 20-30 minutes to complete
- Cannot be interrupted once started
- Creates immutable index (can only drop and rebuild)

**Configuration:**
- Index Type: IVF (Inverted File Index)
- Distance Metric: COSINE (semantic similarity)
- Target: Fast queries on 1M+ vectors

---

### `monitor-index.ts`

Monitors the progress of vector index builds.

**Usage:**
```bash
# Check once
npm run vector:monitor

# Watch continuously (checks every 30 seconds)
npm run vector:monitor:watch
```

**Output:**
- Current index status
- Coverage percentage with progress bar
- Build progress updates
- Alerts when build completes

**Use Cases:**
- Monitor 20-30 minute index builds
- Verify index reached ACTIVE status
- Debug build failures

---

### `test-search.ts`

Tests semantic similarity search using the vector index.

**Usage:**

```bash
# 1. Random chunk similarity search (default)
npm run vector:test

# 2. Query-based semantic search
npm run vector:test -- --query "artificial intelligence"
npm run vector:test -- --query "climate change policy"

# 3. Find similar chunks to a specific chunk
npm run vector:test -- --chunk-id abc123

# 4. Limit results
npm run vector:test -- --limit 5
```

**Output:**
- Top-N most similar chunks
- Similarity scores (cosine distance)
- Source metadata (subject, author, date, publisher)
- Query performance metrics

**Example Output:**
```
🚀 Vector Search Test

Query: "artificial intelligence"

⏳ Generating query embedding...
✅ Generated 768-dimensional embedding

🔍 Searching for 10 most similar chunks...
✅ Query completed in 6.47s

📊 Found 10 similar chunks:

[1] Similarity: 0.8234 (distance: 0.1766)
    Chunk ID: abc-123
    From: John Doe <john@example.com>
    Publisher: Tech Newsletter
    Subject: AI Developments This Week
    Date: 2024-11-15
    Text: Recent advances in artificial intelligence have shown...
```

---

## Workflow Examples

### Initial Setup (First Time)

```bash
# 1. Verify environment
npm run verify:gcp

# 2. Check if index exists
npm run vector:status

# 3. If no index, build one
npm run vector:build -- --force

# 4. Monitor build progress
npm run vector:monitor:watch

# 5. Once active, test it
npm run vector:test
```

### Regular Use (Index Already Exists)

```bash
# Test with random chunk
npm run vector:test

# Search for specific topic
npm run vector:test -- --query "climate change"

# Check index health
npm run vector:status
```

### Troubleshooting

```bash
# Check index status
npm run vector:status

# If status shows ERROR or PENDING:
# 1. Check BigQuery logs in Cloud Console
# 2. Verify table has valid embeddings
# 3. Try rebuilding (drop existing index first)

# Test with a known good chunk
npm run vector:test -- --chunk-id <known-chunk-id>
```

---

## Technical Details

### Index Configuration

```sql
CREATE VECTOR INDEX `chunk_embedding_index`
ON `newsletter-control-center.ncc_production.chunk_embeddings`(`embedding`)
OPTIONS (
  index_type = 'IVF',
  distance_type = 'COSINE'
)
```

### Distance Calculation

The scripts use cosine distance to measure semantic similarity:

```
distance = 1 - cosine_similarity
cosine_similarity = dot_product(A, B) / (norm(A) * norm(B))
```

**Interpretation:**
- Distance 0.0 = identical (100% similar)
- Distance 0.2 = very similar (~80% similar)
- Distance 0.5 = somewhat similar (~50% similar)
- Distance 1.0 = orthogonal (no similarity)
- Distance 2.0 = opposite vectors

### Performance

**Current Performance:**
- ~7 seconds for top-10 similarity search with metadata
- Scales to 1M+ vectors efficiently
- Index coverage: 100%

**Query Breakdown:**
1. Embedding generation: ~1s (Vertex AI)
2. Vector search: ~3s (BigQuery with index)
3. Metadata joins: ~3s (chunks, emails, publishers)

---

## Environment Variables

Required environment variables (set in `.env` or shell):

```bash
BQ_PROJECT_ID=newsletter-control-center
BQ_DATASET=ncc_production
BQ_LOCATION=US
GOOGLE_APPLICATION_CREDENTIALS=secrets/gcp/ncc-local-dev.json
```

Optional:
```bash
EMB_MODEL=text-embedding-004  # Vertex AI embedding model
EMB_LOCATION=us-central1      # Vertex AI region
```

---

## Integration with RAG System

These scripts demonstrate the vector search functionality that will be used in the RAG (Retrieval-Augmented Generation) system:

```
User Query
    ↓
[1. Embed Query]  ← test-search.ts (embedBatch)
    ↓
[2. Vector Search]  ← test-search.ts (BigQuery query)
    ↓
[3. Fetch Context]  ← test-search.ts (JOINs)
    ↓
[4. Generate Answer]  ← src/api/intelligence.ts (Gemini)
    ↓
[5. Return with Citations]
```

See `docs/VECTOR_SEARCH.md` for full RAG implementation details.

---

## Cost Considerations

**Index Storage:**
- ~$0.04/GB/month
- 1M vectors × 768 dims × 4 bytes ≈ 3GB
- **Cost**: ~$0.12/month

**Query Costs:**
- BigQuery compute: ~$0.006/query
- Vertex AI embedding: $0.0001/1K chars

**Total**: Negligible for moderate usage.

---

## Troubleshooting

### "Index not found"

```bash
# Check if index exists
npm run vector:status

# If not found, build it
npm run vector:build -- --force
```

### "Unable to get local issuer certificate"

```bash
# Run outside sandbox (only needed in some environments)
# Scripts already include proper auth handling
```

### "Query taking too long (>10s)"

1. Check index status: `npm run vector:status`
2. Verify index is ACTIVE with 100% coverage
3. Reduce metadata joins if needed
4. Consider query optimization (see docs)

### "Invalid embedding dimensions"

Embeddings must be:
- 768 dimensions (text-embedding-004 model)
- All values as FLOAT64
- Non-null

Check with:
```sql
SELECT 
  COUNT(*) as total,
  COUNTIF(ARRAY_LENGTH(embedding) = 768) as valid_768,
  COUNTIF(embedding IS NULL) as null_count
FROM `ncc_production.chunk_embeddings`;
```

---

## See Also

- `docs/VECTOR_SEARCH.md` - Full documentation
- `VECTOR_SEARCH_SUMMARY.md` - Implementation summary
- `src/embeddings/vertex.ts` - Embedding generation
- `src/bq/client.ts` - BigQuery client

---

## Support

For issues or questions:

1. Check script output for error messages
2. Review BigQuery logs in Cloud Console
3. Verify environment variables are set correctly
4. Ensure GCP credentials have necessary permissions

Required GCP permissions:
- `bigquery.jobs.create`
- `bigquery.tables.get`
- `bigquery.tables.getData`
- `aiplatform.endpoints.predict` (for embeddings)

