/**
 * Main orchestrator for newsletter discovery
 * 
 * Coordinates all discovery methods and stores results in BigQuery
 */

import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { BigQuery } from '@google-cloud/bigquery';
import { discoverSubstackViaSearch, DiscoveryResult } from './discover-substack-search';
import { discoverSubstackRecommendations } from './discover-substack-recommendations';
import { discoverDirectories } from './discover-directories';
import { discoverViaWebSearch } from './discover-web-search';
import { discoverBeehiiv } from './discover-beehiiv';
import { normalizeUrl, normalizeName } from './utils/url-normalizer';
import { classifyBatch, ClassifiedDiscovery } from './classification/classify-batch';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const TABLE_ID = 'discovered_newsletters';

interface StoredDiscovery {
  discovery_id: string;
  canonical_url: string;
  newsletter_name: string;
  newsletter_url: string;
  platform: string | null;
  description: string | null;
  discovery_method: string;
  discovery_source: string;
  discovered_at: string;
  created_at: string;
  updated_at: string;
  is_relevant: boolean | null;
  relevance_confidence: number | null;
  primary_focus: string | null;
  focus_percentage: number | null;
  primary_topics: string[] | null;
  secondary_topics: string[] | null;
  regions: string[] | null;
  classification_reasoning: string | null;
  needs_review: boolean;
  is_paid: boolean | null;
  archive_accessible: boolean | null;
  classification_version: string | null;
  is_duplicate: boolean;
}

/**
 * Store discovered newsletters in BigQuery
 */
async function storeDiscoveries(
  bigquery: BigQuery,
  discoveries: ClassifiedDiscovery[]
): Promise<void> {
  const dataset = bigquery.dataset(DATASET_ID);
  const table = dataset.table(TABLE_ID);
  
  const now = new Date().toISOString();
  
  const rows: StoredDiscovery[] = discoveries.map(discovery => ({
    discovery_id: uuidv4(),
    canonical_url: normalizeUrl(discovery.newsletter_url),
    newsletter_name: discovery.newsletter_name,
    newsletter_url: discovery.newsletter_url,
    platform: discovery.platform || null,
    description: discovery.description || null,
    discovery_method: discovery.discovery_method,
    discovery_source: discovery.discovery_source,
    discovered_at: now,
    created_at: now,
    updated_at: now,
    is_relevant: discovery.is_relevant,
    relevance_confidence: discovery.relevance_confidence,
    primary_focus: discovery.primary_focus || null,
    focus_percentage: discovery.focus_percentage || null,
    primary_topics: discovery.primary_topics || null,
    secondary_topics: discovery.secondary_topics || null,
    regions: discovery.regions || null,
    classification_reasoning: discovery.classification_reasoning || null,
    needs_review: discovery.needs_review,
    is_paid: discovery.is_paid || null,
    archive_accessible: discovery.archive_accessible || null,
    classification_version: discovery.classification_version || null,
    is_duplicate: false,
  }));
  
  // Check for existing discoveries to avoid duplicates
  const existingUrls = new Set<string>();
  if (rows.length > 0) {
    const canonicalUrls = rows.map(r => r.canonical_url);
    const query = `
      SELECT canonical_url
      FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
      WHERE canonical_url IN UNNEST(@canonical_urls)
    `;
    
    try {
      const [existing] = await bigquery.query({
        query,
        params: {
          canonical_urls: canonicalUrls,
        },
      });
      
      existing.forEach((row: any) => {
        existingUrls.add(row.canonical_url);
      });
    } catch (error) {
      console.warn('⚠️  Could not check existing discoveries:', error);
    }
  }
  
  // Filter out existing URLs
  const newRows = rows.filter(row => !existingUrls.has(row.canonical_url));
  
  if (newRows.length === 0) {
    console.log('   ℹ️  All discoveries already exist in database');
    return;
  }
  
  console.log(`   💾 Storing ${newRows.length} new discoveries...`);
  
  try {
    await table.insert(newRows);
    console.log(`   ✅ Stored ${newRows.length} discoveries`);
  } catch (error: any) {
    console.error(`   ❌ Failed to store discoveries:`, error.message);
    throw error;
  }
}

/**
 * Main discovery orchestrator
 */
