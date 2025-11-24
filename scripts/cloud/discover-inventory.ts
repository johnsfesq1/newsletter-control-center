import 'dotenv/config';
import { getBigQuery } from '../../src/bq/client';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

interface CloudRunJob {
  name?: string;
  spec?: {
    template?: {
      spec?: {
        containers?: Array<{
          image?: string;
        }>;
      };
    };
  };
  metadata?: {
    creationTimestamp?: string;
    annotations?: {
      'run.googleapis.com/launch-stage'?: string;
    };
  };
}

interface CloudRunService {
  metadata?: {
    name?: string;
    creationTimestamp?: string;
  };
  spec?: {
    template?: {
      spec?: {
        containers?: Array<{
          image?: string;
        }>;
      };
    };
  };
}

interface SchedulerJob {
  name?: string;
  schedule?: string;
  httpTarget?: {
    uri?: string;
  };
  pubsubTarget?: {
    topic?: string;
  };
}

interface ServiceAccount {
  email?: string;
  displayName?: string;
}

interface Secret {
  name?: string;
}

interface BigQueryTable {
  tableReference?: {
    tableId?: string;
  };
}

async function runCommand(cmd: string, silent = false, issues?: string[]): Promise<string | null> {
  try {
    if (silent) {
      // Capture stdout, stderr will be in error object if command fails
      const result = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return result.trim();
    } else {
      const result = execSync(cmd, { encoding: 'utf8', stdio: 'inherit' });
      return result.trim();
    }
  } catch (error: any) {
    // Capture stderr - extract first error line
    let errorLine = '';
    if (error.stderr) {
      const stderrLines = error.stderr.toString().split('\n').filter((line: string) => line.trim());
      if (stderrLines.length > 0) {
        errorLine = stderrLines[0];
      }
    }
    if (!errorLine && error.message) {
      // Fallback: use error message if stderr not available
      const errorLines = error.message.split('\n').filter((line: string) => line.trim());
      if (errorLines.length > 0) {
        errorLine = errorLines[0];
      }
    }
    if (issues && errorLine) {
      issues.push(errorLine);
    }
    if (!silent) {
      console.error(`Command failed: ${cmd}`);
      console.error(`Error: ${error.message}`);
    }
    return null;
  }
}

