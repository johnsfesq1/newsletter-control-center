/**
 * Calculate Quality Scores for All Publishers
 * 
 * This script calculates composite quality scores based on 6 signals:
 * 1. Citation Signal (30%) - How many other publishers cite this
 * 2. Subscriber Signal (25%) - Estimated subscriber count
 * 3. Recommendation Signal (15%) - How many recommendations received
 * 4. Topic Relevance (20%) - Relevance to geopolitics/foreign policy
 * 5. Platform Signal (5%) - Platform quality indicator
 * 6. Freshness Signal (5%) - Activity level (last_seen date)
 * 
 * Manual overrides are supported - if manual_quality_score_override is set,
 * it takes precedence over calculated score.
 */

import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const PUBLISHERS_TABLE = 'publishers';
const DISCOVERED_TABLE = 'discovered_newsletters';

// Quality scoring version
const QUALITY_SCORE_VERSION = '1.0';

interface QualitySignals {
  citationSignal: number;      // 0-1
  subscriberSignal: number;    // 0-1
  recommendationSignal: number; // 0-1
  topicRelevanceSignal: number; // 0-1
  platformSignal: number;      // 0-1
  freshnessSignal: number;     // 0-1
}

// Publisher data comes from BigQuery query result (any type)

/**
 * Calculate citation signal (0-1)
 * Uses logarithmic scaling: log10(citation_count + 1) / 2
 */
function calculateCitationSignal(citationCount: number | null): number {
  if (!citationCount || citationCount === 0) {
    return 0.0;
  }
  // Logarithmic: 1 citation = 0.15, 10 = 0.5, 100 = 1.0
  return Math.min(Math.log10(citationCount + 1) / 2, 1.0);
}

/**
 * Calculate subscriber signal (0-1)
 * Uses logarithmic scaling: log10(subscriber_count / 1000) / 2
 */
function calculateSubscriberSignal(subscriberCount: number | null): number {
  if (!subscriberCount || subscriberCount === 0) {
    return 0.5; // Neutral default for unknown
  }
  // Logarithmic: 1K = 0.0, 10K = 0.5, 100K = 1.0
  return Math.min(Math.max(Math.log10(subscriberCount / 1000) / 2, 0), 1.0);
}

/**
 * Calculate recommendation signal (0-1)
 */
function calculateRecommendationSignal(recommendationCount: number | null): number {
  if (!recommendationCount || recommendationCount === 0) {
    return 0.4; // Default for no recommendations
  }
  if (recommendationCount >= 3) return 1.0;
  if (recommendationCount === 2) return 0.8;
  if (recommendationCount === 1) return 0.6;
  return 0.4;
}

/**
 * Calculate topic relevance signal (0-1)
 * Uses existing topic_relevance_score if available, otherwise neutral
 */
function calculateTopicRelevanceSignal(topicRelevanceScore: number | null): number {
  if (topicRelevanceScore !== null && topicRelevanceScore !== undefined) {
    return Math.min(Math.max(topicRelevanceScore, 0), 1);
  }
  return 0.5; // Neutral default
}

/**
 * Calculate platform signal (0-1)
 */
function calculatePlatformSignal(platform: string | null): number {
  if (!platform) return 0.7; // Unknown = neutral
  
  const platformScores: { [key: string]: number } = {
    'substack': 0.9,
    'beehiiv': 0.8,
    'ghost': 0.85,
    'custom': 0.7,
    'mailchimp': 0.75,
    'convertkit': 0.75,
    'tinyletter': 0.6,
    'revue': 0.65,
    'buttondown': 0.8,
  };
  
  return platformScores[platform.toLowerCase()] || 0.7;
}

/**
 * Calculate freshness signal (0-1)
 * Based on last_seen date
 */
function calculateFreshnessSignal(lastSeen: string | null): number {
  if (!lastSeen) return 0.5; // Neutral if unknown
  
  try {
    const lastSeenDate = new Date(lastSeen);
    const now = new Date();
    const daysSince = (now.getTime() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSince <= 7) return 1.0;      // Active in last week
    if (daysSince <= 30) return 0.9;     // Active in last month
    if (daysSince <= 90) return 0.7;     // Active in last 3 months
    if (daysSince <= 180) return 0.5;    // Active in last 6 months
    if (daysSince <= 365) return 0.3;    // Active in last year
    return 0.1;                           // Inactive
  } catch {
    return 0.5; // Neutral on error
  }
}

/**
 * Calculate composite quality score (0-100)
 */
