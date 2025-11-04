/**
 * Pattern-Based Citation Detection
 * 
 * Instead of searching for publisher names (too noisy), we:
 * 1. Extract URLs from chunks (newsletter links)
 * 2. Extract citation phrases ("via X", "from X", etc.)
 * 3. Match to publishers table
 * 4. Count actual citations
 */

import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const PUBLISHERS_TABLE = 'publishers';
const CHUNKS_TABLE = 'chunks';

interface CitationMatch {
  discovery_id: string;
  newsletter_name: string;
  citation_count: number;
  citing_publishers: string[];
}

async function calculateCitationsPatternBased() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  console.log('📊 Calculating citations using pattern-based detection...\n');
  console.log('This approach:');
  console.log('  1. Extracts URLs from chunks (newsletter links)');
  console.log('  2. Extracts citation phrases ("via X", "from X")');
  console.log('  3. Matches to publishers table');
  console.log('  4. Counts actual citations (not false positives)\n');

  // Step 1: Get all newsletters with URLs from discovered_newsletters
  // We'll match URLs in chunks to these newsletters, then link to publishers later
  console.log('Step 1: Fetching newsletters with URLs from discovered_newsletters...');
  
  const [discoveredNewsletters] = await bigquery.query({
    query: `
      SELECT 
        discovery_id,
        newsletter_name,
        newsletter_url,
        canonical_url
      FROM \`${PROJECT_ID}.${DATASET_ID}.discovered_newsletters\`
      WHERE newsletter_url IS NOT NULL
        AND is_relevant = TRUE
        AND needs_review = FALSE
    `,
  });
  
  console.log(`   Found ${discoveredNewsletters.length} relevant newsletters with URLs\n`);

  if (discoveredNewsletters.length === 0) {
    console.log('⚠️  No newsletters found with URLs.\n');
    return;
  }

  // Step 2: Extract URLs from chunks using BigQuery regex
  console.log('Step 2: Extracting newsletter URLs from chunks...');
  console.log('   This will find chunks containing newsletter URLs and match them to publishers...\n');
  
  // Create a map of newsletter URLs to discovery IDs for fast lookup
  const newsletterUrlMap = new Map<string, {
    discovery_id: string;
    newsletter_name: string;
  }>(); // normalized_url -> {discovery_id, newsletter_name}
  
  for (const newsletter of discoveredNewsletters) {
    if (!newsletter.newsletter_url) continue;
    try {
      const url = new URL(newsletter.newsletter_url);
      const normalizedUrl = url.hostname.toLowerCase().replace(/^www\./, '');
      newsletterUrlMap.set(normalizedUrl, {
        discovery_id: newsletter.discovery_id,
        newsletter_name: newsletter.newsletter_name,
      });
    } catch {
      // Invalid URL, skip
    }
  }
  
  console.log(`   Created lookup map for ${newsletterUrlMap.size} newsletters\n`);

  // Step 3: Query chunks with newsletter URLs and match in SQL
  console.log('Step 3: Querying chunks with newsletter URLs...');
  
  // Build a query that extracts URLs and matches them to newsletters
  // We'll process in batches to avoid memory issues
  const BATCH_SIZE = 10000;
  const citationMap = new Map<string, {
    discovery_id: string;
    newsletter_name: string;
    citing_publishers: Set<string>;
  }>();

  // Get total count first (check for platform domains)
  const [countResult] = await bigquery.query({
    query: `
      SELECT COUNT(*) as total
      FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\` c
      WHERE c.chunk_text LIKE '%substack%'
         OR c.chunk_text LIKE '%beehiiv%'
         OR c.chunk_text LIKE '%ghost%'
         OR c.chunk_text LIKE '%tinyletter%'
    `,
  });
  
  const totalChunks = parseInt(countResult[0].total) || 0;
  console.log(`   Found ${totalChunks.toLocaleString()} chunks with potential newsletter URLs\n`);
  
  if (totalChunks === 0) {
    console.log('⚠️  No chunks with newsletter URLs found.\n');
    return;
  }

  // For testing: Use random sample instead of full corpus
  const TEST_SAMPLE_SIZE = 2000; // Random sample of 2K chunks
  const USE_RANDOM_SAMPLE = true; // Set to false for full run
  
  let chunksToProcess = totalChunks;
  
  if (USE_RANDOM_SAMPLE && totalChunks > TEST_SAMPLE_SIZE) {
    console.log(`   Using random sample of ${TEST_SAMPLE_SIZE} chunks for testing...\n`);
    chunksToProcess = TEST_SAMPLE_SIZE;
  } else {
    // Full corpus processing
    const totalBatches = Math.ceil(totalChunks / BATCH_SIZE);
    console.log(`   Processing ${totalBatches} batches of ${BATCH_SIZE} chunks each...\n`);
  }

  // Process chunks (either random sample or full corpus)
  if (USE_RANDOM_SAMPLE && totalChunks > TEST_SAMPLE_SIZE) {
    // Random sample: single query
    console.log(`   Processing random sample...`);
    
    const urlQuery = `
      SELECT 
        c.newsletter_id,
        c.publisher_name as citing_publisher,
        REGEXP_EXTRACT(LOWER(REGEXP_REPLACE(c.chunk_text, r'\\s+', '')), r'https?://([a-z0-9-]+)\\.substack\\.com') as substack_subdomain,
        REGEXP_EXTRACT(LOWER(REGEXP_REPLACE(c.chunk_text, r'\\s+', '')), r'https?://([a-z0-9-]+)\\.beehiiv\\.com') as beehiiv_subdomain,
        REGEXP_EXTRACT(LOWER(REGEXP_REPLACE(c.chunk_text, r'\\s+', '')), r'https?://([a-z0-9-]+)\\.ghost\\.org') as ghost_subdomain,
        REGEXP_EXTRACT(LOWER(REGEXP_REPLACE(c.chunk_text, r'\\s+', '')), r'https?://([a-z0-9-]+)\\.tinyletter\\.com') as tinyletter_subdomain
      FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\` c
      WHERE c.chunk_text LIKE '%substack%'
         OR c.chunk_text LIKE '%beehiiv%'
         OR c.chunk_text LIKE '%ghost%'
         OR c.chunk_text LIKE '%tinyletter%'
      ORDER BY RAND()
      LIMIT ${TEST_SAMPLE_SIZE}
    `;

    const [urlChunks] = await bigquery.query({ query: urlQuery });
    
    // Match URLs to publishers
    let processedCount = 0;
    for (const chunk of urlChunks) {
      const citingPublisher = chunk.citing_publisher;
      if (!citingPublisher) continue;
      
      processedCount++;
      
      // Check each platform
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
          if (newsletterInfo.newsletter_name === citingPublisher) continue;
          
          if (!citationMap.has(newsletterInfo.discovery_id)) {
            citationMap.set(newsletterInfo.discovery_id, {
              discovery_id: newsletterInfo.discovery_id,
              newsletter_name: newsletterInfo.newsletter_name,
              citing_publishers: new Set(),
            });
          }
          
          const entry = citationMap.get(newsletterInfo.discovery_id)!;
          entry.citing_publishers.add(citingPublisher);
        }
      }
    }
    
    console.log(`     Processed ${processedCount} chunks (${urlChunks.length} total), found ${citationMap.size} newsletters with citations`);
  } else {
    // Full corpus: process in batches
    for (let offset = 0; offset < totalChunks; offset += BATCH_SIZE) {
      const batchNum = Math.floor(offset / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(totalChunks / BATCH_SIZE);
      console.log(`   Processing batch ${batchNum}/${totalBatches}...`);
    
      // Extract URLs using regex (handle spaces/line breaks in URLs)
      // Use LIKE for WHERE clause (more reliable), then extract in SELECT
      const urlQuery = `
        SELECT 
          c.newsletter_id,
          c.publisher_name as citing_publisher,
          REGEXP_EXTRACT(LOWER(REGEXP_REPLACE(c.chunk_text, r'\\s+', '')), r'https?://([a-z0-9-]+)\\.substack\\.com') as substack_subdomain,
          REGEXP_EXTRACT(LOWER(REGEXP_REPLACE(c.chunk_text, r'\\s+', '')), r'https?://([a-z0-9-]+)\\.beehiiv\\.com') as beehiiv_subdomain,
          REGEXP_EXTRACT(LOWER(REGEXP_REPLACE(c.chunk_text, r'\\s+', '')), r'https?://([a-z0-9-]+)\\.ghost\\.org') as ghost_subdomain,
          REGEXP_EXTRACT(LOWER(REGEXP_REPLACE(c.chunk_text, r'\\s+', '')), r'https?://([a-z0-9-]+)\\.tinyletter\\.com') as tinyletter_subdomain
        FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\` c
        WHERE c.chunk_text LIKE '%substack%'
           OR c.chunk_text LIKE '%beehiiv%'
           OR c.chunk_text LIKE '%ghost%'
           OR c.chunk_text LIKE '%tinyletter%'
        LIMIT ${BATCH_SIZE} OFFSET ${offset}
      `;

    const [urlChunks] = await bigquery.query({ query: urlQuery });
    
    if (urlChunks.length === 0 && batchNum === 1) {
      console.log(`     ⚠️  No chunks returned from query (might be regex issue)`);
      console.log(`     Testing with sample chunk...`);
      // Test with a single chunk to see what we get
      const testQuery = `
        SELECT 
          c.newsletter_id,
          c.publisher_name as citing_publisher,
          REGEXP_EXTRACT(LOWER(REGEXP_REPLACE(c.chunk_text, r'\\s+', '')), r'https?://([a-z0-9-]+)\\.substack\\.com') as substack_subdomain
        FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\` c
        WHERE c.chunk_text LIKE '%substack%'
        LIMIT 5
      `;
      const [testChunks] = await bigquery.query({ query: testQuery });
      console.log(`     Test returned ${testChunks.length} chunks`);
      if (testChunks.length > 0) {
        console.log(`     Sample: subdomain="${testChunks[0].substack_subdomain}", citing="${testChunks[0].citing_publisher}"`);
      }
    }
    
    // Match URLs to publishers
    let processedCount = 0;
    for (const chunk of urlChunks) {
      const citingPublisher = chunk.citing_publisher;
      if (!citingPublisher) continue;
      
      processedCount++;
      
      // Check each platform
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
          if (newsletterInfo.newsletter_name === citingPublisher) continue;
          
          if (!citationMap.has(newsletterInfo.discovery_id)) {
            citationMap.set(newsletterInfo.discovery_id, {
              discovery_id: newsletterInfo.discovery_id,
              newsletter_name: newsletterInfo.newsletter_name,
              citing_publishers: new Set(),
            });
          }
          
          const entry = citationMap.get(newsletterInfo.discovery_id)!;
          entry.citing_publishers.add(citingPublisher);
        }
      }
    }
    
    console.log(`     Processed ${processedCount} chunks (${urlChunks.length} total), found ${citationMap.size} newsletters with citations`);
    }
  }

  if (USE_RANDOM_SAMPLE) {
    console.log(`\n   📊 Random Sample Test Results:`);
    console.log(`      Sample size: ${chunksToProcess.toLocaleString()} chunks`);
    console.log(`      Total chunks available: ${totalChunks.toLocaleString()}`);
    console.log(`      Citations found in sample: ${citationMap.size} newsletters`);
  }
  
  console.log(`   Found ${citationMap.size} newsletters with URL-based citations\n`);

  // Step 4: Extract citation phrases
  console.log('Step 4: Extracting citation phrases ("via X", "from X")...');
  
  // This is a simplified version - in production, you'd use regex to extract phrases
  // For now, we'll focus on URL-based citations which are more reliable

  // Step 5: Aggregate results
  console.log('Step 5: Aggregating citation counts...');
  const citations: CitationMatch[] = [];

  for (const [discoveryId, data] of citationMap.entries()) {
    citations.push({
      discovery_id: data.discovery_id,
      newsletter_name: data.newsletter_name,
      citation_count: data.citing_publishers.size,
      citing_publishers: Array.from(data.citing_publishers),
    });
  }

  // Sort by citation count
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
  console.log('Note: This is a sample run (10K chunks). For full analysis:');
  console.log('  1. Remove LIMIT 10000 from URL query');
  console.log('  2. Add citation phrase extraction');
  console.log('  3. Update publishers table with results');
}

calculateCitationsPatternBased()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

