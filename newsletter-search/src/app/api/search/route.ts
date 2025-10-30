import { NextRequest, NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const TABLE_ID = 'messages';

const bigquery = new BigQuery({ projectId: PROJECT_ID });

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const publisher = searchParams.get('publisher') || '';
    const vipOnly = searchParams.get('vipOnly') === 'true';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = 20;
    const offset = (page - 1) * limit;

    // Build WHERE conditions
    const whereConditions = [];
    
    if (query) {
      whereConditions.push(`(
        LOWER(body_text) LIKE LOWER('%${query.replace(/'/g, "''")}%') OR
        LOWER(subject) LIKE LOWER('%${query.replace(/'/g, "''")}%') OR
        LOWER(sender) LIKE LOWER('%${query.replace(/'/g, "''")}%')
      )`);
    }
    
    if (startDate) {
      whereConditions.push(`sent_date >= '${startDate}'`);
    }
    
    if (endDate) {
      whereConditions.push(`sent_date <= '${endDate}'`);
    }
    
    if (publisher) {
      whereConditions.push(`LOWER(sender) LIKE LOWER('%${publisher.replace(/'/g, "''")}%')`);
    }
    
    if (vipOnly) {
      whereConditions.push(`is_vip = true`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Build snippet logic for search context
    let snippetLogic = 'SUBSTR(body_text, 1, 200) as snippet';
    if (query) {
      const escapedQuery = query.replace(/'/g, "''");
      snippetLogic = `
        CASE 
          WHEN LOWER(body_text) LIKE LOWER('%${escapedQuery}%') THEN
            CONCAT(
              '...',
              SUBSTR(
                body_text, 
                GREATEST(1, REGEXP_INSTR(LOWER(body_text), LOWER('${escapedQuery}')) - 100),
                200
              ),
              '...'
            )
          ELSE SUBSTR(body_text, 1, 200)
        END as snippet
      `;
    }

    // Build the query
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
        has_attachments,
        ${snippetLogic}
      FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
      ${whereClause}
      ORDER BY sent_date DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    console.log('Executing query:', sqlQuery);
    const [rows] = await bigquery.query(sqlQuery);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
      ${whereClause}
    `;
    
    const [countRows] = await bigquery.query(countQuery);
    const total = countRows[0]?.total || 0;

    return NextResponse.json({
      results: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Search failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
