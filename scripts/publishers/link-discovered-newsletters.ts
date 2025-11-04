/**
 * Auto-link publishers to discovered_newsletters
 * Matches by URL domain, email domain, or publisher name
 */

import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const PUBLISHERS_TABLE = 'publishers';
const DISCOVERED_TABLE = 'discovered_newsletters';

/**
 * Extract domain from URL
 */
function extractUrlDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Extract domain from email
 */
function extractEmailDomain(email: string): string | null {
  const match = email.match(/@([^@]+)$/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Normalize for matching
 */
function normalizeForMatch(str: string): string {
  return str.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

/**
 * Calculate match confidence
 */
function calculateMatchConfidence(
  publisher: any,
  discovered: any
): { confidence: number; reason: string } {
  // High confidence: Exact URL domain match
  if (discovered.newsletter_url) {
    const discoveredDomain = extractUrlDomain(discovered.newsletter_url);
    if (discoveredDomain) {
      // Check if publisher email domain matches
      for (const emailDomain of publisher.email_domains || []) {
        if (emailDomain.toLowerCase() === discoveredDomain.toLowerCase()) {
          return { confidence: 0.95, reason: 'URL domain match' };
        }
        // Check if email domain is subdomain (e.g., zeihan.substack.com matches substack.com)
        if (emailDomain.toLowerCase().endsWith('.' + discoveredDomain.toLowerCase())) {
          return { confidence: 0.90, reason: 'URL subdomain match' };
        }
      }
    }
  }

  // Medium confidence: Publisher name match
  const publisherNameNorm = normalizeForMatch(publisher.publisher_name);
  const discoveredNameNorm = normalizeForMatch(discovered.newsletter_name);
  
  if (publisherNameNorm === discoveredNameNorm) {
    return { confidence: 0.85, reason: 'Exact name match' };
  }
  
  // Check if one contains the other (e.g., "Zeihan" vs "Zeihan on Geopolitics")
  if (publisherNameNorm.includes(discoveredNameNorm) || discoveredNameNorm.includes(publisherNameNorm)) {
    return { confidence: 0.70, reason: 'Partial name match' };
  }

  // Low confidence: Email domain match only
  if (discovered.newsletter_url) {
    const discoveredDomain = extractUrlDomain(discovered.newsletter_url);
    if (discoveredDomain) {
      for (const emailDomain of publisher.email_domains || []) {
        const emailDomainNorm = emailDomain.toLowerCase();
        const discoveredDomainNorm = discoveredDomain.toLowerCase();
        
        // Check if domains share common parts (e.g., both contain "substack")
        if (emailDomainNorm.includes('substack') && discoveredDomainNorm.includes('substack')) {
          return { confidence: 0.60, reason: 'Platform domain match' };
        }
      }
    }
  }

  return { confidence: 0, reason: 'No match' };
}

async function linkDiscoveredNewsletters() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  
  console.log('🔗 Linking publishers to discovered newsletters...\n');
  
  // Step 1: Get all publishers
  console.log('Step 1: Fetching publishers...');
  const [publishers] = await bigquery.query({
    query: `
      SELECT 
        publisher_id,
        publisher_name,
        canonical_name,
        primary_email,
        email_domains,
        newsletter_url,
        discovery_id,
        is_discovered
      FROM \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\`
      WHERE is_discovered = false OR is_discovered IS NULL
      ORDER BY publisher_name
    `,
  });
  
  console.log(`   Found ${publishers.length} publishers to check\n`);
  
  // Step 2: Get all discovered newsletters
  console.log('Step 2: Fetching discovered newsletters...');
  const [discovered] = await bigquery.query({
    query: `
      SELECT 
        discovery_id,
        newsletter_name,
        newsletter_url,
        canonical_url,
        platform,
        is_relevant
      FROM \`${PROJECT_ID}.${DATASET_ID}.${DISCOVERED_TABLE}\`
      WHERE is_relevant = true
        AND needs_review = false
      ORDER BY newsletter_name
    `,
  });
  
  console.log(`   Found ${discovered.length} discovered newsletters\n`);
  
  // Step 3: Match publishers to discovered newsletters
  console.log('Step 3: Matching publishers to discovered newsletters...');
  const matches: Array<{
    publisher_id: string;
    discovery_id: string;
    confidence: number;
    reason: string;
  }> = [];
  
  for (const publisher of publishers) {
    let bestMatch: any = null;
    let bestConfidence = 0;
    let bestReason = '';
    
    for (const disc of discovered) {
      const match = calculateMatchConfidence(publisher, disc);
      
      if (match.confidence > bestConfidence) {
        bestConfidence = match.confidence;
        bestReason = match.reason;
        bestMatch = disc;
      }
    }
    
    // Only match if confidence is high (>= 0.70)
    if (bestMatch && bestConfidence >= 0.70) {
      matches.push({
        publisher_id: publisher.publisher_id,
        discovery_id: bestMatch.discovery_id,
        confidence: bestConfidence,
        reason: bestReason,
      });
    }
  }
  
  console.log(`   Found ${matches.length} high-confidence matches\n`);
  
  // Step 4: Update publishers table with matches
  console.log('Step 4: Updating publishers table...');
  const now = new Date().toISOString();
  let updated = 0;
  
  for (const match of matches) {
    try {
      // Get discovery metadata to enrich publisher
      const discovery = discovered.find(d => d.discovery_id === match.discovery_id);
      
      await bigquery.query({
        query: `
          UPDATE \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\`
          SET 
            discovery_id = @discovery_id,
            is_discovered = true,
            matched_at = @matched_at,
            newsletter_url = COALESCE(newsletter_url, @newsletter_url),
            platform = COALESCE(platform, @platform),
            updated_at = @updated_at
          WHERE publisher_id = @publisher_id
        `,
        params: {
          discovery_id: match.discovery_id,
          matched_at: now,
          newsletter_url: discovery?.newsletter_url || null,
          platform: discovery?.platform || null,
          publisher_id: match.publisher_id,
          updated_at: now,
        },
      });
      
      updated++;
    } catch (error: any) {
      console.error(`   ❌ Failed to update publisher ${match.publisher_id}:`, error.message);
    }
  }
  
  console.log(`   ✅ Updated ${updated}/${matches.length} publishers\n`);
  
  // Step 5: Summary
  console.log('📊 Summary:');
  console.log(`   Publishers checked: ${publishers.length}`);
  console.log(`   Discovered newsletters: ${discovered.length}`);
  console.log(`   High-confidence matches: ${matches.length}`);
  console.log(`   Publishers linked: ${updated}`);
  
  // Breakdown by confidence
  const highConf = matches.filter(m => m.confidence >= 0.85).length;
  const mediumConf = matches.filter(m => m.confidence >= 0.70 && m.confidence < 0.85).length;
  
  console.log(`   High confidence (>=0.85): ${highConf}`);
  console.log(`   Medium confidence (0.70-0.84): ${mediumConf}`);
  console.log('');
  
  console.log('✅ Auto-linking complete!\n');
  console.log('Next steps:');
  console.log('  1. Run: npm run publishers:initial-citations (citation analysis)');
  console.log('  2. Run: npm run publishers:initial-scoring (quality scoring)');
}

linkDiscoveredNewsletters()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

