/**
 * Discover newsletters via recommendation scraping
 * 
 * Strategy:
 * 1. Extract Substack URLs from existing corpus (646 publishers)
 * 2. Visit each newsletter page
 * 3. Extract "recommended newsletters" section
 * 4. Discover 1 level deep (recommendations of recommendations)
 */

import * as dotenv from 'dotenv';
import puppeteer, { Browser, Page } from 'puppeteer';
import { BigQuery } from '@google-cloud/bigquery';
import { RateLimiter } from './utils/rate-limiter';
import { normalizeUrl, extractDomain } from './utils/url-normalizer';
import { DiscoveryResult } from './discover-substack-search';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const MESSAGES_TABLE = 'messages';

/**
 * Get Substack URLs from existing corpus
 */
async function getSubstackUrlsFromCorpus(bigquery: BigQuery, limit?: number): Promise<string[]> {
  console.log('📊 Extracting Substack URLs from existing corpus...\n');
  
  const limitClause = limit ? `LIMIT ${limit}` : '';
  
  const query = `
    SELECT DISTINCT
      publisher_name,
      from_domain,
      sender
    FROM \`${PROJECT_ID}.${DATASET_ID}.${MESSAGES_TABLE}\`
    WHERE 
      from_domain LIKE '%substack.com%'
      OR sender LIKE '%substack.com%'
    ORDER BY publisher_name
    ${limitClause}
  `;
  
  const [rows] = await bigquery.query(query);
  
  const urls: string[] = [];
  const seen = new Set<string>();
  
  rows.forEach((row: any) => {
    const sender = row.sender || '';
    const domain = row.from_domain || '';
    
    // Extract newsletter URL from email address
    // Format: newsletter-name@newsletter-name.substack.com or newsletter@substack.com
    if (sender.includes('@')) {
      const emailParts = sender.split('@');
      const newsletterName = emailParts[0];
      const emailDomain = emailParts[1];
      
      if (emailDomain.includes('substack.com')) {
        // Format: newsletter-name.substack.com
        const url = `https://${newsletterName}.substack.com`;
        const normalized = normalizeUrl(url);
        if (!seen.has(normalized)) {
          seen.add(normalized);
          urls.push(url);
        }
      }
    }
    
    // Also try to construct from domain if it's a subdomain
    if (domain.includes('.substack.com')) {
      const url = `https://${domain}`;
      const normalized = normalizeUrl(url);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        urls.push(url);
      }
    }
  });
  
  console.log(`   Found ${urls.length} unique Substack newsletter URLs\n`);
  
  return urls;
}

/**
 * Extract recommendations from a newsletter page
 */
