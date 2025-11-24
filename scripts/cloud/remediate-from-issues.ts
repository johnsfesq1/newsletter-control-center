import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as fsSync from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

interface ServiceAccountKey {
  client_email?: string;
}

function resolve(cmd: string): string {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch {
    return '';
  }
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('apply', {
      type: 'boolean',
      default: false,
      description: 'Execute the commands instead of previewing',
    })
    .parse();

  // Resolve project
  const PROJECT = process.env.BQ_PROJECT_ID || resolve('gcloud config get-value project');
  if (!PROJECT) {
    throw new Error('No project: set BQ_PROJECT_ID or run `gcloud config set project <id>`');
  }

  // Resolve SA from key file
  const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'secrets/gcp/ncc-local-dev.json';
  const resolvedKey = path.resolve(KEY);
  
  if (!fsSync.existsSync(resolvedKey)) {
    throw new Error(`Key file does not exist: ${resolvedKey}`);
  }

  let SA = '';
  try {
    const content = await fs.readFile(resolvedKey, 'utf8');
    const key = JSON.parse(content) as ServiceAccountKey;
    if (!key.client_email) {
      throw new Error('client_email not found in key file');
    }
    SA = key.client_email;
  } catch (error: any) {
    throw new Error(`Failed to read service account from ${resolvedKey}: ${error.message}`);
  }

  // Load and parse issues from CLOUD_INVENTORY.md
  const docPath = path.resolve(__dirname, '../../docs/CLOUD_INVENTORY.md');
  let content: string;
  try {
    content = await fs.readFile(docPath, 'utf8');
  } catch (error: any) {
    throw new Error(`Failed to read ${docPath}: ${error.message}`);
  }

  const lines = content.split('\n');
  const issues: string[] = [];

  let inIssuesSection = false;
  let inNotesSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for issues section header
    if (line.match(/^##\s+⚠️\s+Issues?\s+Encountered/i)) {
      inIssuesSection = true;
      inNotesSection = false;
      continue;
    }

    // Check for notes section header
    if (line.match(/^##\s+Notes?$/i)) {
      inNotesSection = true;
      inIssuesSection = false;
      continue;
    }

    // Stop at next section
    if (line.match(/^##\s+/) && (inIssuesSection || inNotesSection)) {
      break;
    }

    // Collect bullet points
    if ((inIssuesSection || inNotesSection) && line.trim().startsWith('- ')) {
      issues.push(line.trim().substring(2)); // Remove '- ' prefix
    }
  }

  if (issues.length === 0) {
    console.log('---');
    console.log('CLOUD REMEDIATION PLAN');
    console.log('No issues found in cloud inventory.');
    console.log('---');
    return;
  }

  // Build remediation commands
  const commands: string[] = [];
  const servicesToEnable: Set<string> = new Set();
  let needsAuth = false;
  let needsRoles = false;
  let needsCloudBuildRoles = false;

  for (const issue of issues) {
    // Check for permission errors
    if (/PERMISSION|not authorized|does not have permission/i.test(issue)) {
      needsRoles = true;
    }

    // Check for Cloud Build or storage object create errors
    if (/storage\.objects\.create|gcloud\.builds\.submit|Cloud Build/i.test(issue)) {
      needsCloudBuildRoles = true;
      needsRoles = true;
    }

    // Check for API not enabled errors
    if (/API .* not found|API .* has not been used|not enabled|UNIMPLEMENTED/i.test(issue)) {
      // Map to services based on context
      if (/run|Cloud Run/i.test(issue)) {
        servicesToEnable.add('run.googleapis.com');
      }
      if (/scheduler|Cloud Scheduler/i.test(issue)) {
        servicesToEnable.add('cloudscheduler.googleapis.com');
      }
      if (/secret|Secret Manager/i.test(issue)) {
        servicesToEnable.add('secretmanager.googleapis.com');
      }
      if (/iam|IAM|Admin/i.test(issue)) {
        servicesToEnable.add('iam.googleapis.com');
      }
      if (/artifact|Artifact Registry/i.test(issue)) {
        servicesToEnable.add('artifactregistry.googleapis.com');
      }
      if (/container|Container Registry|gcr/i.test(issue)) {
        servicesToEnable.add('containerregistry.googleapis.com');
      }
      if (/build|Cloud Build|gcloud builds/i.test(issue)) {
        servicesToEnable.add('cloudbuild.googleapis.com');
      }
    }

    // Check for authentication errors
    if (/UNAUTHENTICATED|needs login/i.test(issue)) {
      needsAuth = true;
    }
  }

  // Add auth command if needed
  if (needsAuth) {
    commands.push(`gcloud auth activate-service-account ${SA} --key-file ${resolvedKey} --project ${PROJECT}`);
  }

  // Add role binding commands if needed
  if (needsRoles) {
    const roles = [
      'roles/viewer',
      'roles/run.viewer',
      'roles/cloudscheduler.viewer',
      'roles/secretmanager.viewer',
      'roles/iam.serviceAccountViewer',
      'roles/logging.viewer',
      'roles/cloudbuild.builds.editor',
      'roles/storage.objectCreator',
    ];
    for (const role of roles) {
      commands.push(`gcloud projects add-iam-policy-binding ${PROJECT} --member serviceAccount:${SA} --role ${role}`);
    }
  }

  // Add service enable commands
  for (const service of Array.from(servicesToEnable).sort()) {
    commands.push(`gcloud services enable ${service} --project ${PROJECT}`);
  }

  // De-duplicate commands
  const uniqueCommands = Array.from(new Set(commands));

  if (!argv.apply) {
    // Preview mode
    console.log('---');
    console.log('CLOUD REMEDIATION PLAN (Preview)');
    console.log('');
    console.log(`Project: ${PROJECT}`);
    console.log(`Service Account: ${SA}`);
    console.log('');
    console.log('Issues detected:');
    for (const issue of issues) {
      console.log(`- ${issue}`);
    }
    console.log('');
    if (uniqueCommands.length === 0) {
      console.log('No remediation commands needed (issues may not be fixable via this script).');
    } else {
      console.log('Commands to run:');
      for (const cmd of uniqueCommands) {
        console.log(cmd);
      }
    }
    console.log('---');
  } else {
    // Apply mode
    console.log('---');
    console.log('CLOUD REMEDIATION (Applying)');
    console.log(`Project: ${PROJECT}`);
    console.log(`Service Account: ${SA}`);
    console.log('');

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const cmd of uniqueCommands) {
      try {
        execSync(cmd, { stdio: 'inherit' });
        successCount++;
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        if (errorMsg.includes('already has') || errorMsg.includes('already enabled') || errorMsg.includes('already exists')) {
          console.log(`⚠️  Skipped (already applied): ${cmd.split(' ').slice(0, 3).join(' ')}...`);
          skipCount++;
        } else {
          console.error(`❌ Failed: ${cmd}`);
          errorCount++;
          // Continue with next command
        }
      }
    }

    console.log('');
    console.log(`Results: ${successCount} applied, ${skipCount} skipped, ${errorCount} errors`);
    console.log('');
    console.log('Now re-run: npm run cloud:discover:apply && npm run cloud:issues');
    console.log('---');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

