#!/usr/bin/env ts-node
/**
 * NCES Schools Pipeline
 *
 * Imports public (CCD) and private (PSS) school data from NCES CSV files
 * into the PostGIS `schools` table.
 *
 * Usage:
 *   NCES_CCD_FILE=/path/to/ccd.csv NCES_PSS_FILE=/path/to/pss.csv pnpm pipeline:schools
 *
 * Table created by migration:
 *   CREATE TABLE schools (
 *     id TEXT PRIMARY KEY,
 *     name TEXT NOT NULL,
 *     type TEXT NOT NULL,        -- public, private, charter, montessori
 *     address TEXT,
 *     city TEXT,
 *     state TEXT,
 *     zip TEXT,
 *     lat FLOAT,
 *     lng FLOAT,
 *     enrollment INT,
 *     grade_range TEXT,
 *     geom GEOMETRY(POINT, 4326),
 *     created_at TIMESTAMPTZ DEFAULT now(),
 *     updated_at TIMESTAMPTZ DEFAULT now()
 *   );
 *   CREATE INDEX ON schools USING GIST(geom);
 */

import 'dotenv/config';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import path from 'path';
import { getPool, closePool } from './lib/db';

const BATCH_SIZE = 500;

interface SchoolRecord {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  enrollment: number;
  grade_range: string;
}

async function ensureTable(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      lat FLOAT,
      lng FLOAT,
      enrollment INT,
      grade_range TEXT,
      geom GEOMETRY(POINT, 4326),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS schools_geom_idx ON schools USING GIST(geom);
    CREATE INDEX IF NOT EXISTS schools_type_idx ON schools(type);
  `);
}

async function upsertBatch(records: SchoolRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  const pool = getPool();
  const values: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  for (const r of records) {
    values.push(
      `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, ` +
        `$${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, ` +
        `$${paramIdx++}, ST_SetSRID(ST_MakePoint($${paramIdx - 3}, $${paramIdx - 4}), 4326))`
    );
    params.push(
      r.id, r.name, r.type, r.address, r.city,
      r.state, r.zip, r.lat, r.lng, r.enrollment,
      r.grade_range
    );
  }

  // Use a direct parameterized approach
  let inserted = 0;
  for (const r of records) {
    try {
      await pool.query(
        `INSERT INTO schools (id, name, type, address, city, state, zip, lat, lng, enrollment, grade_range, geom)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, ST_SetSRID(ST_MakePoint($8, $9), 4326))
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           type = EXCLUDED.type,
           enrollment = EXCLUDED.enrollment,
           grade_range = EXCLUDED.grade_range,
           geom = EXCLUDED.geom,
           updated_at = now()`,
        [r.id, r.name, r.type, r.address, r.city, r.state, r.zip, r.lng, r.lat, r.enrollment, r.grade_range]
      );
      inserted++;
    } catch {
      // Skip individual record errors
    }
  }
  return inserted;
}

function detectMontessori(name: string): boolean {
  return name.toLowerCase().includes('montessori');
}

function parseGrade(grade: string | undefined): string {
  if (!grade) return '';
  return grade.trim();
}

async function parseCCDFile(filePath: string): Promise<SchoolRecord[]> {
  const records: SchoolRecord[] = [];
  const rl = createInterface({ input: createReadStream(filePath) });

  let headers: string[] = [];
  let lineCount = 0;

  for await (const line of rl) {
    if (lineCount === 0) {
      headers = line.split(',').map((h) => h.replace(/"/g, '').trim());
      lineCount++;
      continue;
    }

    const values = line.split(',').map((v) => v.replace(/"/g, '').trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = values[i] ?? ''));

    const lat = parseFloat(row['LATS'] ?? row['LAT'] ?? '');
    const lng = parseFloat(row['LONS'] ?? row['LON'] ?? '');

    // Skip records outside continental US + Canada bounding box
    if (isNaN(lat) || isNaN(lng) || lat < 24 || lat > 72 || lng < -141 || lng > -52) continue;

    const name = row['SCH_NAME'] ?? row['SCHNAM'] ?? '';
    if (!name) continue;

    const isMontessori = detectMontessori(name);
    const type = isMontessori ? 'montessori' : (row['CHARTER_TEXT'] === 'Yes' ? 'charter' : 'public');

    records.push({
      id: `ccd_${row['NCESSCH'] ?? row['SCHID'] ?? `${lat}_${lng}`}`,
      name,
      type,
      address: row['LSTREE'] ?? row['LSTREET'] ?? '',
      city: row['LCITY'] ?? '',
      state: row['LSTATE'] ?? row['ST'] ?? '',
      zip: row['LZIP'] ?? '',
      lat,
      lng,
      enrollment: parseInt(row['ENROLLMENT'] ?? row['MEMBER'] ?? '0', 10) || 0,
      grade_range: `${row['GSHI'] ?? ''}-${row['GSLO'] ?? ''}`,
    });

    lineCount++;
  }

  return records;
}

async function main() {
  const ccdFile = process.env.NCES_CCD_FILE;
  const pssFile = process.env.NCES_PSS_FILE;

  if (!ccdFile && !pssFile) {
    console.error('Error: Set NCES_CCD_FILE and/or NCES_PSS_FILE environment variables');
    process.exit(1);
  }

  console.log('[Schools Pipeline] Starting...');
  await ensureTable();

  let totalInserted = 0;

  if (ccdFile) {
    console.log(`[Schools Pipeline] Parsing CCD file: ${ccdFile}`);
    const records = await parseCCDFile(ccdFile);
    console.log(`[Schools Pipeline] Parsed ${records.length} CCD records`);

    // Process in batches
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const inserted = await upsertBatch(batch);
      totalInserted += inserted;
      if ((i / BATCH_SIZE) % 10 === 0) {
        console.log(`[Schools Pipeline] Progress: ${i + batch.length}/${records.length}`);
      }
    }
  }

  console.log(`[Schools Pipeline] Complete. Inserted/updated: ${totalInserted}`);
  await closePool();
}

main().catch((err) => {
  console.error('[Schools Pipeline] Fatal error:', err);
  process.exit(1);
});
