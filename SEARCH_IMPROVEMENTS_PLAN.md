# Search & Feature Improvements Plan

**Date**: November 1, 2025  
**Status**: Planning & Implementation

---

## 🎯 PRIORITY ISSUES TO FIX

### 1. ✅ Citations Don't Work (HIGH PRIORITY)
**Problem**: Citations are displayed but not clickable

**Solution**:
- Add `Link` component to citations
- Link to `/newsletter/[newsletter_id]` page
- Pass chunk context in URL params for highlighting

**Status**: Implementing now

---

### 2. ✅ Similarity Scores Too Compressed (HIGH PRIORITY)
**Problem**: 49-51% similarity scores are weirdly close - not enough differentiation

**Root Cause**: 
- Using `1 - distance` conversion where distance is cosine distance (0-2 range)
- Results are clustered around middle values

**Solutions**:
- **Option A**: Use percentile ranking instead of raw similarity
- **Option B**: Apply sigmoid/softmax transformation to spread scores
- **Option C**: Normalize scores relative to top result
- **Option D**: Use better distance metrics

**Recommendation**: Combine Option C (normalize to top result = 100%) + Option A (percentile ranking)

**Status**: Planning implementation

---

### 3. ✅ Publisher Ranking & Prioritization (HIGH PRIORITY)
**Problem**: No way to rank publishers by relevance or reliability

**Solutions**:
- **Short-term**: Add publisher relevance score based on:
  - Number of relevant chunks from publisher
  - Average similarity scores from that publisher
  - Recency of coverage (recent = more relevant)
  
- **Long-term**: Build publisher reliability scores (see #6)

**Implementation**:
1. Aggregate chunks by publisher
2. Calculate publisher-level metrics
3. Rank and prioritize results by publisher score
4. Display publisher rankings in UI

**Status**: Planning

---

### 4. ✅ Enhanced Search Beyond Chunk Combining (MEDIUM PRIORITY)
**Problem**: Search is just combining vector + keyword results - could be smarter

**Improvements**:
- **Reranking**: Use neural reranker to boost top results (10-25% improvement)
- **Freshness Bias**: Recent newsletters rank 10-20% higher
- **Publisher Diversity**: Ensure top results include multiple publishers
- **Query Expansion**: Handle synonyms, related terms
- **Entity Recognition**: Boost results mentioning specific entities from query
- **Cross-Chunk Context**: Consider newsletter-level relevance, not just chunks

**Status**: Planning

---

### 5. ✅ Narrative Emergence Timeline (MEDIUM PRIORITY)
**Problem**: Can't answer "when did this narrative first emerge?"

**Requirements**:
- Temporal analysis of when topics first appeared
- Timeline visualization
- Track how narratives evolved over time
- Identify "first mention" vs "trending now"

**Implementation Approach**:
1. Add temporal grouping to search results
2. Sort by `sent_date` ASC to find earliest mentions
3. Build timeline API endpoint
4. Create visualization component

**Status**: Planning

---

### 6. ✅ Publisher Reliability Scores (LONG-TERM)
**Problem**: "Which analysts have been MOST correct?"

**This is Complex** - Requires:

**Phase 1: Prediction Tracking**
- Extract predictions/forecasts from newsletters
- Track what publishers predicted
- Build prediction database

**Phase 2: Outcome Tracking**
- Determine if predictions came true
- Track accuracy over time
- Calculate reliability scores

**Phase 3: Scoring Algorithm**
- Accuracy rate (predictions that came true)
- Calibration (correct when confident)
- Track record over time
- Topic-specific reliability

**This is a Major Feature** - Requires:
- Prediction extraction (LLM-powered)
- Outcome verification (manual or automated)
- Scoring infrastructure
- UI for displaying reliability scores

**Status**: Design phase

---

## 🚀 IMMEDIATE ACTIONS (This Session)

### Step 1: Fix Citations (15 minutes)
- Make citations clickable
- Link to newsletter detail pages
- Add chunk highlighting

### Step 2: Improve Similarity Scoring (30 minutes)
- Normalize scores to 0-100% range
- Use percentile ranking
- Better visual differentiation

### Step 3: Add Publisher Ranking (1 hour)
- Aggregate chunks by publisher
- Calculate publisher relevance scores
- Display in UI

### Step 4: Enhance Search Algorithm (2-3 hours)
- Add freshness bias
- Implement reranking
- Publisher diversity
- Better score normalization

---

## 📊 IMPROVEMENT METRICS

**Before:**
- Citation clicks: ❌ Don't work
- Similarity scores: 49-51% (compressed)
- Publisher ranking: ❌ None
- Search quality: Basic chunk combining
- Narrative timeline: ❌ Not available
- Reliability scores: ❌ Not available

**After (Target):**
- Citation clicks: ✅ Work perfectly
- Similarity scores: 60-95% range (well-differentiated)
- Publisher ranking: ✅ Relevance scores shown
- Search quality: Reranked + freshness bias
- Narrative timeline: ✅ Temporal analysis available
- Reliability scores: ⏸️ Phase 1 tracking (long-term)

---

## 🎯 PRIORITY ORDER

1. **Fix Citations** (15 min) - Blocks user experience
2. **Improve Similarity Scores** (30 min) - Better UX
3. **Publisher Ranking** (1 hour) - High value
4. **Enhanced Search** (2-3 hours) - Significant improvement
5. **Narrative Timeline** (3-4 hours) - New feature
6. **Reliability Scores** (20+ hours) - Major feature, long-term

---

**Let's start with fixes 1-3, then move to enhancements!** 🚀
