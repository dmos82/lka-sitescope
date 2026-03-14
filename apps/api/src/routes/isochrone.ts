import { Router, Response } from 'express';
import { z } from 'zod';
import { protect, asyncHandler, AuthRequest } from '../middleware/protect';

const router = Router();

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  profile: z.enum(['driving-car', 'walking', 'cycling-regular']).default('driving-car'),
  // seconds: 5, 10, 15, 20, 25 min available; default 10/15/20
  ranges: z.string().optional().default('600,900,1200'),
});

// In-memory cache: 30-day TTL
const cache = new Map<string, { data: unknown; expiresAt: number }>();
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expiresAt: Date.now() + THIRTY_DAYS_MS });
}

const ORS_BASE = 'https://api.openrouteservice.org/v2';

/**
 * GET /api/isochrone
 *
 * Returns drive-time isochrone polygons (GeoJSON) for a location.
 * Uses OpenRouteService API with 30-day cache.
 * Falls back to radius-based circles if ORS API key is not configured.
 *
 * Query params:
 *   lat, lng, profile (driving-car|walking|cycling-regular), ranges (seconds CSV)
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

    const { lat, lng, profile, ranges } = parsed.data;
    const rangeArray = ranges.split(',').map(Number).filter((n) => !isNaN(n) && n > 0);

    if (rangeArray.length === 0) {
      res.status(400).json({ error: 'Invalid ranges parameter' });
      return;
    }

    const cacheKey = `iso:${lat.toFixed(4)},${lng.toFixed(4)}:${profile}:${ranges}`;
    const cached = getCached<unknown>(cacheKey);
    if (cached) {
      res.json({ source: 'cache', geojson: cached });
      return;
    }

    const ORS_API_KEY = process.env.ORS_API_KEY;

    if (!ORS_API_KEY) {
      // Fallback: generate circle polygons as drive-time approximation
      // Uses average city speeds with a network efficiency factor:
      //   driving: 25 mph avg with 0.75 network factor = ~18.75 mph effective
      //   cycling:  12 mph avg with 0.85 factor
      //   walking:   3 mph avg with 0.90 factor
      const speedMph =
        profile === 'walking' ? 3 * 0.90
        : profile === 'cycling-regular' ? 12 * 0.85
        : 25 * 0.75;

      const ISOCHRONE_COLORS = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'];

      const features = rangeArray.map((seconds, i) => {
        const miles = (seconds / 3600) * speedMph;
        const radiusMeters = miles * 1609.344;
        const steps = 64;
        const coords: [number, number][] = [];
        for (let j = 0; j <= steps; j++) {
          const angle = (j / steps) * 2 * Math.PI;
          const dx = radiusMeters * Math.cos(angle);
          const dy = radiusMeters * Math.sin(angle);
          const dLat = dy / 111320;
          const dLng = dx / (111320 * Math.cos((lat * Math.PI) / 180));
          coords.push([lng + dLng, lat + dLat]);
        }
        const minutes = Math.round(seconds / 60);
        return {
          type: 'Feature',
          properties: {
            value: seconds,
            label: `${minutes} min`,
            area_km2: parseFloat((Math.PI * (radiusMeters / 1000) ** 2).toFixed(2)),
            color: ISOCHRONE_COLORS[i] ?? '#999',
          },
          geometry: { type: 'Polygon', coordinates: [coords] },
        };
      });

      const geojson = { type: 'FeatureCollection', features };
      setCache(cacheKey, geojson);
      res.json({ source: 'radius-fallback', note: 'Set ORS_API_KEY for real isochrones', geojson });
      return;
    }

    // Fetch from OpenRouteService
    try {
      const orsRes = await fetch(`${ORS_BASE}/isochrones/${profile}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: ORS_API_KEY,
        },
        body: JSON.stringify({
          locations: [[lng, lat]],
          range: rangeArray,
          range_type: 'time',
          attributes: ['area', 'reachfactor'],
          smoothing: 0.5,
        }),
      });

      if (!orsRes.ok) {
        const errBody = await orsRes.text();
        console.error('[Isochrone] ORS error:', errBody);
        res.status(502).json({ error: 'Isochrone service unavailable', detail: errBody });
        return;
      }

      const geojson = await orsRes.json() as { features?: Array<Record<string, unknown>> };

      // Add color properties based on range index
      const colors = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'];
      if (geojson.features) {
        geojson.features = geojson.features.map((feature: Record<string, unknown>, i: number) => ({
          ...feature,
          properties: {
            ...(feature.properties as Record<string, unknown>),
            color: colors[i] ?? '#999',
            label: `${Math.round(rangeArray[i] / 60)} min`,
          },
        }));
      }

      setCache(cacheKey, geojson);
      res.json({ source: 'openrouteservice', geojson });
    } catch (err) {
      console.error('[Isochrone] Fetch error:', err);
      res.status(502).json({ error: 'Isochrone service unavailable' });
    }
  })
);

export default router;
