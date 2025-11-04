/**
 * Populate quality signals from discovered_newsletters to publishers
 * This enriches publishers with subscriber estimates, recommendation counts, and topic relevance
 */

import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const PUBLISHERS_TABLE = 'publishers';
const DISCOVERED_TABLE = 'discovered_newsletters';

/**
 * Calculate topic relevance score from topics
 */
function calculateTopicRelevance(primaryTopics: string[] | null, secondaryTopics: string[] | null): number {
  if (!primaryTopics || primaryTopics.length === 0) {
    return 0.5; // Neutral if no topics
  }
  
  // High-relevance topics
  const highRelevanceTerms = [
    'geopolitics', 'foreign policy', 'international relations', 'national security',
    'defense', 'diplomacy', 'trade', 'economics', 'macro', 'china', 'taiwan',
    'russia', 'ukraine', 'middle east', 'asia', 'europe', 'nato'
  ];
  
  // Medium-relevance topics
  const mediumRelevanceTerms = [
    'policy', 'politics', 'security', 'strategy', 'global', 'world'
  ];
  
  const allTopics = [...(primaryTopics || []), ...(secondaryTopics || [])];
  const topicsLower = allTopics.map(t => t.toLowerCase());
  
  // Check for high-relevance matches
  for (const term of highRelevanceTerms) {
    if (topicsLower.some(t => t.includes(term))) {
      return 0.9; // High relevance
    }
  }
  
  // Check for medium-relevance matches
  for (const term of mediumRelevanceTerms) {
    if (topicsLower.some(t => t.includes(term))) {
      return 0.7; // Medium relevance
    }
  }
  
  // Has topics but no clear match
  return 0.6;
}

