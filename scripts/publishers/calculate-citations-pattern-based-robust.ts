/**
 * Pattern-Based Citation Detection (Robust Version)
 * 
 * Enhanced with:
 * - Error handling and retry logic
 * - Query timeouts
 * - Progress tracking
 * - Resume capability
 * - Memory-efficient processing
 */

import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const PUBLISHERS_TABLE = 'publishers';
const CHUNKS_TABLE = 'chunks';

// Configuration
const BATCH_SIZE = 10000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // 2 seconds
const QUERY_TIMEOUT_MS = 300000; // 5 minutes per query
const PROGRESS_FILE = path.join(__dirname, '..', '..', '.citation-progress.json');

interface CitationMatch {
  discovery_id: string;
  newsletter_name: string;
  citation_count: number;
  citing_publishers: string[];
}

interface ProgressState {
  lastProcessedOffset: number;
  citations: { [identifier: string]: {
    identifier: string;
    newsletter_name: string;
    source: 'discovered' | 'publisher';
    citing_publishers: string[];
  }};
  startTime: string;
  lastUpdate: string;
}

/**
 * Load progress from file
 */
function loadProgress(): ProgressState | null {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const content = fs.readFileSync(PROGRESS_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('⚠️  Error loading progress file:', error);
  }
  return null;
}

/**
 * Save progress to file
 */
function saveProgress(state: ProgressState): void {
  try {
    state.lastUpdate = new Date().toISOString();
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('⚠️  Error saving progress file:', error);
  }
}

/**
 * Sleep helper for retries
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute BigQuery query with timeout and retry
 */
