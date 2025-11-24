import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';
import { v4 as uuidv4 } from 'uuid';
import { getBestCleanedContent } from '../newsletter-search/src/lib/newsletter-cleaning';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const MESSAGES_TABLE = 'messages';
const CHUNKS_TABLE = 'chunks';
const LOCATION = 'us-central1';

const TARGET_CHUNK_SIZE = 800;
const OVERLAP_SIZE = 100;
const MIN_CHUNK_SIZE = 200;

interface NewsletterChunk {
  chunk_id: string;
  newsletter_id: string;
  chunk_index: number;
  chunk_text: string;
  chunk_embedding: number[] | null;
  sent_date: any;
  publisher_name: string;
  subject: string;
  version: number;
  created_at: string;
  updated_at: string;
}

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

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const { GoogleAuth } = require('google-auth-library');
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/text-embedding-004:predict`;
    
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

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    if (data.predictions && data.predictions[0] && data.predictions[0].embeddings) {
      const embedding = data.predictions[0].embeddings.values || data.predictions[0].embeddings;
      if (Array.isArray(embedding)) {
        return embedding;
      }
    }
    
    throw new Error('No embedding returned from API');
  } catch (error) {
    console.error('❌ Embedding generation failed:', error);
    throw error;
  }
}

async function processNewsletterWithEmbeddings(newsletter: any): Promise<NewsletterChunk[]> {
  console.log(`\n📄 Processing: ${newsletter.subject}`);
  
  const cleanedContent = getBestCleanedContent(
    newsletter.body_text || '',
    newsletter.body_html || ''
  );

  if (!cleanedContent || cleanedContent.length < MIN_CHUNK_SIZE) {
    console.log(`   ⚠️  Insufficient content (${cleanedContent?.length || 0} chars)`);
    return [];
  }

  const chunks = createSemanticChunks(cleanedContent, TARGET_CHUNK_SIZE);
  const overlappedChunks = addOverlap(chunks, OVERLAP_SIZE);

  console.log(`   📏 Cleaned: ${cleanedContent.length} chars → ${overlappedChunks.length} chunks`);

  const chunkRecords: NewsletterChunk[] = [];

  for (let i = 0; i < overlappedChunks.length; i++) {
    const chunkText = overlappedChunks[i];
    
    console.log(`   🧠 Generating embedding for chunk ${i + 1}/${overlappedChunks.length}...`);
    const embedding = await generateEmbedding(chunkText);

    chunkRecords.push({
      chunk_id: uuidv4(),
      newsletter_id: newsletter.id,
      chunk_index: i,
      chunk_text: chunkText,
      chunk_embedding: embedding,
      sent_date: newsletter.sent_date,
      publisher_name: newsletter.publisher_name,
      subject: newsletter.subject,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Small delay to avoid rate limits
    if (i < overlappedChunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return chunkRecords;
}

async function recreateTable(bigquery: BigQuery): Promise<void> {
  const dataset = bigquery.dataset(DATASET_ID);
  const table = dataset.table(CHUNKS_TABLE);

  console.log('🗑️  Deleting existing table...');
  try {
    await table.delete();
    console.log('✅ Table deleted');
  } catch (error) {
    console.log('⚠️  Table may not exist, continuing...');
  }

  console.log('📝 Creating new table with correct schema (ARRAY with REPEATED mode)...');
  
  await table.create({
    schema: [
      { name: 'chunk_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'newsletter_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'chunk_index', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'chunk_text', type: 'STRING', mode: 'REQUIRED' },
      { name: 'chunk_embedding', type: 'FLOAT64', mode: 'REPEATED' },
      { name: 'sent_date', type: 'TIMESTAMP', mode: 'NULLABLE' },
      { name: 'publisher_name', type: 'STRING', mode: 'NULLABLE' },
      { name: 'subject', type: 'STRING', mode: 'NULLABLE' },
      { name: 'version', type: 'INTEGER', mode: 'REQUIRED' },
      { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
      { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' }
    ],
    timePartitioning: {
      type: 'DAY',
      field: 'created_at'
    }
  });

  console.log('✅ Table created');
}

async function main() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  try {
    // Recreate table
    await recreateTable(bigquery);

    // Fetch test newsletter
    const TEST_ID = '191eb243eb2e03f9';
    console.log('\n📥 Fetching test newsletter...');
    const query = `
      SELECT *
      FROM \`${PROJECT_ID}.${DATASET_ID}.${MESSAGES_TABLE}\`
      WHERE id = '${TEST_ID}'
      LIMIT 1
    `;

    const [rows] = await bigquery.query(query);
    const newsletter = rows[0];

    // Process newsletter with embeddings
    const chunks = await processNewsletterWithEmbeddings(newsletter);

    // Insert chunks into BigQuery
    if (chunks.length > 0) {
      console.log(`\n💾 Inserting ${chunks.length} chunks into BigQuery...`);
      const dataset = bigquery.dataset(DATASET_ID);
      const table = dataset.table(CHUNKS_TABLE);
      await table.insert(chunks);
      console.log(`✅ Inserted ${chunks.length} chunks with embeddings`);
    }

    console.log('\n🎉 Complete! Chunks and embeddings created successfully.');

  } catch (error) {
    console.error('❌ Failed:', error);
    throw error;
  }
}

main();
