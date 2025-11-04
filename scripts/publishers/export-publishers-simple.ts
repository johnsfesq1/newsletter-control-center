/**
 * Export simple list of publishers with names and URLs
 */

import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const PUBLISHERS_TABLE = 'publishers';

async function exportPublishersSimple() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  console.log('📊 Exporting publishers (name + URL)...\n');

  try {
    const query = `
      SELECT 
        publisher_name,
        newsletter_url
      FROM \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\`
      ORDER BY publisher_name ASC
    `;

    const [rows] = await bigquery.query(query);
    console.log(`   Found ${rows.length} publishers\n`);

    // Create output directory
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate CSV
    const csvPath = path.join(outputDir, 'publishers-name-url.csv');
    const csvHeaders = ['Publisher Name', 'URL'];
    
    let csvContent = csvHeaders.join(',') + '\n';

    for (const row of rows) {
      const name = (row.publisher_name || '').replace(/"/g, '""');
      const url = (row.newsletter_url || '').replace(/"/g, '""');
      csvContent += `"${name}","${url}"\n`;
    }

    fs.writeFileSync(csvPath, csvContent);
    console.log(`✅ CSV exported: ${csvPath}\n`);
    console.log(`   Total publishers: ${rows.length}\n`);

  } catch (error: any) {
    console.error('❌ Error exporting publishers:', error.message);
    throw error;
  }
}

exportPublishersSimple()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

