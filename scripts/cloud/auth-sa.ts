import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

interface ServiceAccountKey {
  client_email?: string;
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('apply', {
      type: 'boolean',
      default: false,
      description: 'Execute the command instead of previewing',
    })
    .parse();

  // Robust project resolution
  const resolve = (cmd: string) => {
    try {
      return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    } catch {
      return '';
    }
  };

  const project = process.env.BQ_PROJECT_ID || (() => {
    try {
      return resolve('gcloud config get-value project');
    } catch {
      return '';
    }
  })();

  if (!project) {
    throw new Error('No project: set BQ_PROJECT_ID or run `gcloud config set project <id>`');
  }

  // Key file resolution
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'secrets/gcp/ncc-local-dev.json';
  const resolvedKey = path.resolve(keyPath);

  // Validate key file exists
  const fsSync = require('fs');
  if (!fsSync.existsSync(resolvedKey)) {
    throw new Error(`Key file does not exist: ${resolvedKey}`);
  }

  // Parse client_email from key JSON
  let client_email = '';
  try {
    const content = await fs.readFile(resolvedKey, 'utf8');
    const key = JSON.parse(content) as ServiceAccountKey;
    if (!key.client_email) {
      throw new Error('client_email not found in key file');
    }
    client_email = key.client_email;
  } catch (error: any) {
    throw new Error(`Failed to read service account from ${resolvedKey}: ${error.message}`);
  }

  const command = `gcloud auth activate-service-account ${client_email} --key-file ${resolvedKey} --project ${project}`;

  if (!argv.apply) {
    // Preview mode: PRINT the exact command
    console.log('Command that would be executed:');
    console.log('');
    console.log(command);
    console.log('');
    console.log('To execute, run with --apply');
  } else {
    // Apply mode: execute with stdio: 'inherit'
    try {
      execSync(command, { stdio: 'inherit' });
      console.log(`\ngcloud is now authenticated as: ${client_email}`);
    } catch (error: any) {
      console.error(`\nError: ${error.message || 'Command failed'}`);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

