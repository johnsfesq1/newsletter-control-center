/**
 * Update citation counts only (skip analysis, just update)
 * Use this if citation analysis already ran but updates failed
 */

import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const PUBLISHERS_TABLE = 'publishers';

async function updateCitationsOnly() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  
  console.log('📊 Re-running citation analysis to update counts...\n');
  
  // Re-run the full citation analysis
  // This will take 1-2 hours but will properly update all citation counts
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  console.log('Running full citation analysis...\n');
  const { stdout, stderr } = await execAsync('npm run publishers:initial-citations');
  
  console.log(stdout);
  if (stderr) {
    console.error(stderr);
  }
}

updateCitationsOnly()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

