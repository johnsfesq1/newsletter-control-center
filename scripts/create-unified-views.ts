import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getBigQuery } from '../src/bq/client';
import * as fs from 'fs/promises';
import * as path from 'path';

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('dry-run', {
      type: 'boolean',
      default: true,
      description: 'Run in dry-run mode (print statements, do not execute)',
    })
    .parse();

  const projectId = process.env.BQ_PROJECT_ID;
  const datasetId = process.env.BQ_DATASET || 'ncc_production';
  const location = process.env.BQ_LOCATION || 'US';

  if (!projectId) {
    throw new Error('BQ_PROJECT_ID environment variable is required');
  }

  const dryRun = argv['dry-run'];
  const sqlFilePath = path.resolve(__dirname, '../docs/UNIFIED_VIEWS.sql');

  console.log('Config:');
  console.log(`  project: ${projectId}`);
  console.log(`  dataset: ${datasetId}`);
  console.log(`  location: ${location}`);
  console.log(`  sql_file: ${sqlFilePath}`);
  console.log(`  dry_run: ${dryRun}\n`);

  // Read SQL file
  let sqlContent: string;
  try {
    sqlContent = await fs.readFile(sqlFilePath, 'utf8');
  } catch (error: any) {
    throw new Error(`Failed to read SQL file: ${error.message}`);
  }

  // Split on semicolons and filter out empty/whitespace-only statements
  const statements = sqlContent
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.toUpperCase().includes('CREATE OR REPLACE VIEW'));

  if (statements.length === 0) {
    throw new Error('No CREATE OR REPLACE VIEW statements found in SQL file');
  }

  console.log(`Found ${statements.length} CREATE OR REPLACE VIEW statement(s)\n`);

  const bq = getBigQuery();

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    const statementNum = i + 1;

    // Extract view name from statement for logging
    // Handle both backtick-quoted and unquoted formats: `project.dataset.view` or project.dataset.view
    const viewMatch = statement.match(/CREATE OR REPLACE VIEW\s+`?([^`\s]+)`?/i);
    const viewName = viewMatch ? viewMatch[1].replace(/`/g, '') : `statement_${statementNum}`;

    if (dryRun) {
      console.log(`--- Statement ${statementNum}: ${viewName} ---`);
      console.log(statement);
      console.log('---\n');
    } else {
      try {
        await bq.query({
          query: statement,
          location,
        });
        console.log(`Created/updated view: ${viewName}`);
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        throw new Error(`Statement ${statementNum} (${viewName}) failed: ${errorMsg}`);
      }
    }
  }

  if (dryRun) {
    console.log('[DRY RUN] Would execute statements above if --no-dry-run');
  } else {
    console.log(`\nSuccessfully created/updated ${statements.length} view(s)`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

