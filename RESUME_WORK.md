# Resume Work - Morning Protocol

**Last Session:** November 25, 2025  
**Status:** Phase 2 Complete (Briefing Engine MVP Operational)

---

## 🚀 Quick Start (30 seconds)

### 1. Start the Server

```bash
cd newsletter-search && npm run dev
```

### 2. Test the System

```bash
curl -X POST http://localhost:3000/api/intelligence/briefing/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-secret-123" \
  -d '{"windowHours": 24}'
```

### 3. View the Dashboard

```
http://localhost:3000/briefing
```

---

## 🎯 Immediate Goal (Phase 3)

**Open this file and tune the prompt:**

```
src/lib/briefing/generator.ts
```

**Look for:** `EDITOR_IN_CHIEF_PROMPT` (around line 311)

**Problem:** The current prompt is too creative. It produces:
- Overly dramatic narrative titles
- Generic geopolitical tropes
- Speculative synthesis beyond source material

**Fix:** Add explicit grounding rules:
- "Only state what sources explicitly claim"
- "Require direct quotes for key claims"
- "Do not extrapolate or editorialize"

---

## 📁 Key Files

| Purpose | Location |
|---------|----------|
| **Prompt to tune** | `src/lib/briefing/generator.ts` |
| **UI Components** | `src/components/briefing/` |
| **Dashboard Page** | `src/app/briefing/page.tsx` |
| **API Routes** | `src/app/api/intelligence/briefing/` |

---

## 🛠️ Troubleshooting

### Port 3000 Already in Use

```bash
kill -9 $(lsof -t -i:3000)
```

### Auth Expired

```bash
gcloud auth application-default login --project newsletter-control-center
```

### Empty Briefing Result

Increase the time window:
```bash
curl ... -d '{"windowHours": 168}'  # 7 days
```

---

## 📊 Last Successful Run

| Metric | Value |
|--------|-------|
| Briefing ID | `b46c4af1-2365-41f3-b11a-36d2cbd54c8e` |
| Emails | 500 |
| Clusters | 6 |
| Time | ~4 minutes |

---

## 📚 Documentation

- **Phase 2 Log:** `docs/PHASE_2_LOG.md`
- **Dev Runbook:** `docs/DEV_RUNBOOK.md`
- **Architecture:** `docs/SYSTEM_ARCHITECTURE.md`
- **Briefing Spec:** `docs/BRIEFING_ENGINE_SPEC.md`

---

**Ready to code. Good morning!** ☕

