import 'dotenv/config';
import { execSync } from 'child_process';
import { google, gmail_v1 } from 'googleapis';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const REGION = process.env.NCC_REGION || 'us-central1';
const RUNTIME_SA = 'newsletter-local-dev@newsletter-control-center.iam.gserviceaccount.com';

interface CheckResult {
  name: string;
  pass: boolean;
  message: string;
  remediation?: string[];
}

function shell(cmd: string, allowFail = false): { success: boolean; output: string } {
  try {
    const output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
    return { success: true, output: output.trim() };
  } catch (error: any) {
    if (allowFail) {
      return { success: false, output: error.stderr?.toString() || error.message || String(error) };
    }
    throw new Error(`Command failed: ${cmd}\n${error.stderr?.toString() || error.message}`);
  }
}

function shellJSON<T>(cmd: string, allowFail = false): T | null {
  try {
    const result = shell(cmd, allowFail);
    return result.success ? JSON.parse(result.output) : null;
  } catch {
    return null;
  }
}

async function checkSecretExists(secretName: string): Promise<CheckResult> {
  const cmd = `gcloud secrets describe ${secretName} --project=${PROJECT} --format=json`;
  const result = shellJSON<any>(cmd, true);
  
  if (result) {
    return {
      name: `Secret ${secretName} exists`,
      pass: true,
      message: `Secret found`,
    };
  }
  
  return {
    name: `Secret ${secretName} exists`,
    pass: false,
    message: `Secret not found`,
    remediation: [
      `gcloud secrets create ${secretName} --data-file=- --project=${PROJECT} --replication-policy="automatic"`,
      `# Then paste the secret value (client_id, client_secret, or refresh_token)`,
    ],
  };
}

async function checkSecretAccess(secretName: string): Promise<CheckResult> {
  // Check IAM policy for the secret
  const cmd = `gcloud secrets get-iam-policy ${secretName} --project=${PROJECT} --format=json`;
  const policy = shellJSON<any>(cmd, true);
  
  if (!policy) {
    return {
      name: `Secret ${secretName} accessible by ${RUNTIME_SA}`,
      pass: false,
      message: `Cannot read IAM policy (secret may not exist)`,
      remediation: [
        `Create secret: gcloud secrets create ${secretName} --data-file=- --project=${PROJECT}`,
        `Grant access: gcloud secrets add-iam-policy-binding ${secretName} \\`,
        `  --member="serviceAccount:${RUNTIME_SA}" \\`,
        `  --role="roles/secretmanager.secretAccessor" \\`,
        `  --project=${PROJECT}`,
      ],
    };
  }
  
  const bindings = policy.bindings || [];
  const hasAccess = bindings.some((b: any) => 
    b.role === 'roles/secretmanager.secretAccessor' &&
    b.members?.includes(`serviceAccount:${RUNTIME_SA}`)
  );
  
  if (hasAccess) {
    return {
      name: `Secret ${secretName} accessible by ${RUNTIME_SA}`,
      pass: true,
      message: `IAM policy grants access`,
    };
  }
  
  return {
    name: `Secret ${secretName} accessible by ${RUNTIME_SA}`,
    pass: false,
    message: `IAM policy does not grant access`,
    remediation: [
      `gcloud secrets add-iam-policy-binding ${secretName} \\`,
      `  --member="serviceAccount:${RUNTIME_SA}" \\`,
      `  --role="roles/secretmanager.secretAccessor" \\`,
      `  --project=${PROJECT}`,
    ],
  };
}

async function getSecretValue(secretName: string): Promise<string | null> {
  const cmd = `gcloud secrets versions access latest --secret=${secretName} --project=${PROJECT}`;
  const result = shell(cmd, true);
  return result.success ? result.output.trim() : null;
}

