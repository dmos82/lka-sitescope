import { Router, Response } from 'express';
import { z } from 'zod';
import { protect, asyncHandler, AuthRequest } from '../middleware/protect';

const router = Router();

// In-memory cache: key → {data, expiresAt}
const cache = new Map<string, { data: unknown; expiresAt: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown, ttlMs = 7 * 24 * 60 * 60 * 1000): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

const MAX_PER_CATEGORY = 50;

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius_miles: z.coerce.number().min(0.5).max(50).default(5),
  type: z.enum(['schools', 'community', 'competitors', 'churches', 'daycares', 'all']).default('all'),
});

interface POIItem {
  id: string;
  name: string;
  type: string;
  category: string;
  lat: number;
  lng: number;
  address?: string;
  distance_miles?: number;
  tags?: Record<string, string>;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * Fetch POIs from OpenStreetMap Overpass API
 */
async function fetchOverpassPOIs(
  lat: number,
  lng: number,
  radiusMeters: number,
  queries: string[]
): Promise<OverpassElement[]> {
  const queryBody = queries.map((q) => `${q}(around:${radiusMeters},${lat},${lng});`).join('\n');

  const overpassQuery = `
    [out:json][timeout:30];
    (
      ${queryBody}
    );
    out center;
  `;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(overpassQuery)}`,
    signal: AbortSignal.timeout(35000),
  });

  if (!res.ok) throw new Error(`Overpass API error: ${res.status}`);

  const json = await res.json() as { elements: OverpassElement[] };
  return json.elements ?? [];
}

function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function elementToPoint(el: OverpassElement): { lat: number; lng: number } | null {
  if (el.lat !== undefined && el.lon !== undefined) return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

function classifySchool(tags: Record<string, string>): string {
  const name = (tags.name ?? '').toLowerCase();
  if (name.includes('montessori')) return 'Montessori';
  if (tags.isced_level === '0' || tags.school === 'preschool') return 'Preschool';
  if (tags.private === 'yes' || tags.operator_type === 'private') return 'Private K-8';
  if (tags.religion) return 'Religious School';
  return 'Public School';
}

// OSM queries grouped by logical category
const SCHOOL_QUERIES = [
  'node[amenity=school]',
  'way[amenity=school]',
  'node[amenity=kindergarten]',
  'way[amenity=kindergarten]',
];

const COMMUNITY_QUERIES = [
  'node[amenity=library]',
  'way[amenity=library]',
  'node[amenity=community_centre]',
  'way[amenity=community_centre]',
  'node[leisure=park][name]',
  'node[amenity=arts_centre]',
  'way[amenity=arts_centre]',
];

const COMPETITOR_QUERIES = [
  'node[name~"montessori",i]',
  'way[name~"montessori",i]',
  'node[name~"waldorf",i]',
  'node[name~"learning tree",i]',
  'node[name~"brightside",i]',
  'node[name~"abc academy",i]',
  'node[name~"kumon",i]',
  'node[name~"sylvan learning",i]',
  'node[amenity=childcare]',
];

const CHURCH_QUERIES = [
  'node[amenity=place_of_worship]',
  'way[amenity=place_of_worship]',
];

const DAYCARE_QUERIES = [
  'node[amenity=childcare]',
  'way[amenity=childcare]',
  'node[amenity=kindergarten]',
  'node[name~"daycare",i]',
  'node[name~"child care",i]',
  'node[name~"preschool",i]',
];

// GET /api/poi
router.get(
  '/',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() });
      return;
    }

    const { lat, lng, radius_miles, type } = parsed.data;
    const radiusMeters = Math.round(radius_miles * 1609.344);
    const cacheKey = `poi:${lat.toFixed(3)},${lng.toFixed(3)}:${radius_miles}:${type}`;

    const cached = getCached<POIItem[]>(cacheKey);
    if (cached) {
      res.json({ source: 'cache', count: cached.length, results: cached });
      return;
    }

    let queriesToRun: string[] = [];
    if (type === 'schools'     || type === 'all') queriesToRun = [...queriesToRun, ...SCHOOL_QUERIES];
    if (type === 'community'   || type === 'all') queriesToRun = [...queriesToRun, ...COMMUNITY_QUERIES];
    if (type === 'competitors' || type === 'all') queriesToRun = [...queriesToRun, ...COMPETITOR_QUERIES];
    if (type === 'churches'    || type === 'all') queriesToRun = [...queriesToRun, ...CHURCH_QUERIES];
    if (type === 'daycares'    || type === 'all') queriesToRun = [...queriesToRun, ...DAYCARE_QUERIES];

    // Deduplicate query strings
    queriesToRun = [...new Set(queriesToRun)];

    let elements: OverpassElement[] = [];
    try {
      elements = await fetchOverpassPOIs(lat, lng, radiusMeters, queriesToRun);
    } catch (err) {
      console.error('[POI] Overpass error:', err);
      res.status(502).json({ error: 'POI service temporarily unavailable' });
      return;
    }

    const results: POIItem[] = [];
    const seenIds = new Set<string>();
    // Track count per type for MAX_PER_CATEGORY cap
    const typeCounts: Record<string, number> = {};

    for (const el of elements) {
      const point = elementToPoint(el);
      if (!point) continue;

      const id = `${el.type}:${el.id}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const tags = el.tags ?? {};
      const name = tags.name;
      if (!name) continue;

      const distance = haversineDistanceMiles(lat, lng, point.lat, point.lng);

      let category = 'Other';
      let itemType = 'poi';
      const nameLower = name.toLowerCase();

      if (tags.amenity === 'school' || tags.amenity === 'kindergarten') {
        category = classifySchool(tags);
        itemType = 'school';
      } else if (tags.amenity === 'library') {
        category = 'Public Library';
        itemType = 'community';
      } else if (tags.amenity === 'community_centre') {
        category = 'Community Center';
        itemType = 'community';
      } else if (tags.leisure === 'park') {
        category = 'Park';
        itemType = 'community';
      } else if (tags.amenity === 'arts_centre') {
        category = 'Arts Center';
        itemType = 'community';
      } else if (tags.amenity === 'place_of_worship') {
        category = tags.religion ? `${tags.religion.charAt(0).toUpperCase()}${tags.religion.slice(1)} Church` : 'Place of Worship';
        itemType = 'church';
      } else if (tags.amenity === 'childcare' || nameLower.includes('daycare') || nameLower.includes('child care') || nameLower.includes('preschool')) {
        category = 'Daycare / Childcare';
        itemType = 'daycare';
      } else if (
        nameLower.includes('montessori') ||
        nameLower.includes('waldorf') ||
        nameLower.includes('kumon') ||
        nameLower.includes('sylvan')
      ) {
        category = 'Enrichment Program (Competitor)';
        itemType = 'competitor';
      }

      // Apply per-type cap
      typeCounts[itemType] = (typeCounts[itemType] ?? 0) + 1;
      if (typeCounts[itemType] > MAX_PER_CATEGORY) continue;

      const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']]
        .filter(Boolean)
        .join(' ');

      results.push({
        id,
        name,
        type: itemType,
        category,
        lat: point.lat,
        lng: point.lng,
        address: address || undefined,
        distance_miles: parseFloat(distance.toFixed(2)),
        tags: Object.keys(tags).length > 0 ? tags : undefined,
      });
    }

    // Sort by distance
    results.sort((a, b) => (a.distance_miles ?? 0) - (b.distance_miles ?? 0));

    setCache(cacheKey, results);
    res.json({ source: 'overpass', count: results.length, results });
  })
);

export default router;
