# newsletter-control-center
A briefing service based on my newsletters

## Environment Setup

### Authentication

This project uses **Google Cloud service account credentials** for BigQuery, Vertex AI, and other Google Cloud services.

**Local Development:**
- Service account key is stored at: `~/.gcloud/newsletter-local-dev-key.json`
- Environment variable is set in `~/.zshrc`: `GOOGLE_APPLICATION_CREDENTIALS`
- **No need to run `gcloud auth application-default login`** - the service account key provides long-lived credentials

**Cloud Run:**
- Automatically uses compute service account
- Tokens auto-refresh (never expire)

### Environment Variables

1. Copy the environment template file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in your actual credentials:
   - **Gmail API** (for newsletter ingestion):
     - `GMAIL_CLIENT_ID`: Your Gmail API client ID
     - `GMAIL_CLIENT_SECRET`: Your Gmail API client secret  
     - `GMAIL_REFRESH_TOKEN`: Your Gmail API refresh token
   - **Google Custom Search API** (for discovery, optional):
     - `GOOGLE_CUSTOM_SEARCH_API_KEY`: Your API key
     - `GOOGLE_CUSTOM_SEARCH_ENGINE_ID`: Your search engine ID

3. **Important**: Never commit the `.env` file to version control. It contains sensitive credentials.

4. Verify your environment setup:
   ```bash
   npm run verify-env
   ```

   This will check that all required environment variables are present and exit with a clear error message if any are missing.

## Architecture

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for complete system architecture including:

- Data flow diagram
- Publisher canonicalization logic
- Database schema
- Migration path from v1 to v2

## Runbook

See [docs/RUNBOOK.md](./docs/RUNBOOK.md) for:

- Daily operational procedures
- Monitoring queries
- Troubleshooting guides
- Manual intervention procedures