function calculateQualityScore(signals: QualitySignals, manualOverride: number | null): number {
  // Manual override takes precedence
  if (manualOverride !== null && manualOverride !== undefined) {
    return Math.min(Math.max(manualOverride, 0), 100);
  }
  
  // Composite formula
  const composite = (
    signals.citationSignal * 0.30 +
    signals.subscriberSignal * 0.25 +
    signals.recommendationSignal * 0.15 +
    signals.topicRelevanceSignal * 0.20 +
    signals.platformSignal * 0.05 +
    signals.freshnessSignal * 0.05
  ) * 100;
  
  return Math.min(Math.max(composite, 0), 100);
}

/**
 * Apply manual individual signal overrides if present
 */
function applyManualSignalOverrides(
  signals: QualitySignals,
  manualOverrides: any | null
): QualitySignals {
  if (!manualOverrides || typeof manualOverrides !== 'object') {
    return signals;
  }
  
  const overridden = { ...signals };
  
  // Allow manual override of individual signals
  if (manualOverrides.citation_signal !== undefined) {
    overridden.citationSignal = Math.min(Math.max(manualOverrides.citation_signal, 0), 1);
  }
  if (manualOverrides.subscriber_signal !== undefined) {
    overridden.subscriberSignal = Math.min(Math.max(manualOverrides.subscriber_signal, 0), 1);
  }
  if (manualOverrides.recommendation_signal !== undefined) {
    overridden.recommendationSignal = Math.min(Math.max(manualOverrides.recommendation_signal, 0), 1);
  }
  if (manualOverrides.topic_relevance_signal !== undefined) {
    overridden.topicRelevanceSignal = Math.min(Math.max(manualOverrides.topic_relevance_signal, 0), 1);
  }
  if (manualOverrides.platform_signal !== undefined) {
    overridden.platformSignal = Math.min(Math.max(manualOverrides.platform_signal, 0), 1);
  }
  if (manualOverrides.freshness_signal !== undefined) {
    overridden.freshnessSignal = Math.min(Math.max(manualOverrides.freshness_signal, 0), 1);
  }
  
  return overridden;
}

