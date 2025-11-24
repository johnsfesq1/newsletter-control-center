import 'dotenv/config';
import { getBigQuery } from '../src/bq/client';

async function main(): Promise<void> {
  const projectId = process.env.BQ_PROJECT_ID;
  const datasetId = process.env.BQ_DATASET || 'ncc_production';
  const legacyDataset = process.env.LEGACY_DATASET || 'ncc_newsletters';
  const legacyRawTable = process.env.LEGACY_RAW_TABLE || 'messages';
  const legacyChunksTable = process.env.LEGACY_CHUNKS_TABLE || 'chunks';
  const legacyEmbTable = process.env.LEGACY_EMB_TABLE || 'chunk_embeddings';
  const location = process.env.BQ_LOCATION || 'US';

  if (!projectId) {
    throw new Error('BQ_PROJECT_ID environment variable is required');
  }

  const bq = getBigQuery();

  interface TableStats {
    rows: number;
    first: string;
    last: string;
  }

  const formatDate = (date: any): string => {
    if (!date) return 'N/A';
    if (typeof date === 'string') {
      try {
        return new Date(date).toISOString();
      } catch {
        return 'N/A';
      }
    }
    if (date.value) {
      try {
        return new Date(date.value).toISOString();
      } catch {
        return 'N/A';
      }
    }
    return 'N/A';
  };

  const queryTableStats = async (
    tablePath: string,
    countCol: string = '*',
    dateCol: string | null = null
  ): Promise<TableStats | 'not found'> => {
    try {
      // Build query
      let query = `SELECT COUNT(${countCol}) AS cnt`;
      if (dateCol) {
        query += `, MIN(${dateCol}) AS first_date, MAX(${dateCol}) AS last_date`;
      }
      query += ` FROM \`${tablePath}\``;

      const [rows] = await bq.query({
        query,
        location,
      });

      const result = rows[0] as any;
      return {
        rows: Number(result.cnt) || 0,
        first: dateCol ? formatDate(result.first_date) : 'N/A',
        last: dateCol ? formatDate(result.last_date) : 'N/A',
      };
    } catch (error: any) {
      // If table doesn't exist, return 'not found'
      const errorMsg = error.message || String(error);
      if (
        errorMsg.includes('Not found') ||
        errorMsg.includes('does not exist') ||
        errorMsg.includes('Table not found') ||
        errorMsg.includes('was not found')
      ) {
        return 'not found';
      }
      throw error;
    }
  };

  const queryLegacyRawTable = async (): Promise<TableStats | 'not found'> => {
    const tablePath = `${projectId}.${legacyDataset}.${legacyRawTable}`;
    
    // Try sent_date first, then internal_date, then created_at
    const dateColumns = ['sent_date', 'internal_date', 'created_at'];
    
    for (const dateCol of dateColumns) {
      try {
        const query = `
          SELECT 
            COUNT(*) AS cnt,
            MIN(${dateCol}) AS first_date,
            MAX(${dateCol}) AS last_date
          FROM \`${tablePath}\`
        `;
        
        const [rows] = await bq.query({
          query,
          location,
        });

        const result = rows[0] as any;
        if (result.cnt !== null && result.cnt !== undefined) {
          return {
            rows: Number(result.cnt) || 0,
            first: formatDate(result.first_date),
            last: formatDate(result.last_date),
          };
        }
      } catch (error: any) {
        // If column doesn't exist, try next one
        if (error.message?.includes('Unrecognized name') || error.message?.includes('Invalid field name')) {
          continue;
        }
        // If table doesn't exist, return 'not found'
        if (error.message?.includes('Not found') || error.message?.includes('does not exist')) {
          return 'not found';
        }
        throw error;
      }
    }

    // If we get here, try without date columns
    try {
      const query = `SELECT COUNT(*) AS cnt FROM \`${tablePath}\``;
      const [rows] = await bq.query({
        query,
        location,
      });
      const result = rows[0] as any;
      return {
        rows: Number(result.cnt) || 0,
        first: 'N/A',
        last: 'N/A',
      };
    } catch (error: any) {
      if (error.message?.includes('Not found') || error.message?.includes('does not exist')) {
        return 'not found';
      }
      throw error;
    }
  };

  // Production tables
  const prodRawStats = await queryTableStats(
    `${projectId}.${datasetId}.raw_emails`,
    '*',
    'COALESCE(sent_date, ingested_at)'
  );

  const prodChunksStats = await queryTableStats(
    `${projectId}.${datasetId}.chunks`,
    '*',
    'created_at'
  );

  const prodEmbStats = await queryTableStats(
    `${projectId}.${datasetId}.chunk_embeddings`,
    '*',
    'created_at'
  );

  // Legacy tables
  const legacyRawStats = await queryLegacyRawTable();

  const legacyChunksStats = await queryTableStats(
    `${projectId}.${legacyDataset}.${legacyChunksTable}`,
    '*',
    'created_at'
  );

  const legacyEmbStats = await queryTableStats(
    `${projectId}.${legacyDataset}.${legacyEmbTable}`,
    '*',
    'created_at'
  );

  // Format stats for output
  const formatStats = (stats: TableStats | 'not found'): string => {
    if (stats === 'not found') {
      return 'rows=not found | first=N/A | last=N/A';
    }
    return `rows=${stats.rows} | first=${stats.first} | last=${stats.last}`;
  };

  // Print report
  console.log('---');
  console.log('HISTORICAL REPORT');
  console.log('Production:');
  console.log(`  raw_emails: ${formatStats(prodRawStats)}`);
  console.log(`  chunks: ${formatStats(prodChunksStats)}`);
  console.log(`  chunk_embeddings: ${formatStats(prodEmbStats)}`);
  console.log(`Legacy (dataset=${legacyDataset}):`);
  console.log(`  messages: ${formatStats(legacyRawStats)}`);
  console.log(`  chunks: ${formatStats(legacyChunksStats)}`);
  console.log(`  chunk_embeddings: ${formatStats(legacyEmbStats)}`);
  console.log('Unification hint: Use views if legacy tables exist and schemas differ.');
  console.log('---');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