async function extractRecommendations(
  page: Page,
  newsletterUrl: string
): Promise<Array<{ name: string; url: string }>> {
  const recommendations: Array<{ name: string; url: string }> = [];
  
  try {
    // Wait for page to load
    await page.waitForSelector('body', { timeout: 10000 });
    // Reduced wait time - 2 seconds should be enough
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Look for recommendations section
    // Common patterns:
    // - "Recommended newsletters"
    // - "Also subscribe to"
    // - "Newsletters I read"
    // - Links in sidebar or footer
    
    const found = await page.evaluate(() => {
      const results: Array<{ name: string; url: string }> = [];
      const seen = new Set<string>();
      
      // Strategy 1: Look for sections with "recommend" or "subscribe" text
      const allSections = Array.from(document.querySelectorAll('section, div, aside'));
      
      for (const section of allSections) {
        const text = section.textContent?.toLowerCase() || '';
        
        if (text.includes('recommend') || 
            text.includes('also subscribe') || 
            text.includes('newsletters') ||
            text.includes('read next')) {
          
          // Find links in this section
          const links = section.querySelectorAll('a[href*="substack.com"]');
          
          links.forEach(link => {
            const href = (link as HTMLAnchorElement).href;
            if (!href) return;
            
            // Extract newsletter base URL
            let newsletterUrl = href.split('?')[0]; // Remove query params
            
            // Handle post URLs
            if (newsletterUrl.includes('/p/')) {
              newsletterUrl = newsletterUrl.split('/p/')[0];
            }
            
            // Only include actual newsletter URLs
            if (!newsletterUrl.match(/substack\.com\/@|\.substack\.com/)) return;
            if (newsletterUrl.includes('/search') || newsletterUrl.includes('/browse')) return;
            
            // Normalize
            if (!newsletterUrl.endsWith('/')) {
              newsletterUrl += '/';
            }
            
            const normalized = newsletterUrl.toLowerCase();
            if (seen.has(normalized)) return;
            seen.add(normalized);
            
            // Extract name
            let name = link.textContent?.trim() || '';
            if (!name || name.length < 3) {
              // Try to get from nearby heading or parent
              const parent = link.closest('[class*="card"], [class*="item"]');
              if (parent) {
                const titleElement = parent.querySelector('h2, h3, [class*="title"]');
                name = titleElement?.textContent?.trim() || name;
              }
            }
            
            // Extract from URL if needed
            if (!name || name.length < 3) {
              const match = newsletterUrl.match(/([^/]+)\.substack\.com/);
              if (match) {
                name = match[1].replace(/-/g, ' ');
              }
            }
            
            results.push({
              name: name || 'Unknown',
              url: newsletterUrl,
            });
          });
        }
      }
      
      // Strategy 2: Look for newsletter links in sidebar/aside
      const sidebars = document.querySelectorAll('aside, [class*="sidebar"], [class*="recommend"]');
      sidebars.forEach(sidebar => {
        const links = sidebar.querySelectorAll('a[href*="substack.com"]');
        links.forEach(link => {
          const href = (link as HTMLAnchorElement).href;
          if (!href) return;
          
          let newsletterUrl = href.split('?')[0];
          if (newsletterUrl.includes('/p/')) {
            newsletterUrl = newsletterUrl.split('/p/')[0];
          }
          
          if (!newsletterUrl.match(/substack\.com\/@|\.substack\.com/)) return;
          if (newsletterUrl.includes('/search') || newsletterUrl.includes('/browse')) return;
          
          if (!newsletterUrl.endsWith('/')) {
            newsletterUrl += '/';
          }
          
          const normalized = newsletterUrl.toLowerCase();
          if (!seen.has(normalized)) {
            seen.add(normalized);
            
            let name = link.textContent?.trim() || '';
            if (!name || name.length < 3) {
              const match = newsletterUrl.match(/([^/]+)\.substack\.com/);
              if (match) {
                name = match[1].replace(/-/g, ' ');
              }
            }
            
            results.push({
              name: name || 'Unknown',
              url: newsletterUrl,
            });
          }
        });
      });
      
      return results;
    });
    
    return found;
    
  } catch (error: any) {
    console.error(`   ⚠️  Error extracting recommendations: ${error.message}`);
    return [];
  }
}

/**
 * Discover newsletters via recommendation scraping
 */