async function discoverNewsletters() {
  console.log('🚀 Starting Newsletter Discovery Process\n');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('⏱️  This may take 1-2 hours. Progress updates every 100 discoveries.\n');
  
  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  const allDiscoveries: ClassifiedDiscovery[] = [];
  const startTime = Date.now();
  
  // Progress tracking
  let totalDiscovered = 0;
  let totalClassified = 0;
  let totalRelevant = 0;
  let totalNotRelevant = 0;
  let totalManualReview = 0;
  
  function showProgress() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    console.log('\n📊 PROGRESS UPDATE');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`   Total Discovered: ${totalDiscovered}`);
    console.log(`   Total Classified: ${totalClassified}`);
    console.log(`   ✅ Relevant: ${totalRelevant}`);
    console.log(`   ❌ Not Relevant: ${totalNotRelevant}`);
    console.log(`   ⚠️  Manual Review: ${totalManualReview}`);
    console.log(`   ⏱️  Time Elapsed: ${minutes}m ${seconds}s`);
    console.log('═══════════════════════════════════════════════════════\n');
  }
  
  // Step 1: Substack Search (works better than category browsing!)
  console.log('📦 Step 1: Discovering from Substack Search');
  try {
    const substackResults = await discoverSubstackViaSearch();
    if (substackResults.length > 0) {
      totalDiscovered += substackResults.length;
      console.log(`   Found ${substackResults.length} newsletters, classifying...`);
      const { classified, stats } = await classifyBatch(substackResults, true);
      totalClassified += stats.aiClassified;
      totalRelevant += stats.relevant;
      totalNotRelevant += stats.notRelevant;
      totalManualReview += stats.manualReview;
      allDiscoveries.push(...classified);
      await storeDiscoveries(bigquery, classified);
      
      if (totalDiscovered >= 100 && totalDiscovered % 100 < substackResults.length) {
        showProgress();
      }
    } else {
      console.log('   No new discoveries');
    }
  } catch (error: any) {
    console.error(`❌ Substack search discovery failed:`, error.message);
  }
  
  // Step 2: Substack Recommendation Scraping (Network Analysis)
  console.log('\n📦 Step 2: Discovering from Recommendation Scraping');
  try {
    const recommendationResults = await discoverSubstackRecommendations();
    if (recommendationResults.length > 0) {
      totalDiscovered += recommendationResults.length;
      console.log(`   Found ${recommendationResults.length} newsletters, classifying...`);
      const { classified, stats } = await classifyBatch(recommendationResults, true);
      totalClassified += stats.aiClassified;
      totalRelevant += stats.relevant;
      totalNotRelevant += stats.notRelevant;
      totalManualReview += stats.manualReview;
      allDiscoveries.push(...classified);
      await storeDiscoveries(bigquery, classified);
      
      if (totalDiscovered >= 100 && totalDiscovered % 100 < recommendationResults.length) {
        showProgress();
      }
    } else {
      console.log('   No new discoveries');
    }
  } catch (error: any) {
    console.error(`❌ Recommendation scraping failed:`, error.message);
  }
  
  // Step 3: Directory Scraping
  console.log('\n📦 Step 3: Discovering from Directories');
  try {
    const directoryResults = await discoverDirectories();
    if (directoryResults.length > 0) {
      totalDiscovered += directoryResults.length;
      console.log(`   Found ${directoryResults.length} newsletters, classifying...`);
      const { classified, stats } = await classifyBatch(directoryResults, true);
      totalClassified += stats.aiClassified;
      totalRelevant += stats.relevant;
      totalNotRelevant += stats.notRelevant;
      totalManualReview += stats.manualReview;
      allDiscoveries.push(...classified);
      await storeDiscoveries(bigquery, classified);
      
      if (totalDiscovered >= 100 && totalDiscovered % 100 < directoryResults.length) {
        showProgress();
      }
    } else {
      console.log('   No new discoveries');
    }
  } catch (error: any) {
    console.error(`❌ Directory discovery failed:`, error.message);
  }
  
  // Step 4: Beehiiv Discovery (Web Search)
  console.log('\n📦 Step 4: Discovering from Beehiiv (Web Search)');
  try {
    const beehiivResults = await discoverBeehiiv(false); // false = full mode
    if (beehiivResults.length > 0) {
      totalDiscovered += beehiivResults.length;
      console.log(`   Found ${beehiivResults.length} newsletters, classifying...`);
      const { classified, stats } = await classifyBatch(beehiivResults, true);
      totalClassified += stats.aiClassified;
      totalRelevant += stats.relevant;
      totalNotRelevant += stats.notRelevant;
      totalManualReview += stats.manualReview;
      allDiscoveries.push(...classified);
      await storeDiscoveries(bigquery, classified);
      
      if (totalDiscovered >= 100 && totalDiscovered % 100 < beehiivResults.length) {
        showProgress();
      }
    } else {
      console.log('   No new discoveries');
    }
  } catch (error: any) {
    console.error(`❌ Beehiiv discovery failed:`, error.message);
    console.error('   Error details:', error.stack || error);
    // Continue to next step even if this fails
  }
  
  // Step 5: General Web Search
  console.log('\n📦 Step 5: Discovering from General Web Search');
  try {
    const webResults = await discoverViaWebSearch();
    if (webResults.length > 0) {
      totalDiscovered += webResults.length;
      console.log(`   Found ${webResults.length} newsletters, classifying...`);
      const { classified, stats } = await classifyBatch(webResults, true);
      totalClassified += stats.aiClassified;
      totalRelevant += stats.relevant;
      totalNotRelevant += stats.notRelevant;
      totalManualReview += stats.manualReview;
      allDiscoveries.push(...classified);
      await storeDiscoveries(bigquery, classified);
      
      if (totalDiscovered >= 100 && totalDiscovered % 100 < webResults.length) {
        showProgress();
      }
    } else {
      console.log('   No new discoveries');
    }
  } catch (error: any) {
    console.error(`❌ Web search discovery failed:`, error.message);
    console.error('   Error details:', error.stack || error);
    // Continue to final summary even if this fails
  }
  
  // Final summary
  const finalElapsed = Math.floor((Date.now() - startTime) / 1000);
  const finalMinutes = Math.floor(finalElapsed / 60);
  const finalSeconds = finalElapsed % 60;
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`✅ DISCOVERY & CLASSIFICATION COMPLETE!`);
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Summary stats
  const relevant = allDiscoveries.filter(d => d.is_relevant === true).length;
  const notRelevant = allDiscoveries.filter(d => d.is_relevant === false).length;
  const needsReview = allDiscoveries.filter(d => d.needs_review === true).length;
  
  console.log(`📊 FINAL STATISTICS:\n`);
  console.log(`   Total Discovered: ${totalDiscovered}`);
  console.log(`   Total Classified: ${totalClassified}`);
  console.log(`   ✅ Relevant: ${relevant} (${((relevant/totalDiscovered)*100).toFixed(1)}%)`);
  console.log(`   ❌ Not Relevant: ${notRelevant} (${((notRelevant/totalDiscovered)*100).toFixed(1)}%)`);
  console.log(`   ⚠️  Manual Review: ${needsReview} (${((needsReview/totalDiscovered)*100).toFixed(1)}%)`);
  console.log(`\n⏱️  Total Time: ${finalMinutes}m ${finalSeconds}s`);
  console.log(`   Average: ${(totalDiscovered / finalElapsed * 60).toFixed(1)} newsletters/minute\n`);
  
  console.log(`📋 Next Steps:`);
  console.log(`   1. Review manual review queue: npm run discovery:show-review`);
  console.log(`   2. Run deduplication if needed: npm run discovery:dedupe`);
  console.log(`   3. Check results in BigQuery\n`);
}

// Add unhandled error catching
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('\n❌ Unhandled Rejection:', reason);
  console.error('Stack:', reason?.stack);
  // Don't exit - let the orchestrator handle it
});

process.on('uncaughtException', (error: Error) => {
  console.error('\n❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // Log and continue if possible
});

// Run if called directly
if (require.main === module) {
  discoverNewsletters()
    .then(() => {
      console.log('\n✅ Process completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Discovery orchestrator failed:', error);
      console.error('Error details:', error.stack || error.message);
      process.exit(1);
    });
}

export { discoverNewsletters, storeDiscoveries };

