import { getBigQuery } from '../bq/client';
import { GoogleAuth } from 'google-auth-library';

const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const REGION = process.env.NCC_REGION || 'us-central1';
const DATASET = process.env.BQ_DATASET || 'ncc_production';
const LOCATION = process.env.BQ_LOCATION || 'US';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

interface JobExecutionTime {
  job: string;
  lastSuccessTime: Date | null;
  status: 'success' | 'stale' | 'missing';
}

interface ReconcileStats {
  rawEmails: number;
  emailsChunked: number;
  chunks: number;
  chunksEmbedded: number;
  chunkCoverage: number; // 0-100
  embeddingCoverage: number; // 0-100
}

interface HealthCheckResult {
  ok: boolean;
  reason?: string;
  details: {
    jobs: JobExecutionTime[];
    reconcile: ReconcileStats;
  };
}

/**
 * Get last successful execution time for a Cloud Run job using API
 */
async function getLastJobExecutionTime(jobName: string): Promise<JobExecutionTime> {
  try {
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;
    
    if (!accessToken) {
      throw new Error('Failed to get access token');
    }
    
    // List executions for the job, filtering for successful ones
    const apiUrl = `https://${REGION}-run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/jobs/${jobName}/executions?pageSize=1`;
    
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    const executions = data.executions || [];
    
    // Find the most recent successful execution
    const successfulExec = executions.find((exec: any) => 
      exec.status?.conditions?.some((c: any) => c.type === 'Completed' && c.status === 'True')
    );
    
    if (successfulExec) {
      const completionTime = successfulExec.status?.completionTime;
      
      if (completionTime) {
        const lastSuccess = new Date(completionTime);
        const now = new Date();
        const minutesAgo = (now.getTime() - lastSuccess.getTime()) / (1000 * 60);
        
        return {
          job: jobName,
          lastSuccessTime: lastSuccess,
          status: minutesAgo <= 120 ? 'success' : 'stale',
        };
      }
    }
    
    return {
      job: jobName,
      lastSuccessTime: null,
      status: 'missing',
    };
  } catch (error) {
    // Job might not exist or no executions
    return {
      job: jobName,
      lastSuccessTime: null,
      status: 'missing',
    };
  }
}

/**
 * Get reconcile stats for last 24 hours
 */
async function getReconcileStats(): Promise<ReconcileStats> {
  const bq = getBigQuery();
  const t0 = 'TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)';
  
  const queries = {
    raw24h: `
      SELECT COUNT(*) AS count
      FROM \`${PROJECT}.${DATASET}.raw_emails\`
      WHERE ingested_at >= ${t0}
    `,
    emailsWithChunks24h: `
      SELECT COUNT(DISTINCT gmail_message_id) AS count
      FROM \`${PROJECT}.${DATASET}.chunks\`
      WHERE gmail_message_id IN (
        SELECT gmail_message_id
        FROM \`${PROJECT}.${DATASET}.raw_emails\`
        WHERE ingested_at >= ${t0}
      )
    `,
    chunks24h: `
      SELECT COUNT(*) AS count
      FROM \`${PROJECT}.${DATASET}.chunks\`
      WHERE gmail_message_id IN (
        SELECT gmail_message_id
        FROM \`${PROJECT}.${DATASET}.raw_emails\`
        WHERE ingested_at >= ${t0}
      )
    `,
    embeddedChunks24h: `
      SELECT COUNT(*) AS count
      FROM \`${PROJECT}.${DATASET}.chunk_embeddings\`
      WHERE chunk_id IN (
        SELECT chunk_id
        FROM \`${PROJECT}.${DATASET}.chunks\`
        WHERE gmail_message_id IN (
          SELECT gmail_message_id
          FROM \`${PROJECT}.${DATASET}.raw_emails\`
          WHERE ingested_at >= ${t0}
        )
      )
    `,
  };
  
  try {
    const [raw24hRows] = await bq.query({ query: queries.raw24h, location: LOCATION });
    const rawEmails = (raw24hRows[0] as { count: number }).count;
    
    const [emailsWithChunks24hRows] = await bq.query({ query: queries.emailsWithChunks24h, location: LOCATION });
    const emailsChunked = (emailsWithChunks24hRows[0] as { count: number }).count;
    
    const [chunks24hRows] = await bq.query({ query: queries.chunks24h, location: LOCATION });
    const chunks = (chunks24hRows[0] as { count: number }).count;
    
    const [embeddedChunks24hRows] = await bq.query({ query: queries.embeddedChunks24h, location: LOCATION });
    const chunksEmbedded = (embeddedChunks24hRows[0] as { count: number }).count;
    
    const chunkCoverage = rawEmails > 0 ? Math.round((emailsChunked / rawEmails) * 10000) / 100 : 100;
    const embeddingCoverage = chunks > 0 ? Math.round((chunksEmbedded / chunks) * 10000) / 100 : 100;
    
    return {
      rawEmails,
      emailsChunked,
      chunks,
      chunksEmbedded,
      chunkCoverage,
      embeddingCoverage,
    };
  } catch (error: any) {
    console.error('Error getting reconcile stats:', error);
    // Return safe defaults
    return {
      rawEmails: 0,
      emailsChunked: 0,
      chunks: 0,
      chunksEmbedded: 0,
      chunkCoverage: 0,
      embeddingCoverage: 0,
    };
  }
}

/**
 * Run health check
 */
export async function checkHealth(): Promise<HealthCheckResult> {
  const monitoredJobs = ['ncc-ingest-me', 'ncc-ingest-other', 'ncc-chunks', 'ncc-embeddings'];
  
  // Get job execution times (parallel)
  const jobPromises = monitoredJobs.map(job => getLastJobExecutionTime(job));
  const jobs = await Promise.all(jobPromises);
  
  // Get reconcile stats
  const reconcile = await getReconcileStats();
  
  // Check conditions
  const allJobsRecent = jobs.every(j => j.status === 'success');
  const chunkCoverageOk = reconcile.chunkCoverage === 100;
  const embeddingCoverageOk = reconcile.embeddingCoverage === 100;
  
  const ok = allJobsRecent && chunkCoverageOk && embeddingCoverageOk;
  
  const reasons: string[] = [];
  if (!allJobsRecent) {
    const staleJobs = jobs.filter(j => j.status !== 'success').map(j => j.job);
    reasons.push(`Jobs not recent: ${staleJobs.join(', ')}`);
  }
  if (!chunkCoverageOk) {
    reasons.push(`Chunk coverage: ${reconcile.chunkCoverage}% (expected 100%)`);
  }
  if (!embeddingCoverageOk) {
    reasons.push(`Embedding coverage: ${reconcile.embeddingCoverage}% (expected 100%)`);
  }
  
  return {
    ok,
    reason: reasons.length > 0 ? reasons.join('; ') : undefined,
    details: {
      jobs,
      reconcile,
    },
  };
}

