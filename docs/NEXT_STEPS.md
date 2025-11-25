# Resume Work Protocol

**Project:** Newsletter Control Center
**Last Phase Completed:** Phase 4 (Trust & Verification)
**Next Phase:** Phase 5 (Polish & Deployment)

---

## 🚀 How to Start (The "Morning Routine")

1.  **Start the Server:**
    ```bash
    cd newsletter-search && npm run dev
    ```
2.  **Open the Dashboard:**
    `http://localhost:3000/briefing`
3.  **Run a Cycle:**
    Click **"Run Intelligence Cycle"** -> **"Last 24 Hours"** to generate fresh data.

---

## 📋 The Todo List

### Priority 1: Deployment (Get it off Localhost)

Currently, the cron job only runs if your laptop is open.

- [ ] **Database:** Ensure BigQuery/Vertex permissions are set for a Service Account (not just your User ADC).
- [ ] **Hosting:** Deploy Next.js to Vercel.
- [ ] **Cron:** Configure Vercel Cron to hit `/api/cron/daily-briefing` at 8:15 AM.

### Priority 2: Data Polish (The "Last Mile" of Trust)

- [ ] **Publisher Lookup:** Create a mapping table (or regex logic) to turn `writer@substack.com` into "The Writer's Name".
- [ ] **Smart Snippets:** Update the Map Phase prompt to extract a specific "Quote" rather than just the summary.

### Priority 3: Personalization (The "Lens")

- [ ] **Topic Filtering:** Allow generating a briefing ONLY for "Crypto" or ONLY for "China."

---

## 🔑 Key Secrets (Local)

Ensure your `.env.local` has:

- `BRIEFING_ADMIN_KEY` (Server)
- `NEXT_PUBLIC_BRIEFING_ADMIN_KEY` (Client)
- `RESEND_API_KEY` (Email)
- `ADMIN_EMAIL` (Recipient)

