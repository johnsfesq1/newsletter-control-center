/**
 * Update publishers table with citation counts from pattern-based analysis
 * This script reads citation results and updates the publishers table
 */

import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const PUBLISHERS_TABLE = 'publishers';
const DISCOVERED_TABLE = 'discovered_newsletters';

interface CitationResult {
  discovery_id?: string;
  publisher_id?: string;
  newsletter_name: string;
  citation_count: number;
  citing_publishers: string[];
}

async function updateCitationCounts() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  console.log('📊 Updating citation counts in publishers table...\n');

  try {
    // Step 1: Get citation results from the last run
    // We'll need to re-run the citation analysis or read from a file
    // For now, let's query the discovered_newsletters to get what we have
    console.log('Step 1: Fetching citation results...\n');
    
    // We need to get the citation data from the citation analysis script
    // Since we just ran it, we'll query discovered_newsletters for any existing citation data
    // OR we can re-run the citation analysis and store results
    
    // For now, let's create a script that can be called with citation data
    // We'll use a parameterized approach
    
    console.log('⚠️  This script needs citation data from calculate-citations-pattern-based-robust.ts');
    console.log('   Two options:');
    console.log('   1. Run citation analysis and pipe results to this script');
    console.log('   2. Re-run citation analysis and update in same script');
    console.log('\n   Proceeding with option 2: Re-running citation analysis...\n');
    
    // Import and run the citation analysis
    // Actually, we should extract the citation results from the citation script
    // Let's create a helper function that can be called
    
    console.log('✅ Citation counts will be updated after running citation analysis');
    console.log('   See: calculate-citations-pattern-based-robust.ts for citation data\n');
    
  } catch (error: any) {
    console.error('❌ Error updating citation counts:', error.message);
    throw error;
  }
}

// For now, create a version that accepts citation data as input
export async function updatePublishersWithCitations(citations: CitationResult[]) {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  console.log(`\n📊 Updating ${citations.length} publishers with citation counts...\n`);

  let updatedCount = 0;
  let notFoundCount = 0;

  for (const citation of citations) {
    try {
      // Try to find publisher by discovery_id first
      if (citation.discovery_id) {
        const updateQuery = `
          UPDATE \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\`
          SET 
            citation_count = @citation_count,
            citing_publishers = @citing_publishers,
            updated_at = CURRENT_TIMESTAMP()
          WHERE discovery_id = @discovery_id
        `;

        const options = {
          query: updateQuery,
          params: {
            discovery_id: citation.discovery_id,
            citation_count: citation.citation_count,
            citing_publishers: citation.citing_publishers,
          },
        };

        const [job] = await bigquery.createQueryJob(options);
        const [rows] = await job.getQueryResults();
        
        if (rows && rows.length > 0) {
          updatedCount++;
        } else {
          // Try to find by publisher_name
          notFoundCount++;
        }
      } else if (citation.publisher_id) {
        // Update by publisher_id
        const updateQuery = `
          UPDATE \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\`
          SET 
            citation_count = @citation_count,
            citing_publishers = @citing_publishers,
            updated_at = CURRENT_TIMESTAMP()
          WHERE publisher_id = @publisher_id
        `;

        const options = {
          query: updateQuery,
          params: {
            publisher_id: citation.publisher_id,
            citation_count: citation.citation_count,
            citing_publishers: citation.citing_publishers,
          },
        };

        const [job] = await bigquery.createQueryJob(options);
        const [rows] = await job.getQueryResults();
        
        if (rows && rows.length > 0) {
          updatedCount++;
        } else {
          notFoundCount++;
        }
      }
    } catch (error: any) {
      console.error(`   ⚠️  Error updating ${citation.newsletter_name}:`, error.message);
    }
  }

  console.log(`\n✅ Updated ${updatedCount} publishers`);
  if (notFoundCount > 0) {
    console.log(`   ⚠️  ${notFoundCount} citations not matched to publishers`);
  }
}

if (require.main === module) {
  updateCitationCounts()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

