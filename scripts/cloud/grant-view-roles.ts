import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

interface ServiceAccountKey {
  client_email?: string;
}

const ROLES = [
  'roles/viewer',
  'roles/run.viewer',
  'roles/cloudscheduler.viewer',
  'roles/secretmanager.viewer',
  'roles/iam.serviceAccountViewer',
  'roles/logging.viewer',
];

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('apply', {
      type: 'boolean',
      default: false,
      description: 'Execute the commands instead of previewing',
    })
    .parse();

  const PROJECT = process.env.BQ_PROJECT_ID;
  if (!PROJECT) {
    throw new Error('BQ_PROJECT_ID environment variable is required');
  }

  // Get SA from env or parse from key
  let SA = process.env.NCC_IMPERSONATE_SA;
  if (!SA) {
    const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'secrets/gcp/ncc-local-dev.json';
    const resolvedKey = path.resolve(KEY);
    try {
      const content = await fs.readFile(resolvedKey, 'utf8');
      const key = JSON.parse(content) as ServiceAccountKey;
      if (key.client_email) {
        SA = key.client_email;
      } else {
        throw new Error('client_email not found in key file');
      }
    } catch (error: any) {
      throw new Error(`Failed to read service account: ${error.message}`);
    }
  }

  const commands = ROLES.map((role) => {
    return `gcloud projects add-iam-policy-binding ${PROJECT} \\\n  --member serviceAccount:${SA} \\\n  --role ${role}`;
  });

  if (!argv.apply) {
    // Preview mode
    console.log('Commands that would be executed:');
    console.log('');
    for (const cmd of commands) {
      console.log(cmd);
      console.log('');
    }
    console.log('To execute, run with --apply');
  } else {
    // Apply mode
    console.log(`Granting viewer roles to: ${SA}`);
    console.log('');

    for (let i = 0; i < commands.length; i++) {
      const role = ROLES[i];
      const command = `gcloud projects add-iam-policy-binding ${PROJECT} --member serviceAccount:${SA} --role ${role}`;

      try {
        execSync(command, { stdio: 'inherit' });
        console.log(`✅ Granted: ${role}`);
      } catch (error: any) {
        // Check if error is because role is already bound
        const errorMsg = error.message || String(error);
        if (errorMsg.includes('already exists') || errorMsg.includes('already bound')) {
          console.log(`⚠️  Already bound: ${role} (skipping)`);
        } else {
          console.error(`❌ Failed to grant ${role}: ${errorMsg}`);
          // Continue with next role
        }
      }
    }

    console.log('');
    console.log('Done.');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

