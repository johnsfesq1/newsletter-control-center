import 'dotenv/config';
import { getBigQuery } from '../src/bq/client';

async function main(): Promise<void> {
  const projectId = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const datasetId = 'ncc_newsletters';
  const location = process.env.BQ_LOCATION || 'US';

  if (!projectId) {
    throw new Error('BQ_PROJECT_ID environment variable is required');
  }

  const bq = getBigQuery();

  console.log('---');
  console.log('LEGACY SCHEMA');
  console.log('');

  // Query columns for messages table
  const messagesColumnsQuery = `
    SELECT column_name, data_type
    FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.COLUMNS\`
    WHERE table_name = 'messages'
    ORDER BY ordinal_position
  `;

  let messagesColumns: Array<{ column_name: string; data_type: string }> = [];
  try {
    const [rows] = await bq.query({
      query: messagesColumnsQuery,
      location,
    });
    messagesColumns = rows as Array<{ column_name: string; data_type: string }>;
  } catch (error: any) {
    console.error(`Error querying messages columns: ${error.message}`);
    return;
  }

  console.log('messages columns:');
  for (const col of messagesColumns) {
    console.log(`  - ${col.column_name} ${col.data_type}`);
  }
  console.log('');

  // Query sample row from messages table
  const messagesIdFields = ['gmail_message_id', 'message_id', 'id', 'gmail_id', 'subject', 'sent_date'];
  const messagesExistingFields = messagesColumns
    .map(c => c.column_name)
    .filter(name => messagesIdFields.includes(name));

  if (messagesExistingFields.length > 0) {
    const messagesSampleQuery = `
      SELECT ${messagesExistingFields.map(f => `\`${f}\``).join(', ')}
      FROM \`${projectId}.${datasetId}.messages\`
      LIMIT 1
    `;

    try {
      const [rows] = await bq.query({
        query: messagesSampleQuery,
        location,
      });
      if (rows.length > 0) {
        const sample = rows[0] as Record<string, any>;
        const samplePairs = messagesExistingFields
          .map(field => `${field}=${sample[field] ?? 'NULL'}`)
          .join(', ');
        console.log('messages sample keys:');
        console.log(`  ${samplePairs}`);
      } else {
        console.log('messages sample keys:');
        console.log('  (no rows found)');
      }
    } catch (error: any) {
      console.error(`Error querying messages sample: ${error.message}`);
    }
  } else {
    console.log('messages sample keys:');
    console.log('  (no ID fields found)');
  }
  console.log('');

  // Query columns for chunks table
  const chunksColumnsQuery = `
    SELECT column_name, data_type
    FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.COLUMNS\`
    WHERE table_name = 'chunks'
    ORDER BY ordinal_position
  `;

  let chunksColumns: Array<{ column_name: string; data_type: string }> = [];
  try {
    const [rows] = await bq.query({
      query: chunksColumnsQuery,
      location,
    });
    chunksColumns = rows as Array<{ column_name: string; data_type: string }>;
  } catch (error: any) {
    console.error(`Error querying chunks columns: ${error.message}`);
    return;
  }

  console.log('chunks columns:');
  for (const col of chunksColumns) {
    console.log(`  - ${col.column_name} ${col.data_type}`);
  }
  console.log('');

  // Query sample row from chunks table
  const chunksIdFields = ['chunk_id', 'newsletter_id', 'gmail_message_id', 'chunk_index'];
  const chunksExistingFields = chunksColumns
    .map(c => c.column_name)
    .filter(name => chunksIdFields.includes(name));

  if (chunksExistingFields.length > 0) {
    const chunksSampleQuery = `
      SELECT ${chunksExistingFields.map(f => `\`${f}\``).join(', ')}
      FROM \`${projectId}.${datasetId}.chunks\`
      LIMIT 1
    `;

    try {
      const [rows] = await bq.query({
        query: chunksSampleQuery,
        location,
      });
      if (rows.length > 0) {
        const sample = rows[0] as Record<string, any>;
        const samplePairs = chunksExistingFields
          .map(field => `${field}=${sample[field] ?? 'NULL'}`)
          .join(', ');
        console.log('chunks sample keys:');
        console.log(`  ${samplePairs}`);
      } else {
        console.log('chunks sample keys:');
        console.log('  (no rows found)');
      }
    } catch (error: any) {
      console.error(`Error querying chunks sample: ${error.message}`);
    }
  } else {
    console.log('chunks sample keys:');
    console.log('  (no ID fields found)');
  }
  console.log('---');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

