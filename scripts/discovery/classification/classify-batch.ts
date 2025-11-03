/**
 * Classify a batch of DiscoveryResult objects
 * 
 * Used for inline classification during discovery (before storing)
 */

import { DiscoveryResult } from '../discover-substack-search';
import { ruleBasedFilter } from './classify-rule-based';
import { classifyNewsletter, ClassificationResult } from './classify-ai';

export interface ClassifiedDiscovery extends DiscoveryResult {
  is_relevant: boolean;
  relevance_confidence: number;
  primary_focus?: string;
  focus_percentage?: number;
  primary_topics?: string[];
  secondary_topics?: string[];
  regions?: string[];
  classification_reasoning?: string;
  needs_review: boolean;
  is_paid?: boolean | null;
  archive_accessible?: boolean | null;
  classification_version: string;
}

export interface BatchClassificationStats {
  total: number;
  ruleBasedRejected: number;
  aiClassified: number;
  autoAccepted: number;
  autoRejected: number;
  manualReview: number;
  relevant: number;
  notRelevant: number;
  errors: number;
}

/**
 * Classify a batch of discoveries
 */
export async function classifyBatch(
  discoveries: DiscoveryResult[],
  verbose: boolean = false
): Promise<{
  classified: ClassifiedDiscovery[];
  stats: BatchClassificationStats;
}> {
  const stats: BatchClassificationStats = {
    total: discoveries.length,
    ruleBasedRejected: 0,
    aiClassified: 0,
    autoAccepted: 0,
    autoRejected: 0,
    manualReview: 0,
    relevant: 0,
    notRelevant: 0,
    errors: 0,
  };
  
  const classified: ClassifiedDiscovery[] = [];
  
  if (discoveries.length === 0) {
    return { classified, stats };
  }
  
  if (verbose) {
    console.log(`\n🧪 Classifying ${discoveries.length} discoveries...\n`);
  }
  
  for (let i = 0; i < discoveries.length; i++) {
    const discovery = discoveries[i];
    const newsletterName = discovery.newsletter_name || 'Unknown';
    const description = discovery.description || null;
    const url = discovery.newsletter_url || '';
    
    if (verbose) {
      if (i % 10 === 0 || i === discoveries.length - 1) {
        console.log(`   Classifying ${i + 1}/${discoveries.length}...`);
      }
    }
    
    try {
      // Step 1: Rule-based pre-filter
      const filterResult = ruleBasedFilter(newsletterName, description, url);
      
      if (!filterResult.shouldProceed) {
        stats.ruleBasedRejected++;
        
        classified.push({
          ...discovery,
          is_relevant: false,
          relevance_confidence: 0.0,
          classification_reasoning: filterResult.reason || 'Rule-based exclusion',
          needs_review: false,
          classification_version: 'v1-geopolitics-lens',
        });
        
        if (verbose) {
          console.log(`   ⚠️  ${newsletterName}: Rule-based reject`);
        }
        continue;
      }
      
      // Step 2: AI Classification with overall timeout (40 seconds total: 5s auth + 30s API + 5s buffer)
      const classificationPromise = classifyNewsletter(newsletterName, description, url);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Classification timeout (40s exceeded)')), 40000);
      });
      
      let classification;
      try {
        classification = await Promise.race([classificationPromise, timeoutPromise]);
      } catch (timeoutError: any) {
        throw new Error(`Classification timeout for ${newsletterName}: ${timeoutError.message}`);
      }
      stats.aiClassified++;
      
      // Step 3: Apply confidence thresholds
      let finalRelevant = classification.relevant;
      let needsReview = false;
      
      if (classification.confidence > 0.8 && classification.focus_percentage >= 0.7) {
        // Auto-accept
        stats.autoAccepted++;
        if (finalRelevant) stats.relevant++;
        else stats.notRelevant++;
      } else if (classification.confidence < 0.5 || classification.focus_percentage < 0.5) {
        // Auto-reject
        stats.autoRejected++;
        finalRelevant = false;
        stats.notRelevant++;
      } else {
        // Manual review
        stats.manualReview++;
        needsReview = true;
        if (finalRelevant) stats.relevant++;
        else stats.notRelevant++;
      }
      
      // Store analytical lens in reasoning if available
      let reasoning = classification.reasoning || '';
      if (classification.analytical_lens) {
        reasoning = `${reasoning} [Lens: ${classification.analytical_lens}]`.trim();
      }
      
      classified.push({
        ...discovery,
        is_relevant: finalRelevant,
        relevance_confidence: classification.confidence,
        primary_focus: classification.primary_focus,
        focus_percentage: classification.focus_percentage,
        primary_topics: classification.primary_topics || [],
        secondary_topics: classification.secondary_topics || [],
        regions: classification.regions || [],
        classification_reasoning: reasoning,
        needs_review: needsReview,
        is_paid: classification.is_paid,
        archive_accessible: classification.archive_accessible,
        classification_version: 'v1-geopolitics-lens',
      });
      
      // Rate limiting (respect API quotas - Gemini has 60 requests/minute limit)
      // Increased to 2000ms (30 req/min) to stay well under quota and avoid 429 errors
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds = 30 requests/minute
      
    } catch (error: any) {
      stats.errors++;
      
      if (verbose) {
        console.error(`   ❌ Error classifying ${newsletterName}: ${error.message}`);
      }
      
      // Mark as needs review on error
      classified.push({
        ...discovery,
        is_relevant: false,
        relevance_confidence: 0.0,
        classification_reasoning: `Classification error: ${error.message}`,
        needs_review: true,
        classification_version: 'v1-geopolitics-lens',
      });
    }
  }
  
  if (verbose) {
    console.log(`\n✅ Classification complete:`);
    console.log(`   Rule-based rejected: ${stats.ruleBasedRejected}`);
    console.log(`   AI classified: ${stats.aiClassified}`);
    console.log(`   Auto-accepted: ${stats.autoAccepted}`);
    console.log(`   Auto-rejected: ${stats.autoRejected}`);
    console.log(`   Manual review: ${stats.manualReview}`);
    console.log(`   Relevant: ${stats.relevant}`);
    console.log(`   Not relevant: ${stats.notRelevant}`);
    console.log(`   Errors: ${stats.errors}\n`);
  }
  
  return { classified, stats };
}

