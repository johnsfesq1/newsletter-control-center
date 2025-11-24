import 'dotenv/config';
import * as fs from 'fs/promises';
import * as path from 'path';

async function main(): Promise<void> {
  const docPath = path.resolve(__dirname, '../../docs/CLOUD_INVENTORY.md');

  let content: string;
  try {
    content = await fs.readFile(docPath, 'utf8');
  } catch (error: any) {
    console.log('---');
    console.log('CLOUD INVENTORY ISSUES');
    console.log('(file not found)');
    console.log('---');
    process.exit(1);
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

    // Check for warning emoji at start of line
    if (line.trim().startsWith('⚠️')) {
      issues.push(line.trim());
      continue;
    }

    // Collect lines in issues section (bullet points)
    if (inIssuesSection) {
      // Stop at next section (##)
      if (line.match(/^##\s+/)) {
        inIssuesSection = false;
        continue;
      }
      // Collect bullet points
      if (line.trim().startsWith('- ')) {
        issues.push(line.trim().substring(2)); // Remove '- ' prefix
      }
    }

    // Collect lines in notes section (bullet points)
    if (inNotesSection) {
      // Stop at next section (##) or end of file
      if (line.match(/^##\s+/)) {
        inNotesSection = false;
        continue;
      }
      // Collect bullet points
      if (line.trim().startsWith('- ')) {
        issues.push(line.trim().substring(2)); // Remove '- ' prefix
      }
    }
  }

  console.log('---');
  console.log('CLOUD INVENTORY ISSUES');
  if (issues.length === 0) {
    console.log('(none found)');
  } else {
    for (const issue of issues) {
      console.log(issue);
    }
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