async function queryBigQuery(query: string, timeout = 10000): Promise<any[]> {
  const bq = getBigQuery();
  const projectId = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const location = process.env.BQ_LOCATION || 'US';

  try {
    const [rows] = await Promise.race([
      bq.query({ query, location }),
      new Promise<any[]>((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout')), timeout)
      ),
    ]);
    return rows as any[];
  } catch (error: any) {
    console.error(`BigQuery query failed: ${error.message}`);
    return [];
  }
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('apply', {
      type: 'boolean',
      default: false,
      description: 'Execute commands and generate inventory doc',
    })
    .parse();

  const PROJECT = process.env.BQ_PROJECT_ID;
  const BQ_LOC = process.env.BQ_LOCATION || 'US';
  const RUN_REGION = process.env.NCC_REGION || (BQ_LOC.toUpperCase() === 'US' ? 'us-central1' : BQ_LOC);

  if (!PROJECT) {
    throw new Error('BQ_PROJECT_ID environment variable is required');
  }

  const isApply = argv.apply;

  // Build impersonation flags if NCC_IMPERSONATE_SA is set
  const impersonateFlags = process.env.NCC_IMPERSONATE_SA
    ? ['--impersonate-service-account', process.env.NCC_IMPERSONATE_SA]
    : [];
  const impersonateStr = impersonateFlags.length > 0 ? impersonateFlags.join(' ') + ' ' : '';

  // Define commands with impersonation support
  const commands = {
    cloudRunJobs: `gcloud ${impersonateStr}run jobs list --region ${RUN_REGION} --project ${PROJECT} --format=json`,
    cloudRunServices: `gcloud ${impersonateStr}run services list --region ${RUN_REGION} --project ${PROJECT} --format=json`,
    scheduler: `gcloud ${impersonateStr}scheduler jobs list --location ${RUN_REGION} --project ${PROJECT} --format=json`,
    gcrImages: `gcloud ${impersonateStr}container images list --repository=gcr.io/${PROJECT} --format=json || true`,
    artifactRepos: `gcloud ${impersonateStr}artifacts repositories list --project ${PROJECT} --format=json || true`,
    serviceAccounts: `gcloud ${impersonateStr}iam service-accounts list --project ${PROJECT} --format=json`,
    iamPolicy: `gcloud ${impersonateStr}projects get-iam-policy ${PROJECT} --format=json`,
    secrets: `gcloud ${impersonateStr}secrets list --project ${PROJECT} --format=json`,
  };

  if (!isApply) {
    // Preview mode: print commands
    console.log('---');
    console.log('CLOUD INVENTORY DISCOVERY (PREVIEW)');
    console.log('');
    console.log('Project:', PROJECT);
    console.log('BigQuery Location:', BQ_LOC);
    console.log('Cloud Run Region:', RUN_REGION);
    console.log('');
    console.log('Commands that would be executed:');
    console.log('');
    for (const [name, cmd] of Object.entries(commands)) {
      console.log(`  ${name}:`);
      console.log(`    ${cmd}`);
    }
    console.log('');
    console.log('BigQuery queries:');
    console.log('  - List datasets matching /ncc/i');
    console.log('  - For ncc_production and ncc_newsletters: list tables and row counts');
    console.log('');
    console.log('To execute and generate docs/CLOUD_INVENTORY.md, run with --apply');
    console.log('---');
    return;
  }

  // Apply mode: execute commands and generate doc
  console.log('Discovering cloud inventory...');
  console.log('Project:', PROJECT);
  console.log('BigQuery Location:', BQ_LOC);
  console.log('Cloud Run Region:', RUN_REGION);
  console.log('');

  const issues: string[] = [];
  const inventory: any = {
    project: PROJECT,
    region: RUN_REGION,
    cloudRunJobs: [],
    cloudRunServices: [],
    scheduler: [],
    images: { gcr: [], artifacts: [] },
    serviceAccounts: [],
    iamRoles: {},
    secrets: [],
    bigquery: {},
  };

  // 1. Cloud Run Jobs
  console.log('Fetching Cloud Run Jobs...');
  const jobsJson = await runCommand(commands.cloudRunJobs, true, issues);
  if (jobsJson) {
    try {
      inventory.cloudRunJobs = JSON.parse(jobsJson);
    } catch (e) {
      issues.push('Failed to parse Cloud Run Jobs JSON');
    }
  } else {
    issues.push('Failed to fetch Cloud Run Jobs');
  }

  // 2. Cloud Run Services
  console.log('Fetching Cloud Run Services...');
  const servicesJson = await runCommand(commands.cloudRunServices, true, issues);
  if (servicesJson) {
    try {
      inventory.cloudRunServices = JSON.parse(servicesJson);
    } catch (e) {
      issues.push('Failed to parse Cloud Run Services JSON');
    }
  } else {
    issues.push('Failed to fetch Cloud Run Services');
  }

  // 3. Cloud Scheduler
  console.log('Fetching Cloud Scheduler jobs...');
  const schedulerJson = await runCommand(commands.scheduler, true, issues);
  if (schedulerJson) {
    try {
      inventory.scheduler = JSON.parse(schedulerJson);
    } catch (e) {
      issues.push('Failed to parse Cloud Scheduler JSON');
    }
  } else {
    issues.push('Failed to fetch Cloud Scheduler jobs');
  }

  // 4. Images
  console.log('Fetching container images...');
  const gcrJson = await runCommand(commands.gcrImages, true);
  if (gcrJson) {
    try {
      inventory.images.gcr = JSON.parse(gcrJson);
    } catch (e) {
      // Ignore errors for optional commands
    }
  }

  const artifactsJson = await runCommand(commands.artifactRepos, true);
  if (artifactsJson) {
    try {
      inventory.images.artifacts = JSON.parse(artifactsJson);
    } catch (e) {
      // Ignore errors for optional commands
    }
  }

  // 5. Service Accounts & IAM
  console.log('Fetching Service Accounts...');
  const saJson = await runCommand(commands.serviceAccounts, true, issues);
  if (saJson) {
    try {
      inventory.serviceAccounts = JSON.parse(saJson);
    } catch (e) {
      issues.push('Failed to parse Service Accounts JSON');
    }
  } else {
    issues.push('Failed to fetch Service Accounts');
  }

  console.log('Fetching IAM policy...');
  const iamJson = await runCommand(commands.iamPolicy, true, issues);
  if (iamJson) {
    try {
      const policy = JSON.parse(iamJson);
      // Summarize roles by service account
      const roleMap: Record<string, string[]> = {};
      if (policy.bindings) {
        for (const binding of policy.bindings) {
          const role = binding.role || '';
          const members = binding.members || [];
          for (const member of members) {
            if (member.startsWith('serviceAccount:')) {
              const saEmail = member.replace('serviceAccount:', '');
              if (!roleMap[saEmail]) {
                roleMap[saEmail] = [];
              }
              roleMap[saEmail].push(role);
            }
          }
        }
      }
      inventory.iamRoles = roleMap;
    } catch (e) {
      issues.push('Failed to parse IAM policy JSON');
    }
  } else {
    issues.push('Failed to fetch IAM policy');
  }

  // 6. Secrets
  console.log('Fetching Secrets...');
  const secretsJson = await runCommand(commands.secrets, true, issues);
  if (secretsJson) {
    try {
      inventory.secrets = JSON.parse(secretsJson);
    } catch (e) {
      issues.push('Failed to parse Secrets JSON');
    }
  } else {
    issues.push('Failed to fetch Secrets');
  }

  // 7. BigQuery
  console.log('Querying BigQuery...');
  const bq = getBigQuery();
  try {
    const [datasets] = await bq.getDatasets();
    const nccDatasets = datasets.filter((ds) => /ncc/i.test(ds.id || ''));
    inventory.bigquery.datasets = nccDatasets.map((ds) => ds.id);

    // For key datasets, get tables and row counts
    for (const datasetId of ['ncc_production', 'ncc_newsletters']) {
      if (!nccDatasets.find((d) => d.id === datasetId)) {
        continue;
      }

      const dataset = bq.dataset(datasetId);
      const [tables] = await dataset.getTables();

      inventory.bigquery[datasetId] = {
        tables: [],
      };

      for (const table of tables) {
        const tableId = table.id || '';
        let rowCount: string | number = 'unknown';

        try {
          const countQuery = `SELECT COUNT(*) AS cnt FROM \`${PROJECT}.${datasetId}.${tableId}\``;
          const rows = await queryBigQuery(countQuery, 10000);
          if (rows.length > 0) {
            const count = (rows[0] as { cnt: number }).cnt;
            rowCount = count > 100000 ? '>100k rows' : count;
          }
        } catch (e) {
          rowCount = 'error';
        }

        inventory.bigquery[datasetId].tables.push({
          name: tableId,
          rowCount,
        });
      }
    }
  } catch (e: any) {
    issues.push(`BigQuery discovery failed: ${e.message}`);
  }

  // Generate markdown document
  const docPath = path.resolve(__dirname, '../../docs/CLOUD_INVENTORY.md');
  let markdown = `# Cloud Inventory (Generated)

**Generated:** ${new Date().toISOString()}
**Project:** ${PROJECT}
**BigQuery Location:** ${BQ_LOC}
**Cloud Run Region:** ${RUN_REGION}

`;

  if (issues.length > 0) {
    markdown += `## ⚠️ Issues Encountered

`;
    for (const issue of issues) {
      markdown += `- ${issue}\n`;
    }
    markdown += `\n`;
  }

  markdown += `## Cloud Run Jobs

| Name | Image | Created | Updated |
|------|-------|---------|---------|
`;
  for (const job of inventory.cloudRunJobs as CloudRunJob[]) {
    const name = job.name?.split('/').pop() || 'unknown';
    const image =
      job.spec?.template?.spec?.containers?.[0]?.image || 'unknown';
    const created = job.metadata?.creationTimestamp || 'unknown';
    const updated = job.metadata?.annotations?.['run.googleapis.com/launch-stage'] || 'unknown';
    markdown += `| ${name} | ${image} | ${created} | ${updated} |\n`;
  }

  markdown += `\n## Cloud Run Services

| Name | Image | Created |
|------|-------|---------|
`;
  for (const service of inventory.cloudRunServices as CloudRunService[]) {
    const name = service.metadata?.name || 'unknown';
    const image =
      service.spec?.template?.spec?.containers?.[0]?.image || 'unknown';
    const created = service.metadata?.creationTimestamp || 'unknown';
    markdown += `| ${name} | ${image} | ${created} |\n`;
  }

  markdown += `\n## Cloud Scheduler

| Name | Schedule | Target |
|------|----------|--------|
`;
  for (const job of inventory.scheduler as SchedulerJob[]) {
    const name = job.name?.split('/').pop() || 'unknown';
    const schedule = job.schedule || 'unknown';
    const target = job.httpTarget?.uri || job.pubsubTarget?.topic || 'unknown';
    markdown += `| ${name} | ${schedule} | ${target} |\n`;
  }

  markdown += `\n## Container Images

### GCR Images (gcr.io/${PROJECT})

`;
  if (inventory.images.gcr.length > 0) {
    for (const img of inventory.images.gcr as any[]) {
      markdown += `- ${img.name || 'unknown'}\n`;
    }
  } else {
    markdown += `_None found_\n`;
  }

  markdown += `\n### Artifact Registry Repositories

`;
  if (inventory.images.artifacts.length > 0) {
    for (const repo of inventory.images.artifacts as any[]) {
      markdown += `- ${repo.name || 'unknown'}\n`;
    }
  } else {
    markdown += `_None found_\n`;
  }

  markdown += `\n## Service Accounts

| Email | Display Name | Key Roles |
|-------|--------------|-----------|
`;
  for (const sa of inventory.serviceAccounts as ServiceAccount[]) {
    const email = sa.email || 'unknown';
    const displayName = sa.displayName || '-';
    const roles = inventory.iamRoles[email] || [];
    const keyRoles = roles.slice(0, 3).join(', ') + (roles.length > 3 ? '...' : '');
    markdown += `| ${email} | ${displayName} | ${keyRoles || '-'} |\n`;
  }

  markdown += `\n## Secrets

`;
  if (inventory.secrets.length > 0) {
    for (const secret of inventory.secrets as Secret[]) {
      markdown += `- ${secret.name || 'unknown'}\n`;
    }
  } else {
    markdown += `_None found_\n`;
  }

  markdown += `\n## BigQuery

### Datasets (matching /ncc/i)

`;
  if (inventory.bigquery.datasets) {
    for (const dataset of inventory.bigquery.datasets) {
      markdown += `- ${dataset}\n`;
    }
  }

  for (const datasetId of ['ncc_production', 'ncc_newsletters']) {
    if (!inventory.bigquery[datasetId]) {
      continue;
    }

    markdown += `\n### ${datasetId}

| Table | Row Count |
|-------|-----------|
`;
    for (const table of inventory.bigquery[datasetId].tables) {
      markdown += `| ${table.name} | ${table.rowCount} |\n`;
    }
  }

  markdown += `\n## Notes

`;
  const notes: string[] = [];
  if (issues.length > 0) {
    notes.push(`Some discovery operations encountered errors (see Issues section above).`);
  }
  if (inventory.cloudRunJobs.length === 0 && inventory.cloudRunServices.length === 0) {
    notes.push(`No Cloud Run resources found in region ${RUN_REGION}.`);
  }
  if (notes.length === 0) {
    notes.push(`No anomalies detected.`);
  }
  for (const note of notes) {
    markdown += `- ${note}\n`;
  }

  // Write file
  await fs.writeFile(docPath, markdown, 'utf8');
  console.log(`\nInventory written to: ${docPath}`);
  if (issues.length > 0) {
    console.log(`\n⚠️  ${issues.length} issue(s) encountered during discovery.`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

