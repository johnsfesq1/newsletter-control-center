/**
 * Briefing Engine Module
 * 
 * Main exports for the intelligence briefing system.
 */

export * from './types';
export { 
  generateBriefing,
  getLatestBriefing,
  getBriefingById,
  getBriefingArchive,
} from './generator';