async function populateQualitySignals() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  console.log('📊 Populating quality signals from discovered_newsletters...\n');

  try {
    // Step 1: Get all discovered newsletters with quality signals
    console.log('Step 1: Fetching discovered newsletters with quality signals...');
    
    const discoveredQuery = `
      SELECT 
        discovery_id,
        newsletter_name,
        newsletter_url,
        subscriber_count_estimate,
        recommendation_count,
        primary_topics,
        secondary_topics,
        platform
      FROM \`${PROJECT_ID}.${DATASET_ID}.${DISCOVERED_TABLE}\`
      WHERE is_relevant = true
        AND needs_review = false
        AND (
          subscriber_count_estimate IS NOT NULL
          OR recommendation_count IS NOT NULL
          OR primary_topics IS NOT NULL
        )
    `;

    const [discoveredRows] = await bigquery.query(discoveredQuery);
    console.log(`   Found ${discoveredRows.length} discovered newsletters with quality signals\n`);

    if (discoveredRows.length === 0) {
      console.log('⚠️  No discovered newsletters with quality signals found.\n');
      return;
    }

    // Step 2: Try to match to publishers by name or email domain
    console.log('Step 2: Matching to publishers...\n');

    let updatedCount = 0;
    let matchedCount = 0;

    for (const discovered of discoveredRows) {
      try {
        // Try to find publisher by name match (fuzzy)
        const matchQuery = `
          SELECT publisher_id, publisher_name, primary_email, email_domains
          FROM \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\`
          WHERE LOWER(publisher_name) = LOWER(@newsletter_name)
             OR LOWER(TRIM(publisher_name)) = LOWER(TRIM(@newsletter_name))
          LIMIT 1
        `;

        const [matchRows] = await bigquery.query({
          query: matchQuery,
          params: { newsletter_name: discovered.newsletter_name },
        });

        if (!matchRows || matchRows.length === 0) {
          // Try partial match
          const partialMatchQuery = `
            SELECT publisher_id, publisher_name, primary_email
            FROM \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\`
            WHERE LOWER(publisher_name) LIKE LOWER(CONCAT('%', @newsletter_name, '%'))
               OR LOWER(@newsletter_name) LIKE LOWER(CONCAT('%', publisher_name, '%'))
            LIMIT 1
          `;

          const [partialRows] = await bigquery.query({
            query: partialMatchQuery,
            params: { newsletter_name: discovered.newsletter_name },
          });

          if (partialRows && partialRows.length > 0) {
            const publisher = partialRows[0];
            
            // Update publisher with quality signals
            const topicRelevance = calculateTopicRelevance(
              discovered.primary_topics,
              discovered.secondary_topics
            );

            // Build update query dynamically to handle nulls
            const updateFields: string[] = [
              'discovery_id = @discovery_id',
              'topic_relevance_score = @topic_relevance',
              'is_discovered = TRUE',
              'matched_at = CURRENT_TIMESTAMP()',
              'updated_at = CURRENT_TIMESTAMP()',
            ];
            
            const params: any = {
              publisher_id: publisher.publisher_id,
              discovery_id: discovered.discovery_id,
              topic_relevance: topicRelevance,
            };

            if (discovered.subscriber_count_estimate !== null) {
              updateFields.push('subscriber_estimate = COALESCE(@subscriber_estimate, subscriber_estimate)');
              params.subscriber_estimate = discovered.subscriber_count_estimate;
            }
            
            if (discovered.recommendation_count !== null) {
              updateFields.push('recommendation_count = COALESCE(@recommendation_count, recommendation_count)');
              params.recommendation_count = discovered.recommendation_count;
            }
            
            if (discovered.platform) {
              updateFields.push('platform = COALESCE(@platform, platform)');
              params.platform = discovered.platform;
            }
            
            if (discovered.newsletter_url) {
              updateFields.push('newsletter_url = COALESCE(@newsletter_url, newsletter_url)');
              params.newsletter_url = discovered.newsletter_url;
            }

            const updateQuery = `
              UPDATE \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\`
              SET ${updateFields.join(', ')}
              WHERE publisher_id = @publisher_id
            `;

            await bigquery.query({
              query: updateQuery,
              params,
            });

            updatedCount++;
            matchedCount++;
          }
        } else {
          const publisher = matchRows[0];
          
          // Update publisher with quality signals
          const topicRelevance = calculateTopicRelevance(
            discovered.primary_topics,
            discovered.secondary_topics
          );

          // Build update query dynamically to handle nulls
          const updateFields: string[] = [
            'discovery_id = @discovery_id',
            'topic_relevance_score = @topic_relevance',
            'is_discovered = TRUE',
            'matched_at = CURRENT_TIMESTAMP()',
            'updated_at = CURRENT_TIMESTAMP()',
          ];
          
          const params: any = {
            publisher_id: publisher.publisher_id,
            discovery_id: discovered.discovery_id,
            topic_relevance: topicRelevance,
          };

          if (discovered.subscriber_count_estimate !== null) {
            updateFields.push('subscriber_estimate = COALESCE(@subscriber_estimate, subscriber_estimate)');
            params.subscriber_estimate = discovered.subscriber_count_estimate;
          }
          
          if (discovered.recommendation_count !== null) {
            updateFields.push('recommendation_count = COALESCE(@recommendation_count, recommendation_count)');
            params.recommendation_count = discovered.recommendation_count;
          }
          
          if (discovered.platform) {
            updateFields.push('platform = COALESCE(@platform, platform)');
            params.platform = discovered.platform;
          }
          
          if (discovered.newsletter_url) {
            updateFields.push('newsletter_url = COALESCE(@newsletter_url, newsletter_url)');
            params.newsletter_url = discovered.newsletter_url;
          }

          const updateQuery = `
            UPDATE \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\`
            SET ${updateFields.join(', ')}
            WHERE publisher_id = @publisher_id
          `;

          await bigquery.query({
            query: updateQuery,
            params,
          });

          updatedCount++;
          matchedCount++;
        }
      } catch (error: any) {
        console.error(`   ⚠️  Error matching ${discovered.newsletter_name}:`, error.message);
      }
    }

    console.log(`\n✅ Updated ${updatedCount} publishers with quality signals`);
    console.log(`   Matched ${matchedCount} discovered newsletters to publishers\n`);

    // Step 3: Re-run citation analysis to catch newly linked publishers
    console.log('Step 3: Re-running citation analysis to update linked publishers...\n');
    console.log('   (Run: npm run publishers:calculate-citations)\n');

    // Step 4: Re-calculate quality scores
    console.log('Step 4: Re-calculate quality scores with new data...\n');
    console.log('   (Run: npm run publishers:calculate-scores)\n');

  } catch (error: any) {
    console.error('❌ Error populating quality signals:', error.message);
    throw error;
  }
}

populateQualitySignals()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

