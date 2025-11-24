
import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const PROJECT_ID = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = process.env.BQ_DATASET || 'ncc_production';

// Load VIP config
const VIP_CONFIG_PATH = path.join(process.cwd(), 'config', 'vip.json');
let VIP_LIST: Set<string> = new Set();

try {
  if (fs.existsSync(VIP_CONFIG_PATH)) {
    const vipConfig = JSON.parse(fs.readFileSync(VIP_CONFIG_PATH, 'utf8'));
    // Add emails
    if (vipConfig.senders) {
      vipConfig.senders.forEach((s: string) => VIP_LIST.add(s.toLowerCase()));
    }
  } else {
    console.log('  (No vip.json found, skipping VIP check)');
  }
} catch (err) {
  console.warn('Warning: Could not load config/vip.json', err);
}

async function ensureSchema(bq: BigQuery, tableId: string) {
  const [metadata] = await bq.dataset(DATASET_ID).table('publishers').getMetadata();
  const schema = metadata.schema.fields;
  
  const newFields = [];
  
  if (!schema.some((f: any) => f.name === 'is_vip')) {
    console.log('  Adding column: is_vip');
    newFields.push({ name: 'is_vip', type: 'BOOLEAN', mode: 'NULLABLE' });
  }
  
  if (!schema.some((f: any) => f.name === 'created_at')) {
    console.log('  Adding column: created_at');
    newFields.push({ name: 'created_at', type: 'TIMESTAMP', mode: 'NULLABLE' });
  }

  if (newFields.length > 0) {
    const newSchema = schema.concat(newFields);
    await bq.dataset(DATASET_ID).table('publishers').setMetadata({ schema: { fields: newSchema } });
    console.log('  Schema updated.');
  } else {
    console.log('  Schema already up to date.');
  }
}

function extractDomain(email: string): string {
  const match = email.match(/@(.+)$/);
  return match ? match[1].toLowerCase() : '';
}

function determineService(domain: string): string {
  if (domain.includes('substack')) return 'substack';
  if (domain.includes('beehiiv')) return 'beehiiv';
  if (domain.includes('convertkit')) return 'convertkit';
  if (domain.includes('ghost')) return 'ghost';
  return 'custom';
}

async function main() {
  const bq = new BigQuery({ projectId: PROJECT_ID });
  
  console.log(`Populating publishers in ${PROJECT_ID}.${DATASET_ID}...\n`);

  // 1. Ensure Schema
  await ensureSchema(bq, 'publishers');

  // 2. Query unique publishers
  console.log('Querying distinct publishers from raw_emails...');
  // Note: Converting BigQuery TIMESTAMP to JS Date happens automatically in recent client versions
  // but we need to handle the BigQueryDate object if returned.
  const query = `
    SELECT 
      from_name as publisher_name,
      ANY_VALUE(from_email) as email,
      MIN(sent_date) as first_seen,
      MAX(sent_date) as last_seen
    FROM \`${PROJECT_ID}.${DATASET_ID}.raw_emails\`
    WHERE from_name IS NOT NULL AND from_name != ''
    GROUP BY 1
  `;

  const [rows] = await bq.query({ query, location: 'US' });
  console.log(`Found ${rows.length} unique publishers.`);

  const publishers = rows.map(row => {
    const email = row.email || '';
    const domain = extractDomain(email);
    const isVip = VIP_LIST.has(email.toLowerCase());
    
    // Handle BigQuery timestamp (might be BigQueryTimestamp object or string/date)
    const toDate = (val: any) => {
      if (!val) return null;
      if (val.value) return new Date(val.value); // BigQueryTimestamp
      return new Date(val);
    };

    return {
      publisher_id: uuidv4(),
      service: determineService(domain),
      site_id: domain, // Using domain as site_id for now
      domain_root: domain,
      display_name: row.publisher_name, // This maps to 'publisher_name' in user request
      first_seen_at: bq.timestamp(toDate(row.first_seen) || new Date()),
      last_seen_at: bq.timestamp(toDate(row.last_seen) || new Date()),
      is_vip: isVip,
      created_at: bq.timestamp(new Date())
    };
  });

  // 3. Preview
  console.log('\n--- Preview (First 20) ---');
  publishers.slice(0, 20).forEach(p => {
    console.log(`[${p.is_vip ? 'VIP' : '   '}] ${p.display_name} (${p.service}) - ${p.publisher_id}`);
  });

  // 4. Insert
  console.log(`\nInserting ${publishers.length} publishers...`);
  
  // Insert in batches
  const batchSize = 500;
  let inserted = 0;
  const table = bq.dataset(DATASET_ID).table('publishers');

  for (let i = 0; i < publishers.length; i += batchSize) {
    const batch = publishers.slice(i, i + batchSize);
    try {
      await table.insert(batch);
      inserted += batch.length;
      process.stdout.write(`\rInserted: ${inserted}/${publishers.length}`);
    } catch (err: any) {
      console.error(`\nError inserting batch ${i}:`, err.message);
      if (err.errors) console.error(JSON.stringify(err.errors, null, 2));
    }
  }

  // 5. Stats
  const vipCount = publishers.filter(p => p.is_vip).length;
  console.log('\n\n--- Final Statistics ---');
  console.log(`Total Created: ${inserted}`);
  console.log(`VIPs: ${vipCount}`);
  console.log(`Non-VIPs: ${inserted - vipCount}`);
}

main().catch(console.error);
