import { GoogleAuth } from 'google-auth-library';

export interface EmbedOptions {
  model?: string;
  location?: string;
}

export async function embedBatch(
  texts: string[],
  options: EmbedOptions = {}
): Promise<number[][]> {
  const projectId = process.env.BQ_PROJECT_ID;
  const model = options.model || process.env.EMB_MODEL || 'text-embedding-004';
  // Vertex AI uses region codes (us-central1), not BigQuery locations (US)
  // Map common BigQuery locations to Vertex AI regions
  const bqLocation = process.env.BQ_LOCATION || 'US';
  const locationMap: Record<string, string> = {
    'US': 'us-central1',
    'EU': 'europe-west1',
    'asia-northeast1': 'asia-northeast1',
  };
  const location = options.location || process.env.EMB_LOCATION || locationMap[bqLocation] || 'us-central1';

  if (!projectId) {
    throw new Error('BQ_PROJECT_ID environment variable is required');
  }

  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  if (!accessToken.token) {
    throw new Error('Failed to get access token');
  }

  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

  const instances = texts.map((text) => ({
    content: text,
    task_type: 'RETRIEVAL_DOCUMENT',
  }));

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ instances }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vertex AI API returned ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  if (!data.predictions || !Array.isArray(data.predictions)) {
    throw new Error('Invalid response format from Vertex AI API');
  }

  const embeddings: number[][] = data.predictions.map((pred: any) => {
    if (pred.embeddings) {
      return pred.embeddings.values || pred.embeddings;
    }
    throw new Error('Missing embeddings in prediction');
  });

  return embeddings;
}

