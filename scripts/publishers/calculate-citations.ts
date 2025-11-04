/**
 * Calculate citation counts for all publishers
 * Searches chunks table for mentions of each publisher
 * This is a full corpus analysis (69K+ chunks)
 */

import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const PUBLISHERS_TABLE = 'publishers';
const CHUNKS_TABLE = 'chunks';

/**
 * Extract searchable terms from publisher name
 * Only use longer, more unique terms to avoid false positives
 */
function extractSearchTerms(publisherName: string): string[] {
  const normalized = publisherName.toLowerCase().trim();
  
  // Common words to exclude (appear in many chunks, not unique)
  // These words appear in thousands of chunks and cause false positives
  const COMMON_WORDS = [
    'from', 'the', 'and', 'with', 'that', 'this', 'have', 'will', 'would',
    'news', 'mail', 'daily', 'weekly', 'monthly', 'update', 'report',
    'brief', 'digest', 'summary', 'analysis', 'insights',
    'space', 'monitor', 'watch', 'check', 'view', 'read', 'see', 'look',
    'about', 'more', 'most', 'some', 'many', 'much', 'very', 'just',
    // Very common words that appear everywhere
    'world', 'today', 'state', 'letter', 'media', 'peak', 'time', 'news',
    'here', 'there', 'where', 'when', 'what', 'which', 'who', 'why',
    'could', 'should', 'might', 'may', 'must', 'can', 'cannot'
  ];
  
  // Extract words (6+ characters for single words, 5+ for phrases)
  // Single words must be longer to avoid false positives
  const words = normalized.split(/\s+/)
    .filter(w => w.length >= 5) // Start with 5+ char words
    .filter(w => !COMMON_WORDS.includes(w.toLowerCase()))
    .filter(w => !/^\d+$/.test(w)); // Exclude pure numbers
  
  if (words.length === 0) {
    // Try shorter words as fallback (but still filter common words)
    const fallbackWords = normalized.split(/\s+/)
      .filter(w => w.length >= 4)
      .filter(w => !COMMON_WORDS.includes(w.toLowerCase()));
    
    // CRITICAL: If only 1 word remains and it's common, skip it
    if (fallbackWords.length === 1 && fallbackWords[0].length < 6) {
      return []; // Skip - too generic
    }
    
    return [...new Set(fallbackWords)];
  }
  
  // CRITICAL: If only 1 word remains, it must be 6+ chars and not be too common
  if (words.length === 1) {
    const singleWord = words[0];
    // Single words must be 6+ chars to reduce false positives
    if (singleWord.length < 6) {
      return []; // Skip - single word too short/generic
    }
    // Even if 6+ chars, check if it's still too common
    // For now, allow it but it will be less precise
    return [singleWord];
  }
  
  // Prefer phrase matching if multiple unique words (more precise)
  const terms: string[] = [];
  
  // If we have 2+ unique words, try phrase combinations
  if (words.length >= 2) {
    // Try full phrase if reasonable length
    if (normalized.length >= 10 && normalized.length <= 100) {
      terms.push(normalized);
    }
    
    // Try 2-word phrases (more specific than individual words)
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      if (phrase.length >= 10) { // Only if phrase is reasonably long
        terms.push(phrase);
      }
    }
  }
  
  // Fallback to individual words if no phrases (but we already handled single word case)
  if (terms.length === 0 && words.length >= 2) {
    // Only use individual words if we have 2+ (AND logic requires all)
    terms.push(...words);
  }
  
  // Return unique terms
  return [...new Set(terms)];
}

