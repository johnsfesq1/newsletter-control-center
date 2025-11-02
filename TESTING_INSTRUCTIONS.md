# Testing Instructions - Semantic Search

**Status**: ✅ Authentication set up! Server running!

---

## ✅ What's Ready

1. ✅ **Authentication**: Application Default Credentials configured
2. ✅ **Dev Server**: Running on http://localhost:3000
3. ✅ **Frontend**: Connected to semantic search API
4. ✅ **API**: `/api/intelligence/query` ready

---

## 🧪 How to Test

### Option 1: Test in Browser (Easiest)

1. Open: **http://localhost:3000**
2. Enter a query like: "What are the latest developments in AI regulation?"
3. Click "Search"
4. Wait 10-30 seconds (first query takes longer)
5. You should see:
   - AI-generated answer
   - Citations with sources
   - Relevant newsletters

### Option 2: Test API Directly

```bash
curl -X POST http://localhost:3000/api/intelligence/query \
  -H "Content-Type: application/json" \
  -d '{"query":"What are recent AI developments?"}'
```

---

## ⏱️ Expected Timing

- **First query**: 30-60 seconds (cold start, embedding generation)
- **Subsequent queries**: 10-20 seconds
- **Processing time**:
  - Embedding generation: ~2-3 seconds
  - Vector search: ~5-10 seconds
  - Fact extraction: ~5-8 seconds
  - Answer synthesis: ~3-5 seconds

---

## ✅ What Success Looks Like

**Response should include:**
```json
{
  "query": "...",
  "answer": "A detailed answer based on newsletter content...",
  "citations": [
    {
      "citation": "Publisher · Date · Subject",
      "publisher": "...",
      "date": "...",
      "subject": "..."
    }
  ],
  "chunks_used": 10,
  "cost_usd": 0.00XX,
  "chunks": [...]
}
```

---

## 🔍 If Something Goes Wrong

### Error: "invalid_grant"
- Auth token expired
- **Fix**: Run `gcloud auth application-default login` again

### Error: "Timeout"
- Query is taking too long
- **Fix**: Wait longer (first query can take 60+ seconds)

### Error: "No results"
- Query didn't match well
- **Fix**: Try a different query with more specific terms

### Server not responding
- **Fix**: Check terminal running `npm run dev` for errors

---

## 🎯 Quick Test Queries

Try these queries that should definitely work:

1. **"What are the latest developments in AI regulation?"**
2. **"What has been written about China trade policy?"**
3. **"What do newsletters say about climate change?"**
4. **"Tell me about recent economic trends"**

---

**Ready to test! Open http://localhost:3000** 🚀