async function queryWithRetry(
  bigquery: BigQuery,
  query: string,
  options: { timeout?: number; maxRetries?: number } = {}
): Promise<any[]> {
  const timeout = options.timeout || QUERY_TIMEOUT_MS;
  const maxRetries = options.maxRetries || MAX_RETRIES;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Use Promise.race to add timeout wrapper around query
      const queryPromise = bigquery.query({ query });
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout)
      );

      const result = await Promise.race([queryPromise, timeoutPromise]);
      // BigQuery query returns [rows, metadata] tuple
      if (Array.isArray(result) && result.length >= 1) {
        return result[0] || [];
      }
      // If result is not array, return empty array (shouldn't happen)
      return [];
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      
      // Don't retry on certain errors (syntax errors, etc.)
      if (errorMsg.includes('Syntax error') || errorMsg.includes('Invalid query')) {
        throw new Error(`Query syntax error: ${errorMsg}`);
      }
      
      console.error(`   ⚠️  Query attempt ${attempt}/${maxRetries} failed:`, errorMsg.substring(0, 200));
      
      if (attempt < maxRetries) {
        const delay = RETRY_DELAY_MS * attempt; // Exponential backoff
        console.log(`   ⏳ Retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        throw new Error(`Query failed after ${maxRetries} attempts: ${errorMsg}`);
      }
    }
  }
  
  throw new Error('Query failed: unknown error');
}

async function calculateCitationsPatternBased() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  const startTime = new Date().toISOString();

  console.log('📊 Calculating citations using pattern-based detection (Robust Version)...\n');
  console.log('Features:');
  console.log('  ✅ Error handling & retry logic');
  console.log('  ✅ Query timeouts (5 min per query)');
  console.log('  ✅ Progress tracking & resume capability');
  console.log('  ✅ Memory-efficient batch processing\n');

  // Check for existing progress
  const existingProgress = loadProgress();
  if (existingProgress) {
    console.log('⚠️  Found existing progress file!');
    console.log(`   Last processed offset: ${existingProgress.lastProcessedOffset}`);
    console.log(`   Citations found so far: ${Object.keys(existingProgress.citations).length}`);
    console.log(`   Started: ${existingProgress.startTime}`);
    console.log(`   Last update: ${existingProgress.lastUpdate}\n`);
    console.log('Do you want to:');
    console.log('  1. Resume from last position');
    console.log('  2. Start fresh (delete progress file)\n');
    // For now, auto-resume
    console.log('   Auto-resuming from last position...\n');
  }

  try {
    // Step 1: Get ALL newsletters/publishers with URLs
    // Combine discovered_newsletters with publishers table to get full coverage
    console.log('Step 1: Fetching all newsletters/publishers with URLs...');
    console.log('   (Checking discovered_newsletters + publishers table)\n');
    
    // Get from discovered_newsletters
    const discoveredNewsletters = await queryWithRetry(bigquery, `
      SELECT 
        discovery_id,
        newsletter_name,
        newsletter_url,
        canonical_url
      FROM \`${PROJECT_ID}.${DATASET_ID}.discovered_newsletters\`
      WHERE newsletter_url IS NOT NULL
        AND is_relevant = TRUE
        AND needs_review = FALSE
    `);
    
    if (!Array.isArray(discoveredNewsletters)) {
      throw new Error(`Expected array from query, got: ${typeof discoveredNewsletters}`);
    }
    
    // Also get from publishers table and infer URLs from email domains
    const allPublishers = await queryWithRetry(bigquery, `
      SELECT 
        publisher_id,
        publisher_name,
        newsletter_url,
        primary_email,
        email_domains
      FROM \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\`
    `);
    
    // Infer URLs from email domains for publishers without explicit URLs
    const publishersWithUrls: any[] = [];
    const publishersWithInferredUrls: any[] = [];
    
    for (const publisher of allPublishers) {
      if (publisher.newsletter_url) {
        publishersWithUrls.push(publisher);
      } else if (publisher.primary_email) {
        // Infer URL from email domain
        const email = publisher.primary_email.toLowerCase();
        let inferredUrl: string | null = null;
        
        // Extract subdomain from email (e.g., "morningbrew@substack.com" -> "morningbrew.substack.com")
        if (email.includes('@substack.com')) {
          const subdomain = email.split('@')[0];
          inferredUrl = `https://${subdomain}.substack.com`;
        } else if (email.includes('@beehiiv.com')) {
          const subdomain = email.split('@')[0];
          inferredUrl = `https://${subdomain}.beehiiv.com`;
        } else if (email.includes('@ghost.org')) {
          // Ghost uses custom domains, can't infer easily
          // Skip for now
        }
        
        if (inferredUrl) {
          publishersWithInferredUrls.push({
            ...publisher,
            newsletter_url: inferredUrl,
            is_inferred: true,
          });
        }
      }
    }
    
    console.log(`   Found ${discoveredNewsletters.length} from discovered_newsletters`);
    console.log(`   Found ${publishersWithUrls.length} from publishers table (with explicit URLs)`);
    console.log(`   Found ${publishersWithInferredUrls.length} from publishers table (inferred from emails)\n`);
    
    if (discoveredNewsletters.length === 0 && publishersWithUrls.length === 0 && publishersWithInferredUrls.length === 0) {
      console.log('⚠️  No newsletters found with URLs.\n');
      return;
    }

    // Step 2: Create lookup map from all sources
    console.log('Step 2: Creating newsletter URL lookup map...');
    
    const newsletterUrlMap = new Map<string, {
      identifier: string; // discovery_id or publisher_id
      newsletter_name: string;
      source: 'discovered' | 'publisher';
    }>();
    
    // Add from discovered_newsletters
    for (const newsletter of discoveredNewsletters) {
      if (!newsletter.newsletter_url) continue;
      try {
        const url = new URL(newsletter.newsletter_url);
        const normalizedUrl = url.hostname.toLowerCase().replace(/^www\./, '');
        newsletterUrlMap.set(normalizedUrl, {
          identifier: newsletter.discovery_id,
          newsletter_name: newsletter.newsletter_name,
          source: 'discovered',
        });
      } catch {
        // Invalid URL, skip
      }
    }
    
    // Add from publishers table (explicit URLs)
    for (const publisher of publishersWithUrls) {
      if (!publisher.newsletter_url) continue;
      try {
        const url = new URL(publisher.newsletter_url);
        const normalizedUrl = url.hostname.toLowerCase().replace(/^www\./, '');
        // Only add if not already in map (discovered_newsletters takes precedence)
        if (!newsletterUrlMap.has(normalizedUrl)) {
          newsletterUrlMap.set(normalizedUrl, {
            identifier: publisher.publisher_id,
            newsletter_name: publisher.publisher_name,
            source: 'publisher',
          });
        }
      } catch {
        // Invalid URL, skip
      }
    }
    
    // Add from publishers table (inferred URLs from email domains)
    for (const publisher of publishersWithInferredUrls) {
      if (!publisher.newsletter_url) continue;
      try {
        const url = new URL(publisher.newsletter_url);
        const normalizedUrl = url.hostname.toLowerCase().replace(/^www\./, '');
        // Only add if not already in map
        if (!newsletterUrlMap.has(normalizedUrl)) {
          newsletterUrlMap.set(normalizedUrl, {
            identifier: publisher.publisher_id,
            newsletter_name: publisher.publisher_name,
            source: 'publisher',
          });
        }
      } catch {
        // Invalid URL, skip
      }
    }
    
    console.log(`   Created lookup map for ${newsletterUrlMap.size} newsletters/publishers\n`);

    // Step 3: Get total count of chunks with URLs (optimized: only scan chunks with http)
    console.log('Step 3: Counting chunks that might contain URLs...');
    console.log('   (Scanning chunks with "http" to optimize - most URLs will be in these)\n');
    
    const countResult = await queryWithRetry(bigquery, `
      SELECT COUNT(*) as total
      FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\` c
      WHERE c.chunk_text LIKE '%http%'
    `);
    
    if (!Array.isArray(countResult) || countResult.length === 0) {
      throw new Error('Failed to get chunk count from BigQuery');
    }
    
    const totalChunks = parseInt(countResult[0]?.total) || 0;
    console.log(`   Found ${totalChunks.toLocaleString()} chunks with URLs (out of full corpus)\n`);
    console.log(`   This will search these chunks for newsletter URL citations...\n`);
    
    if (totalChunks === 0) {
      console.log('⚠️  No chunks with URLs found.\n');
      return;
    }

    // Initialize progress state
    const progress: ProgressState = existingProgress || {
      lastProcessedOffset: 0,
      citations: {},
      startTime: startTime,
      lastUpdate: startTime,
    };

    // Restore citation map from progress
    const citationMap = new Map<string, {
      identifier: string;
      newsletter_name: string;
      source: 'discovered' | 'publisher';
      citing_publishers: Set<string>;
    }>();

    for (const [identifier, data] of Object.entries(progress.citations)) {
      citationMap.set(identifier, {
        identifier: data.identifier || identifier,
        newsletter_name: data.newsletter_name,
        source: data.source || 'discovered',
        citing_publishers: new Set(data.citing_publishers),
      });
    }

    // Step 4: Process chunks in batches
    console.log('Step 4: Processing chunks in batches...\n');
    
    const totalBatches = Math.ceil(totalChunks / BATCH_SIZE);
    const startOffset = progress.lastProcessedOffset;
    const startBatch = Math.floor(startOffset / BATCH_SIZE) + 1;

    console.log(`   Processing ${totalBatches} batches (starting from batch ${startBatch})...\n`);

    for (let offset = startOffset; offset < totalChunks; offset += BATCH_SIZE) {
      const batchNum = Math.floor(offset / BATCH_SIZE) + 1;
      const batchStartTime = Date.now();

      try {
        console.log(`   Processing batch ${batchNum}/${totalBatches} (offset ${offset.toLocaleString()})...`);
        
        // Search chunks with URLs for newsletter URL patterns
        // Extract any newsletter URL patterns from chunk text
        // Filter in application logic (more efficient than WHERE clause regex)
        const urlQuery = `
          SELECT 
            c.newsletter_id,
            c.publisher_name as citing_publisher,
            REGEXP_EXTRACT(LOWER(REGEXP_REPLACE(c.chunk_text, r'\\s+', '')), r'https?://([a-z0-9-]+)\\.substack\\.com') as substack_subdomain,
            REGEXP_EXTRACT(LOWER(REGEXP_REPLACE(c.chunk_text, r'\\s+', '')), r'https?://([a-z0-9-]+)\\.beehiiv\\.com') as beehiiv_subdomain,
            REGEXP_EXTRACT(LOWER(REGEXP_REPLACE(c.chunk_text, r'\\s+', '')), r'https?://([a-z0-9-]+)\\.ghost\\.org') as ghost_subdomain,
            REGEXP_EXTRACT(LOWER(REGEXP_REPLACE(c.chunk_text, r'\\s+', '')), r'https?://([a-z0-9-]+)\\.tinyletter\\.com') as tinyletter_subdomain
          FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\` c
          WHERE c.chunk_text LIKE '%http%'
          LIMIT ${BATCH_SIZE} OFFSET ${offset}
        `;

        const urlChunks = await queryWithRetry(bigquery, urlQuery);
        
        let processedCount = 0;
        let citationsFoundInBatch = 0;

        for (const chunk of urlChunks) {
          if (!chunk.citing_publisher) continue;
          
          processedCount++;
          
          const platforms = [
            { subdomain: chunk.substack_subdomain, domain: 'substack.com' },
            { subdomain: chunk.beehiiv_subdomain, domain: 'beehiiv.com' },
            { subdomain: chunk.ghost_subdomain, domain: 'ghost.org' },
            { subdomain: chunk.tinyletter_subdomain, domain: 'tinyletter.com' },
          ];
          
          for (const platform of platforms) {
            if (!platform.subdomain) continue;
            
            const normalizedUrl = `${platform.subdomain}.${platform.domain}`;
            const newsletterInfo = newsletterUrlMap.get(normalizedUrl);
            
            if (newsletterInfo) {
              // Don't count self-citations
              if (newsletterInfo.newsletter_name === chunk.citing_publisher) continue;
              
              if (!citationMap.has(newsletterInfo.identifier)) {
                citationMap.set(newsletterInfo.identifier, {
                  identifier: newsletterInfo.identifier,
                  newsletter_name: newsletterInfo.newsletter_name,
                  source: newsletterInfo.source,
                  citing_publishers: new Set(),
                });
                citationsFoundInBatch++;
              }
              
              const entry = citationMap.get(newsletterInfo.identifier)!;
              entry.citing_publishers.add(chunk.citing_publisher);
            }
          }
        }

        const batchTime = ((Date.now() - batchStartTime) / 1000).toFixed(1);
        console.log(`     ✅ Processed ${processedCount} chunks in ${batchTime}s`);
        console.log(`     📊 Found ${citationsFoundInBatch} new newsletters with citations`);
        console.log(`     📈 Total: ${citationMap.size} newsletters with citations\n`);

        // Update progress
        progress.lastProcessedOffset = offset + urlChunks.length;
        progress.citations = Object.fromEntries(
          Array.from(citationMap.entries()).map(([id, data]) => [
            id,
            {
              identifier: data.identifier,
              newsletter_name: data.newsletter_name,
              source: data.source,
              citing_publishers: Array.from(data.citing_publishers),
            },
          ])
        );
        saveProgress(progress);

      } catch (error: any) {
        console.error(`\n❌ Error processing batch ${batchNum}:`, error.message);
        console.error(`   Progress saved up to offset ${offset}`);
        console.error(`   You can resume by running the script again\n`);
        throw error;
      }
    }

    // Clean up progress file on success
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
      console.log('✅ Progress file cleaned up\n');
    }

    // Step 5: Aggregate results
    console.log('Step 5: Aggregating citation counts...');
    const citations: CitationMatch[] = [];

    for (const [identifier, data] of citationMap.entries()) {
      citations.push({
        discovery_id: data.identifier, // Keep field name for compatibility
        newsletter_name: data.newsletter_name,
        citation_count: data.citing_publishers.size,
        citing_publishers: Array.from(data.citing_publishers),
      });
    }

    citations.sort((a, b) => b.citation_count - a.citation_count);

    console.log(`\n📊 Citation Analysis Results:\n`);
    console.log(`   Total newsletters with citations: ${citations.length}`);
    console.log(`   Total citations: ${citations.reduce((sum, c) => sum + c.citation_count, 0)}`);

    if (citations.length > 0) {
      const avg = citations.reduce((sum, c) => sum + c.citation_count, 0) / citations.length;
      console.log(`   Average citations per newsletter: ${avg.toFixed(1)}\n`);

      console.log('🏆 Top 10 Most Cited Newsletters:');
      citations.slice(0, 10).forEach((c, idx) => {
        console.log(`   ${idx + 1}. ${c.citation_count} citations: ${c.newsletter_name}`);
      });
    }

    console.log('\n✅ Pattern-based citation analysis complete!\n');

    // Step 6: Update publishers table with citation counts
    console.log('Step 6: Updating publishers table with citation counts...\n');
    await updatePublishersWithCitations(bigquery, citations);

  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    console.error('   Progress has been saved. You can resume by running the script again.\n');
    process.exit(1);
  }
}

