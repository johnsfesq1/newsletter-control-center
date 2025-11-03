/**
 * Discover newsletters via web search (Google/Perplexity)
 * 
 * Strategy: Search for "substack geopolitics newsletter" etc.
 * Extract newsletter URLs from search results
 */

import * as dotenv from 'dotenv';
import { DiscoveryResult } from './discover-substack-search';
import { normalizeUrl } from './utils/url-normalizer';

dotenv.config();

// General newsletter search queries (entire web, all platforms)
const GENERAL_QUERIES = [
  'geopolitics newsletter',
  'foreign policy newsletter',
  'international relations newsletter',
  'macro economics newsletter',
  'macroeconomics newsletter',
  'defense newsletter',
  'national security newsletter',
  'geoeconomics newsletter',
  'diplomacy newsletter',
  'strategic studies newsletter',
];

// Platform-specific queries
const PLATFORM_QUERIES = [
  // Ghost platform
  'site:ghost.io geopolitics',
  'site:ghost.io "foreign policy"',
  '"powered by Ghost" geopolitics newsletter',
  '"powered by Ghost" foreign policy newsletter',
  
  // MailChimp (harder to search, but try these patterns)
  'site:mailchimp.com geopolitics',
  '"Mailchimp" geopolitics newsletter',
  
  // ConvertKit
  'site:convertkit.com geopolitics',
  '"ConvertKit" geopolitics newsletter',
  
  // TinyLetter
  '"tinyletter.com" geopolitics',
  '"tinyletter.com" foreign policy',
  
  // Revue (now defunct, but might find archives)
  'site:revue.co geopolitics',
  
  // Custom domains with newsletter indicators
  '"subscribe" geopolitics newsletter',
  '"newsletter" geopolitics site:.com',
  '"newsletter" foreign policy site:.com',
];

/**
 * Extract newsletter URL from search result
 * Handles various patterns: direct newsletter pages, subscribe pages, blog posts, etc.
 */
function extractNewsletterUrl(url: string, title?: string, snippet?: string): string | null {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const path = urlObj.pathname.toLowerCase();
    
    // Skip social media and non-newsletter platforms
    const socialMediaDomains = [
      'linkedin.com', 'linkedin.co',
      'facebook.com', 'fb.com',
      'twitter.com', 'x.com',
      'instagram.com',
      'youtube.com',
      'tiktok.com',
      'reddit.com',
      'medium.com',
      'pinterest.com'
    ];
    
    for (const domain of socialMediaDomains) {
      if (hostname.includes(domain)) {
        return null; // Skip social media
      }
    }
    
    // Skip academic/research domains unless they have clear newsletter indicators
    if (hostname.endsWith('.edu') || hostname.endsWith('.ac.uk') || hostname.endsWith('.ac.za')) {
      // Only include if path has newsletter indicators
      if (!path.includes('/newsletter') && !path.includes('/subscribe') && 
          !(snippet && snippet.toLowerCase().includes('newsletter'))) {
        return null;
      }
    }
    
    // Skip PDF files
    if (path.endsWith('.pdf') || url.toLowerCase().endsWith('.pdf')) {
      return null;
    }
    
    // Skip obvious non-newsletter pages
    if (path.includes('/tag/') || path.includes('/category/') || path.includes('/author/')) {
      return null;
    }
    
    // Known newsletter platforms - extract base URL
    if (hostname.includes('substack.com')) {
      // Extract substack newsletter base URL
      const match = url.match(/(https?:\/\/[^/]+\.substack\.com)/);
      return match ? match[1] : url;
    }
    
    if (hostname.includes('beehiiv.com')) {
      // Extract beehiiv newsletter base URL
      const match = url.match(/(https?:\/\/[^/]+\.beehiiv\.com)/);
      return match ? match[1] : url;
    }
    
    if (hostname.includes('ghost.org') || hostname.includes('ghost.io')) {
      // Ghost sites - keep the domain
      return `${urlObj.protocol}//${hostname}`;
    }
    
    // For custom domains, look for newsletter indicators in path or query
    // Subscribe pages, newsletter pages, etc.
    if (path.includes('/subscribe') || path.includes('/newsletter') || 
        path.includes('/signup') || path.includes('/join') ||
        (snippet && snippet.toLowerCase().includes('newsletter'))) {
      return url;
    }
    
    // Blog posts or articles - try to find the newsletter home page
    // Remove article-specific paths like /p/, /posts/, /article/, etc.
    const articlePaths = ['/p/', '/posts/', '/article/', '/articles/', '/blog/'];
    for (const articlePath of articlePaths) {
      if (path.startsWith(articlePath)) {
        // Return base domain - newsletter home page is usually at root or /newsletter
        return `${urlObj.protocol}//${hostname}`;
      }
    }
    
    // Default: return the URL as-is for manual review
    return url;
  } catch {
    return url; // If URL parsing fails, return as-is
  }
}

