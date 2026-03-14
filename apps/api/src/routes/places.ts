/**
 * GET /api/places
 * Query: lat, lng, radius_miles (default 5), categories (comma-separated, default all)
 *
 * Returns POIs grouped by category from Google Places (with Overpass fallback).
 * Results are cached 7 days to minimise Google API spend.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { protect, asyncHandler, AuthRequest } from '../middleware/protect';
import {
  fetchPlacesByCategory,
  fetchAllPlaces,
  type PlaceCategory,
} from '../services/places';

const router = Router();

const ALL_CATEGORIES: PlaceCategory[] = [
  'school',
  'library',
  'community_center',
  'grocery',
  'art_gallery',
  'museum',
];

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius_miles: z.coerce.number().min(0.5).max(50).default(5),
  categories: z.string().optional(), // comma-separated
});

// GET /api/places
router.get(
  '/',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() });
      return;
    }

    const { lat, lng, radius_miles, categories: categoriesRaw } = parsed.data;

    // Parse requested categories
    let requestedCategories: PlaceCategory[];
    if (categoriesRaw) {
      const requested = categoriesRaw.split(',').map((c) => c.trim()) as PlaceCategory[];
      requestedCategories = requested.filter((c) => ALL_CATEGORIES.includes(c));
      if (requestedCategories.length === 0) {
        res.status(400).json({ error: 'No valid categories provided', valid: ALL_CATEGORIES });
        return;
      }
    } else {
      requestedCategories = ALL_CATEGORIES;
    }

    try {
      const grouped = await fetchAllPlaces(lat, lng, radius_miles, requestedCategories);

      const summary: Record<string, number> = {};
      let total = 0;
      for (const cat of requestedCategories) {
        const count = grouped[cat]?.length ?? 0;
        summary[cat] = count;
        total += count;
      }

      res.json({
        lat,
        lng,
        radius_miles,
        total,
        summary,
        results: grouped,
        google_enabled: !!process.env.GOOGLE_PLACES_API_KEY,
      });
    } catch (err) {
      console.error('[Places] Fetch error:', err);
      res.status(502).json({ error: 'Failed to fetch POI data' });
    }
  })
);

// GET /api/places/category/:category — single category query
router.get(
  '/category/:category',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const categoryParam = req.params.category as PlaceCategory;
    if (!ALL_CATEGORIES.includes(categoryParam)) {
      res.status(400).json({ error: `Unknown category: ${categoryParam}`, valid: ALL_CATEGORIES });
      return;
    }

    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() });
      return;
    }

    const { lat, lng, radius_miles } = parsed.data;

    try {
      const result = await fetchPlacesByCategory(lat, lng, radius_miles, categoryParam);
      res.json(result);
    } catch (err) {
      console.error(`[Places] Category fetch error (${categoryParam}):`, err);
      res.status(502).json({ error: 'Failed to fetch POI data for category' });
    }
  })
);

export default router;
