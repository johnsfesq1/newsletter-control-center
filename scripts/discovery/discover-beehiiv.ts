/**
 * Discover Beehiiv newsletters via web search
 * 
 * Strategy: Use Google search with site:beehiiv.com + geopolitics keywords
 * Extract Beehiiv newsletter URLs from search results
 */

import * as dotenv from 'dotenv';
import { DiscoveryResult } from './discover-substack-search';
import { normalizeUrl } from './utils/url-normalizer';

dotenv.config();

// Test queries (targeting Beehiiv with geopolitics keywords)
const TEST_QUERIES = [
  'site:beehiiv.com geopolitics',
  'site:beehiiv.com "foreign policy"',
  'site:beehiiv.com "international relations"',
];

// Full query set (expanded with additional related terms)
const FULL_QUERIES = [
  'site:beehiiv.com geopolitics',
  'site:beehiiv.com "foreign policy"',
  'site:beehiiv.com "international relations"',
  'site:beehiiv.com "macro economics"',
  'site:beehiiv.com macroeconomics',
  'site:beehiiv.com geoeconomics',
  'site:beehiiv.com "national security"',
  'site:beehiiv.com defense',
  'site:beehiiv.com diplomacy',
  'site:beehiiv.com trade',
  'site:beehiiv.com "global news"',
  'site:beehiiv.com "international trade"',
  'site:beehiiv.com "security policy"',
  'site:beehiiv.com "defense policy"',
  'site:beehiiv.com "strategic studies"',
];

/**
 * Search Google with site:beehiiv.com query
 */
async function searchBeehiiv(query: string): Promise<string[]> {
  const API_KEY = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const SEARCH_ENGINE_ID = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
  
  if (!API_KEY || !SEARCH_ENGINE_ID) {
    console.warn('⚠️  Google Custom Search API not configured');
    console.warn(`   API_KEY present: ${!!API_KEY}`);
    console.warn(`   SEARCH_ENGINE_ID present: ${!!SEARCH_ENGINE_ID}`);
    console.warn('   Set GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_ENGINE_ID in .env or Cloud Run env vars');
    return [];
  }
  
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    const data = await response.json();
    
    const urls: string[] = [];
    
    if (data.items) {
      data.items.forEach((item: any) => {
        const url = item.link;
        // Validate and include only Beehiiv URLs
        if (url && isValidBeehiivUrl(url)) {
          // Normalize to newsletter base URL (remove post paths)
          // e.g., https://newsletter.beehiiv.com/p/123 -> https://newsletter.beehiiv.com
          let normalized = url;
          try {
            const urlObj = new URL(url);
            // If it's a post URL (contains /p/), try to extract newsletter base
            if (urlObj.pathname.startsWith('/p/')) {
              // Keep the hostname but remove post path
              normalized = `${urlObj.protocol}//${urlObj.hostname}`;
            }
            urls.push(normalized);
          } catch {
            urls.push(url);
          }
        }
      });
    }
    
    return urls;
  } catch (error: any) {
    console.error(`❌ Google search error for "${query}": ${error.message}`);
    return [];
  }
}

/**
 * Extract newsletter name from Beehiiv URL
 */
