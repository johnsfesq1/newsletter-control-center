# Long-Term Product Roadmap

## 🎯 Vision
Build a semantic intelligence platform that transforms newsletter subscriptions into actionable insights with RAG-powered queries, quality citations, and intelligent content discovery.

---

## Phase 1: Foundation (Current - In Progress) ✅

**Goal:** Core RAG system working with clean, searchable corpus

**Status:** 70% Complete

- ✅ Basic ingestion pipeline (Gmail → BigQuery)
- ✅ Semantic chunking + embeddings
- ✅ Hybrid retrieval (vector + keyword)
- ✅ LLM-powered synthesis with citations
- ✅ Cloud Run infrastructure
- ✅ Quality validation
- 🚧 Critical infrastructure fixes (in progress)
- 🚧 New features (paid, labels, links)

**End State:** 73K newsletters processed, RAG working reliably

---

## Phase 2: Optimization (Next 4-6 weeks)

**Goal:** Improve retrieval quality, reduce costs, add intelligence

### Retrieval Enhancements (Medium Priority)
- [ ] **Neural Reranker** - Boost top-k results by 10-25%
  - Use CrossEncoder or similar
  - Rerank top 50 → select top 10
  - Integration: 8-12 hours
  
- [ ] **Query Expansion** - Handle entities, acronyms, dates
  - Entity extraction (people, places, orgs)
  - Acronym resolution (AI → Artificial Intelligence)
  - Date range expansion ("recent" → last 30 days)
  - Integration: 6-8 hours
  
- [ ] **Freshness Bias** - Time-decay scoring
  - Recent newsletters outrank older by default
  - Allow query override: "historical perspective"
  - Integration: 4-6 hours

### Data Quality Improvements
- [ ] **MERGE Deduplication** - Replace query-based dedupe
  - Use MERGE statements for idempotency
  - Primary key enforcement
  - Integration: 3-4 hours
  
- [ ] **Answerability Classifier** - Reduce hallucination
  - Detect low-confidence queries
  - Say "not enough evidence" instead of guessing
  - Offer closest sources
  - Integration: 8-10 hours

### Monitoring & Observability
- [ ] **Publisher Health Dashboard**
  - Top senders, failure rates
  - Ingestion freshness per publisher
  - Coverage metrics (legacy → nsm transition)
  - Integration: 10-12 hours
  
- [ ] **Automated Alerting**
  - Error rate thresholds (>2%)
  - Job duration alerts (>P95)
  - Cost overruns
  - Integration: 4-6 hours

**End State:** High-quality retrieval, low hallucination, well-monitored

---

## Phase 3: Link Intelligence (6-8 weeks)

**Goal:** Extract and ingest content from newsletter links

### Link Extraction (Phase 2-4)
- [ ] **Link Deduplication** - Track reference counts
  - Create `links` table in BigQuery
  - Only process links mentioned 2+ times
  - Integration: 4-6 hours
  
- [ ] **Smart Content Extraction** - Visit valuable links
  - AI-powered relevance filtering
  - Playwright for dynamic content
  - Readability.js for articles
  - Skip paywalled content
  - Integration: 12-16 hours
  
- [ ] **Link → Chunk Relationship**
  - `chunk_source` enum: 'newsletter' | 'external_link'
  - Maintain provenance trail
  - Citation: "Source: The Atlantic via Axios"
  - Integration: 6-8 hours

**End State:** Linked content enhances corpus, maintains provenance

---

## Phase 4: User Interface (8-12 weeks)

**Goal:** Web interface for querying and browsing newsletters

### Query Interface
- [ ] **Search UI** - Clean, fast query interface
  - Auto-suggest based on corpus
  - Recent queries history
  - Saved searches
  - Integration: 20-30 hours
  
- [ ] **Results Display** - Beautiful answers + citations
  - Expandable citations
  - Newsletter preview cards
  - Publisher filters
  - Date range sliders
  - Integration: 20-25 hours

### Browsing Interface
- [ ] **Newsletter Browser** - Explore by publisher
  - Publisher list with counts
  - Sortable columns
  - Filter by date, topic, paid status
  - Integration: 15-20 hours
  
- [ ] **Article Reader** - Full text display
  - Clean, readable format
  - Related newsletters
  - Citation links
  - Integration: 10-15 hours

**End State:** Product-quality UI for end users

---

## Phase 5: Intelligence Features (12-16 weeks)

**Goal:** Proactive insights, not just reactive queries

### Trend Detection
- [ ] **Emerging Story Detection**
  - Cross-publisher pattern matching
  - Early warning signals
  - "3 publishers starting to cover X"
  - Integration: 15-20 hours
  
- [ ] **Contradiction Detection**
  - Flag conflicting claims
  - Cross-reference sources
  - "Zeihan says X, but Bloomberg says Y"
  - Integration: 12-16 hours

### Personalization
- [ ] **Topic Clustering**
  - Auto-group related newsletters
  - User-defined topics
  - Smart recommendations
  - Integration: 16-20 hours
  
- [ ] **User Preferences**
  - Favorite publishers
  - Muted sources
  - Priority flags
  - Integration: 8-12 hours

### Automation
- [ ] **Weekly Digest**
  - Summarize top stories by topic
  - Email or dashboard
  - Customizable format
  - Integration: 12-16 hours
  
- [ ] **Alert Rules**
  - "Notify me when X is mentioned"
  - Custom triggers
  - Slack/email integration
  - Integration: 10-15 hours

**End State:** Proactive intelligence platform, not just a query engine

---

## Phase 6: Monetization (16+ weeks)

**Goal:** Paid tiers and premium features

### Pricing Tiers
- [ ] **Free Tier**
  - 100 queries/month
  - Recent newsletters only (last 30 days)
  - Public sources only
  
- [ ] **Pro Tier** ($X/month)
  - Unlimited queries
  - Full historical archive
  - Paid sources included
  
- [ ] **Enterprise Tier** (custom)
  - Custom corpus ingestion
  - API access
  - White-label option

### Revenue Features
- [ ] **Billing Integration** - Stripe/payments
- [ ] **Usage Analytics** - Track queries, users
- [ ] **Referral Program** - Growth mechanism

**End State:** Sustainable business model

---

## Ongoing Maintenance

### Data Quality
- Daily ingestion from new inbox
- Weekly evaluation runs
- Monthly quality reports
- Quarterly corpus audits

### Infrastructure
- Monitor Cloud Run costs
- Optimize BigQuery queries
- Update AI models (lock version)
- Security audits

### Product Improvements
- User feedback integration
- A/B testing
- Performance optimization
- Feature deprecation

---

## Success Metrics

**Technical:**
- Query latency < 2-3 seconds (p95)
- Retrieval precision > 85%
- Citation accuracy > 95%
- Uptime > 99.5%

**Product:**
- User engagement (queries per user per week)
- Feature adoption rates
- User retention (monthly/quarterly)
- Customer satisfaction scores

**Business:**
- Monthly recurring revenue
- Customer acquisition cost
- Lifetime value
- Churn rate

---

## Key Principles

1. **Data Quality First** - Bad data = bad product
2. **Measure Everything** - Metrics over gut feelings
3. **Iterate Fast** - Ship, measure, improve
4. **User Value** - Every feature must solve real problems
5. **Technical Debt** - Pay it down incrementally, not all at once

