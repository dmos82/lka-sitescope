#!/usr/bin/env ts-node
/**
 * Run all pipeline imports in sequence
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import path from 'path';

const SCRIPTS = [
  { name: 'Schools (NCES)', script: 'schools.ts', envCheck: 'NCES_CCD_FILE' },
  { name: 'Foursquare POI', script: 'foursquare.ts', envCheck: 'FSQ_PARQUET_DIR' },
];

async function main() {
  console.log('[Pipeline] Starting all imports...');

  for (const { name, script, envCheck } of SCRIPTS) {
    if (!process.env[envCheck]) {
      console.log(`[Pipeline] Skipping ${name} — ${envCheck} not set`);
      continue;
    }

    console.log(`[Pipeline] Running: ${name}`);
    try {
      execSync(`ts-node ${path.join(__dirname, script)}`, {
        stdio: 'inherit',
        env: process.env,
      });
      console.log(`[Pipeline] ${name} complete`);
    } catch (err) {
      console.error(`[Pipeline] ${name} failed:`, err);
    }
  }

  console.log('[Pipeline] All imports complete');
}

main().catch((err) => {
  console.error('[Pipeline] Fatal error:', err);
  process.exit(1);
});
