import { NextRequest, NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const TABLE_ID = 'messages';

const bigquery = new BigQuery({ projectId: PROJECT_ID });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const sqlQuery = `
      SELECT 
        id,
        sender,
        subject,
        sent_date,
        received_date,
        body_text,
        body_html,
        is_vip,
        publisher_name,
        source_type,
        word_count,
        has_attachments
      FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
      WHERE id = '${id.replace(/'/g, "''")}'
      LIMIT 1
    `;

    const [rows] = await bigquery.query(sqlQuery);
    
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Newsletter not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(rows[0]);

  } catch (error) {
    console.error('Newsletter fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch newsletter', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
