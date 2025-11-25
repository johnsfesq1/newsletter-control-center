/**
 * Briefing Engine - Generator
 * 
 * The main orchestrator for generating daily intelligence briefings.
 * Implements a Map-Reduce pattern:
 * 
 * 1. Delta Query: Find emails since last briefing (or 24h fallback)
 * 2. Map Phase: Extract insights from each email (Gemini Flash)
 * 3. Reduce Phase: Synthesize into briefing (Gemini Pro)
 * 4. Storage: Save to BigQuery
 * 
 * CRITICAL: BigQuery uses 'US' location, Vertex AI uses 'us-central1'
 */

import { BigQuery } from '@google-cloud/bigquery';
import { v4 as uuidv4 } from 'uuid';
import type { 
  RawEmail, 
  InsightObject,
  BriefingContent, 
  BriefingPipelineOptions, 
  BriefingPipelineResult,
  StoredBriefing,
  BriefingArchiveItem
} from './types';

// Configuration
const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_production';
const BIGQUERY_LOCATION = 'US';           // CRITICAL: Must be 'US' for BigQuery
const VERTEX_LOCATION = 'us-central1';    // Vertex AI regional endpoint

// Model versions (must match available Vertex AI models)
const FLASH_MODEL = 'gemini-2.0-flash';  // Fast extraction
const PRO_MODEL = 'gemini-2.5-pro';       // Intelligent synthesis
const MODEL_VERSION = `flash:${FLASH_MODEL},pro:${PRO_MODEL}`;

// Default settings
const DEFAULT_FALLBACK_HOURS = 24;
const DEFAULT_MAX_EMAILS = 500;
const DEFAULT_MAP_BATCH_SIZE = 10;

// ============================================================================
// BigQuery Client
// ============================================================================

function getBigQueryClient(): BigQuery {
  return new BigQuery({
    projectId: PROJECT_ID,
    location: BIGQUERY_LOCATION,  // CRITICAL: Must be 'US'
  });
}

// ============================================================================
// Authentication
// ============================================================================

async function getAccessToken(): Promise<string> {
  const { GoogleAuth } = await import('google-auth-library');
  
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  
  if (!accessToken.token) {
    throw new Error('Failed to get access token');
  }
  
  return accessToken.token;
}

// ============================================================================
// Delta Query (Step A)
// ============================================================================

async function getLastBriefingEndTime(bigquery: BigQuery): Promise<Date | null> {
  const query = `
    SELECT MAX(time_window_end) as last_end
    FROM \`${PROJECT_ID}.${DATASET_ID}.briefings\`
  `;

  try {
    const [rows] = await bigquery.query({
      query,
      location: BIGQUERY_LOCATION,
    });

    if (rows.length > 0 && rows[0].last_end) {
      const endTime = rows[0].last_end;
      if (endTime.value) {
        return new Date(endTime.value);
      }
      return new Date(endTime);
    }
  } catch (error) {
    console.warn('⚠️  Could not fetch last briefing, will use fallback:', error);
  }

  return null;
}

async function fetchDeltaEmails(
  bigquery: BigQuery,
  windowStart: Date,
  windowEnd: Date,
  maxEmails: number
): Promise<RawEmail[]> {
  const query = `
    SELECT 
      gmail_message_id,
      subject,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', sent_date) as sent_date,
      from_email,
      from_name,
      body_html,
      body_text,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', ingested_at) as ingested_at
    FROM \`${PROJECT_ID}.${DATASET_ID}.raw_emails\`
    WHERE ingested_at > TIMESTAMP('${windowStart.toISOString()}')
      AND ingested_at <= TIMESTAMP('${windowEnd.toISOString()}')
    ORDER BY ingested_at DESC
    LIMIT ${maxEmails}
  `;

  // Log exact time window for trust & verification
  const startISO = windowStart.toISOString();
  const endISO = windowEnd.toISOString();
  const windowDurationMs = windowEnd.getTime() - windowStart.getTime();
  const windowDurationHours = (windowDurationMs / (1000 * 60 * 60)).toFixed(1);
  
  console.log(`\n📨 DELTA QUERY (Trust & Verification)`);
  console.log(`${'─'.repeat(50)}`);
  console.log(`   Window Start: ${startISO}`);
  console.log(`   Window End:   ${endISO}`);
  console.log(`   Duration:     ${windowDurationHours} hours`);
  console.log(`   Query:        ingested_at > '${startISO}' AND ingested_at <= '${endISO}'`);

  const [rows] = await bigquery.query({
    query,
    location: BIGQUERY_LOCATION,
  });

  console.log(`   Found:        ${rows.length} emails`);
  console.log(`${'─'.repeat(50)}\n`);

  return rows as RawEmail[];
}

