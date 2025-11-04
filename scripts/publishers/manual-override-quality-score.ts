/**
 * Manual Quality Score Override
 * 
 * Allows manual adjustment of quality scores for specific publishers.
 * Supports:
 * - Full quality score override
 * - Individual signal overrides
 * - Reason tracking
 * 
 * Usage:
 *   npm run publishers:override <publisher_id> <score> [reason]
 *   npm run publishers:override-signal <publisher_id> <signal_name> <value> [reason]
 */

import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const TABLE_ID = 'publishers';

interface OverrideOptions {
  publisherId: string;
  score?: number;
  signalName?: string;
  signalValue?: number;
  reason?: string;
  updatedBy?: string;
}

async function setManualOverride(options: OverrideOptions) {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  const { publisherId, score, signalName, signalValue, reason, updatedBy } = options;

  // Validate
  if (score !== undefined && (score < 0 || score > 100)) {
    throw new Error('Quality score must be between 0 and 100');
  }
  if (signalValue !== undefined && (signalValue < 0 || signalValue > 1)) {
    throw new Error('Signal value must be between 0 and 1');
  }

  const validSignals = ['citation_signal', 'subscriber_signal', 'recommendation_signal', 
                        'topic_relevance_signal', 'platform_signal', 'freshness_signal'];
  if (signalName && !validSignals.includes(signalName)) {
    throw new Error(`Invalid signal name. Must be one of: ${validSignals.join(', ')}`);
  }

  try {
    // First, check if publisher exists and get current manual overrides
    const checkQuery = `
      SELECT 
        publisher_id,
        publisher_name,
        quality_score,
        manual_quality_score_override,
        manual_individual_signal_overrides
      FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
      WHERE publisher_id = @publisher_id
    `;

    const [rows] = await bigquery.query({
      query: checkQuery,
      params: { publisher_id: publisherId },
    });

    if (!rows || rows.length === 0) {
      throw new Error(`Publisher not found: ${publisherId}`);
    }

    const publisher = rows[0];
    console.log(`\n📝 Setting manual override for: ${publisher.publisher_name}`);
    console.log(`   Current quality score: ${publisher.quality_score?.toFixed(1) || 'N/A'}`);
    console.log(`   Current manual override: ${publisher.manual_quality_score_override || 'None'}\n`);

    // Build update query
    let updateFields: string[] = [];
    const params: any = { publisher_id: publisherId };

    if (score !== undefined) {
      // Full quality score override
      updateFields.push('manual_quality_score_override = @score');
      params.score = score;
      console.log(`   Setting quality score override: ${score}`);
    }

    if (signalName && signalValue !== undefined) {
      // Individual signal override
      let signalOverrides = publisher.manual_individual_signal_overrides 
        ? JSON.parse(JSON.stringify(publisher.manual_individual_signal_overrides))
        : {};
      
      signalOverrides[signalName] = signalValue;
      
      updateFields.push('manual_individual_signal_overrides = @signal_overrides');
      params.signal_overrides = JSON.stringify(signalOverrides);
      
      console.log(`   Setting ${signalName} override: ${signalValue}`);
      console.log(`   Note: You'll need to re-run quality scoring for this to take effect`);
    }

    if (reason) {
      updateFields.push('manual_override_reason = @reason');
      params.reason = reason;
      console.log(`   Reason: ${reason}`);
    }

    updateFields.push('manual_override_updated_at = CURRENT_TIMESTAMP()');
    updateFields.push('updated_at = CURRENT_TIMESTAMP()');

    if (updatedBy) {
      updateFields.push('manual_override_updated_by = @updated_by');
      params.updated_by = updatedBy;
    }

    const updateQuery = `
      UPDATE \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
      SET ${updateFields.join(', ')}
      WHERE publisher_id = @publisher_id
    `;

    await bigquery.query({
      query: updateQuery,
      params,
    });

    console.log('\n✅ Manual override set successfully!\n');

    if (score !== undefined) {
      console.log('⚠️  Note: Manual quality score override will take precedence over calculated score.');
      console.log('   The calculated score will be ignored until you remove the override.\n');
    }

    if (signalName && signalValue !== undefined) {
      console.log('⚠️  Note: Individual signal override requires re-running quality scoring.');
      console.log('   Run: npm run publishers:calculate-scores\n');
    }

  } catch (error: any) {
    console.error('❌ Error setting manual override:', error.message);
    throw error;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage:');
    console.error('  Set full quality score override:');
    console.error('    npm run publishers:override <publisher_id> <score> [reason]');
    console.error('');
    console.error('  Set individual signal override:');
    console.error('    npm run publishers:override-signal <publisher_id> <signal_name> <value> [reason]');
    console.error('');
    console.error('  Valid signals: citation_signal, subscriber_signal, recommendation_signal,');
    console.error('                 topic_relevance_signal, platform_signal, freshness_signal');
    console.error('');
    console.error('Examples:');
    console.error('  npm run publishers:override pub_123 85 "High-value source"');
    console.error('  npm run publishers:override-signal pub_123 citation_signal 0.9 "Well-cited"');
    process.exit(1);
  }

  const mode = process.env.OVERRIDE_MODE || 'score';
  const publisherId = args[0];
  
  if (mode === 'signal') {
    // Signal override mode
    const signalName = args[1];
    const signalValue = parseFloat(args[2]);
    const reason = args[3] || undefined;
    
    if (isNaN(signalValue)) {
      console.error('Error: Signal value must be a number between 0 and 1');
      process.exit(1);
    }
    
    setManualOverride({
      publisherId,
      signalName,
      signalValue,
      reason,
      updatedBy: process.env.USER || 'manual',
    })
      .then(() => process.exit(0))
      .catch((error) => {
        console.error('Error:', error);
        process.exit(1);
      });
  } else {
    // Full score override mode
    const score = parseFloat(args[1]);
    const reason = args[2] || undefined;
    
    if (isNaN(score)) {
      console.error('Error: Score must be a number between 0 and 100');
      process.exit(1);
    }
    
    setManualOverride({
      publisherId,
      score,
      reason,
      updatedBy: process.env.USER || 'manual',
    })
      .then(() => process.exit(0))
      .catch((error) => {
        console.error('Error:', error);
        process.exit(1);
      });
  }
}

export { setManualOverride };