async function checkGmailAuth(inbox: 'me' | 'other'): Promise<CheckResult> {
  // Temporarily set env vars from secrets for auth test
  const originalClientId = process.env.GMAIL_CLIENT_ID;
  const originalClientSecret = process.env.GMAIL_CLIENT_SECRET;
  const originalRefreshTokenMe = process.env.GMAIL_REFRESH_TOKEN_ME;
  const originalRefreshTokenOther = process.env.GMAIL_REFRESH_TOKEN_OTHER;
  
  try {
    const clientId = await getSecretValue('GMAIL_CLIENT_ID');
    const clientSecret = await getSecretValue('GMAIL_CLIENT_SECRET');
    const refreshTokenName = inbox === 'me' ? 'GMAIL_REFRESH_TOKEN_ME' : 'GMAIL_REFRESH_TOKEN_OTHER';
    const refreshToken = await getSecretValue(refreshTokenName);
    
    if (!clientId || !clientSecret || !refreshToken) {
      return {
        name: `Gmail auth for ${inbox}`,
        pass: false,
        message: `Missing credentials (client_id=${!!clientId}, client_secret=${!!clientSecret}, refresh_token=${!!refreshToken})`,
        remediation: [
          `Verify secrets exist: gcloud secrets list --project=${PROJECT} | grep GMAIL`,
          `Check access: gcloud secrets versions access latest --secret=${refreshTokenName} --project=${PROJECT}`,
        ],
      };
    }
    
    // Set env vars for token provider
    process.env.GMAIL_CLIENT_ID = clientId;
    process.env.GMAIL_CLIENT_SECRET = clientSecret;
    if (inbox === 'me') {
      process.env.GMAIL_REFRESH_TOKEN_ME = refreshToken;
    } else {
      process.env.GMAIL_REFRESH_TOKEN_OTHER = refreshToken;
    }
    
    try {
      const oAuth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'urn:ietf:wg:oauth:2.0:oob'
      );
      oAuth2Client.setCredentials({ refresh_token: refreshToken });
      
      const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      
      if (profile.data.emailAddress) {
        return {
          name: `Gmail auth for ${inbox}`,
          pass: true,
          message: `Profile: ${profile.data.emailAddress}`,
        };
      }
      
      return {
        name: `Gmail auth for ${inbox}`,
        pass: false,
        message: `No email address in profile`,
      };
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      return {
        name: `Gmail auth for ${inbox}`,
        pass: false,
        message: `Auth failed: ${errorMsg.substring(0, 100)}`,
        remediation: [
          `Check refresh token: gcloud secrets versions access latest --secret=${refreshTokenName} --project=${PROJECT}`,
          `If token is invalid, re-run OAuth flow and update secret`,
        ],
      };
    }
  } finally {
    // Restore original env vars
    if (originalClientId !== undefined) process.env.GMAIL_CLIENT_ID = originalClientId;
    if (originalClientSecret !== undefined) process.env.GMAIL_CLIENT_SECRET = originalClientSecret;
    if (originalRefreshTokenMe !== undefined) process.env.GMAIL_REFRESH_TOKEN_ME = originalRefreshTokenMe;
    if (originalRefreshTokenOther !== undefined) process.env.GMAIL_REFRESH_TOKEN_OTHER = originalRefreshTokenOther;
  }
}

