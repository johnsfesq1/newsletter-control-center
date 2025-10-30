# Newsletter Control Center - Project Status

## Overview

This repository contains a Gmail-driven newsletter ingestion foundation that can authenticate with Gmail API, classify emails as VIP or non-VIP based on sender/domain rules, and extract plaintext content from messages. The system currently operates as command-line scripts with no LLM summarization or web interface yet implemented.

## Current Capabilities (verified by code)

- **Auth**: `src/lib/gmail.ts` (getGmail, extractEmailAddress) - OAuth2 client creation and email address extraction
- **Parsing**: `src/lib/parseMessage.ts` (extractPlaintext, getHeader) - Message content extraction and header parsing
- **Config**: `config/vip.json` (VIP senders/domains) - 7 VIP senders and 7 VIP domains for classification
- **Scripts**: 
  - `scripts/whoami.ts` - Authenticates and displays current Gmail user
  - `scripts/list-recent.ts` - Lists 50 recent message IDs from last 24h
  - `scripts/classify-recent.ts` - Classifies messages as VIP/non-VIP with counts and samples
  - `scripts/preview-vip.ts` - Shows first 10 VIP messages with sender/subject/snippet
- **Types**: `src/types.ts` - Email and FetchResult type definitions

## Environment & Security

- `.env` is local-only and excluded from git via `.gitignore`
- `.env.example` present with placeholder values
- Required environment variables: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`
- `.gitignore` excludes secrets, build artifacts, and OS/editor files

## How to Run (today)

1. `npm install`
2. `cp .env.example .env` (fill values)
3. `npx ts-node scripts/whoami.ts` → prints authenticated address
4. `npm run list:recent` → prints 50 IDs
5. `npm run classify:recent` → VIP/non-VIP counts + samples
6. `npm run preview:vip` → first 10 VIP bodies (sender/subject/snippet)

## What's Not Built Yet

- [ ] LLM summarization of newsletter content
- [ ] Non-VIP email theming/categorization
- [ ] Automated scheduler for periodic runs
- [ ] HTTP API endpoints for external access
- [ ] Cloud Run deployment configuration
- [ ] Frontend web interface
- [ ] Data persistence/storage layer

## Suggested Next Micro-Steps

- Add `scripts/fetch-bodies.ts` to persist raw VIP/non-VIP plaintext to `out/` (JSONL).
- Add `src/http/server.ts` with one route `GET /healthz` to prep for deploy.
- Add `scripts/brief-vip.ts` (stub summarizer) to render Markdown (MVP).
- Add `scripts/schedule-daily.ts` to run classification and store results.
- Add `out/` directory and `.gitignore` entry for generated content.

## Repo Map

```
config/
  vip.json
scripts/
  whoami.ts
  list-recent.ts
  classify-recent.ts
  preview-vip.ts
  verify-env.ts
  get-gmail-token.js
src/
  lib/
    gmail.ts
    parseMessage.ts
  types.ts
  index.js
.env.example
tsconfig.json
package.json
.gitignore
README.md
```

## Architecture Sketch

```mermaid
flowchart LR
  G[Gmail API] -->|OAuth2 + refresh token| H[Helper getGmail()]
  H --> S1[list-recent.ts]
  H --> S2[classify-recent.ts]
  H --> S3[preview-vip.ts]
  S2 -.uses config .-> V[vip.json]
  S3 --> P[parseMessage.extractPlaintext]
  
  %% Future (dashed)
  subgraph Future [planned]
    A[HTTP API / Cloud Run]
    F[Frontend (React/Next)]
    L[LLM Summarizer]
  end
  
  S3 -.to be consumed by .-> L
  A -.to power .-> F
```
