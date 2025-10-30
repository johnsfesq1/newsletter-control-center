/**
 * Newsletter Content Cleaning Utility
 * 
 * This module provides functions to clean newsletter content by:
 * - Removing tracking URLs and email artifacts
 * - Stripping HTML tags and preserving text content
 * - Removing sponsored/advertisement content
 * - Fixing spacing issues for readability
 * - Selecting the best content source (body_text vs body_html)
 */

/**
 * Calculate content weight to determine the best content source
 */
export function calculateContentWeight(content: string): number {
  if (!content || content.trim().length === 0) return 0;
  
  let weight = content.length;
  
  // Penalize content that's mostly URLs
  const urlPattern = /https?:\/\/[^\s]+/g;
  const urls = content.match(urlPattern) || [];
  const urlLength = urls.reduce((sum, url) => sum + url.length, 0);
  
  if (urlLength > content.length * 0.5) {
    weight = weight * 0.1;
  }
  
  // Bonus for having proper sentence structure
  if (content.match(/[.!?]\s+[A-Z]/g)) {
    weight = weight * 1.2;
  }
  
  return weight;
}

/**
 * Strip HTML tags and decode entities
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  
  // Remove style/script blocks
  let text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ');
  
  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  
  // Add spaces around ALL tags before removing them
  text = text.replace(/</g, ' <').replace(/>/g, '> ');
  
  // Remove all HTML tags
  text = text.replace(/<[^>]*>/g, ' ');
  
  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, ' — ')
    .replace(/&ndash;/g, ' – ')
    .replace(/&hellip;/g, '...')
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&#\d+;/g, ' ')
    .replace(/&[a-z]+;/g, ' ');
  
  // Normalize whitespace (multiple spaces to single space)
  text = text.replace(/[ \t\n\r]+/g, ' ').trim();
  
  return text;
}

/**
 * Clean newsletter content by removing artifacts and fixing spacing
 */