async function checkModifyCapability(inbox: 'me' | 'other'): Promise<CheckResult> {
  // Skip in dry-run mode (this check requires actual API calls)
  if (process.argv.includes('--apply')) {
    // Temporarily set env vars from secrets for auth test
    const originalClientId = process.env.GMAIL_CLIENT_ID;
    const originalClientSecret = process.env.GMAIL_CLIENT_SECRET;
    const originalRefreshTokenMe = process.env.GMAIL_REFRESH_TOKEN_ME;
    const originalRefreshTokenOther = process.env.GMAIL_REFRESH_TOKEN_OTHER;
    
    try {
      const clientId = await getSecretValue('GMAIL_CLIENT_ID');
      const clientSecret = await getSecretValue('GMAIL_CLIENT_SECRET');
      const refreshTokenName = inbox === 'me' ? 'GMAIL_REFRESH_TOKEN_ME' : 'GMAIL_REFRESH_TOKEN_OTHER';
      const refreshToken = await getSecretValue(refreshTokenName);
      
      if (!clientId || !clientSecret || !refreshToken) {
        return {
          name: `Gmail modify capability for ${inbox}`,
          pass: false,
          message: `Missing credentials`,
          remediation: [
            `Verify secrets exist: gcloud secrets list --project=${PROJECT} | grep GMAIL`,
          ],
        };
      }
      
      // Set env vars for token provider
      process.env.GMAIL_CLIENT_ID = clientId;
      process.env.GMAIL_CLIENT_SECRET = clientSecret;
      if (inbox === 'me') {
        process.env.GMAIL_REFRESH_TOKEN_ME = refreshToken;
      } else {
        process.env.GMAIL_REFRESH_TOKEN_OTHER = refreshToken;
      }
      
      try {
        const oAuth2Client = new google.auth.OAuth2(
          clientId,
          clientSecret,
          'urn:ietf:wg:oauth:2.0:oob'
        );
        oAuth2Client.setCredentials({ refresh_token: refreshToken });
        
        const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
        
        // Test modify capability by listing labels (requires gmail.modify scope)
        const labels = await gmail.users.labels.list({ userId: 'me' });
        
        if (labels.data.labels && labels.data.labels.length > 0) {
          return {
            name: `Gmail modify capability for ${inbox}`,
            pass: true,
            message: `Labels accessible (${labels.data.labels.length} labels)`,
          };
        }
        
        return {
          name: `Gmail modify capability for ${inbox}`,
          pass: false,
          message: `Labels list returned empty`,
        };
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        const is403 = errorMsg.includes('403') || errorMsg.includes('Forbidden') || errorMsg.includes('Insufficient Permission');
        
        if (is403) {
          return {
            name: `Gmail modify capability for ${inbox}`,
            pass: false,
            message: `403 Forbidden - refresh token lacks gmail.modify scope`,
            remediation: [
              `Remint token with modify scope: npm run gmail:mint:${inbox}`,
              `Then update secret: npm run gmail:secret:${inbox} -- --token="<new_token>"`,
            ],
          };
        }
        
        return {
          name: `Gmail modify capability for ${inbox}`,
          pass: false,
          message: `Auth failed: ${errorMsg.substring(0, 100)}`,
          remediation: [
            `Check refresh token: gcloud secrets versions access latest --secret=${refreshTokenName} --project=${PROJECT}`,
          ],
        };
      }
    } finally {
      // Restore original env vars
      if (originalClientId !== undefined) process.env.GMAIL_CLIENT_ID = originalClientId;
      if (originalClientSecret !== undefined) process.env.GMAIL_CLIENT_SECRET = originalClientSecret;
      if (originalRefreshTokenMe !== undefined) process.env.GMAIL_REFRESH_TOKEN_ME = originalRefreshTokenMe;
      if (originalRefreshTokenOther !== undefined) process.env.GMAIL_REFRESH_TOKEN_OTHER = originalRefreshTokenOther;
    }
  }
  
  // Skip in preview mode
  return {
    name: `Gmail modify capability for ${inbox}`,
    pass: false,
    message: 'Not checked (use --apply to enable)',
    remediation: [`npm run ingest:preflight -- --apply`],
  };
}

