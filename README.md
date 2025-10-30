# newsletter-control-center
A briefing service based on my newsletters

## Environment Setup

1. Copy the environment template file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in your actual Gmail API credentials:
   - `GMAIL_CLIENT_ID`: Your Gmail API client ID
   - `GMAIL_CLIENT_SECRET`: Your Gmail API client secret  
   - `GMAIL_REFRESH_TOKEN`: Your Gmail API refresh token

3. **Important**: Never commit the `.env` file to version control. It contains sensitive credentials.

4. Verify your environment setup:
   ```bash
   npm run verify-env
   ```

   This will check that all required environment variables are present and exit with a clear error message if any are missing.
