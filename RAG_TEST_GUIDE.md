# RAG Query Engine Test - Step-by-Step Guide

**Goal**: Test that your RAG system can answer questions using your processed newsletters.

---

## ✅ STEP 1: Make Sure You're in the Right Directory

Open your terminal (in Cursor or any terminal app) and navigate to your project:

```bash
cd /Users/jsf/Documents/newsletter-control-center
```

**To verify you're in the right place**, you should see files like `package.json`, `scripts/`, and `newsletter-search/` when you list files:

```bash
ls
```

---

## ✅ STEP 2: Verify Your Environment Variables

The test script needs your BigQuery project ID. Let's check if it's set:

```bash
cat .env | grep BIGQUERY_PROJECT_ID
```

**Expected output**: Something like:
```
BIGQUERY_PROJECT_ID=newsletter-control-center
```

If you see it, you're good! ✅  
If not, add it to your `.env` file (it should be `newsletter-control-center`).

---

## ✅ STEP 3: Run the First Test Query

We'll test with a simple, broad question that should find results:

```bash
npx tsx scripts/test-rag-simple.ts "What are newsletters saying about climate change?"
```

**What to expect:**
- The script will run for 30-60 seconds
- You'll see progress messages like:
  - "Step 1: 📊 Generating query embedding..."
  - "Step 2: 🔎 Performing hybrid search..."
  - etc.

**If it works**, you'll see:
- Top chunks found
- Facts extracted
- A final answer with citations

**If it fails**, you'll see an error message. We'll troubleshoot from there.

---

## ✅ STEP 4: Try a Second Test Query (Optional)

If the first test worked, try a more specific query:

```bash
npx tsx scripts/test-rag-simple.ts "What did Bloomberg say about the US stock market?"
```

This tests whether it can find content from specific publishers.

---

## ✅ STEP 5: Interpret the Results

### ✅ Success Looks Like:

```
📋 Top 3 chunks found:
   Chunk 1:
   - Publisher: Bloomberg
   - Subject: Markets Update
   - Score: 0.856
   - Preview: The US stock market showed...

✅ Extracted 5 facts

Answer:
Based on the newsletter archive, Bloomberg reported...
[chunk_abc123] The S&P 500...
```

### ❌ Problems to Watch For:

1. **"No chunks found"**
   - Might mean the query doesn't match any content
   - Try a broader query like "What's in the newsletters?"

2. **"Extracted 0 facts"**
   - Chunks were found but didn't contain relevant info
   - This is actually OK - the system is working, just no matching content

3. **Error messages**
   - Authentication issues
   - API not enabled
   - BigQuery connection problems

---

## 🆘 Troubleshooting

### Problem: "Cannot find module '@google-cloud/bigquery'"

**Fix**: Install dependencies
```bash
npm install
```

### Problem: "Authentication error" or "Permission denied"

**Fix**: Make sure you're authenticated with Google Cloud:
```bash
gcloud auth application-default login
```

Or verify your service account credentials are set up correctly.

### Problem: "Table not found"

**Fix**: Verify your chunks table exists:
```bash
bq ls newsletter-control-center:ncc_newsletters
```

You should see `chunks` in the list.

### Problem: Script runs but returns no results

**Possible causes**:
1. The query is too specific (try broader: "What's in the newsletters?")
2. The processed newsletters don't contain that topic
3. There's an issue with vector search

**Debug**: Check if you have chunks:
```bash
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as total FROM \`newsletter-control-center.ncc_newsletters.chunks\`"
```

Should return a number > 0 (you have ~62,811 chunks from the 5K tranche).

---

## 📊 What Success Means

If you see:
- ✅ Chunks being retrieved
- ✅ Facts being extracted
- ✅ A coherent answer with citations

**Then your RAG system is working!** 🎉

You can confidently proceed with processing the full 73K newsletters.

---

## 🚀 Next Steps After Testing

If the test passes:
1. ✅ RAG system is validated
2. ✅ You can start the 9-hour Cloud Run job
3. ✅ Process the full 73K newsletters with confidence

If the test fails:
1. We'll debug the issue
2. Fix any problems
3. Re-test until it works

---

## 💡 Test Queries to Try

Here are some good test queries:

1. **Broad topic** (most likely to find results):
   ```bash
   npx tsx scripts/test-rag-simple.ts "What are newsletters saying about climate change?"
   ```

2. **Geographic**:
   ```bash
   npx tsx scripts/test-rag-simple.ts "What's happening in Ukraine?"
   ```

3. **Publisher-specific**:
   ```bash
   npx tsx scripts/test-rag-simple.ts "What did Bloomberg say about markets?"
   ```

4. **Very broad** (should always find something):
   ```bash
   npx tsx scripts/test-rag-simple.ts "What topics are covered in the newsletters?"
   ```

---

**Ready to start? Run Step 3 and let me know what happens!** 🚀