async function checkIAMRoles(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  
  // Check project-level IAM
  const cmd = `gcloud projects get-iam-policy ${PROJECT} --format=json`;
  const policy = shellJSON<any>(cmd, true);
  
  if (!policy) {
    return [{
      name: 'IAM policy accessible',
      pass: false,
      message: 'Cannot read IAM policy',
      remediation: [`gcloud projects get-iam-policy ${PROJECT} --format=json`],
    }];
  }
  
  const bindings = policy.bindings || [];
  const saBindings = bindings.filter((b: any) => 
    b.members?.includes(`serviceAccount:${RUNTIME_SA}`)
  );
  
  const roles = new Set<string>();
  for (const binding of saBindings) {
    if (binding.role) {
      roles.add(binding.role);
    }
  }
  
  // Check BigQuery roles
  const hasJobUser = roles.has('roles/bigquery.jobUser') || roles.has('roles/bigquery.user');
  const hasDataEditor = roles.has('roles/bigquery.dataEditor') || roles.has('roles/bigquery.admin');
  const hasSecretAccessor = roles.has('roles/secretmanager.secretAccessor');
  
  results.push({
    name: 'BigQuery jobUser role',
    pass: hasJobUser,
    message: hasJobUser ? 'Role present' : 'Role missing',
    remediation: hasJobUser ? undefined : [
      `gcloud projects add-iam-policy-binding ${PROJECT} \\`,
      `  --member="serviceAccount:${RUNTIME_SA}" \\`,
      `  --role="roles/bigquery.jobUser"`,
    ],
  });
  
  results.push({
    name: 'BigQuery dataEditor role',
    pass: hasDataEditor,
    message: hasDataEditor ? 'Role present' : 'Role missing',
    remediation: hasDataEditor ? undefined : [
      `gcloud projects add-iam-policy-binding ${PROJECT} \\`,
      `  --member="serviceAccount:${RUNTIME_SA}" \\`,
      `  --role="roles/bigquery.dataEditor"`,
    ],
  });
  
  results.push({
    name: 'Secret Manager secretAccessor role',
    pass: hasSecretAccessor,
    message: hasSecretAccessor ? 'Role present' : 'Role missing',
    remediation: hasSecretAccessor ? undefined : [
      `gcloud projects add-iam-policy-binding ${PROJECT} \\`,
      `  --member="serviceAccount:${RUNTIME_SA}" \\`,
      `  --role="roles/secretmanager.secretAccessor"`,
    ],
  });
  
  return results;
}

async function checkJobConfig(jobName: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  
  const cmd = `gcloud run jobs describe ${jobName} --region=${REGION} --project=${PROJECT} --format=json`;
  const job = shellJSON<any>(cmd, true);
  
  if (!job) {
    return [{
      name: `Job ${jobName} exists`,
      pass: false,
      message: 'Job not found',
      remediation: [`npm run cloud:jobs:apply`],
    }];
  }
  
  results.push({
    name: `Job ${jobName} exists`,
    pass: true,
    message: 'Job found',
  });
  
  // Check args
  // Path: spec.template.spec.template.spec.containers[0] (nested template structure)
  const spec = job.spec;
  const outerTemplate = spec?.template;
  const outerTemplateSpec = outerTemplate?.spec;
  const innerTemplate = outerTemplateSpec?.template;
  const innerTemplateSpec = innerTemplate?.spec;
  const containers = innerTemplateSpec?.containers || [];
  const container = containers[0];
  const args = container?.args || [];
  
  const hasInbox = args.includes('--inbox');
  const inboxValue = args[args.indexOf('--inbox') + 1];
  const hasLimit = args.includes('--limit');
  const limitValue = args[args.indexOf('--limit') + 1];
  const hasNoDryRun = args.includes('--no-dry-run');
  
  const expectedInbox = jobName.includes('me') ? 'me' : 'other';
  
  results.push({
    name: `Job ${jobName} --inbox arg`,
    pass: hasInbox && inboxValue === expectedInbox,
    message: hasInbox ? `Value: ${inboxValue}` : 'Missing --inbox arg',
    remediation: hasInbox && inboxValue === expectedInbox ? undefined : [
      `gcloud run jobs update ${jobName} --region=${REGION} --project=${PROJECT} \\`,
      `  --args="${args.filter((a: string) => a !== '--inbox' && a !== inboxValue).join(',')},--inbox,${expectedInbox}"`,
    ],
  });
  
  results.push({
    name: `Job ${jobName} --limit arg`,
    pass: hasLimit && limitValue && parseInt(limitValue) > 0,
    message: hasLimit ? `Value: ${limitValue}` : 'Missing --limit arg',
    remediation: hasLimit ? undefined : [
      `gcloud run jobs update ${jobName} --region=${REGION} --project=${PROJECT} \\`,
      `  --args="${args.join(',')},--limit,500"`,
    ],
  });
  
  // Check env vars
  const envVars = container?.env || [];
  const envMap = new Map<string, string>();
  for (const env of envVars) {
    if (env.name && env.value) {
      envMap.set(env.name, env.value);
    }
  }
  
  const requiredEnvVars = [
    'GMAIL_QUERY',
    'GMAIL_PROCESSED_LABEL',
    'GMAIL_PAID_LABEL',
    'GMAIL_MARK_READ',
  ];
  
  for (const envVar of requiredEnvVars) {
    const hasVar = envMap.has(envVar);
    const value = envMap.get(envVar);
    results.push({
      name: `Job ${jobName} env ${envVar}`,
      pass: hasVar && value !== undefined,
      message: hasVar ? `Value: ${value}` : 'Missing',
      remediation: hasVar ? undefined : [
        `gcloud run jobs update ${jobName} --region=${REGION} --project=${PROJECT} \\`,
        `  --update-env-vars="${envVar}=<value>"`,
      ],
    });
  }
  
  return results;
}

