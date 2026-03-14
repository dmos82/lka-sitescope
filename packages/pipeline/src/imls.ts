#!/usr/bin/env ts-node
/**
 * IMLS Public Library Data Pipeline
 *
 * Imports Institute of Museum and Library Services (IMLS) public library data.
 * Data source: https://www.imls.gov/research-evaluation/data-collection/public-libraries-survey
 *
 * Download the CSV from IMLS and set IMLS_CSV_PATH env var.
 *
 * Usage:
 *   IMLS_CSV_PATH=/path/to/pls_fy2021_pud21.csv pnpm pipeline:imls
 *
 * Table schema matches the POI table for unified querying.
 */

import 'dotenv/config';
import fs from 'fs';
import readline from 'readline';
import { getPool, closePool } from './lib/db';

const IMLS_CATEGORY_ID = 'imls_public_library';
const IMLS_CATEGORY_NAME = 'Public Library';

interface IMLSRecord {
  LIBID: string;
  LIBNAME: string;
  ADDRESS: string;
  CITY: string;
  STABR: string;   // State abbreviation
  ZIP: string;
  LATITUDE: string;
  LONGITUD: string;
  VISITS: string;
  TOTSTAFF: string;
}

async function ensureTable(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public_libraries (
      lib_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      lat FLOAT NOT NULL,
      lng FLOAT NOT NULL,
      geom GEOMETRY(POINT, 4326),
      annual_visits INTEGER,
      total_staff FLOAT,
      country TEXT DEFAULT 'US',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS public_libraries_geom_idx ON public_libraries USING GIST(geom);
    CREATE INDEX IF NOT EXISTS public_libraries_state_idx ON public_libraries(state);
  `);
  console.log('[IMLS] Table ready');
}

async function upsertLibrary(record: IMLSRecord): Promise<void> {
  const lat = parseFloat(record.LATITUDE);
  const lng = parseFloat(record.LONGITUD);

  if (isNaN(lat) || isNaN(lng)) return;
  if (lat === 0 && lng === 0) return;

  // North America bounds check
  if (lat < 24 || lat > 72 || lng < -141 || lng > -52) return;

  const pool = getPool();
  await pool.query(
    `INSERT INTO public_libraries (lib_id, name, address, city, state, zip, lat, lng, geom, annual_visits, total_staff)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ST_SetSRID(ST_MakePoint($8, $7), 4326), $9, $10)
     ON CONFLICT (lib_id) DO UPDATE SET
       name = EXCLUDED.name,
       annual_visits = EXCLUDED.annual_visits,
       total_staff = EXCLUDED.total_staff,
       geom = EXCLUDED.geom,
       updated_at = now()`,
    [
      record.LIBID,
      record.LIBNAME,
      record.ADDRESS,
      record.CITY,
      record.STABR,
      record.ZIP,
      lat,
      lng,
      parseInt(record.VISITS || '0', 10) || 0,
      parseFloat(record.TOTSTAFF || '0') || 0,
    ]
  );
}

async function parseCsv(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });

    let headers: string[] = [];
    let lineNum = 0;
    let processed = 0;
    let inserted = 0;
    const promises: Promise<void>[] = [];

    rl.on('line', (line) => {
      lineNum++;

      // Parse CSV (simple split — handle quoted fields if needed)
      const fields = line.split(',').map((f) => f.replace(/^"|"$/g, '').trim());

      if (lineNum === 1) {
        headers = fields;
        return;
      }

      if (fields.length < headers.length) return;

      const record: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        record[headers[i]] = fields[i] ?? '';
      }

      processed++;
      const p = upsertLibrary(record as IMLSRecord)
        .then(() => { inserted++; })
        .catch((err) => console.warn(`[IMLS] Skip record ${record.LIBID}: ${err.message}`));
      promises.push(p);

      if (processed % 5000 === 0) {
        console.log(`[IMLS] Processed: ${processed}`);
      }
    });

    rl.on('close', async () => {
      await Promise.allSettled(promises);
      console.log(`[IMLS] Complete. Processed: ${processed}, Inserted: ${inserted}`);
      resolve();
    });

    rl.on('error', reject);
  });
}

async function main() {
  const csvPath = process.env.IMLS_CSV_PATH;

  if (!csvPath) {
    console.error('[IMLS] Set IMLS_CSV_PATH to the IMLS PLS CSV file path');
    console.error('[IMLS] Download from: https://www.imls.gov/research-evaluation/data-collection/public-libraries-survey');
    process.exit(1);
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`[IMLS] File not found: ${csvPath}`);
    process.exit(1);
  }

  console.log('[IMLS] Starting library import...');
  await ensureTable();
  await parseCsv(csvPath);
  await closePool();
}

main().catch((err) => {
  console.error('[IMLS] Fatal error:', err);
  process.exit(1);
});
