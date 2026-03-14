import { Router, Response } from 'express';
import { z } from 'zod';
import { protect, asyncHandler, AuthRequest } from '../middleware/protect';
import { prisma } from '@lka/database';

const router = Router();

// In-memory cache: 7-day TTL
const cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius_miles: z.coerce.number().min(0.5).max(50).default(5),
  type: z.enum(['public', 'private', 'charter', 'montessori', 'all']).default('all'),
  limit: z.coerce.number().min(1).max(200).default(50),
});

interface SchoolResult {
  id: string;
  name: string;
  type: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number;
  lng: number;
  enrollment: number | null;
  grade_range: string | null;
  distance_miles: number;
}

/**
 * GET /api/schools
 * Query pipeline-imported school data by lat/lng radius.
 * Returns schools from the `schools` table (populated by NCES pipeline importer).
 * Falls back to empty array if table does not exist yet.
 */
router.get(
  '/',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() });
      return;
    }

    const { lat, lng, radius_miles, type, limit } = parsed.data;
    const cacheKey = `schools:${lat.toFixed(3)},${lng.toFixed(3)}:${radius_miles}:${type}:${limit}`;

    const cached = getCached<SchoolResult[]>(cacheKey);
    if (cached) {
      res.json({ source: 'cache', count: cached.length, results: cached });
      return;
    }

    const radiusMeters = radius_miles * 1609.344;

    try {
      // Check if schools table exists
      const tableCheck = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'schools'
        ) as exists
      ` as Array<{ exists: boolean }>;

      if (!tableCheck[0]?.exists) {
        res.json({
          source: 'pipeline',
          count: 0,
          results: [],
          note: 'Schools table not yet populated. Run the NCES pipeline importer first.',
        });
        return;
      }

      const typeFilter = type === 'all' ? '' : `AND s.type = '${type}'`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schools = (await prisma.$queryRawUnsafe(`
        SELECT
          s.id, s.name, s.type, s.address, s.city, s.state, s.zip,
          s.lat, s.lng, s.enrollment, s.grade_range,
          ST_Distance(
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography
          ) / 1609.344 AS distance_miles
        FROM schools s
        WHERE ST_DWithin(
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography,
          ${radiusMeters}
        )
        ${typeFilter}
        ORDER BY distance_miles ASC
        LIMIT ${limit}
      `)) as SchoolResult[];

      setCache(cacheKey, schools);
      res.json({ source: 'pipeline', count: schools.length, results: schools });
    } catch (err) {
      console.error('[Schools] Query error:', err);
      res.status(500).json({ error: 'Failed to query schools data' });
    }
  })
);

export default router;