async function calculateQualityScores() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  console.log('📊 Calculating quality scores for all publishers...\n');
  console.log(`Quality Score Version: ${QUALITY_SCORE_VERSION}\n`);

  try {
    // Step 1: Fetch all publishers with their signals
    console.log('Step 1: Fetching publishers and quality signals...');
    
    const query = `
      SELECT 
        p.publisher_id,
        p.publisher_name,
        p.citation_count,
        p.subscriber_estimate,
        p.recommendation_count,
        p.topic_relevance_score,
        p.platform,
        p.last_seen,
        p.manual_quality_score_override,
        p.manual_individual_signal_overrides,
        -- Get additional signals from discovered_newsletters if linked
        d.subscriber_count_estimate as discovered_subscriber_estimate,
        d.recommendation_count as discovered_recommendation_count,
        d.primary_topics,
        d.secondary_topics
      FROM \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\` p
      LEFT JOIN \`${PROJECT_ID}.${DATASET_ID}.${DISCOVERED_TABLE}\` d
        ON p.discovery_id = d.discovery_id
    `;

    const [rows] = await bigquery.query(query);
    console.log(`   Found ${rows.length} publishers\n`);

    if (rows.length === 0) {
      console.log('⚠️  No publishers found.\n');
      return;
    }

    // Step 2: Calculate quality scores
    console.log('Step 2: Calculating quality scores...\n');

    const updates: Array<{
      publisher_id: string;
      quality_score: number;
      citation_signal: number;
      subscriber_signal: number;
      recommendation_signal: number;
      topic_relevance_signal: number;
      platform_signal: number;
      freshness_signal: number;
    }> = [];

    for (const row of rows) {
      const publisher = row as any;
      
      // Use discovered_newsletters data if available, otherwise use publishers table
      const subscriberCount = publisher.discovered_subscriber_estimate || publisher.subscriber_estimate;
      const recommendationCount = publisher.discovered_recommendation_count || publisher.recommendation_count;
      
      // Calculate individual signals
      let signals: QualitySignals = {
        citationSignal: calculateCitationSignal(publisher.citation_count),
        subscriberSignal: calculateSubscriberSignal(subscriberCount),
        recommendationSignal: calculateRecommendationSignal(recommendationCount),
        topicRelevanceSignal: calculateTopicRelevanceSignal(publisher.topic_relevance_score),
        platformSignal: calculatePlatformSignal(publisher.platform),
        freshnessSignal: calculateFreshnessSignal(publisher.last_seen),
      };
      
      // Apply manual individual signal overrides if present
      signals = applyManualSignalOverrides(signals, publisher.manual_individual_signal_overrides);
      
      // Calculate composite score (respects manual override)
      const qualityScore = calculateQualityScore(signals, publisher.manual_quality_score_override);
      
      updates.push({
        publisher_id: publisher.publisher_id,
        quality_score: qualityScore,
        citation_signal: signals.citationSignal,
        subscriber_signal: signals.subscriberSignal,
        recommendation_signal: signals.recommendationSignal,
        topic_relevance_signal: signals.topicRelevanceSignal,
        platform_signal: signals.platformSignal,
        freshness_signal: signals.freshnessSignal,
      });
    }

    console.log(`   Calculated scores for ${updates.length} publishers\n`);

    // Step 3: Update publishers table
    console.log('Step 3: Updating publishers table...\n');

    let updatedCount = 0;
    const batchSize = 100;

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      
      // Use MERGE for batch updates
      const mergeQuery = `
        MERGE \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\` AS target
        USING UNNEST([
          ${batch.map(u => `
            STRUCT(
              '${u.publisher_id}' AS publisher_id,
              ${u.quality_score} AS quality_score,
              ${u.citation_signal} AS citation_signal,
              ${u.subscriber_signal} AS subscriber_signal,
              ${u.recommendation_signal} AS recommendation_signal,
              ${u.topic_relevance_signal} AS topic_relevance_signal,
              ${u.platform_signal} AS platform_signal,
              ${u.freshness_signal} AS freshness_signal
            )
          `).join(',')}
        ]) AS source
        ON target.publisher_id = source.publisher_id
        WHEN MATCHED THEN
          UPDATE SET
            quality_score = source.quality_score,
            quality_score_last_calculated = CURRENT_TIMESTAMP(),
            quality_score_version = '${QUALITY_SCORE_VERSION}',
            updated_at = CURRENT_TIMESTAMP()
      `;

      // Actually, we need to update individual signal scores too
      // Let's do individual updates to be safe
      for (const update of batch) {
        const updateQuery = `
          UPDATE \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\`
          SET 
            quality_score = @quality_score,
            quality_score_last_calculated = CURRENT_TIMESTAMP(),
            quality_score_version = @version,
            updated_at = CURRENT_TIMESTAMP()
          WHERE publisher_id = @publisher_id
        `;

        await bigquery.query({
          query: updateQuery,
          params: {
            publisher_id: update.publisher_id,
            quality_score: update.quality_score,
            version: QUALITY_SCORE_VERSION,
          },
        });
        
        updatedCount++;
      }
      
      if ((i / batchSize) % 10 === 0) {
        console.log(`   Updated ${updatedCount}/${updates.length} publishers...`);
      }
    }

    console.log(`\n✅ Updated ${updatedCount} publishers with quality scores\n`);

    // Step 4: Show summary statistics
    console.log('Step 4: Quality Score Summary...\n');
    
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        AVG(quality_score) as avg_score,
        MIN(quality_score) as min_score,
        MAX(quality_score) as max_score,
        COUNTIF(quality_score >= 80) as high_quality,
        COUNTIF(quality_score >= 60 AND quality_score < 80) as medium_quality,
        COUNTIF(quality_score < 60) as low_quality,
        COUNTIF(manual_quality_score_override IS NOT NULL) as manual_overrides
      FROM \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\`
      WHERE quality_score IS NOT NULL
    `;

    const [statsRows] = await bigquery.query(statsQuery);
    const stats = statsRows[0];

    console.log(`   Total publishers scored: ${stats.total}`);
    console.log(`   Average score: ${stats.avg_score?.toFixed(1) || 'N/A'}`);
    console.log(`   Score range: ${stats.min_score?.toFixed(1) || 'N/A'} - ${stats.max_score?.toFixed(1) || 'N/A'}`);
    console.log(`   High quality (≥80): ${stats.high_quality}`);
    console.log(`   Medium quality (60-79): ${stats.medium_quality}`);
    console.log(`   Low quality (<60): ${stats.low_quality}`);
    console.log(`   Manual overrides: ${stats.manual_overrides}\n`);

    console.log('✅ Quality score calculation complete!\n');
    console.log('Next steps:');
    console.log('  - Review scores and add manual overrides where needed');
    console.log('  - Run: npm run publishers:manual-override <publisher_id> <score>');
    console.log('  - Integrate quality scores into retrieval system\n');

  } catch (error: any) {
    console.error('❌ Error calculating quality scores:', error.message);
    throw error;
  }
}

calculateQualityScores()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

