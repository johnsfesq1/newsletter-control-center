/**
 * Extract existing publishers from messages table and populate publishers table
 * This is a one-time initial population
 */

import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const MESSAGES_TABLE = 'messages';
const PUBLISHERS_TABLE = 'publishers';

/**
 * Normalize publisher name to canonical form
 */
function normalizePublisherName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Extract domain from email
 */
function extractDomain(email: string): string | null {
  const match = email.match(/@([^@]+)$/);
  return match ? match[1] : null;
}

async function extractExistingPublishers() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  
  console.log('📊 Extracting existing publishers from messages table...\n');
  
  // Step 1: Query unique publishers from messages table
  console.log('Step 1: Querying unique publishers...');
  const [publisherRows] = await bigquery.query({
    query: `
      SELECT 
        publisher_name,
        sender,
        from_domain,
        COUNT(*) as message_count,
        MIN(sent_date) as first_seen,
        MAX(sent_date) as last_seen,
        AVG(word_count) as avg_word_count,
        ARRAY_AGG(DISTINCT sender) as all_senders
      FROM \`${PROJECT_ID}.${DATASET_ID}.${MESSAGES_TABLE}\`
      WHERE publisher_name IS NOT NULL
        AND publisher_name != ''
      GROUP BY publisher_name, sender, from_domain
      ORDER BY message_count DESC
    `,
  });
  
  console.log(`   Found ${publisherRows.length} unique publisher entries\n`);
  
  if (publisherRows.length === 0) {
    console.log('⚠️  No publishers found in messages table.\n');
    return;
  }
  
  // Step 2: Group by publisher_name (some publishers may have multiple emails)
  console.log('Step 2: Grouping by publisher name...');
  const publisherMap = new Map<string, any>();
  
  for (const row of publisherRows) {
    const publisherName = row.publisher_name;
    const canonicalName = normalizePublisherName(publisherName);
    
    if (!publisherMap.has(canonicalName)) {
      publisherMap.set(canonicalName, {
        publisher_name: publisherName,
        canonical_name: canonicalName,
        primary_email: row.sender,
        email_domains: new Set<string>(),
        email_variations: new Set<string>(),
        from_domain: row.from_domain,
        message_count: 0,
        first_seen: null,
        last_seen: null,
        avg_word_count: 0,
        all_senders: new Set<string>(),
      });
    }
    
    const publisher = publisherMap.get(canonicalName)!;
    
    // Aggregate data
    publisher.message_count += row.message_count;
    publisher.email_variations.add(row.sender);
    publisher.all_senders.add(row.sender);
    
    if (row.from_domain) {
      publisher.email_domains.add(row.from_domain);
    }
    
    // Extract domain from sender email
    const senderDomain = extractDomain(row.sender);
    if (senderDomain) {
      publisher.email_domains.add(senderDomain);
    }
    
    // Update first_seen and last_seen
    if (!publisher.first_seen || (row.first_seen && new Date(row.first_seen) < new Date(publisher.first_seen))) {
      publisher.first_seen = row.first_seen;
    }
    if (!publisher.last_seen || (row.last_seen && new Date(row.last_seen) > new Date(publisher.last_seen))) {
      publisher.last_seen = row.last_seen;
    }
    
    // Update avg_word_count (weighted average)
    const totalWords = publisher.avg_word_count * (publisher.message_count - row.message_count) + 
                       (row.avg_word_count || 0) * row.message_count;
    publisher.avg_word_count = totalWords / publisher.message_count;
  }
  
  console.log(`   Grouped into ${publisherMap.size} unique publishers\n`);
  
  // Step 3: Prepare rows for insertion
  console.log('Step 3: Preparing publisher entries...');
  const now = new Date().toISOString();
  const rows = Array.from(publisherMap.values()).map((publisher) => {
    const publisherId = uuidv4();
    
    return {
      publisher_id: publisherId,
      publisher_name: publisher.publisher_name,
      canonical_name: publisher.canonical_name,
      primary_email: publisher.primary_email,
      email_domains: Array.from(publisher.email_domains),
      email_variations: Array.from(publisher.email_variations),
      newsletter_url: null, // Will be populated later if linked to discovered_newsletters
      platform: null, // Will be inferred later
      from_domain: publisher.from_domain,
      quality_score: null, // Will be calculated later
      citation_count: 0, // Will be calculated later
      citing_publishers: [], // Will be calculated later
      subscriber_estimate: null,
      recommendation_count: 0,
      topic_relevance_score: null,
      freshness_score: null,
      platform_score: null,
      message_count: publisher.message_count,
      first_seen: publisher.first_seen,
      last_seen: publisher.last_seen,
      avg_word_count: publisher.avg_word_count,
      discovery_id: null, // Will be linked later
      is_discovered: false,
      matched_at: null,
      quality_score_last_calculated: null,
      quality_score_version: null,
      is_duplicate: false,
      merged_into_publisher_id: null,
      created_at: now,
      updated_at: now,
    };
  });
  
  console.log(`   Prepared ${rows.length} publisher entries\n`);
  
  // Step 4: Insert into publishers table
  console.log('Step 4: Inserting into publishers table...');
  const table = bigquery.dataset(DATASET_ID).table(PUBLISHERS_TABLE);
  
  // Insert in chunks to avoid BigQuery limits
  const CHUNK_SIZE = 500;
  let inserted = 0;
  
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(rows.length / CHUNK_SIZE);
    
    try {
      await table.insert(chunk);
      inserted += chunk.length;
      console.log(`   ✅ Inserted chunk ${chunkNumber}/${totalChunks} (${chunk.length} publishers)`);
    } catch (error: any) {
      console.error(`   ❌ Failed to insert chunk ${chunkNumber}:`, error.message);
      // Continue with next chunk
    }
  }
  
  console.log(`\n✅ Successfully inserted ${inserted}/${rows.length} publishers\n`);
  
  // Step 5: Summary statistics
  console.log('📊 Summary Statistics:');
  console.log(`   Total unique publishers: ${publisherMap.size}`);
  console.log(`   Total messages: ${rows.reduce((sum, r) => sum + r.message_count, 0).toLocaleString()}`);
  console.log(`   Average messages per publisher: ${Math.round(rows.reduce((sum, r) => sum + r.message_count, 0) / rows.length)}`);
  console.log(`   Publishers with multiple emails: ${rows.filter(r => r.email_variations.length > 1).length}`);
  console.log('');
  
  console.log('✅ Initial publisher extraction complete!\n');
  console.log('Next steps:');
  console.log('  1. Run: npm run publishers:link-discoveries (optional - links to discovered_newsletters)');
  console.log('  2. Run: npm run publishers:initial-citations (citation analysis)');
  console.log('  3. Run: npm run publishers:initial-scoring (quality scoring)');
}

extractExistingPublishers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

