import { BigQuery } from '@google-cloud/bigquery';

let bqInstance: BigQuery | null = null;

export function getBigQuery(): BigQuery {
  if (!bqInstance) {
    const projectId = process.env.BQ_PROJECT_ID;
    if (!projectId) {
      throw new Error('BQ_PROJECT_ID environment variable is required');
    }
    
    // Use service account key if GOOGLE_APPLICATION_CREDENTIALS is set
    const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (keyFilename) {
      bqInstance = new BigQuery({ 
        projectId,
        keyFilename 
      });
    } else {
      // Fall back to Application Default Credentials
      bqInstance = new BigQuery({ projectId });
    }
  }
  return bqInstance;
}

export async function getDataset() {
  const bq = getBigQuery();
  const datasetId = process.env.BQ_DATASET || 'ncc_production';
  const location = process.env.BQ_LOCATION || 'US';
  const dataset = bq.dataset(datasetId, { location });
  await dataset.get({ autoCreate: true });
  return dataset;
}

export async function getTable(name: string) {
  const dataset = await getDataset();
  return dataset.table(name);
}

