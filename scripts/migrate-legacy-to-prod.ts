import 'dotenv/config';

import { getBigQuery } from '../src/bq/client';

type StepResult = { step: string; inserted: number; };

const projectId = process.env.BQ_PROJECT_ID;
const prodDataset = process.env.BQ_DATASET || 'ncc_production';
const legacyDataset = process.env.LEGACY_DATASET || 'ncc_newsletters';
const location = process.env.BQ_LOCATION || 'US';

// Args: --apply (boolean), --limit N (number)
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const limitFlagIdx = args.findIndex(a => a === '--limit');
const BATCH_LIMIT = limitFlagIdx >= 0 ? Math.max(1, Number(args[limitFlagIdx + 1])) : 100000;

if (!projectId) throw new Error('BQ_PROJECT_ID env var is required');

const bq = getBigQuery();

const fq = (ds: string, table: string) => `\`${projectId}.${ds}.${table}\``;

async function q<T=any>(sql: string): Promise<T[]> {
  const [rows] = await bq.query({ query: sql, location });
  return rows as T[];
}

function withLimit(sql: string, lim?: number) {
  return (lim && lim > 0) ? `${sql}\nLIMIT ${lim}` : sql;
}

async function migrateMessages(): Promise<StepResult> {
  const countSQL = `
    SELECT COUNT(*) AS to_insert
    FROM ${fq(legacyDataset, 'messages')} m
    WHERE NOT EXISTS (
      SELECT 1 FROM ${fq(prodDataset, 'raw_emails')} re
      WHERE re.gmail_message_id = m.id
    )`;
  const [{ to_insert }] = await q<{to_insert: string | number}>(countSQL);
  let remaining = Number(to_insert) || 0;
  let inserted = 0;

  const insertBase = `
    INSERT INTO ${fq(prodDataset, 'raw_emails')}
    (gmail_message_id,inbox,history_id,message_id_header,subject,from_email,from_name,reply_to,list_id,
     sent_date,body_html,body_text,content_hash,is_paid,ingested_at)
    SELECT
      m.id,
      CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(NULL AS STRING),
      m.subject, m.sender, CAST(NULL AS STRING), CAST(NULL AS STRING), m.list_id,
      CAST(m.sent_date AS TIMESTAMP),
      m.body_html, m.body_text, CAST(NULL AS STRING),
      COALESCE(m.is_paid, FALSE),
      CAST(COALESCE(m.received_date, m.sent_date, CURRENT_TIMESTAMP()) AS TIMESTAMP)
    FROM ${fq(legacyDataset, 'messages')} m
    WHERE NOT EXISTS (
      SELECT 1 FROM ${fq(prodDataset, 'raw_emails')} re
      WHERE re.gmail_message_id = m.id
    )`;

  if (!APPLY) {
    console.log(`[DRY] messages → raw_emails would insert: ${remaining}`);
    return { step: 'messages', inserted: 0 };
  }

  while (remaining > 0) {
    const batch = Math.min(remaining, BATCH_LIMIT);
    await q(withLimit(insertBase, batch));
    inserted += batch;
    const [{ to_insert: after }] = await q<{to_insert: string | number}>(countSQL);
    remaining = Number(after) || 0;
    console.log(`[APPLY] messages batch inserted=${batch}, remaining=${remaining}`);
    if (batch === 0) break;
  }
  return { step: 'messages', inserted };
}

