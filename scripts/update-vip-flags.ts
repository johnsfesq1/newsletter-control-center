import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';
import { getGmail } from '../src/lib/gmail';
import vipConfig from '../config/vip.json';

dotenv.config();

// BigQuery configuration
const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const TABLE_ID = 'messages';

// Initialize BigQuery client using Application Default Credentials
const bigquery = new BigQuery({ projectId: PROJECT_ID });

interface VipUpdateResult {
  sender: string;
  updatedCount: number;
}

/**
 * Update VIP flags for a specific sender
 */
async function updateVipFlagsForSender(sender: string): Promise<number> {
  const query = `
    UPDATE \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
    SET is_vip = true
    WHERE sender = @sender
      AND is_vip = false
  `;
  
  const options = {
    query: query,
    params: {
      sender: sender
    }
  };
  
  const [job] = await bigquery.createQueryJob(options);
  const [rows] = await job.getQueryResults();
  
  // Get the number of affected rows from job metadata
  const [jobMetadata] = await job.getMetadata();
  return jobMetadata.statistics?.query?.numDmlAffectedRows || 0;
}

/**
 * Get current VIP statistics
 */
async function getVipStatistics(): Promise<{ total: number; vip: number; nonVip: number }> {
  const query = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN is_vip = true THEN 1 ELSE 0 END) as vip,
      SUM(CASE WHEN is_vip = false THEN 1 ELSE 0 END) as non_vip
    FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
  `;
  
  const [rows] = await bigquery.query(query);
  return {
    total: parseInt(rows[0].total),
    vip: parseInt(rows[0].vip),
    nonVip: parseInt(rows[0].non_vip)
  };
}

(async () => {
  try {
    console.log('🚀 Starting VIP flags backfill...');
    console.log(`📊 Project: ${PROJECT_ID}`);
    console.log(`📊 Dataset: ${DATASET_ID}`);
    console.log(`📊 Table: ${TABLE_ID}\n`);
    
    // Initialize Gmail client to establish OAuth2 authentication context
    console.log('🔐 Establishing authentication...');
    const gmail = getGmail();
    console.log('✅ Authentication established\n');
    
    // Get initial statistics
    console.log('📈 Current VIP statistics:');
    const initialStats = await getVipStatistics();
    console.log(`   Total newsletters: ${initialStats.total.toLocaleString()}`);
    console.log(`   VIP newsletters: ${initialStats.vip.toLocaleString()}`);
    console.log(`   Non-VIP newsletters: ${initialStats.nonVip.toLocaleString()}\n`);
    
    // Process each VIP sender
    const vipSenders = vipConfig.senders;
    console.log(`🔄 Processing ${vipSenders.length} VIP senders...\n`);
    
    const results: VipUpdateResult[] = [];
    let totalUpdated = 0;
    
    for (let i = 0; i < vipSenders.length; i++) {
      const sender = vipSenders[i];
      const senderNumber = i + 1;
      
      try {
        console.log(`📤 [${senderNumber}/${vipSenders.length}] Updating ${sender}...`);
        
        const updatedCount = await updateVipFlagsForSender(sender);
        
        results.push({
          sender: sender,
          updatedCount: updatedCount
        });
        
        totalUpdated += updatedCount;
        
        if (updatedCount > 0) {
          console.log(`   ✅ Updated ${updatedCount} newsletters`);
        } else {
          console.log(`   ⏭️  No newsletters found to update`);
        }
        
      } catch (error) {
        console.error(`   ❌ Error updating ${sender}:`, error);
        results.push({
          sender: sender,
          updatedCount: 0
        });
      }
    }
    
    // Get final statistics
    console.log('\n📈 Final VIP statistics:');
    const finalStats = await getVipStatistics();
    console.log(`   Total newsletters: ${finalStats.total.toLocaleString()}`);
    console.log(`   VIP newsletters: ${finalStats.vip.toLocaleString()}`);
    console.log(`   Non-VIP newsletters: ${finalStats.nonVip.toLocaleString()}`);
    
    // Show detailed results
    console.log('\n📊 VIP Update Summary:');
    console.log('='.repeat(60));
    
    const successfulUpdates = results.filter(r => r.updatedCount > 0);
    const failedUpdates = results.filter(r => r.updatedCount === 0);
    
    if (successfulUpdates.length > 0) {
      console.log('\n✅ Successfully updated:');
      successfulUpdates.forEach(result => {
        console.log(`   ${result.sender}: ${result.updatedCount} newsletters`);
      });
    }
    
    if (failedUpdates.length > 0) {
      console.log('\n⏭️  No updates needed:');
      failedUpdates.forEach(result => {
        console.log(`   ${result.sender}: 0 newsletters`);
      });
    }
    
    console.log('\n🎉 BACKFILL COMPLETE!');
    console.log('='.repeat(60));
    console.log(`📊 Total newsletters updated: ${totalUpdated.toLocaleString()}`);
    console.log(`📊 VIP senders processed: ${vipSenders.length}`);
    console.log(`📊 Successful updates: ${successfulUpdates.length}`);
    console.log(`📊 No updates needed: ${failedUpdates.length}`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('💥 Fatal error during VIP flags backfill:', error);
    process.exit(1);
  }
})();
