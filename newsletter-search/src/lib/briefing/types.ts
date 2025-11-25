/**
 * Briefing Engine Type Definitions
 * 
 * These types define the data structures for the Map-Reduce pipeline
 * that generates daily intelligence briefings.
 */

// ============================================================================
// Raw Input Types (from BigQuery)
// ============================================================================

/**
 * Raw email from BigQuery raw_emails table
 */
export interface RawEmail {
  gmail_message_id: string;
  subject: string;
  sent_date: string;           // ISO timestamp
  from_email: string;          // Used as publisher name
  from_name: string | null;
  body_html: string | null;
  body_text: string | null;
  ingested_at: string;         // ISO timestamp
}

// ============================================================================
// Map Phase Types (Email → Insight)
// ============================================================================

/**
 * Output from the Map phase (Gemini Flash extraction)
 * One InsightObject is generated per email.
 */
export interface InsightObject {
  gmail_message_id: string;
  publisher: string;           // from raw_emails.from_email
  subject: string;
  sent_date: string;
  snippet: string;             // Specific text chunk used (first 200 chars of key content)
  themes: string[];            // Key topics extracted (e.g., "AI regulation", "Fed policy")
  entities: string[];          // Named entities (people, orgs, tickers)
  sentiment: 'positive' | 'negative' | 'neutral';
  summary: string;             // Brief summary of the email
  key_claims: string[];        // 2-3 bullet points summarizing the email
}

/**
 * Enriched source citation for trust & verification
 */
export interface SourceCitation {
  gmail_message_id: string;
  publisher: string;
  subject: string;
  sent_date: string;
  snippet: string;
  sentiment: 'positive' | 'negative' | 'neutral';  // For deterministic sentiment math
}

/**
 * Deterministic sentiment breakdown (100% Falsifiable)
 * Calculated mathematically from source sentiments, NOT from LLM opinion
 */
export interface SentimentBreakdown {
  positive: number;
  negative: number;
  neutral: number;
  total: number;
  calculated_consensus: 'Positive' | 'Negative' | 'Mixed';  // The math-derived label
  llm_consensus: 'Positive' | 'Negative' | 'Mixed';         // What the LLM originally said
  override_applied: boolean;                                 // True if math overrode LLM
}

// ============================================================================
// Reduce Phase Types (Insights → Briefing)
// ============================================================================

/**
 * A narrative cluster groups related insights around a theme
 */
export interface NarrativeCluster {
  title: string;               // e.g., "The Nvidia Aftermath"
  synthesis: string;           // 2-3 sentence overview of the consensus
  consensus_sentiment: 'Positive' | 'Negative' | 'Mixed';
  counter_point: string | null; // "While most sources agreed on X, [Publisher] argued Y."
  source_ids: string[];        // gmail_message_ids involved (for backward compatibility)
  sources?: SourceCitation[];   // Enriched source citations for trust & verification
  sentiment_breakdown?: SentimentBreakdown;  // Deterministic sentiment math (100% Falsifiable)
}

/**
 * A serendipity item is a high-value insight unrelated to main clusters
 */
export interface SerendipityItem {
  title: string;
  insight: string;
  source_id: string;           // gmail_message_id
  publisher: string;
}

/**
 * The full briefing content output from the Reduce phase
 * This is what gets stored in content_json in BigQuery
 */
export interface BriefingContent {
  executive_summary: string[]; // Max 3 bullet points capturing dominant themes
  narrative_clusters: NarrativeCluster[];
  serendipity_corner: SerendipityItem[];  // 2 items
  radar_signals: string[];     // 3-5 emerging terms/entities with unusual velocity
}

// ============================================================================
// Stored Briefing Types (BigQuery)
// ============================================================================

/**
 * Full briefing record as stored in BigQuery briefings table
 */
export interface StoredBriefing {
  briefing_id: string;         // UUID
  generated_at: string;        // ISO timestamp
  time_window_start: string;   // ISO timestamp
  time_window_end: string;     // ISO timestamp
  content_json: BriefingContent;
  email_count: number;
  model_version: string | null;
}

/**
 * Briefing metadata for the archive sidebar (without full content)
 */
export interface BriefingArchiveItem {
  briefing_id: string;
  generated_at: string;
  email_count: number;
  executive_summary: string | null; // First item of executive_summary for preview
}

// ============================================================================
// Pipeline Configuration
// ============================================================================

export interface BriefingPipelineOptions {
  /** Override the time window (defaults to time since last briefing or 24h) */
  windowStart?: Date;
  windowEnd?: Date;
  /** Override lookback in hours (alternative to windowStart/windowEnd) */
  windowHours?: number;
  /** Maximum emails to process (safety limit) */
  maxEmails?: number;
  /** Batch size for parallel map operations */
  mapBatchSize?: number;
}

export interface BriefingPipelineResult {
  briefing_id: string;
  generated_at: string;
  time_window_start: string;
  time_window_end: string;
  email_count: number;
  content: BriefingContent;
  model_version: string;
}