async function migrateChunks(): Promise<StepResult> {
  const countSQL = `
    SELECT COUNT(*) AS to_insert
    FROM ${fq(legacyDataset, 'chunks')} c
    WHERE NOT EXISTS (
      SELECT 1 FROM ${fq(prodDataset, 'chunks')} pc
      WHERE pc.chunk_id = c.chunk_id
    )`;
  const [{ to_insert }] = await q<{to_insert: string | number}>(countSQL);
  let remaining = Number(to_insert) || 0;
  let inserted = 0;

  const insertBase = `
    INSERT INTO ${fq(prodDataset, 'chunks')}
    (chunk_id,gmail_message_id,publisher_id,source_part,char_start,char_end,chunk_index,chunk_text,created_at)
    SELECT
      c.chunk_id, c.newsletter_id,
      CAST(NULL AS STRING), CAST(NULL AS STRING),
      CAST(NULL AS INT64), CAST(NULL AS INT64),
      c.chunk_index, c.chunk_text,
      COALESCE(c.created_at, CURRENT_TIMESTAMP())
    FROM ${fq(legacyDataset, 'chunks')} c
    WHERE NOT EXISTS (
      SELECT 1 FROM ${fq(prodDataset, 'chunks')} pc
      WHERE pc.chunk_id = c.chunk_id
    )`;

  if (!APPLY) {
    console.log(`[DRY] chunks → chunks would insert: ${remaining}`);
    return { step: 'chunks', inserted: 0 };
  }

  while (remaining > 0) {
    const batch = Math.min(remaining, BATCH_LIMIT);
    await q(withLimit(insertBase, batch));
    inserted += batch;
    const [{ to_insert: after }] = await q<{to_insert: string | number}>(countSQL);
    remaining = Number(after) || 0;
    console.log(`[APPLY] chunks batch inserted=${batch}, remaining=${remaining}`);
    if (batch === 0) break;
  }
  return { step: 'chunks', inserted };
}

async function migrateEmbeddings(): Promise<StepResult> {
  // Only legacy rows that actually have embeddings
  const countSQL = `
    SELECT COUNT(*) AS to_insert
    FROM ${fq(legacyDataset, 'chunks')} c
    WHERE c.chunk_embedding IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM ${fq(prodDataset, 'chunk_embeddings')} e
        WHERE e.chunk_id = c.chunk_id
      )`;
  const [{ to_insert }] = await q<{to_insert: string | number}>(countSQL);
  let remaining = Number(to_insert) || 0;
  let inserted = 0;

  const insertBase = `
    INSERT INTO ${fq(prodDataset, 'chunk_embeddings')}
    (chunk_id,model,dim,embedding,created_at)
    SELECT
      c.chunk_id,
      "legacy",
      ARRAY_LENGTH(c.chunk_embedding),
      c.chunk_embedding,
      COALESCE(c.updated_at, c.created_at, CURRENT_TIMESTAMP())
    FROM ${fq(legacyDataset, 'chunks')} c
    WHERE c.chunk_embedding IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM ${fq(prodDataset, 'chunk_embeddings')} e
        WHERE e.chunk_id = c.chunk_id
      )`;

  if (!APPLY) {
    console.log(`[DRY] legacy embeddings → prod.chunk_embeddings would insert: ${remaining}`);
    return { step: 'embeddings', inserted: 0 };
  }

  while (remaining > 0) {
    const batch = Math.min(remaining, BATCH_LIMIT);
    await q(withLimit(insertBase, batch));
    inserted += batch;
    const [{ to_insert: after }] = await q<{to_insert: string | number}>(countSQL);
    remaining = Number(after) || 0;
    console.log(`[APPLY] embeddings batch inserted=${batch}, remaining=${remaining}`);
    if (batch === 0) break;
  }
  return { step: 'embeddings', inserted };
}

async function main() {
  console.log(`---\nLEGACY → PROD MIGRATION (${APPLY ? 'APPLY' : 'DRY'})`);
  console.log(`Project=${projectId} Location=${location} Legacy=${legacyDataset} Prod=${prodDataset} Limit=${BATCH_LIMIT}\n`);

  const r1 = await migrateMessages();
  const r2 = await migrateChunks();
  const r3 = await migrateEmbeddings();

  console.log('\nSUMMARY:');
  if (!APPLY) {
    console.log('DRY RUN only (no rows inserted).');
  } else {
    console.log(`Inserted: messages=${r1.inserted}, chunks=${r2.inserted}, embeddings=${r3.inserted}`);
  }
  console.log('---');
}

main().catch(err => {
  console.error('Migration failed.\n', err?.message || err);
  process.exit(1);
});