// ============================================================================
// Map Phase (Step B) - Gemini Flash
// ============================================================================

const MAP_SYSTEM_PROMPT = `You are an intelligence analyst extracting key information from newsletter content.

For each newsletter, extract:
1. themes: 2-5 key topics/themes discussed (e.g., "AI regulation", "Fed policy", "China trade")
2. entities: Named entities mentioned (people, organizations, stock tickers, countries)
3. sentiment: Overall sentiment toward the main topic (positive, negative, or neutral)
4. summary: A 1-2 sentence summary of the main point
5. key_claims: 2-3 bullet points summarizing the main claims or insights

Return ONLY valid JSON matching this exact structure:
{
  "themes": ["theme1", "theme2"],
  "entities": ["entity1", "entity2"],
  "sentiment": "positive" | "negative" | "neutral",
  "summary": "Brief summary here",
  "key_claims": ["claim1", "claim2"]
}`;

function extractEmailText(email: RawEmail): string {
  if (email.body_text && email.body_text.trim().length > 0) {
    return email.body_text;
  }
  
  if (email.body_html) {
    return email.body_html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  return '';
}

/**
 * Extract a representative snippet from email text (first 200 chars of meaningful content)
 */
function extractSnippet(emailText: string, subject: string): string {
  if (!emailText || emailText.trim().length === 0) {
    return `[No content available] ${subject}`;
  }

  // Remove common email headers/footers
  const cleaned = emailText
    .replace(/^(From:|To:|Subject:|Date:).*$/gmi, '')
    .replace(/^--.*$/gm, '')
    .trim();

  // Take first 200 characters, breaking at word boundary
  const snippet = cleaned.length > 200 
    ? cleaned.substring(0, 200).replace(/\s+\S*$/, '') + '...'
    : cleaned;

  return snippet || `[Content preview unavailable] ${subject}`;
}

async function mapEmailToInsight(
  email: RawEmail,
  accessToken: string
): Promise<InsightObject> {
  const emailText = extractEmailText(email);
  const snippet = extractSnippet(emailText, email.subject);
  const truncatedText = emailText.length > 15000 
    ? emailText.substring(0, 15000) + '\n\n[Content truncated...]'
    : emailText;
  
  const userPrompt = `Analyze this newsletter:

Publisher: ${email.from_email}
Subject: ${email.subject}
Date: ${email.sent_date}

Content:
${truncatedText}

Extract the key themes, entities, sentiment, summary, and claims.`;

  const endpoint = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${FLASH_MODEL}:generateContent`;
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: MAP_SYSTEM_PROMPT + '\n\n' + userPrompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      console.error(`Gemini Flash API error for ${email.gmail_message_id}`);
      return createDefaultInsight(email);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      return createDefaultInsight(email);
    }
    
    const parsed = JSON.parse(text);
    
    return {
      gmail_message_id: email.gmail_message_id,
      publisher: email.from_email,
      subject: email.subject,
      sent_date: email.sent_date,
      snippet: snippet,
      themes: parsed.themes || [],
      entities: parsed.entities || [],
      sentiment: parsed.sentiment || 'neutral',
      summary: parsed.summary || '',
      key_claims: parsed.key_claims || []
    };
  } catch (error) {
    console.warn(`Failed to extract insight for ${email.gmail_message_id}:`, error);
    return createDefaultInsight(email);
  }
}

function createDefaultInsight(email: RawEmail): InsightObject {
  const emailText = extractEmailText(email);
  const snippet = extractSnippet(emailText, email.subject);
  
  return {
    gmail_message_id: email.gmail_message_id,
    publisher: email.from_email,
    subject: email.subject,
    sent_date: email.sent_date,
    snippet: snippet,
    themes: [],
    entities: [],
    sentiment: 'neutral',
    summary: `[Extraction failed] ${email.subject}`,
    key_claims: []
  };
}

async function mapEmailsToInsights(
  emails: RawEmail[],
  batchSize: number = DEFAULT_MAP_BATCH_SIZE
): Promise<InsightObject[]> {
  if (emails.length === 0) {
    return [];
  }
  
  console.log(`📧 Starting Map phase: ${emails.length} emails in batches of ${batchSize}`);
  
  const accessToken = await getAccessToken();
  const insights: InsightObject[] = [];
  const totalBatches = Math.ceil(emails.length / batchSize);
  
  for (let i = 0; i < emails.length; i += batchSize) {
    const batchNum = Math.floor(i / batchSize) + 1;
    const batch = emails.slice(i, i + batchSize);
    
    console.log(`  Batch ${batchNum}/${totalBatches}: Processing ${batch.length} emails...`);
    
    const batchResults = await Promise.all(
      batch.map(email => mapEmailToInsight(email, accessToken))
    );
    
    insights.push(...batchResults);
  }
  
  console.log(`✅ Map phase complete: ${insights.length} insights extracted`);
  
  return insights;
}

// ============================================================================
// Reduce Phase (Step C) - Gemini Pro (Editor-in-Chief)
// ============================================================================

const EDITOR_IN_CHIEF_PROMPT = `You are a Senior Intelligence Analyst compiling a Daily Briefing from newsletter summaries.

## YOUR ROLE
You are a rigorous, evidence-based analyst. Your job is to FAITHFULLY SYNTHESIZE what the provided sources actually say—not to interpret, speculate, or add dramatic flair. Think of yourself as a forensic reporter, not a storyteller.

## CRITICAL GROUNDING RULES
1. **ONLY use information from the provided InsightObjects.** You have ZERO outside knowledge. If something is not explicitly stated in the sources, it does not exist.
2. **Every claim must be traceable.** If you write a synthesis statement, it MUST be directly supported by at least one source in the source_ids array.
3. **Use the language of the sources.** Prefer paraphrasing the actual summaries and key_claims rather than inventing new framings.
4. **When in doubt, be literal.** If sources discuss "chip export controls," say "chip export controls"—do not upgrade to "The New Cold War in Semiconductors."
5. **No generic geopolitical tropes.** Avoid clichés like "US-China tensions," "market uncertainty," or "geopolitical risks" unless sources use those EXACT phrases.

## FORBIDDEN BEHAVIORS
- ❌ Do NOT invent dramatic narrative titles not grounded in source language
- ❌ Do NOT extrapolate or speculate beyond what sources explicitly claim
- ❌ Do NOT add context, background, or "common knowledge" not in the sources
- ❌ Do NOT create thematic clusters that have no supporting source_ids
- ❌ Do NOT generate serendipity items from imagination—they MUST come from actual InsightObjects

## OUTPUT STRUCTURE (JSON)
{
  "executive_summary": [
    "First dominant theme in 1-2 sentences (grounded in sources)",
    "Second dominant theme in 1-2 sentences (grounded in sources)", 
    "Third dominant theme in 1-2 sentences (grounded in sources)"
  ],
  "narrative_clusters": [
    {
      "title": "Short descriptive title using source language",
      "synthesis": "A 2-3 sentence summary of what sources ACTUALLY SAY. Use specific details from summaries and key_claims.",
      "consensus_sentiment": "Positive" | "Negative" | "Mixed",
      "counter_point": "Publisher X argued Y, which contrasts with the consensus." or null if no dissent found,
      "source_ids": ["gmail_message_id_1", "gmail_message_id_2"]
    }
  ],
  "serendipity_corner": [
    {
      "title": "Title from the actual source subject/summary",
      "insight": "1-2 sentences describing what THIS SOURCE actually reported",
      "source_id": "gmail_message_id",
      "publisher": "publisher_email"
    }
  ],
  "radar_signals": ["term1", "term2", "term3"]
}

## STRICT REQUIREMENTS
1. executive_summary: EXACTLY 3 points. Each must be directly supported by multiple sources.
2. narrative_clusters: 3-7 clusters. Each MUST have at least 2 source_ids. If you cannot find 2 sources for a theme, do NOT create that cluster.
3. serendipity_corner: EXACTLY 2 items. These must be REAL insights from actual InsightObjects that don't fit main clusters—not invented items.
4. radar_signals: 3-5 specific entities/terms that appear in the sources. These must be nouns/names from the data, not generic concepts.
5. source_ids: MANDATORY for every cluster. Use the exact gmail_message_id values from the InsightObjects.
6. counter_point: Include ONLY if a source explicitly disagrees. Do not manufacture dissent.

## SELF-CHECK BEFORE OUTPUT
Before generating, verify:
- Can I point to a specific InsightObject for each claim I'm making?
- Am I using language/framing from the sources, or am I inventing my own?
- Would someone reading only the InsightObjects recognize these themes?

Return ONLY valid JSON. No markdown, no explanation, just the JSON object.`;

function formatInsightsForContext(insights: InsightObject[]): string {
  return insights.map((insight, idx) => `
--- Insight ${idx + 1} ---
ID: ${insight.gmail_message_id}
Publisher: ${insight.publisher}
Subject: ${insight.subject}
Date: ${insight.sent_date}
Themes: ${insight.themes.join(', ')}
Entities: ${insight.entities.join(', ')}
Sentiment: ${insight.sentiment}
Summary: ${insight.summary}
Key Claims:
${insight.key_claims.map(c => `  • ${c}`).join('\n')}
`).join('\n');
}

async function reduceInsightsToBriefing(
  insights: InsightObject[]
): Promise<BriefingContent> {
  if (insights.length === 0) {
    return {
      executive_summary: ['No newsletters processed in this time window.'],
      narrative_clusters: [],
      serendipity_corner: [],
      radar_signals: [],
    };
  }
  
  console.log(`🧠 Starting Reduce phase: Synthesizing ${insights.length} insights...`);
  
  const accessToken = await getAccessToken();
  const insightsContext = formatInsightsForContext(insights);
  
  const userPrompt = `Here are ${insights.length} newsletter insights from the past day. Synthesize them into a Daily Intelligence Briefing:

${insightsContext}

Generate the briefing JSON now:`;

  const endpoint = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${PRO_MODEL}:generateContent`;
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: EDITOR_IN_CHIEF_PROMPT + '\n\n' + userPrompt }]
        }
      ],
      generationConfig: {
        temperature: 0.1,  // Lowered from 0.3 for strict grounding
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini Pro API error:', errorText);
    throw new Error(`Gemini Pro API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!text) {
    throw new Error('Empty response from Gemini Pro');
  }
  
  // Try to parse JSON with repair logic for truncation
  let briefing: BriefingContent;
  try {
    briefing = JSON.parse(text) as BriefingContent;
  } catch (parseError) {
    console.warn('⚠️  Initial JSON parse failed, attempting repair...');
    console.log('Raw text preview:', text.substring(0, 500));
    
    // Attempt to repair truncated JSON
    let repairedText = text;
    
    // Try to find the last valid closing brace
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace !== -1) {
      // Count open/close braces and brackets to attempt repair
      let openBraces = 0;
      let openBrackets = 0;
      for (let i = 0; i <= lastBrace; i++) {
        if (text[i] === '{') openBraces++;
        if (text[i] === '}') openBraces--;
        if (text[i] === '[') openBrackets++;
        if (text[i] === ']') openBrackets--;
      }
      
      // Add missing closures
      repairedText = text.substring(0, lastBrace + 1);
      repairedText += ']'.repeat(Math.max(0, openBrackets));
      repairedText += '}'.repeat(Math.max(0, openBraces));
    }
    
    try {
      briefing = JSON.parse(repairedText) as BriefingContent;
      console.log('✅ JSON repair successful');
    } catch (repairError) {
      // Final fallback: return a minimal valid briefing
      console.error('❌ JSON repair failed, returning fallback briefing');
      briefing = {
        executive_summary: ['[Briefing generation encountered parsing issues]'],
        narrative_clusters: [],
        serendipity_corner: [],
        radar_signals: [],
      };
    }
  }
  
  // Validate and fix structure
  if (!briefing.executive_summary || !Array.isArray(briefing.executive_summary)) {
    briefing.executive_summary = ['[Briefing generation incomplete]'];
  }
  if (!briefing.narrative_clusters || !Array.isArray(briefing.narrative_clusters)) {
    briefing.narrative_clusters = [];
  }
  if (!briefing.serendipity_corner || !Array.isArray(briefing.serendipity_corner)) {
    briefing.serendipity_corner = [];
  }
  if (!briefing.radar_signals || !Array.isArray(briefing.radar_signals)) {
    briefing.radar_signals = [];
  }
  
  // Enrich clusters with source citations and DETERMINISTIC SENTIMENT MATH
  const insightsMap = new Map(insights.map(insight => [insight.gmail_message_id, insight]));
  
  briefing.narrative_clusters = briefing.narrative_clusters.map(cluster => {
    // Get all insights for this cluster
    const clusterInsights = cluster.source_ids
      .map(id => insightsMap.get(id))
      .filter((insight): insight is InsightObject => insight !== undefined);
    
    // Enrich sources with sentiment
    const enrichedSources = clusterInsights.map(insight => ({
      gmail_message_id: insight.gmail_message_id,
      publisher: insight.publisher,
      subject: insight.subject,
      sent_date: insight.sent_date,
      snippet: insight.snippet,
      sentiment: insight.sentiment,
    }));
    
    // DETERMINISTIC SENTIMENT MATH (100% Falsifiable)
    const sentimentCounts = {
      positive: clusterInsights.filter(i => i.sentiment === 'positive').length,
      negative: clusterInsights.filter(i => i.sentiment === 'negative').length,
      neutral: clusterInsights.filter(i => i.sentiment === 'neutral').length,
    };
    const total = sentimentCounts.positive + sentimentCounts.negative + sentimentCounts.neutral;
    
    // Calculate mathematical consensus
    let calculated_consensus: 'Positive' | 'Negative' | 'Mixed';
    if (total === 0) {
      calculated_consensus = 'Mixed';
    } else if (sentimentCounts.positive > sentimentCounts.negative && sentimentCounts.positive > sentimentCounts.neutral) {
      calculated_consensus = 'Positive';
    } else if (sentimentCounts.negative > sentimentCounts.positive && sentimentCounts.negative > sentimentCounts.neutral) {
      calculated_consensus = 'Negative';
    } else {
      calculated_consensus = 'Mixed';
    }
    
    // Check if math overrides LLM
    const llm_consensus = cluster.consensus_sentiment;
    const override_applied = calculated_consensus !== llm_consensus;
    
    if (override_applied) {
      console.log(`   ⚠️  Sentiment override: "${cluster.title}" LLM said ${llm_consensus}, Math says ${calculated_consensus}`);
    }
    
    return {
      ...cluster,
      // MATH WINS: Use calculated consensus, not LLM guess
      consensus_sentiment: calculated_consensus,
      sources: enrichedSources.length > 0 ? enrichedSources : undefined,
      sentiment_breakdown: {
        positive: sentimentCounts.positive,
        negative: sentimentCounts.negative,
        neutral: sentimentCounts.neutral,
        total,
        calculated_consensus,
        llm_consensus,
        override_applied,
      },
    };
  });
  
  console.log(`✅ Reduce phase complete:`);
  console.log(`   - Executive summary: ${briefing.executive_summary.length} points`);
  console.log(`   - Narrative clusters: ${briefing.narrative_clusters.length}`);
  console.log(`   - Serendipity items: ${briefing.serendipity_corner.length}`);
  console.log(`   - Radar signals: ${briefing.radar_signals.length}`);
  
  return briefing;
}

// ============================================================================
// Storage (Step D)
// ============================================================================

async function storeBriefing(
  bigquery: BigQuery,
  briefingId: string,
  generatedAt: Date,
  windowStart: Date,
  windowEnd: Date,
  emailCount: number,
  content: BriefingContent,
  modelVersion: string
): Promise<void> {
  const table = bigquery.dataset(DATASET_ID).table('briefings');

  const row = {
    briefing_id: briefingId,
    generated_at: generatedAt.toISOString(),
    time_window_start: windowStart.toISOString(),
    time_window_end: windowEnd.toISOString(),
    content_json: JSON.stringify(content),
    email_count: emailCount,
    model_version: modelVersion,
  };

  await table.insert([row]);
  console.log(`💾 Briefing ${briefingId} stored in BigQuery`);
}

// ============================================================================
// Main Generator Function
// ============================================================================

/**
 * Generate a daily intelligence briefing
 * 
 * @param windowHours - Optional: Override lookback window in hours
 * @returns The generated briefing with metadata
 */
export async function generateBriefing(
  windowHours?: number
): Promise<BriefingPipelineResult>;

export async function generateBriefing(
  options?: BriefingPipelineOptions
): Promise<BriefingPipelineResult>;

export async function generateBriefing(
  optionsOrHours?: BriefingPipelineOptions | number
): Promise<BriefingPipelineResult> {
  const startTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Starting Briefing Engine Pipeline');
  console.log('='.repeat(60) + '\n');

  // Normalize options
  let options: BriefingPipelineOptions = {};
  if (typeof optionsOrHours === 'number') {
    options = { windowHours: optionsOrHours };
  } else if (optionsOrHours) {
    options = optionsOrHours;
  }

  const bigquery = getBigQueryClient();
  const maxEmails = options.maxEmails ?? DEFAULT_MAX_EMAILS;
  const mapBatchSize = options.mapBatchSize ?? DEFAULT_MAP_BATCH_SIZE;

  // Determine time window
  let windowStart: Date;
  let windowEnd: Date = new Date();

  if (options.windowStart && options.windowEnd) {
    windowStart = options.windowStart;
    windowEnd = options.windowEnd;
    console.log('📅 Using provided time window');
  } else if (options.windowHours) {
    // Override: use specified hours
    windowStart = new Date(windowEnd.getTime() - options.windowHours * 60 * 60 * 1000);
    console.log(`📅 Override mode: Looking back ${options.windowHours} hours`);
  } else {
    // Delta: based on last briefing
    const lastBriefingEnd = await getLastBriefingEndTime(bigquery);

    if (lastBriefingEnd) {
      windowStart = lastBriefingEnd;
      console.log('📅 Delta mode: Processing emails since last briefing');
    } else {
      // Fallback: last 24 hours
      windowStart = new Date(windowEnd.getTime() - DEFAULT_FALLBACK_HOURS * 60 * 60 * 1000);
      console.log(`📅 Fallback mode: No previous briefing, using last ${DEFAULT_FALLBACK_HOURS} hours`);
    }
  }

  // Step A: Fetch delta emails
  const emails = await fetchDeltaEmails(bigquery, windowStart, windowEnd, maxEmails);

  if (emails.length === 0) {
    console.log('⚠️  No emails found in time window. Creating empty briefing.');
    
    const briefingId = uuidv4();
    const generatedAt = new Date();
    const emptyContent: BriefingContent = {
      executive_summary: ['No new newsletters were processed in this time window.'],
      narrative_clusters: [],
      serendipity_corner: [],
      radar_signals: [],
    };

    await storeBriefing(
      bigquery,
      briefingId,
      generatedAt,
      windowStart,
      windowEnd,
      0,
      emptyContent,
      MODEL_VERSION
    );

    return {
      briefing_id: briefingId,
      generated_at: generatedAt.toISOString(),
      time_window_start: windowStart.toISOString(),
      time_window_end: windowEnd.toISOString(),
      email_count: 0,
      content: emptyContent,
      model_version: MODEL_VERSION,
    };
  }

  // Step B: Map phase
  console.log('\n--- MAP PHASE ---');
  const insights = await mapEmailsToInsights(emails, mapBatchSize);

  // Step C: Reduce phase
  console.log('\n--- REDUCE PHASE ---');
  const content = await reduceInsightsToBriefing(insights);

  // Step D: Store
  console.log('\n--- STORAGE PHASE ---');
  const briefingId = uuidv4();
  const generatedAt = new Date();

  await storeBriefing(
    bigquery,
    briefingId,
    generatedAt,
    windowStart,
    windowEnd,
    emails.length,
    content,
    MODEL_VERSION
  );

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log(`✅ Briefing Pipeline Complete in ${duration}s`);
  console.log(`   Briefing ID: ${briefingId}`);
  console.log(`   Emails processed: ${emails.length}`);
  console.log(`   Clusters generated: ${content.narrative_clusters.length}`);
  console.log('='.repeat(60) + '\n');

  return {
    briefing_id: briefingId,
    generated_at: generatedAt.toISOString(),
    time_window_start: windowStart.toISOString(),
    time_window_end: windowEnd.toISOString(),
    email_count: emails.length,
    content,
    model_version: MODEL_VERSION,
  };
}

// ============================================================================
// Query Functions
// ============================================================================

export async function getLatestBriefing(): Promise<StoredBriefing | null> {
  const bigquery = getBigQueryClient();

  const query = `
    SELECT 
      briefing_id,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', generated_at) as generated_at,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', time_window_start) as time_window_start,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', time_window_end) as time_window_end,
      content_json,
      email_count,
      model_version
    FROM \`${PROJECT_ID}.${DATASET_ID}.briefings\`
    ORDER BY generated_at DESC
    LIMIT 1
  `;

  const [rows] = await bigquery.query({
    query,
    location: BIGQUERY_LOCATION,
  });

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  
  let content: BriefingContent;
  if (typeof row.content_json === 'string') {
    content = JSON.parse(row.content_json);
  } else {
    content = row.content_json;
  }

  return {
    briefing_id: row.briefing_id,
    generated_at: row.generated_at,
    time_window_start: row.time_window_start,
    time_window_end: row.time_window_end,
    content_json: content,
    email_count: row.email_count,
    model_version: row.model_version,
  };
}