async function discoverSubstackRecommendations(
  testMode: boolean = false,
  testLimit: number = 10
): Promise<DiscoveryResult[]> {
  console.log('🚀 Starting recommendation scraping discovery...\n');
  
  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  
  // Get Substack URLs from corpus
  // For full discovery, scrape ALL newsletters (no limit)
  // For test mode, use the test limit
  const substackUrls = await getSubstackUrlsFromCorpus(
    bigquery,
    testMode ? testLimit : undefined  // undefined = no limit = ALL newsletters
  );
  
  if (substackUrls.length === 0) {
    console.log('⚠️  No Substack URLs found in corpus\n');
    return [];
  }
  
  if (testMode) {
    console.log(`📊 Will scrape recommendations from ${substackUrls.length} newsletters (TEST MODE: limited to ${testLimit})\n`);
  } else {
    console.log(`📊 Will scrape recommendations from ${substackUrls.length} newsletters (FULL MODE: all newsletters)\n`);
  }
  
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // Prevents memory issues
      '--disable-gpu', // Helps with stability
    ],
  });
  
  const rateLimiter = new RateLimiter(2000); // 2 seconds between requests
  const allResults: DiscoveryResult[] = [];
  const seenUrls = new Set<string>();
  
  let processed = 0;
  let successful = 0;
  let failed = 0;
  
  // Add overall timeout for the entire scraping operation (2 hours max)
  const overallTimeout = setTimeout(() => {
    console.error('\n⏱️  Overall timeout reached (2 hours). Stopping recommendation scraping.');
    throw new Error('Recommendation scraping timeout');
  }, 2 * 60 * 60 * 1000); // 2 hours
  
  try {
    for (const newsletterUrl of substackUrls) {
      processed++;
      
      // Show progress every 10 newsletters
      if (processed % 10 === 0) {
        console.log(`\n📊 Progress: ${processed}/${substackUrls.length} (${successful} successful, ${failed} failed)`);
      }
      
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      // Set page timeout
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);
      
      try {
        await rateLimiter.waitForDomain(newsletterUrl);
        
        console.log(`\n📖 [${processed}/${substackUrls.length}] ${newsletterUrl}`);
        
        // Wrap entire page operation in a timeout to prevent infinite hangs
        const pageOperation = (async () => {
          // Use domcontentloaded instead of networkidle2 to avoid hanging
          // networkidle2 can hang forever if page keeps making requests
          await page.goto(newsletterUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 20000, // Reduced timeout
          });
          
          // Wait for dynamic content, but with a max timeout
          await Promise.race([
            new Promise(resolve => setTimeout(resolve, 5000)), // Max 5 second wait
            page.waitForSelector('body', { timeout: 10000 }),
          ]);
          
          // Extract recommendations with timeout
          return await extractRecommendations(page, newsletterUrl);
        })();
        
        // Overall timeout for entire page operation (30 seconds total)
        const recommendations = await Promise.race([
          pageOperation,
          new Promise<Array<{ name: string; url: string }>>((_, reject) => 
            setTimeout(() => reject(new Error('Page operation timeout after 30s')), 30000)
          ),
        ]);
        
        if (recommendations.length > 0) {
          successful++;
          console.log(`   ✅ Found ${recommendations.length} recommendations`);
          
          // Add to results
          recommendations.forEach(rec => {
            const normalized = normalizeUrl(rec.url);
            if (!seenUrls.has(normalized)) {
              seenUrls.add(normalized);
              
              allResults.push({
                newsletter_name: rec.name,
                newsletter_url: rec.url,
                platform: 'substack',
                discovery_method: 'substack_recommendations',
                discovery_source: newsletterUrl,
                metadata: {
                  recommended_by: newsletterUrl,
                },
              });
            }
          });
        } else {
          console.log(`   ℹ️  No recommendations found (may not have recommendations section)`);
        }
        
      } catch (error: any) {
        failed++;
        console.error(`   ❌ Error: ${error.message}`);
      } finally {
        await page.close();
      }
      
      // Small delay between newsletters
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } finally {
    clearTimeout(overallTimeout);
    await browser.close();
  }
  
  console.log(`\n✅ Recommendation scraping complete!`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Successful: ${successful}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Unique newsletters discovered: ${allResults.length}\n`);
  
  return allResults;
}

// Run if called directly
if (require.main === module) {
  const isTestMode = process.env.TEST_MODE === 'true';
  const testLimit = parseInt(process.env.TEST_LIMIT || '5', 10);
  
  discoverSubstackRecommendations(isTestMode, testLimit)
    .then((results) => {
      console.log('📊 Sample results:');
      results.slice(0, 10).forEach((r, idx) => {
        console.log(`   ${idx + 1}. ${r.newsletter_name}`);
        console.log(`      ${r.newsletter_url}`);
        console.log(`      Recommended by: ${r.discovery_source}`);
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

export { discoverSubstackRecommendations };

