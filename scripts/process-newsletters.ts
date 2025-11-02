import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';
import { v4 as uuidv4 } from 'uuid';
import { getBestCleanedContent } from '../newsletter-search/src/lib/newsletter-cleaning';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const MESSAGES_TABLE = 'messages';
const CHUNKS_TABLE = 'chunks';
const LOCATION = 'us-central1';

const TARGET_CHUNK_SIZE = 800;
const OVERLAP_SIZE = 100;
const MIN_CHUNK_SIZE = 200;

// Progress persistence file
const PROGRESS_FILE = path.join(__dirname, '..', 'processing-progress.json');

interface NewsletterChunk {
  chunk_id: string;
  newsletter_id: string;
  chunk_index: number;
  chunk_text: string;
  chunk_embedding: number[] | null;
  sent_date: any;
  publisher_name: string;
  subject: string;
  is_paid: boolean | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface ProcessingStats {
  total: number;
  processed: number;
  skipped: number;
  failed: number;
  chunksCreated: number;
  apiCalls: number;
  startTime: string;
  lastUpdateTime: string;
  processedNewsletterIds: string[];
  lastProcessedId?: string; // For cursor-based pagination
}

// Cost tracking
const EMBEDDING_COST_PER_1K_CHARS = 0.00001; // $0.00001 per 1k characters
const GEMINI_COST_PER_1K_TOKENS_INPUT = 0.25; // Approximate
const GEMINI_COST_PER_1K_TOKENS_OUTPUT = 1.0; // Approximate

let stats: ProcessingStats = {
  total: 0,
  processed: 0,
  skipped: 0,
  failed: 0,
  chunksCreated: 0,
  apiCalls: 0,
  startTime: new Date().toISOString(),
  lastUpdateTime: new Date().toISOString(),
  processedNewsletterIds: [],
  lastProcessedId: undefined
};

function createSemanticChunks(text: string, targetSize: number = TARGET_CHUNK_SIZE): string[] {
  if (!text || text.length < MIN_CHUNK_SIZE) {
    return text ? [text] : [];
  }

  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  
  if (paragraphs.length === 0) return [text];
  
  const chunks: string[] = [];
  let currentChunk = '';

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim();
    
    if (currentChunk && (currentChunk.length + paragraph.length + 2 > targetSize)) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    } else {
      if (currentChunk) {
        currentChunk += '\n\n' + paragraph;
      } else {
        currentChunk = paragraph;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  if (chunks.length === 1 && chunks[0].length > targetSize * 1.5) {
    return splitBySentences(chunks[0], targetSize);
  }

  return chunks.filter(chunk => chunk.length >= MIN_CHUNK_SIZE);
}

function splitBySentences(text: string, targetSize: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if (currentChunk && (currentChunk.length + sentence.length > targetSize)) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter(chunk => chunk.length >= MIN_CHUNK_SIZE);
}

function addOverlap(chunks: string[], overlapSize: number = OVERLAP_SIZE): string[] {
  if (chunks.length <= 1) return chunks;

  const overlappedChunks = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = chunks[i - 1];
    const currentChunk = chunks[i];

    const overlapText = prevChunk.slice(-overlapSize);
    const overlappedChunk = overlapText + '\n\n' + currentChunk;
    
    overlappedChunks.push(overlappedChunk);
  }

  return overlappedChunks;
}

async function generateEmbedding(text: string, retries: number = 3): Promise<number[]> {
  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/text-embedding-004:predict`;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: [
            {
              content: text,
              task_type: 'RETRIEVAL_DOCUMENT',
            }
          ]
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.predictions && data.predictions[0] && data.predictions[0].embeddings) {
          const embedding = data.predictions[0].embeddings.values || data.predictions[0].embeddings;
          if (Array.isArray(embedding)) {
            stats.apiCalls++;
            return embedding;
          }
        }
        
        throw new Error('No embedding returned from API');
      }

      // Handle rate limiting (429) or temporary errors (500, 502, 503, 504)
      if (response.status === 429 || response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504) {
        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s...
        console.log(`   ⚠️  Rate limited or server error. Retrying in ${waitTime}ms... (attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      const errorText = await response.text();
      throw new Error(`API returned ${response.status}: ${errorText}`);
    } catch (error) {
      if (attempt === retries - 1) {
        console.error('❌ Embedding generation failed after retries:', error);
        throw error;
      }
      const waitTime = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw new Error('Embedding generation failed after all retries');
}

async function processNewsletterWithEmbeddings(newsletter: any): Promise<NewsletterChunk[]> {
  const cleanedContent = getBestCleanedContent(
    newsletter.body_text || '',
    newsletter.body_html || ''
  );

  if (!cleanedContent || cleanedContent.length < MIN_CHUNK_SIZE) {
    return [];
  }

  const chunks = createSemanticChunks(cleanedContent, TARGET_CHUNK_SIZE);
  const overlappedChunks = addOverlap(chunks, OVERLAP_SIZE);

  const chunkRecords: NewsletterChunk[] = [];

  for (let i = 0; i < overlappedChunks.length; i++) {
    const chunkText = overlappedChunks[i];
    
    // Retry embedding generation with exponential backoff
    let embedding: number[];
    try {
      embedding = await generateEmbedding(chunkText, 3);
    } catch (error) {
      console.error(`   ❌ Failed to generate embedding for chunk ${i}: ${error}`);
      throw error; // Re-throw to skip this newsletter
    }

    chunkRecords.push({
      chunk_id: uuidv4(),
      newsletter_id: newsletter.id,
      chunk_index: i,
      chunk_text: chunkText,
      chunk_embedding: embedding,
      sent_date: newsletter.sent_date,
      publisher_name: newsletter.publisher_name,
      subject: newsletter.subject,
      is_paid: newsletter.is_paid || null,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // No delay needed - exponential backoff handles rate limits
  }

  return chunkRecords;
}

function getExistingNewsletterIds(bigquery: BigQuery): Promise<Set<string>> {
  return new Promise(async (resolve, reject) => {
    try {
      const query = `
        SELECT DISTINCT newsletter_id
        FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
        WHERE newsletter_id IS NOT NULL
      `;
      const [rows] = await bigquery.query(query);
      resolve(new Set(rows.map((row: any) => row.newsletter_id)));
    } catch (error) {
      console.warn('⚠️  Could not fetch existing newsletters, starting fresh');
      resolve(new Set());
    }
  });
}

function calculateTimeRemaining(): string {
  if (stats.processed === 0) return 'N/A';
  
  const startTime = new Date(stats.startTime).getTime();
  const elapsed = (Date.now() - startTime) / 1000;
  const avgTimePerNewsletter = elapsed / stats.processed;
  const remaining = avgTimePerNewsletter * (stats.total - stats.processed);
  
  if (remaining < 60) return `${Math.round(remaining)}s`;
  if (remaining < 3600) return `${Math.round(remaining / 60)}m`;
  return `${Math.round(remaining / 3600)}h ${Math.round((remaining % 3600) / 60)}m`;
}

function estimateCost(): number {
  // Embeddings: $0.00001 per 1k characters
  // Assume average newsletter is 10k characters, becomes 12 chunks of 800 chars each
  const estimatedCharsPerNewsletter = 10000;
  const embeddingCost = stats.processed * (estimatedCharsPerNewsletter / 1000) * EMBEDDING_COST_PER_1K_CHARS;
  
  return embeddingCost;
}

function saveProgress() {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(stats, null, 2));
  } catch (error) {
    console.warn('⚠️  Could not save progress file:', error);
  }
}

function loadProgress(): ProcessingStats | null {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = fs.readFileSync(PROGRESS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn('⚠️  Could not load progress file:', error);
  }
  return null;
}

function logProgress(newsletter: any) {
  stats.processed++;
  stats.processedNewsletterIds.push(newsletter.id);
  stats.lastUpdateTime = new Date().toISOString();
  
  const percent = ((stats.processed / stats.total) * 100).toFixed(1);
  const timeRemaining = calculateTimeRemaining();
  const cost = estimateCost();
  
  // Save progress after every newsletter
  saveProgress();
  
  console.log(`\n[${stats.processed}/${stats.total}] (${percent}%) Processing: ${newsletter.subject}`);
  console.log(`   Publisher: ${newsletter.publisher_name}`);
  console.log(`   Time remaining: ${timeRemaining} | Cost so far: $${cost.toFixed(4)} | API calls: ${stats.apiCalls}`);
  console.log(`   Completed: ${stats.processed}/${stats.total} | Failed: ${stats.failed} | Skipped: ${stats.skipped}`);
}

async function main() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  const limit = parseInt(process.env.PROCESS_LIMIT || '100');
  const startFrom = parseInt(process.env.START_FROM || '0');

  try {
    console.log('\n🚀 NEWSLETTER PROCESSING PIPELINE');
    console.log('=====================================\n');
    console.log(`Limit: ${limit} newsletters`);
    console.log(`Starting from: ${startFrom}`);

    // Try to load previous progress
    const savedProgress = loadProgress();
    if (savedProgress) {
      console.log(`📂 Found previous progress: ${savedProgress.processed} processed`);
      stats = savedProgress;
    }

    console.log('');

    // Get existing newsletter IDs for resume capability
    console.log('📋 Checking already processed newsletters...');
    const existingIds = await getExistingNewsletterIds(bigquery);
    
    // Merge saved progress with database IDs
    savedProgress?.processedNewsletterIds.forEach(id => existingIds.add(id));
    
    console.log(`   Found ${existingIds.size} already processed\n`);

    if (!savedProgress) {
      stats.startTime = new Date().toISOString();
    }

    // Process in small batches to avoid memory issues
    // Use cursor-based pagination (WHERE id > lastId) instead of OFFSET to avoid BigQuery memory errors
    const BATCH_SIZE = 1000;
    let totalToProcess = limit;
    let batchNumber = 0;
    let lastProcessedId = savedProgress?.lastProcessedId;
    
    if (!savedProgress) {
      stats.total = limit;
    }

    console.log(`📥 Processing ${limit} newsletters in batches of ${BATCH_SIZE}...`);
    if (lastProcessedId) {
      console.log(`📍 Resuming from newsletter ID: ${lastProcessedId}\n`);
    } else {
      console.log(`📍 Starting from the beginning\n`);
    }

    // Main processing loop: fetch batch, process, repeat
    while (totalToProcess > 0) {
      batchNumber++;
      const batchLimit = Math.min(BATCH_SIZE, totalToProcess);
      
      console.log(`\n═══════════════════════════════════════════════════════════════`);
      console.log(`📦 BATCH ${batchNumber}: Fetching ${batchLimit} newsletters...`);
      if (lastProcessedId) {
        console.log(`   Starting from ID > ${lastProcessedId}`);
      }
      console.log(`═══════════════════════════════════════════════════════════════\n`);
      
      // Cursor-based pagination: much more efficient than OFFSET at scale
      // Use parameterized query to safely handle the lastProcessedId
      const queryOptions: any = {
        query: `
          SELECT *
          FROM \`${PROJECT_ID}.${DATASET_ID}.${MESSAGES_TABLE}\`
          WHERE (LENGTH(body_text) > 500 OR LENGTH(body_html) > 1000)
            ${lastProcessedId ? 'AND id > @lastProcessedId' : ''}
          ORDER BY id ASC
          LIMIT @batchLimit
        `,
        params: {
          batchLimit: batchLimit
        }
      };
      
      if (lastProcessedId) {
        queryOptions.params.lastProcessedId = lastProcessedId;
      }

      // Retry logic for BigQuery resource errors
      let rows: any[] = [];
      let queryAttempts = 0;
      const maxQueryRetries = 3;
      
      while (queryAttempts < maxQueryRetries) {
        try {
          const [queryRows] = await bigquery.query(queryOptions);
          rows = queryRows;
          break; // Success, exit retry loop
        } catch (queryError: any) {
          queryAttempts++;
          const errorMessage = queryError?.message || String(queryError);
          
          // Check if it's a resource/memory error
          if (errorMessage.includes('Resources exceeded') || 
              errorMessage.includes('resourcesExceeded') ||
              errorMessage.includes('memory') ||
              errorMessage.includes('Resources exceeded during query execution')) {
            if (queryAttempts >= maxQueryRetries) {
              console.error(`\n❌ BigQuery resource error after ${maxQueryRetries} attempts:`);
              console.error(`   ${errorMessage}`);
              console.error(`\n💾 Progress saved. The job can be restarted and it will resume from the last processed ID.`);
              saveProgress();
              throw new Error(`BigQuery resource error: ${errorMessage}`);
            }
            
            // Exponential backoff with jitter
            const waitTime = Math.pow(2, queryAttempts) * 1000 + Math.random() * 1000;
            console.warn(`⚠️  BigQuery resource error (attempt ${queryAttempts}/${maxQueryRetries}). Retrying in ${Math.round(waitTime)}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            // Non-resource error, re-throw immediately
            throw queryError;
          }
        }
      }

      console.log(`✅ Fetched ${rows.length} newsletters from BigQuery\n`);

      if (rows.length === 0) {
        console.log('✅ No more newsletters to fetch - we\'re done!\n');
        break;
      }

      // Process each newsletter in this batch
      for (const newsletter of rows) {
        // Skip if already processed
        if (existingIds.has(newsletter.id)) {
          stats.skipped++;
          console.log(`⏭️  Skipping already processed: ${newsletter.subject}`);
          lastProcessedId = newsletter.id; // Update cursor even for skipped items
          continue;
        }

        logProgress(newsletter);

        try {
          const chunks = await processNewsletterWithEmbeddings(newsletter);

          if (chunks.length > 0) {
            // Insert chunks
            const dataset = bigquery.dataset(DATASET_ID);
            const table = dataset.table(CHUNKS_TABLE);
            
            try {
              await table.insert(chunks);
              stats.chunksCreated += chunks.length;
              console.log(`   ✅ Created ${chunks.length} chunks`);
            } catch (insertError: any) {
              // Handle duplicate insert errors gracefully
              if (insertError?.message?.includes('duplicate') || insertError?.message?.includes('already exists')) {
                console.log(`   ⚠️  Chunks already exist (skipping duplicate insert)`);
                stats.chunksCreated += chunks.length; // Count them anyway for stats
              } else {
                throw insertError; // Re-throw if it's not a duplicate error
              }
            }
          } else {
            console.log(`   ⚠️  No chunks created (insufficient content)`);
          }
          
          // Update cursor after successful processing
          lastProcessedId = newsletter.id;
          stats.lastProcessedId = lastProcessedId;
        } catch (error) {
          stats.failed++;
          console.error(`   ❌ Failed: ${error instanceof Error ? error.message : error}`);
          // Continue processing - don't let one failure stop the pipeline
          // Still update cursor to avoid reprocessing failed items (they'll be skipped on retry)
          lastProcessedId = newsletter.id;
          stats.lastProcessedId = lastProcessedId;
        }
      }

      // Update progress and save after each batch
      totalToProcess -= rows.length;
      saveProgress(); // Save progress after each batch to enable recovery
      
      console.log(`\n✅ Batch ${batchNumber} complete. Processed ${rows.length} newsletters.`);
      console.log(`📊 Progress: ${stats.processed} processed, ${stats.skipped} skipped, ${stats.failed} failed`);
      console.log(`📦 Remaining: ${totalToProcess} newsletters`);
      console.log(`📍 Last processed ID: ${lastProcessedId}\n`);
    }

    // Final summary
    const endTime = new Date().getTime();
    const startTime = new Date(stats.startTime).getTime();
    const elapsedMinutes = (endTime - startTime) / 1000 / 60;

    console.log('\n\n=====================================');
    console.log('PROCESSING COMPLETE');
    console.log('=====================================');
    console.log(`Total newsletters: ${stats.total}`);
    console.log(`Processed: ${stats.processed}`);
    console.log(`Skipped: ${stats.skipped}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`Chunks created: ${stats.chunksCreated}`);
    console.log(`API calls: ${stats.apiCalls}`);
    console.log(`Total cost: $${estimateCost().toFixed(4)}`);
    console.log(`Elapsed time: ${elapsedMinutes.toFixed(1)} minutes (${(elapsedMinutes / 60).toFixed(2)} hours)`);
    console.log('=====================================\n');

    // Delete progress file on successful completion
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
      console.log('🗑️  Deleted progress file');
    }

  } catch (error) {
    console.error('\n❌ Pipeline failed:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`   Error details: ${errorMessage}`);
    
    // Save progress before exiting
    console.log(`\n💾 Progress saved. Resume by running the same command.`);
    if (stats.lastProcessedId) {
      console.log(`📍 Will resume from newsletter ID: ${stats.lastProcessedId}`);
    }
    saveProgress();
    
    // Exit with error code so Cloud Run knows the job failed
    process.exit(1);
  }
}

main();
