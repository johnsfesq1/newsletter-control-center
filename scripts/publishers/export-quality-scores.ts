/**
 * Export quality scores for review
 * Creates CSV and markdown files with publisher quality scores
 */

import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const PUBLISHERS_TABLE = 'publishers';

async function exportQualityScores() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  console.log('📊 Exporting quality scores for review...\n');

  try {
    // Query all publishers with quality scores
    const query = `
      SELECT 
        publisher_id,
        publisher_name,
        quality_score,
        citation_count,
        subscriber_estimate,
        recommendation_count,
        topic_relevance_score,
        platform,
        platform_score,
        freshness_score,
        last_seen,
        message_count,
        manual_quality_score_override,
        manual_override_reason,
        is_discovered,
        discovery_id,
        newsletter_url
      FROM \`${PROJECT_ID}.${DATASET_ID}.${PUBLISHERS_TABLE}\`
      WHERE quality_score IS NOT NULL
      ORDER BY quality_score DESC, publisher_name ASC
    `;

    const [rows] = await bigquery.query(query);
    console.log(`   Found ${rows.length} publishers with quality scores\n`);

    if (rows.length === 0) {
      console.log('⚠️  No publishers with quality scores found.\n');
      return;
    }

    // Create output directory
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate CSV
    const csvPath = path.join(outputDir, 'publisher-quality-scores.csv');
    const csvHeaders = [
      'Publisher Name',
      'Quality Score',
      'Citation Count',
      'Subscriber Estimate',
      'Recommendation Count',
      'Topic Relevance',
      'Platform',
      'Last Seen',
      'Message Count',
      'Manual Override',
      'Override Reason',
      'Newsletter URL',
      'Is Discovered',
    ];

    let csvContent = csvHeaders.join(',') + '\n';

    for (const row of rows) {
      const csvRow = [
        `"${(row.publisher_name || '').replace(/"/g, '""')}"`,
        row.quality_score?.toFixed(1) || '',
        row.citation_count || 0,
        row.subscriber_estimate || '',
        row.recommendation_count || 0,
        row.topic_relevance_score?.toFixed(2) || '',
        row.platform || '',
        row.last_seen && row.last_seen !== 'Invalid Date' ? (() => {
          try {
            const date = new Date(row.last_seen);
            return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
          } catch {
            return '';
          }
        })() : '',
        row.message_count || 0,
        row.manual_quality_score_override || '',
        row.manual_override_reason ? `"${row.manual_override_reason.replace(/"/g, '""')}"` : '',
        row.newsletter_url || '',
        row.is_discovered ? 'Yes' : 'No',
      ];
      csvContent += csvRow.join(',') + '\n';
    }

    fs.writeFileSync(csvPath, csvContent);
    console.log(`✅ CSV exported: ${csvPath}\n`);

    // Generate Markdown report
    const mdPath = path.join(outputDir, 'publisher-quality-scores.md');
    let mdContent = '# Publisher Quality Scores\n\n';
    mdContent += `Generated: ${new Date().toISOString()}\n\n`;
    mdContent += `Total Publishers: ${rows.length}\n\n`;

    // Summary statistics
    const highQuality = rows.filter(r => r.quality_score >= 80).length;
    const mediumQuality = rows.filter(r => r.quality_score >= 60 && r.quality_score < 80).length;
    const lowQuality = rows.filter(r => r.quality_score < 60).length;
    const withManualOverride = rows.filter(r => r.manual_quality_score_override !== null).length;

    mdContent += '## Summary Statistics\n\n';
    mdContent += `- **High Quality (≥80):** ${highQuality}\n`;
    mdContent += `- **Medium Quality (60-79):** ${mediumQuality}\n`;
    mdContent += `- **Low Quality (<60):** ${lowQuality}\n`;
    mdContent += `- **Manual Overrides:** ${withManualOverride}\n\n`;

    mdContent += '## All Publishers (Sorted by Quality Score)\n\n';
    mdContent += '| Publisher Name | Quality Score | Citations | Subscribers | Recommendations | Topic Relevance | Platform | Last Seen | Manual Override |\n';
    mdContent += '|----------------|---------------|-----------|-------------|-----------------|-----------------|----------|-----------|-----------------|\n';

    for (const row of rows) {
      const name = (row.publisher_name || '').replace(/\|/g, '\\|');
      const score = row.quality_score?.toFixed(1) || 'N/A';
      const citations = row.citation_count || 0;
      const subscribers = row.subscriber_estimate ? row.subscriber_estimate.toLocaleString() : '-';
      const recommendations = row.recommendation_count || 0;
      const topicRelevance = row.topic_relevance_score ? (row.topic_relevance_score * 100).toFixed(0) + '%' : '-';
      const platform = row.platform || '-';
      const lastSeen = row.last_seen && row.last_seen !== 'Invalid Date' ? (() => {
        try {
          const date = new Date(row.last_seen);
          return isNaN(date.getTime()) ? '-' : date.toISOString().split('T')[0];
        } catch {
          return '-';
        }
      })() : '-';
      const manualOverride = row.manual_quality_score_override ? `**${row.manual_quality_score_override.toFixed(1)}**` : '-';
      
      mdContent += `| ${name} | ${score} | ${citations} | ${subscribers} | ${recommendations} | ${topicRelevance} | ${platform} | ${lastSeen} | ${manualOverride} |\n`;
    }

    fs.writeFileSync(mdPath, mdContent);
    console.log(`✅ Markdown report exported: ${mdPath}\n`);

    // Generate top publishers list
    const topPublishers = rows.slice(0, 50);
    const topPath = path.join(outputDir, 'top-publishers.md');
    let topContent = '# Top 50 Publishers by Quality Score\n\n';
    topContent += `Generated: ${new Date().toISOString()}\n\n`;

    topContent += '| Rank | Publisher Name | Quality Score | Citations | Topic Relevance | Platform |\n';
    topContent += '|------|----------------|---------------|-----------|-----------------|----------|\n';

    topPublishers.forEach((row, idx) => {
      const name = (row.publisher_name || '').replace(/\|/g, '\\|');
      const score = row.quality_score?.toFixed(1) || 'N/A';
      const citations = row.citation_count || 0;
      const topicRelevance = row.topic_relevance_score ? (row.topic_relevance_score * 100).toFixed(0) + '%' : '-';
      const platform = row.platform || '-';
      
      topContent += `| ${idx + 1} | ${name} | ${score} | ${citations} | ${topicRelevance} | ${platform} |\n`;
    });

    fs.writeFileSync(topPath, topContent);
    console.log(`✅ Top 50 publishers exported: ${topPath}\n`);

    // Show summary
    console.log('📊 Export Summary:');
    console.log(`   Total publishers: ${rows.length}`);
    console.log(`   High quality (≥80): ${highQuality}`);
    console.log(`   Medium quality (60-79): ${mediumQuality}`);
    console.log(`   Low quality (<60): ${lowQuality}`);
    console.log(`   With manual overrides: ${withManualOverride}\n`);

    console.log('📁 Files created:');
    console.log(`   - ${csvPath}`);
    console.log(`   - ${mdPath}`);
    console.log(`   - ${topPath}\n`);

    console.log('✅ Export complete!\n');

  } catch (error: any) {
    console.error('❌ Error exporting quality scores:', error.message);
    throw error;
  }
}

exportQualityScores()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