/**
 * Search via Google Custom Search API
 */
async function searchGoogle(query: string): Promise<string[]> {
  const API_KEY = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const SEARCH_ENGINE_ID = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
  
  if (!API_KEY || !SEARCH_ENGINE_ID) {
    console.warn('⚠️  Google Custom Search API not configured');
    console.warn('   Set GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_ENGINE_ID in .env');
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
        const title = item.title;
        const snippet = item.snippet;
        
        // Extract newsletter URL (handles all platforms and custom domains)
        const newsletterUrl = extractNewsletterUrl(url, title, snippet);
        if (newsletterUrl) {
          urls.push(newsletterUrl);
        }
      });
    }
    
    return urls;
  } catch (error: any) {
    console.error(`❌ Google search error: ${error.message}`);
    return [];
  }
}

/**
 * Search via Perplexity API (if available)
 */
async function searchPerplexity(query: string): Promise<string[]> {
  const API_KEY = process.env.PERPLEXITY_API_KEY;
  
  if (!API_KEY) {
    console.warn('⚠️  Perplexity API not configured');
    console.warn('   Set PERPLEXITY_API_KEY in .env');
    return [];
  }
  
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'user',
            content: `Find newsletters about ${query}. Return a list of newsletter URLs (Substack, Beehiiv, Ghost). Return only URLs, one per line.`,
          },
        ],
      }),
    });
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Extract URLs from response
    const urlRegex = /https?:\/\/[^\s\)]+/g;
    const urls = content.match(urlRegex) || [];
    
    // Filter and extract newsletter URLs (all platforms)
    const newsletterUrls: string[] = [];
    urls.forEach((url: string) => {
      // Clean up URL (remove trailing punctuation)
      const cleanUrl = url.replace(/[.,;:!?]+$/, '');
      const extracted = extractNewsletterUrl(cleanUrl);
      if (extracted) {
        newsletterUrls.push(extracted);
      }
    });
    
    return newsletterUrls;
  } catch (error: any) {
    console.error(`❌ Perplexity search error: ${error.message}`);
    return [];
  }
}

/**
 * Determine platform from URL
 */
function detectPlatform(url: string): string {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('substack.com')) return 'substack';
  if (urlLower.includes('beehiiv.com')) return 'beehiiv';
  if (urlLower.includes('ghost.org') || urlLower.includes('ghost.io')) return 'ghost';
  if (urlLower.includes('mailchimp.com')) return 'mailchimp';
  if (urlLower.includes('convertkit.com')) return 'convertkit';
  if (urlLower.includes('tinyletter.com')) return 'tinyletter';
  if (urlLower.includes('revue.co')) return 'revue';
  if (urlLower.includes('buttondown.email')) return 'buttondown';
  if (urlLower.includes('sendy.co')) return 'sendy';
  
  return 'custom';
}

/**
 * Extract newsletter name from URL
 */
function extractNewsletterName(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Substack
    const substackMatch = hostname.match(/([^.]+)\.substack\.com/);
    if (substackMatch) {
      return substackMatch[1].replace(/-/g, ' ');
    }
    
    // Beehiiv
    const beehiivMatch = hostname.match(/([^.]+)\.beehiiv\.com/);
    if (beehiivMatch && beehiivMatch[1] !== 'newsletter' && beehiivMatch[1] !== 'www') {
      return beehiivMatch[1].replace(/-/g, ' ');
    }
    
    // Ghost - domain name or path
    if (hostname.includes('ghost')) {
      const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
      if (pathParts.length > 0 && pathParts[0] !== 'p' && pathParts[0] !== 'tag') {
        return pathParts[0].replace(/-/g, ' ');
      }
      // Use domain name without TLD
      const domainMatch = hostname.match(/([^.]+)\.[^.]+$/);
      if (domainMatch && domainMatch[1] !== 'www') {
        return domainMatch[1].replace(/-/g, ' ');
      }
    }
    
    // Custom domain - use domain name
    const domainMatch = hostname.match(/([^.]+)\.[^.]+$/);
    if (domainMatch && domainMatch[1] !== 'www') {
      return domainMatch[1].replace(/-/g, ' ');
    }
    
    return 'Unknown Newsletter';
  } catch {
    return 'Unknown Newsletter';
  }
}

