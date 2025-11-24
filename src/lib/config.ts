/**
 * Configuration module - loads environment variables
 */

export const cfg = {
  projectId: process.env.BQ_PROJECT_ID || '',
  dataset: process.env.BQ_DATASET || 'ncc_production',
  location: process.env.BQ_LOCATION || 'US',
  adminToken: process.env.ADMIN_TOKEN || '',
  ingestLabel: process.env.GMAIL_INGEST_LABEL || 'Ingested',
  paidLabel: process.env.GMAIL_PAID_LABEL || 'Paid $',
};

