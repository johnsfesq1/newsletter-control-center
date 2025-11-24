import express from 'express';
import { GoogleAuth } from 'google-auth-library';
import { checkHealth } from '../ops/health';

const app = express();
app.use(express.json());

const PROJECT_ID = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const REGION = process.env.NCC_REGION || 'us-central1';

// Initialize auth client
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

// Route guard: Allow /health-check publicly, require auth for all other routes
app.use((req, res, next) => {
  // Allow unauthenticated GET requests to /health-check
  if (req.path === '/health-check' && req.method === 'GET') {
    return next();
  }
  
  // All other routes require Bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'This endpoint requires authentication. Provide a Bearer token in the Authorization header.',
    });
  }
  
  // TODO: Verify JWT token with Google's audience = service URL
  // For now, just check that the header exists (Cloud Run validates OIDC tokens at platform level)
  next();
});

interface RunJobRequest {
  job: string;
}

app.post('/run', async (req, res) => {
  try {
    const { job }: RunJobRequest = req.body;

    if (!job) {
      return res.status(400).json({ error: 'Missing job field in request body' });
    }

    // Validate job name
    const validJobs = [
      'ncc-chunks',
      'ncc-embeddings',
      'ncc-smoke',
      'ncc-ingest-me',
      'ncc-ingest-other',
    ];
    if (!validJobs.includes(job)) {
      return res.status(400).json({ error: `Invalid job: ${job}. Must be one of: ${validJobs.join(', ')}` });
    }

    // Get access token
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;

    if (!accessToken) {
      throw new Error('Failed to get access token');
    }

    // Call Cloud Run Jobs API
    const jobName = `projects/${PROJECT_ID}/locations/${REGION}/jobs/${job}`;
    const apiUrl = `https://${REGION}-run.googleapis.com/v2/${jobName}:run`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloud Run Jobs API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    res.json({
      success: true,
      job,
      execution: result.name || 'Unknown',
    });
  } catch (error: any) {
    console.error('Error running job:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Production health check handler
async function handleHealthCheck(req: express.Request, res: express.Response): Promise<void> {
  try {
    const health = await checkHealth();
    
    if (health.ok) {
      res.status(200).json({
        ok: true,
        jobs_ok: true,
        coverage_ok: health.details.reconcile.chunkCoverage === 100 && health.details.reconcile.embeddingCoverage === 100,
        timestamp: new Date().toISOString(),
        details: {
          jobs: health.details.jobs.map(j => ({
            job: j.job,
            lastSuccessTime: j.lastSuccessTime?.toISOString() || null,
            status: j.status,
          })),
          reconcile: health.details.reconcile,
        },
      });
    } else {
      // Return 200 even if logical health is poor, so monitoring tools verify the service is UP.
      // The body indicates the logical failure.
      res.status(200).json({
        ok: false,
        jobs_ok: false,
        coverage_ok: false,
        timestamp: new Date().toISOString(),
        reason: health.reason,
        details: {
          jobs: health.details.jobs.map(j => ({
            job: j.job,
            lastSuccessTime: j.lastSuccessTime?.toISOString() || null,
            status: j.status,
          })),
          reconcile: health.details.reconcile,
        },
      });
    }
  } catch (error: any) {
    console.error('Health check error:', error);
    res.status(500).json({
      ok: false,
      jobs_ok: false,
      coverage_ok: false,
      timestamp: new Date().toISOString(),
      reason: `Health check failed: ${error.message || 'unknown error'}`,
      details: {},
    });
  }
}

// Production health check (using /healthz per requirements, with /health-check as fallback)
app.get('/healthz', handleHealthCheck);
app.get('/health-check', handleHealthCheck);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Jobs runner listening on port ${PORT}`);
});