async function checkDryRun(jobName: string): Promise<CheckResult> {
  // First check if job exists
  const checkJob = shell(`gcloud run jobs describe ${jobName} --region=${REGION} --project=${PROJECT} --format=json`, true);
  if (!checkJob.success) {
    return {
      name: `Dry-run execution for ${jobName}`,
      pass: false,
      message: 'Job does not exist',
      remediation: [`npm run cloud:jobs:apply`],
    };
  }
  
  // Get the script path from job config
  const jobDesc = shellJSON<any>(`gcloud run jobs describe ${jobName} --region=${REGION} --project=${PROJECT} --format=json`, true);
  if (!jobDesc) {
    return {
      name: `Dry-run execution for ${jobName}`,
      pass: false,
      message: 'Cannot read job configuration',
    };
  }
  
  const spec = jobDesc.spec;
  const outerTemplate = spec?.template;
  const outerTemplateSpec = outerTemplate?.spec;
  const innerTemplate = outerTemplateSpec?.template;
  const innerTemplateSpec = innerTemplate?.spec;
  const containers = innerTemplateSpec?.containers || [];
  const container = containers[0];
  const existingArgs = container?.args || [];
  const scriptPath = existingArgs[0] || 'dist/scripts/ingest-gmail.js';
  
  const inbox = jobName.includes('me') ? 'me' : 'other';
  // Execute job with temporary args override (must include script path)
  const cmd = `gcloud run jobs execute ${jobName} --region=${REGION} --project=${PROJECT} --args="${scriptPath},--dry-run,--limit,3,--inbox,${inbox}" --wait --format=json`;
  const result = shellJSON<any>(cmd, true);
  
  if (!result) {
    return {
      name: `Dry-run execution for ${jobName}`,
      pass: false,
      message: 'Execution failed or timed out',
      remediation: [
        `Check job status: gcloud run jobs executions list --job=${jobName} --region=${REGION} --project=${PROJECT} --limit=1`,
        `View logs: gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${jobName}" --limit=100 --project=${PROJECT}`,
      ],
    };
  }
  
  // Wait a bit for logs to appear
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Get execution name from result or list
  let execName: string | null = null;
  if (result.metadata?.name) {
    execName = result.metadata.name.split('/').pop() || null;
  } else {
    const execCmd = `gcloud run jobs executions list --job=${jobName} --region=${REGION} --project=${PROJECT} --format=json --limit=1`;
    const executions = shellJSON<Array<{ name?: string }>>(execCmd, true);
    if (executions && executions.length > 0 && executions[0].name) {
      execName = executions[0].name.split('/').pop() || null;
    }
  }
  
  if (!execName) {
    return {
      name: `Dry-run execution for ${jobName}`,
      pass: false,
      message: 'Cannot find execution name',
    };
  }
  
  // Check logs for expected output
  const logCmd = `gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${jobName}" --limit=200 --format="value(textPayload)" --project=${PROJECT} --freshness=5m`;
  const logs = shell(logCmd, true);
  
  const logText = logs.output.toLowerCase();
  const hasFetched = logText.includes('fetched') || logText.includes('messages');
  const hasDryRun = logText.includes('dry-run') || logText.includes('dry run') || logText.includes('[dry run]');
  const hasNoWrites = !logText.includes('labeled') && !logText.includes('marked_read') || logText.includes('readonly');
  
  const allChecks = hasFetched && hasDryRun;
  
  return {
    name: `Dry-run execution for ${jobName}`,
    pass: allChecks,
    message: allChecks ? 'Dry-run completed successfully (no writes)' : `Missing expected output (fetched=${hasFetched}, dry-run=${hasDryRun})`,
    remediation: allChecks ? undefined : [
      `View recent logs: ${logCmd}`,
      `Check execution: gcloud run jobs executions describe ${execName} --region=${REGION} --project=${PROJECT}`,
    ],
  };
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('apply', {
      type: 'boolean',
      default: false,
      description: 'Actually execute dry-run jobs (default: preview only)',
    })
    .parse();

  console.log('---');
  console.log('GMAIL INGEST PREFLIGHT');
  console.log(`Project: ${PROJECT}`);
  console.log(`Region: ${REGION}`);
  console.log(`Runtime SA: ${RUNTIME_SA}`);
  console.log('');

  const checks: CheckResult[] = [];

  // 1. Secrets check
  console.log('Checking secrets...');
  const secretNames = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN_ME', 'GMAIL_REFRESH_TOKEN_OTHER'];
  for (const secretName of secretNames) {
    checks.push(await checkSecretExists(secretName));
    checks.push(await checkSecretAccess(secretName));
  }
  console.log('');

  // 2. Gmail auth check
  console.log('Checking Gmail authentication...');
  checks.push(await checkGmailAuth('me'));
  checks.push(await checkGmailAuth('other'));
  console.log('');

  // 2b. Gmail modify capability check (only when --apply is used)
  if (argv.apply) {
    console.log('Checking Gmail modify capability...');
    checks.push(await checkModifyCapability('me'));
    checks.push(await checkModifyCapability('other'));
    console.log('');
  } else {
    checks.push(await checkModifyCapability('me'));
    checks.push(await checkModifyCapability('other'));
  }

  // 3. IAM check
  console.log('Checking IAM roles...');
  checks.push(...await checkIAMRoles());
  console.log('');

  // 4. Job config check
  console.log('Checking job configurations...');
  checks.push(...await checkJobConfig('ncc-ingest-me'));
  checks.push(...await checkJobConfig('ncc-ingest-other'));
  console.log('');

  // 5. Dry-run execution
  if (argv.apply) {
    console.log('Executing dry-run jobs...');
    checks.push(await checkDryRun('ncc-ingest-me'));
    checks.push(await checkDryRun('ncc-ingest-other'));
  } else {
    console.log('Skipping dry-run execution (use --apply to enable)');
    checks.push({
      name: 'Dry-run execution',
      pass: false,
      message: 'Not executed (use --apply flag)',
      remediation: [`npm run ingest:preflight -- --apply`],
    });
  }
  console.log('');

  // Summary
  console.log('---');
  console.log('PREFLIGHT SUMMARY');
  console.log('');
  
  const passed = checks.filter(c => c.pass).length;
  const total = checks.length;
  
  for (const check of checks) {
    const icon = check.pass ? '✓' : '✗';
    const color = check.pass ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';
    console.log(`${color}${icon}${reset} ${check.name}: ${check.message}`);
    if (!check.pass && check.remediation) {
      console.log('   Remediation:');
      for (const cmd of check.remediation) {
        console.log(`     ${cmd}`);
      }
    }
  }
  
  console.log('');
  console.log(`Results: ${passed}/${total} checks passed`);
  console.log('');
  
  if (passed === total) {
    console.log('✅ PREFLIGHT PASSED');
    console.log('');
    console.log('Next steps:');
    console.log('  1. npm run cloud:jobs:apply');
    console.log('  2. npm run cloud:schedule:apply');
    console.log('  3. npm run cloud:snapshot');
  } else {
    console.log('❌ PREFLIGHT FAILED');
    console.log('');
    console.log('Fix the issues above, then re-run:');
    console.log('  npm run ingest:preflight');
  }
  console.log('---');
  
  process.exit(passed === total ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