export async function getBriefingById(briefingId: string): Promise<StoredBriefing | null> {
  const bigquery = getBigQueryClient();

  const query = `
    SELECT 
      briefing_id,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', generated_at) as generated_at,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', time_window_start) as time_window_start,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', time_window_end) as time_window_end,
      content_json,
      email_count,
      model_version
    FROM \`${PROJECT_ID}.${DATASET_ID}.briefings\`
    WHERE briefing_id = @briefingId
  `;

  const [rows] = await bigquery.query({
    query,
    location: BIGQUERY_LOCATION,
    params: { briefingId },
  });

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  
  let content: BriefingContent;
  if (typeof row.content_json === 'string') {
    content = JSON.parse(row.content_json);
  } else {
    content = row.content_json;
  }

  return {
    briefing_id: row.briefing_id,
    generated_at: row.generated_at,
    time_window_start: row.time_window_start,
    time_window_end: row.time_window_end,
    content_json: content,
    email_count: row.email_count,
    model_version: row.model_version,
  };
}

export async function getBriefingArchive(limit: number = 30): Promise<BriefingArchiveItem[]> {
  const bigquery = getBigQueryClient();

  const query = `
    SELECT 
      briefing_id,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', generated_at) as generated_at,
      email_count,
      JSON_VALUE(content_json, '$.executive_summary[0]') as executive_summary
    FROM \`${PROJECT_ID}.${DATASET_ID}.briefings\`
    ORDER BY generated_at DESC
    LIMIT ${limit}
  `;

  const [rows] = await bigquery.query({
    query,
    location: BIGQUERY_LOCATION,
  });

  return rows as BriefingArchiveItem[];
}