function extractNewsletterName(url: string): string {
  // Beehiiv URLs can be:
  // - https://newsletter.beehiiv.com/p/[newsletter-id] (published post)
  // - https://[name].beehiiv.com/... (custom subdomain - newsletter name)
  // - https://[name].beehiiv.com/p/... (custom subdomain with post)
  // - https://www.beehiiv.com/subscribe/[name] (subscribe page)
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Check for custom subdomain (most common pattern)
    // e.g., "geopoliticsweekly.beehiiv.com"
    const parts = hostname.split('.');
    if (parts.length >= 3 && parts[parts.length - 2] === 'beehiiv') {
      const subdomain = parts[0];
      if (subdomain !== 'newsletter' && subdomain !== 'www' && subdomain !== 'beehiiv') {
        // Capitalize and format
        return subdomain
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
    }
    
    // Check path for subscribe pages
    // e.g., /subscribe/geopolitics-weekly
    const pathMatch = urlObj.pathname.match(/\/subscribe\/([^/]+)/);
    if (pathMatch) {
      return pathMatch[1]
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
    
    // Check path for other patterns
    const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
    if (pathParts.length > 0) {
      // Skip common paths
      const skipPaths = ['p', 'c', 'subscribe', 'archive', 'publication'];
      const name = pathParts.find(p => !skipPaths.includes(p) && p.length > 2);
      if (name) {
        return name
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
    }
    
    return 'Unknown Beehiiv Newsletter';
  } catch {
    return 'Unknown Beehiiv Newsletter';
  }
}

/**
 * Validate Beehiiv URL format
 */
function isValidBeehiivUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('beehiiv.com');
  } catch {
    return false;
  }
}

/**
 * Discover Beehiiv newsletters via web search
 */
async function discoverBeehiiv(testMode: boolean = true): Promise<DiscoveryResult[]> {
  console.log('🚀 Starting Beehiiv discovery via web search...\n');
  
  const queries = testMode ? TEST_QUERIES : FULL_QUERIES;
  const allResults: DiscoveryResult[] = [];
  const seenUrls = new Set<string>();
  
  const API_KEY = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const SEARCH_ENGINE_ID = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
  
  if (!API_KEY || !SEARCH_ENGINE_ID) {
    console.log('⚠️  Google Custom Search API not configured');
    console.log('   Set GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_ENGINE_ID in .env');
    console.log('   Skipping Beehiiv discovery...\n');
    return [];
  }
  
  console.log(`📊 Running in ${testMode ? 'TEST' : 'FULL'} mode`);
  console.log(`   Queries: ${queries.length}\n`);
  
  for (const query of queries) {
    console.log(`🔍 Searching: "${query}"`);
    
    const urls = await searchBeehiiv(query);
    console.log(`   Found ${urls.length} Beehiiv URLs`);
    
    // Process URLs
    let newCount = 0;
    urls.forEach(url => {
      const normalized = normalizeUrl(url);
      if (seenUrls.has(normalized)) return;
      seenUrls.add(normalized);
      newCount++;
      
      const name = extractNewsletterName(url);
      
      allResults.push({
        newsletter_name: name,
        newsletter_url: normalized,
        platform: 'beehiiv',
        discovery_method: 'web_search',
        discovery_source: 'google',
        metadata: {
          search_query: query,
        },
      });
      
      console.log(`   ✅ ${name}`);
      console.log(`      ${normalized}`);
    });
    
    console.log(`   Added ${newCount} new newsletters\n`);
    
    // Rate limit between searches (respect Google API limits)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n✅ Beehiiv discovery complete!`);
  console.log(`   Total discovered: ${allResults.length} unique newsletters`);
  
  if (testMode && allResults.length < 10) {
    console.log(`\n⚠️  Found ${allResults.length} newsletters (less than 10)`);
    console.log(`   Recommendation: Consider manual research and subscription`);
  }
  
  console.log('');
  
  return allResults;
}

// Run if called directly
if (require.main === module) {
  // Run in test mode only if explicitly set to 'true', otherwise full mode
  const testMode = process.env.BEEHIIV_TEST_MODE === 'true';
  
  discoverBeehiiv(testMode)
    .then((results) => {
      console.log('📊 Summary:');
      console.log(`   Total: ${results.length} newsletters`);
      console.log(`   Queries tested: ${testMode ? TEST_QUERIES.length : FULL_QUERIES.length}\n`);
      
      if (results.length > 0) {
        console.log('📋 Discovered newsletters:');
        results.forEach((r, idx) => {
          console.log(`   ${idx + 1}. ${r.newsletter_name}`);
          console.log(`      ${r.newsletter_url}`);
        });
      }
      
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Discovery failed:', error);
      process.exit(1);
    });
}

export { discoverBeehiiv };