export function cleanNewsletterContent(content: string): string {
  if (!content) return '';
  
  return content
    // Remove sponsored content
    .replace(/A message from [^.\n]{0,100}\./gim, '')
    .replace(/Presented by [^.\n]{0,100}\./gim, '')
    .replace(/Sponsored by [^.\n]{0,100}\./gim, '')
    .replace(/In partnership with [^.\n]{0,100}\./gim, '')
    .replace(/Advertisement[\s\S]{0,200}\.?/gim, '')
    .replace(/[A-Z][a-z]+'s new local partnership.*?See how\./gims, '')
    .replace(/Improving public transportation requires partnership.*?Learn more\./gims, '')
    .replace(/Want more [A-Z][a-z]+ content\? Check out.*?and more!/gims, '')
    .replace(/Want to help [A-Z][a-z]+ grow\? Become a member\./gims, '')
    .replace(/Support your local newsroom.*?and more!/gims, '')
    .replace(/Sponsored event listings.*?(?=\d\.|$)/gims, '')
    .replace(/Advertise with us\..*?(?=\d\.|$)/gims, '')
    .replace(/Don't miss out.*?(?=\d\.|$)/gims, '')
    .replace(/Learn how to ride\./gim, '')
    .replace(/See how\./gim, '')
    .replace(/Learn more\./gim, '')
    .replace(/Sign up now to get.*?inbox\./gims, '')
    .replace(/To stop receiving.*?preferences\./gims, '')
    .replace(/Was this email forwarded.*?preferences\./gims, '')
    .replace(/Interested in advertising.*?axios\.com\./gims, '')
    .replace(/A message from [^.]*\./gims, '')
    .replace(/Presented by [^.]*\./gims, '')
    .replace(/Sponsored by [^.]*\./gims, '')
    .replace(/Public-private partnerships.*?transit networks.*?Learn more\./gims, '')
    .replace(/Want to help.*?Become a member\./gims, '')
    .replace(/Axios thanks our partners.*?newsletters\./gims, '')
    .replace(/Advertise with us\..*$/gims, '')
    .replace(/Axios, PO Box.*$/gims, '')
    .replace(/To stop receiving.*$/gims, '')
    .replace(/unsubscribe or manage.*$/gims, '')
    .replace(/Want more.*?more!.*$/gims, '')
    
    // Remove image references
    .replace(/View image:.*?(?=\n|$)/gim, '')
    .replace(/\[image:.*?\]/gim, '')
    .replace(/<img[^>]*>/gim, '')
    .replace(/Image source.*?(?=\n|$)/gim, '')
    
    // Remove "View this post" links
    .replace(/View this post on the web at\s+https?:\/\/[^\s]+/gim, '')
    .replace(/View this email in your browser.*?(?=\n|$)/gim, '')
    .replace(/Read online.*?(?=\n|$)/gim, '')
    
    // Remove tracking URLs
    .replace(/https?:\/\/(newsletter-tracking|tracking|click-tracking|link-tracking|redirect-tracking)\.[^\s]+/gim, '')
    .replace(/https?:\/\/[a-zA-Z0-9.-]*\.com\/redirect[^\s]+/gim, '')
    .replace(/https?:\/\/(t\.co|bit\.ly|tinyurl\.com|ow\.ly|buff\.ly|goo\.gl)[^\s]+/gim, '')
    .replace(/https?:\/\/email\.(semafor|axios|bloomberg)\.[^\s]+/gim, '')
    .replace(/https?:\/\/mailchi\.mp[^\s]+/gim, '')
    
    // Remove very long URLs (over 60 chars, likely tracking)
    .replace(/https?:\/\/[^\s]{60,}/gim, '')
    
    // Remove unsubscribe boilerplate
    .replace(/Unsubscribe From This List\s+https?:\/\/[^\s]+/gim, '')
    .replace(/\[Unsubscribe\]/gim, '')
    .replace(/\[Update preferences\]/gim, '')
    .replace(/\[View in browser\]/gim, '')
    .replace(/\[Forward to a friend\]/gim, '')
    .replace(/This email was sent to.*?(?=\n|$)/gim, '')
    .replace(/You received this email because.*?(?=\n|$)/gim, '')
    .replace(/To unsubscribe.*?(?=\n|$)/gim, '')
    .replace(/If you no longer wish to receive.*?(?=\n|$)/gim, '')
    .replace(/Click here to unsubscribe.*?(?=\n|$)/gim, '')
    .replace(/Tracking pixel.*?(?=\n|$)/gim, '')
    
    // Remove email separators
    .replace(/-{10,}/g, '')
    .replace(/\*{10,}/g, '')
    .replace(/\u2014{3,}/g, '')
    .replace(/Presented by:.*?(?=\n\n|\n[A-Z][a-z])/gim, '')
    .replace(/Presented by\n.*?(?=\n\n|\n[A-Z][a-z])/gim, '')
    .replace(/In partnership with.*?(?=\n\n|\n[A-Z][a-z])/gim, '')
    
    // Clean up HTML entities
    .replace(/&zwnj;/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, ' · ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/g, ' ')
    
    // Remove orphaned artifacts
    .replace(/\[here\]/gim, '')
    .replace(/\[.*?\]\(\s*\)/gim, '')
    .replace(/\(Caption:\)/gim, '')
    .replace(/^(\d+|\d+[A-Z]|\d+\.)$/gm, '')
    .replace(/^View in browser$/gm, '')
    .replace(/^Sign up here.*$/gm, '')
    .replace(/^Don't keep us a secret.*$/gm, '')
    .replace(/Sponsorship has no influence.*$/gim, '')
    .replace(/Was this email forwarded to you\?.*$/gim, '')
    .replace(/Follow [A-Z][a-z]+ on social media:.*$/gim, '')
    
    // Add spacing between words
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([.!?])([A-Z])/g, '$1 $2')
    .replace(/([.!?])([a-z])/g, '$1 $2')
    .replace(/([.!?])([0-9])/g, '$1 $2')
    
    // Fix punctuation spacing
    .replace(/ : /g, ': ')
    .replace(/ \. /g, '. ')
    .replace(/ , /g, ', ')
    .replace(/ ; /g, '; ')
    .replace(/ \( /g, ' (')
    .replace(/ \) /g, ') ')
    .replace(/ \[ /g, ' [')
    .replace(/ \] /g, '] ')
    
    // Fix specific spacing issues
    .replace(/(\d+) \. (\d)/g, '$1.$2')
    .replace(/(\d+) \./g, '$1.')
    .replace(/\. (\d)/g, '.$1')
    .replace(/([a-z]) \. com/gi, '$1.com')
    .replace(/([a-z]) \. ([a-z])/gi, '$1.$2')
    .replace(/Data: ([A-Z][a-z]+) \. com/gi, 'Data: $1.com')
    
    // Clean up final whitespace
    .replace(/ {2,}/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .replace(/^\s+|\s+$/gm, '')
    .trim();
}

/**
 * Get the best cleaned content from a newsletter
 * Automatically selects between body_text and body_html based on content quality
 */
export function getBestCleanedContent(bodyText: string, bodyHtml: string): string {
  const textWeight = calculateContentWeight(bodyText);
  const htmlWeight = calculateContentWeight(stripHtml(bodyHtml));
  
  // Choose the field with higher weight
  const bestContent = htmlWeight > textWeight ? stripHtml(bodyHtml) : bodyText;
  
  // Apply cleaning
  return cleanNewsletterContent(bestContent);
}