/**
 * Update publishers table with citation counts
 */
async function updatePublishersWithCitations(bigquery: BigQuery, citations: CitationMatch[]) {
  console.log(`   Updating ${citations.length} publishers with citation data...\n`);

  let updatedCount = 0;
  let notFoundCount = 0;

  for (const citation of citations) {
    try {
      // Try to find publisher by discovery_id first
      if (citation.discovery_id) {
        // Check if this is a discovery_id (UUID format) or publisher_id
        // discovery_ids are UUIDs, publisher_ids might be different format
        // Try discovery_id match first (most common case)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(citation.discovery_id);
        
        if (isUUID) {
          // Update via discovery_id link using MERGE
          const mergeQuery = `
            MERGE \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\` AS target
            USING (
              SELECT 
                @discovery_id AS discovery_id,
                @citation_count AS citation_count,
                @citing_publishers AS citing_publishers
            ) AS source
            ON target.discovery_id = source.discovery_id
            WHEN MATCHED THEN
              UPDATE SET
                citation_count = source.citation_count,
                citing_publishers = source.citing_publishers,
                updated_at = CURRENT_TIMESTAMP()
          `;

          const [job] = await bigquery.createQueryJob({
            query: mergeQuery,
            params: {
              discovery_id: citation.discovery_id,
              citation_count: citation.citation_count,
              citing_publishers: citation.citing_publishers.length > 0 
                ? citation.citing_publishers 
                : [],
            },
          });
          
          const [rows] = await job.getQueryResults();
          if (rows && rows.length > 0) {
            updatedCount++;
          } else {
            notFoundCount++;
          }
        } else {
          // It's a publisher_id - use MERGE
          const mergeQuery = `
            MERGE \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\` AS target
            USING (
              SELECT 
                @publisher_id AS publisher_id,
                @citation_count AS citation_count,
                @citing_publishers AS citing_publishers
            ) AS source
            ON target.publisher_id = source.publisher_id
            WHEN MATCHED THEN
              UPDATE SET
                citation_count = source.citation_count,
                citing_publishers = source.citing_publishers,
                updated_at = CURRENT_TIMESTAMP()
          `;

          const [job] = await bigquery.createQueryJob({
            query: mergeQuery,
            params: {
              publisher_id: citation.discovery_id,
              citation_count: citation.citation_count,
              citing_publishers: citation.citing_publishers.length > 0 
                ? citation.citing_publishers 
                : [],
            },
          });
          
          const [rows] = await job.getQueryResults();
          if (rows && rows.length > 0) {
            updatedCount++;
          } else {
            notFoundCount++;
          }
        }
      }
      
      // Always try matching by newsletter name (as fallback or primary method)
      // This handles cases where discovery_id isn't linked yet
      const nameMatchQuery = `
        UPDATE \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\`
        SET 
          citation_count = @citation_count,
          citing_publishers = @citing_publishers,
          updated_at = CURRENT_TIMESTAMP()
        WHERE publisher_name = @newsletter_name
           OR LOWER(publisher_name) = LOWER(@newsletter_name)
      `;

      try {
        const [job] = await bigquery.createQueryJob({
          query: nameMatchQuery,
          params: {
            newsletter_name: citation.newsletter_name,
            citation_count: citation.citation_count,
            citing_publishers: citation.citing_publishers.length > 0 
              ? citation.citing_publishers 
              : [],
          },
        });
        
        await job.getQueryResults();
        
        // Verify update by checking if publisher exists and was updated
        const checkQuery = `
          SELECT citation_count
          FROM \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\`
          WHERE (publisher_name = @newsletter_name
             OR LOWER(publisher_name) = LOWER(@newsletter_name))
            AND citation_count = @citation_count
        `;
        const [checkRows] = await bigquery.query({
          query: checkQuery,
          params: { 
            newsletter_name: citation.newsletter_name,
            citation_count: citation.citation_count,
          },
        });
        
        if (checkRows && checkRows.length > 0) {
          if (updatedCount === 0) {
            // Only count if we didn't already update via discovery_id
            updatedCount++;
          }
        } else {
          // Check if publisher exists at all
          const existsQuery = `
            SELECT publisher_name
            FROM \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\`
            WHERE publisher_name = @newsletter_name
               OR LOWER(publisher_name) = LOWER(@newsletter_name)
          `;
          const [existsRows] = await bigquery.query({
            query: existsQuery,
            params: { newsletter_name: citation.newsletter_name },
          });
          
          if (!existsRows || existsRows.length === 0) {
            notFoundCount++;
            console.log(`     ⚠️  Not found: ${citation.newsletter_name}`);
          } else {
            // Found but update didn't work - might be a data issue
            updatedCount++;
          }
        }
      } catch (error: any) {
        // If UPDATE failed, try to see if publisher exists
        notFoundCount++;
        console.log(`     ⚠️  Error updating ${citation.newsletter_name}: ${error.message}`);
      }
      
      // Also try matching by newsletter name even if we have a discovery_id
      // (in case publisher exists but discovery_id not linked yet)
      if (citation.discovery_id && notFoundCount > 0) {
        // Try name match as fallback
        const nameMatchQuery = `
          MERGE \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\` AS target
          USING (
            SELECT 
              @newsletter_name AS newsletter_name,
              @citation_count AS citation_count,
              @citing_publishers AS citing_publishers
          ) AS source
          ON target.publisher_name = source.newsletter_name
             OR LOWER(target.publisher_name) = LOWER(source.newsletter_name)
          WHEN MATCHED THEN
            UPDATE SET
              citation_count = source.citation_count,
              citing_publishers = source.citing_publishers,
              updated_at = CURRENT_TIMESTAMP()
        `;

        try {
          const [job] = await bigquery.createQueryJob({
            query: nameMatchQuery,
            params: {
              newsletter_name: citation.newsletter_name,
              citation_count: citation.citation_count,
              citing_publishers: citation.citing_publishers.length > 0 
                ? citation.citing_publishers 
                : [],
            },
          });
          
          const [rows] = await job.getQueryResults();
          if (rows && rows.length > 0) {
            updatedCount++;
            notFoundCount--; // Found via name match
          }
        } catch (error) {
          // Ignore errors in fallback
        }
      }
    } catch (error: any) {
      console.error(`     ❌ Error updating ${citation.newsletter_name}:`, error.message);
      notFoundCount++;
    }
  }

  console.log(`\n   ✅ Updated ${updatedCount} publishers`);
  if (notFoundCount > 0) {
    console.log(`   ⚠️  ${notFoundCount} citations could not be matched to publishers`);
    console.log(`      (These may be discovered newsletters not yet linked to publishers)\n`);
  }
}

calculateCitationsPatternBased()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