/**
 * Discover newsletters via web search
 */
async function discoverViaWebSearch(): Promise<DiscoveryResult[]> {
  console.log('🚀 Starting comprehensive web search discovery...\n');
  console.log('   Searching entire web for newsletters (all platforms + custom domains)\n');
  
  const allResults: DiscoveryResult[] = [];
  const seenUrls = new Set<string>();
  
  // Try Google first, fallback to Perplexity
  const useGoogle = !!process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const usePerplexity = !!process.env.PERPLEXITY_API_KEY;
  
  if (!useGoogle && !usePerplexity) {
    console.log('⚠️  No search API configured');
    console.log(`   GOOGLE_CUSTOM_SEARCH_API_KEY present: ${!!process.env.GOOGLE_CUSTOM_SEARCH_API_KEY}`);
    console.log(`   PERPLEXITY_API_KEY present: ${!!process.env.PERPLEXITY_API_KEY}`);
    console.log('   Options:');
    console.log('   1. Set GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_ENGINE_ID');
    console.log('   2. Set PERPLEXITY_API_KEY');
    console.log('   Skipping web search discovery...\n');
    return [];
  }
  
  // Combine general and platform-specific queries
  const allQueries = [...GENERAL_QUERIES, ...PLATFORM_QUERIES];
  
  console.log(`📊 Total queries: ${allQueries.length} (${GENERAL_QUERIES.length} general + ${PLATFORM_QUERIES.length} platform-specific)\n`);
  
  for (let i = 0; i < allQueries.length; i++) {
    const query = allQueries[i];
    console.log(`🔍 [${i + 1}/${allQueries.length}] Searching: "${query}"`);
    
    let urls: string[] = [];
    
    if (useGoogle) {
      urls = await searchGoogle(query);
      console.log(`   Google: Found ${urls.length} newsletter URLs`);
    }
    
    if (usePerplexity && urls.length === 0) {
      urls = await searchPerplexity(query);
      console.log(`   Perplexity: Found ${urls.length} newsletter URLs`);
    }
    
    // Process URLs
    let newCount = 0;
    urls.forEach(url => {
      const normalized = normalizeUrl(url);
      if (seenUrls.has(normalized)) return;
      seenUrls.add(normalized);
      newCount++;
      
      const platform = detectPlatform(url);
      const name = extractNewsletterName(url);
      
      allResults.push({
        newsletter_name: name,
        newsletter_url: normalized,
        platform,
        discovery_method: 'web_search',
        discovery_source: useGoogle ? 'google' : 'perplexity',
        metadata: {
          search_query: query,
        },
      });
      
      console.log(`   ✅ ${name} (${platform})`);
      console.log(`      ${normalized}`);
    });
    
    console.log(`   Added ${newCount} new newsletters\n`);
    
    // Rate limit between searches (respect API limits)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n✅ Web search discovery complete!`);
  console.log(`   Total discovered: ${allResults.length} unique newsletters`);
  console.log(`   Platforms: ${[...new Set(allResults.map(r => r.platform))].join(', ')}\n`);
  
  return allResults;
}

// Run if called directly
if (require.main === module) {
  discoverViaWebSearch()
    .then((results) => {
      console.log('📊 Sample results:');
      results.slice(0, 10).forEach((r, idx) => {
        console.log(`   ${idx + 1}. ${r.newsletter_name} (${r.platform})`);
        console.log(`      ${r.newsletter_url}`);
      });
      if (results.length > 10) {
        console.log(`   ... and ${results.length - 10} more`);
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Discovery failed:', error);
      process.exit(1);
    });
}

export { discoverViaWebSearch };

