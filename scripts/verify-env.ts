#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { exit } from 'process';

// Load environment variables from .env file
dotenv.config();

// Required environment variables
const requiredEnvVars = [
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET', 
  'GMAIL_REFRESH_TOKEN'
];

// Check if all required environment variables are present
const missingVars: string[] = [];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    missingVars.push(envVar);
  }
}

// If any variables are missing, exit with error
if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\n💡 Please check your .env file and ensure all required variables are set.');
  console.error('   You can copy .env.example to .env and fill in the values.');
  exit(1);
}

// All variables are present
console.log('✅ All required environment variables are present:');
requiredEnvVars.forEach(varName => {
  const value = process.env[varName];
  const maskedValue = value ? value.substring(0, 4) + '...' : 'undefined';
  console.log(`   - ${varName}: ${maskedValue}`);
});

console.log('\n🎉 Environment validation passed!');
exit(0);
