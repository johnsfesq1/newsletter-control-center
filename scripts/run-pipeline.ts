#!/usr/bin/env ts-node

import { Command } from 'commander';
import * as ingestion from '../src/core/ingestion';
import * as processor from '../src/core/processor';
import * as publisher from '../src/core/publisher';

const program = new Command();

program
  .name('run-pipeline')
  .description('Newsletter Control Center Pipeline CLI')
  .version('1.0.0');

program
  .command('ingest')
  .description('Ingest new newsletters from Gmail')
  .option('--inbox <inbox>', 'Inbox to ingest from: all or email address', 'all')
  .action(async (options) => {
    try {
      const inbox = options.inbox || 'all';
      await ingestion.ingestNewNewsletters(inbox === 'all' ? 'all' : inbox);
      console.log('✅ Ingestion complete');
    } catch (error: any) {
      if (error.message.includes('not implemented yet')) {
        console.log('⚠️  Not implemented yet');
      } else {
        console.error('❌ Ingestion failed:', error.message);
        process.exit(1);
      }
    }
  });

program
  .command('process')
  .description('Process unchunked messages (chunk and embed)')
  .action(async () => {
    try {
      await processor.processUnchunkedMessages();
      console.log('✅ Processing complete');
    } catch (error: any) {
      if (error.message.includes('not implemented yet')) {
        console.log('⚠️  Not implemented yet');
      } else {
        console.error('❌ Processing failed:', error.message);
        process.exit(1);
      }
    }
  });

program
  .command('full')
  .description('Run full pipeline: ingest then process')
  .action(async () => {
    try {
      console.log('📥 Starting ingestion...');
      await ingestion.ingestNewNewsletters('all');
      console.log('✅ Ingestion complete');
      
      console.log('⚙️  Starting processing...');
      await processor.processUnchunkedMessages();
      console.log('✅ Processing complete');
      
      console.log('✅ Full pipeline complete');
    } catch (error: any) {
      if (error.message.includes('not implemented yet')) {
        console.log('⚠️  Not implemented yet');
      } else {
        console.error('❌ Pipeline failed:', error.message);
        process.exit(1);
      }
    }
  });

program
  .command('fix-publishers')
  .description('Fix duplicate publishers via alias merge')
  .action(async () => {
    try {
      // Placeholder for publisher fix logic
      console.log('⚠️  Publisher fix not implemented yet');
    } catch (error: any) {
      console.error('❌ Publisher fix failed:', error.message);
      process.exit(1);
    }
  });

program.parse();

