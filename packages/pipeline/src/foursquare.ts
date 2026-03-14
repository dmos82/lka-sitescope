#!/usr/bin/env ts-node
/**
 * Foursquare POI Pipeline
 *
 * Imports Foursquare Open Places dataset (Parquet) into PostGIS `poi` table.
 * Filters to North America bounding box.
 *
 * Usage:
 *   FSQ_PARQUET_DIR=/path/to/parquet pnpm pipeline:foursquare
 *
 * Note: Requires @dsnp/parquetjs or parquetjs-lite for Parquet reading.
 * The actual dataset is ~100GB; this script handles streaming imports.
 *
 * Table created by migration:
 *   CREATE TABLE poi (
 *     fsq_id TEXT PRIMARY KEY,
 *     name TEXT NOT NULL,
 *     category_id TEXT,
 *     category_name TEXT,
 *     address TEXT,
 *     city TEXT,
 *     state TEXT,
 *     country TEXT,
 *     lat FLOAT,
 *     lng FLOAT,
 *     geom GEOMETRY(POINT, 4326),
 *     created_at TIMESTAMPTZ DEFAULT now()
 *   );
 *   CREATE INDEX ON poi USING GIST(geom);
 *   CREATE INDEX ON poi(category_id);
 */

import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { getPool, closePool } from './lib/db';
import { FSQ_CATEGORIES } from '@lka/shared';

// North America bounding box
const NA_BOUNDS = {
  minLat: 24,
  maxLat: 72,
  minLng: -141,
  maxLng: -52,
};

// Only import categories relevant to LKA analysis
const RELEVANT_CATEGORY_IDS = new Set(Object.values(FSQ_CATEGORIES));

interface POIRecord {
  fsq_id: string;
  name: string;
  category_id: string;
  category_name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  lat: number;
  lng: number;
}

async function ensureTable(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS poi (
      fsq_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category_id TEXT,
      category_name TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      country TEXT,
      lat FLOAT,
      lng FLOAT,
      geom GEOMETRY(POINT, 4326),
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS poi_geom_idx ON poi USING GIST(geom);
    CREATE INDEX IF NOT EXISTS poi_category_idx ON poi(category_id);
    CREATE INDEX IF NOT EXISTS poi_country_idx ON poi(country);
  `);
}

async function upsertPOI(record: POIRecord): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO poi (fsq_id, name, category_id, category_name, address, city, state, country, lat, lng, geom)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ST_SetSRID(ST_MakePoint($10, $9), 4326))
     ON CONFLICT (fsq_id) DO UPDATE SET
       name = EXCLUDED.name,
       category_id = EXCLUDED.category_id,
       category_name = EXCLUDED.category_name,
       geom = EXCLUDED.geom`,
    [
      record.fsq_id, record.name, record.category_id, record.category_name,
      record.address, record.city, record.state, record.country,
      record.lat, record.lng,
    ]
  );
}

async function main() {
  const parquetDir = process.env.FSQ_PARQUET_DIR;

  if (!parquetDir) {
    console.error('Error: Set FSQ_PARQUET_DIR environment variable pointing to Foursquare Parquet files');
    process.exit(1);
  }

  if (!fs.existsSync(parquetDir)) {
    console.error(`Error: Directory not found: ${parquetDir}`);
    process.exit(1);
  }

  console.log('[Foursquare Pipeline] Starting...');
  await ensureTable();

  const files = fs.readdirSync(parquetDir).filter((f) => f.endsWith('.parquet'));
  console.log(`[Foursquare Pipeline] Found ${files.length} Parquet files`);

  let totalProcessed = 0;
  let totalInserted = 0;

  for (const file of files) {
    const filePath = path.join(parquetDir, file);
    console.log(`[Foursquare Pipeline] Processing: ${file}`);

    // Note: Parquet reading requires parquetjs library
    // This is a stub that shows the structure — actual Parquet parsing
    // depends on the specific library version installed
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const parquetjs = require('@dsnp/parquetjs');
      const reader = await parquetjs.ParquetReader.openFile(filePath);
      const cursor = reader.getCursor();

      let row;
      while ((row = await cursor.next()) !== null) {
        totalProcessed++;

        const lat = parseFloat(row.latitude ?? row.lat ?? '');
        const lng = parseFloat(row.longitude ?? row.lng ?? '');

        // Filter to North America
        if (isNaN(lat) || isNaN(lng)) continue;
        if (lat < NA_BOUNDS.minLat || lat > NA_BOUNDS.maxLat) continue;
        if (lng < NA_BOUNDS.minLng || lng > NA_BOUNDS.maxLng) continue;

        // Filter to relevant categories
        const categoryId = String(row.fsq_category_ids?.[0] ?? row.category_id ?? '');
        if (!RELEVANT_CATEGORY_IDS.has(categoryId as never)) continue;

        await upsertPOI({
          fsq_id: String(row.fsq_place_id ?? row.fsq_id),
          name: String(row.name ?? ''),
          category_id: categoryId,
          category_name: String(row.fsq_category_labels?.[0] ?? row.category_name ?? ''),
          address: String(row.address ?? ''),
          city: String(row.locality ?? row.city ?? ''),
          state: String(row.region ?? row.state ?? ''),
          country: String(row.country ?? 'US'),
          lat,
          lng,
        });

        totalInserted++;
        if (totalProcessed % 10000 === 0) {
          console.log(`[Foursquare Pipeline] Processed: ${totalProcessed}, Inserted: ${totalInserted}`);
        }
      }

      await reader.close();
    } catch (err) {
      console.error(`[Foursquare Pipeline] Error processing ${file}:`, err);
      console.log('[Foursquare Pipeline] Note: Install @dsnp/parquetjs to read Parquet files');
    }
  }

  console.log(`[Foursquare Pipeline] Complete. Processed: ${totalProcessed}, Inserted: ${totalInserted}`);
  await closePool();
}

main().catch((err) => {
  console.error('[Foursquare Pipeline] Fatal error:', err);
  process.exit(1);
});
