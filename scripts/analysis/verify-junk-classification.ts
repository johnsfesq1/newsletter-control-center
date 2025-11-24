
import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';

dotenv.config();

const PROJECT_ID = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_production';

async function main() {
  const bq = new BigQuery({ projectId: PROJECT_ID });

  console.log('--- 1. Analyzing JUNK Chunks (is_junk = TRUE) ---');
  const queryJunk = `
    SELECT chunk_id, SUBSTR(chunk_text, 1, 200) as preview, LENGTH(chunk_text) as len
    FROM \`${PROJECT_ID}.${DATASET_ID}.chunks\`
    WHERE is_junk = TRUE
    ORDER BY RAND()
    LIMIT 20
  `;
  const [junkRows] = await bq.query({ query: queryJunk, location: 'US' });
  junkRows.forEach(r => {
    console.log(`[${r.chunk_id}] Len: ${r.len} | "${r.preview.replace(/\n/g, ' ')}..."`);
  });

  console.log('\n--- 2. Analyzing VALID Chunks (is_junk = FALSE) ---');
  const queryValid = `
    SELECT chunk_id, SUBSTR(chunk_text, 1, 200) as preview, LENGTH(chunk_text) as len
    FROM \`${PROJECT_ID}.${DATASET_ID}.chunks\`
    WHERE is_junk = FALSE
    ORDER BY RAND()
    LIMIT 20
  `;
  const [validRows] = await bq.query({ query: queryValid, location: 'US' });
  validRows.forEach(r => {
    console.log(`[${r.chunk_id}] Len: ${r.len} | "${r.preview.replace(/\n/g, ' ')}..."`);
  });

  console.log('\n--- 3. Checking Short Valid Chunks (< 300 chars but is_junk = FALSE) ---');
  // Note: Heuristic used < 300 chars as flag. Checking for exceptions or gaps.
  // If the logic was "LENGTH < 300 OR keywords", then all < 300 should be TRUE.
  // Let's verify if any slipped through (maybe NULLs?).
  const queryShortValid = `
    SELECT chunk_id, SUBSTR(chunk_text, 1, 200) as preview, LENGTH(chunk_text) as len
    FROM \`${PROJECT_ID}.${DATASET_ID}.chunks\`
    WHERE (is_junk = FALSE OR is_junk IS NULL)
      AND LENGTH(chunk_text) < 300
    LIMIT 10
  `;
  const [shortValidRows] = await bq.query({ query: queryShortValid, location: 'US' });
  
  if (shortValidRows.length === 0) {
    console.log('None found. All chunks < 300 chars were correctly flagged.');
  } else {
    shortValidRows.forEach(r => {
      console.log(`[${r.chunk_id}] Len: ${r.len} | "${r.preview.replace(/\n/g, ' ')}..."`);
    });
  }
}

main().catch(console.error);