async function calculateCitations() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  
  console.log('📊 Calculating citation counts for all publishers...\n');
  console.log('This analyzes the full corpus (69K+ chunks) - may take 1-2 hours\n');
  
  // Step 1: Get all publishers
  console.log('Step 1: Fetching all publishers...');
  const [publishers] = await bigquery.query({
    query: `
      SELECT 
        publisher_id,
        publisher_name,
        canonical_name,
        newsletter_url,
        primary_email
      FROM \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\`
      ORDER BY publisher_name
    `,
  });
  
  console.log(`   Found ${publishers.length} publishers\n`);
  
  if (publishers.length === 0) {
    console.log('⚠️  No publishers found.\n');
    return;
  }
  
  // Step 2: Process publishers in batches (to avoid memory issues)
  const BATCH_SIZE = 50;
  let processed = 0;
  const citations: Array<{
    publisher_id: string;
    citation_count: number;
    citing_publishers: string[];
  }> = [];
  
  console.log(`Step 2: Analyzing citations (processing ${publishers.length} publishers in batches of ${BATCH_SIZE})...\n`);
  
  for (let i = 0; i < publishers.length; i += BATCH_SIZE) {
    const batch = publishers.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(publishers.length / BATCH_SIZE);
    
    console.log(`   Processing batch ${batchNumber}/${totalBatches} (publishers ${i + 1}-${Math.min(i + BATCH_SIZE, publishers.length)})...`);
    
    // Process each publisher individually to avoid query size limits
    const batchResults: any[] = [];
    
    for (const publisher of batch) {
      const searchTerms = extractSearchTerms(publisher.publisher_name);
      if (searchTerms.length === 0) {
        continue; // Skip if no search terms
      }
      
      // Build search conditions for this publisher
      // Use AND logic: ALL terms must be present (more precise)
      // If we have a phrase, use exact phrase match
      // Otherwise, require all terms to be present
      let termConditions: string;
      
      if (searchTerms.length === 1 && searchTerms[0].includes(' ')) {
        // Single phrase: exact match
        termConditions = `LOWER(c.chunk_text) LIKE CONCAT('%', LOWER(@term_${publisher.publisher_id.replace(/-/g, '_')}), '%')`;
      } else {
        // Multiple terms: AND logic (all must be present)
        termConditions = searchTerms.map((term, idx) => 
          `LOWER(c.chunk_text) LIKE CONCAT('%', LOWER(@term_${publisher.publisher_id.replace(/-/g, '_')}_${idx}), '%')`
        ).join(' AND ');
      }
      
      // Also check for newsletter URL if available
      let urlCondition = '';
      if (publisher.newsletter_url) {
        try {
          const url = new URL(publisher.newsletter_url);
          const domain = url.hostname.replace(/^www\./, '');
          urlCondition = ` OR LOWER(c.chunk_text) LIKE CONCAT('%', LOWER(@domain_${publisher.publisher_id.replace(/-/g, '_')}), '%')`;
        } catch {
          // Invalid URL, skip
        }
      }
      
      // Build parameterized query
      const params: any = {
        publisher_id: publisher.publisher_id,
      };
      
      // Add term parameters
      if (searchTerms.length === 1 && searchTerms[0].includes(' ')) {
        // Single phrase
        params[`term_${publisher.publisher_id.replace(/-/g, '_')}`] = searchTerms[0];
      } else {
        // Multiple terms (AND logic)
        searchTerms.forEach((term, idx) => {
          params[`term_${publisher.publisher_id.replace(/-/g, '_')}_${idx}`] = term;
        });
      }
      
      if (urlCondition) {
        try {
          const url = new URL(publisher.newsletter_url!);
          const domain = url.hostname.replace(/^www\./, '');
          params[`domain_${publisher.publisher_id.replace(/-/g, '_')}`] = domain;
        } catch {
          // Skip
        }
      }
      
      const query = `
        SELECT 
          @publisher_id as publisher_id,
          COUNT(DISTINCT c.newsletter_id) as citation_count,
          ARRAY_AGG(DISTINCT c.publisher_name) as citing_publishers
        FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\` c
        WHERE 
          (
            ${termConditions}${urlCondition}
          )
          AND c.publisher_name != (
            SELECT publisher_name 
            FROM \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\`
            WHERE publisher_id = @publisher_id
          )
      `;
      
      try {
        const [results] = await bigquery.query({ query, params });
        if (results.length > 0) {
          batchResults.push({
            publisher_id: publisher.publisher_id,
            publisher_name: publisher.publisher_name,
            citation_count: parseInt(results[0].citation_count) || 0,
            citing_publishers: results[0].citing_publishers || [],
          });
        }
      } catch (error: any) {
        // If parameterized query fails, try simpler approach
        console.log(`     ⚠️  Using fallback search for ${publisher.publisher_name}`);
        
        // Fallback: use simple LIKE with escaped terms (AND logic)
        const escapedTerms = searchTerms.map(t => t.replace(/'/g, "''").replace(/\\/g, '\\\\'));
        const simpleConditions = escapedTerms.map(term => 
          `LOWER(c.chunk_text) LIKE '%${term}%'`
        ).join(' AND '); // Use AND, not OR
        
        const fallbackQuery = `
          SELECT 
            '${publisher.publisher_id}' as publisher_id,
            COUNT(DISTINCT c.newsletter_id) as citation_count,
            ARRAY_AGG(DISTINCT c.publisher_name) as citing_publishers
          FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\` c
          WHERE 
            (${simpleConditions})
            AND c.publisher_name != '${publisher.publisher_name.replace(/'/g, "''")}'
        `;
        
        try {
          const [results] = await bigquery.query({ query: fallbackQuery });
          if (results.length > 0) {
            batchResults.push({
              publisher_id: publisher.publisher_id,
              publisher_name: publisher.publisher_name,
              citation_count: parseInt(results[0].citation_count) || 0,
              citing_publishers: results[0].citing_publishers || [],
            });
          }
        } catch (fallbackError: any) {
          console.error(`     ❌ Error with fallback for ${publisher.publisher_name}:`, fallbackError.message);
        }
      }
    }
    
    // Add batch results to citations
    for (const result of batchResults) {
      citations.push({
        publisher_id: result.publisher_id,
        citation_count: result.citation_count,
        citing_publishers: result.citing_publishers,
      });
    }
    
    processed += batch.length;
    console.log(`     ✅ Found citations for ${batchResults.length} publishers in this batch`);
  }
  
  console.log(`\n   Processed ${processed} publishers`);
  console.log(`   Found citations for ${citations.length} publishers\n`);
  
  // Step 3: Update publishers table with citation counts
  console.log('Step 3: Updating publishers table with citation counts...');
  
  // Group by publisher_id (some may have multiple matches)
  const citationMap = new Map<string, { count: number; citing: string[] }>();
  
  for (const citation of citations) {
    if (!citationMap.has(citation.publisher_id)) {
      citationMap.set(citation.publisher_id, {
        count: 0,
        citing: [],
      });
    }
    
    const existing = citationMap.get(citation.publisher_id)!;
    existing.count += citation.citation_count;
    existing.citing.push(...citation.citing_publishers);
  }
  
  // Deduplicate citing publishers
  for (const [publisherId, data] of citationMap.entries()) {
    data.citing = [...new Set(data.citing)];
  }
  
  console.log(`   Updating ${citationMap.size} publishers...\n`);
  
  let updated = 0;
  const now = new Date().toISOString();
  
  // Use BigQuery table.insert with upsert pattern (safer than SQL string construction)
  const citationArray = Array.from(citationMap.entries());
  
  console.log(`   Updating ${citationArray.length} publishers using BigQuery API...\n`);
  
  const table = bigquery.dataset(DATASET_ID).table(PUBLISHERS_TABLE);
  
  // Process in smaller batches to handle streaming buffer
  const UPDATE_BATCH_SIZE = 10; // Small batches to avoid streaming buffer issues
  
  for (let i = 0; i < citationArray.length; i += UPDATE_BATCH_SIZE) {
    const batch = citationArray.slice(i, i + UPDATE_BATCH_SIZE);
    const batchNumber = Math.floor(i / UPDATE_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(citationArray.length / UPDATE_BATCH_SIZE);
    
    if (batchNumber % 10 === 0) {
      console.log(`   Progress: Batch ${batchNumber}/${totalBatches} (${i + 1}/${citationArray.length} publishers)...`);
    }
    
    // Prepare rows for this batch
    const rows = batch.map(([publisherId, data]) => {
      // Limit citing_publishers to avoid array size issues
      const citingLimited = data.citing.slice(0, 200); // Limit to 200 citing publishers
      
      return {
        publisher_id: publisherId,
        citation_count: data.count,
        citing_publishers: citingLimited, // BigQuery handles arrays natively
        updated_at: now,
      };
    });
    
    try {
      // Use table.insert - BigQuery will handle the array properly
      // Note: This creates/updates rows, but we need to use MERGE for true upsert
      // For now, we'll insert and handle conflicts separately
      
      // Actually, we need to use MERGE but with proper parameterization
      // Let's use a simpler approach: update one at a time with proper escaping
      for (const row of rows) {
        try {
          // Use parameterized MERGE with proper array and timestamp handling
          const mergeQuery = `
            MERGE \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\` AS target
            USING (
              SELECT 
                @publisher_id AS publisher_id,
                @citation_count AS citation_count,
                @citing_publishers AS citing_publishers,
                TIMESTAMP(@updated_at) AS updated_at
            ) AS source
            ON target.publisher_id = source.publisher_id
            WHEN MATCHED THEN
              UPDATE SET
                citation_count = source.citation_count,
                citing_publishers = source.citing_publishers,
                updated_at = source.updated_at
          `;
          
          await bigquery.query({
            query: mergeQuery,
            params: {
              publisher_id: row.publisher_id,
              citation_count: row.citation_count,
              citing_publishers: row.citing_publishers, // Pass array directly - BigQuery handles it
              updated_at: now, // Pass as ISO string, TIMESTAMP() converts it
            },
          });
          
          updated++;
        } catch (error: any) {
          if (error.message?.includes('streaming buffer')) {
            // Will retry later - skip for now
            continue;
          } else {
            // Log error but continue
            if (updated % 100 === 0) {
              console.error(`   ⚠️  Error updating ${row.publisher_id}: ${error.message.substring(0, 100)}`);
            }
          }
        }
      }
    } catch (error: any) {
      console.error(`   ❌ Error processing batch ${batchNumber}:`, error.message.substring(0, 200));
      // Continue with next batch
    }
  }
  
  console.log(`\n   ✅ Updated ${updated}/${citationArray.length} publishers\n`);
  
  // Step 4: Summary statistics
  console.log('📊 Citation Analysis Summary:');
  const totalCitations = Array.from(citationMap.values()).reduce((sum, d) => sum + d.count, 0);
  const avgCitations = totalCitations / citationMap.size;
  const maxCitations = Math.max(...Array.from(citationMap.values()).map(d => d.count));
  
  console.log(`   Total citations found: ${totalCitations.toLocaleString()}`);
  console.log(`   Average citations per publisher: ${avgCitations.toFixed(1)}`);
  console.log(`   Maximum citations: ${maxCitations}`);
  console.log(`   Publishers with citations: ${citationMap.size}/${publishers.length}`);
  console.log(`   Publishers with no citations: ${publishers.length - citationMap.size}`);
  console.log('');
  
  // Top 10 most cited publishers
  const topCited = Array.from(citationMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);
  
  if (topCited.length > 0) {
    console.log('🏆 Top 10 Most Cited Publishers:');
    for (const [publisherId, data] of topCited) {
      const publisher = publishers.find(p => p.publisher_id === publisherId);
      console.log(`   ${data.count} citations: ${publisher?.publisher_name || publisherId}`);
    }
    console.log('');
  }
  
  console.log('✅ Citation analysis complete!\n');
  console.log('Next steps:');
  console.log('  1. Review citation counts (top publishers should be recognizable)');
  console.log('  2. Run: npm run publishers:initial-scoring (quality scoring)');
}

calculateCitations()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

