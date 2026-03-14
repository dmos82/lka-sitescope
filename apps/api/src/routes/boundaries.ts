/**
 * GET /api/boundaries
 * Query: lat, lng
 * Returns place (city), county, and census tract boundary GeoJSON for a point.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { protect, asyncHandler, AuthRequest } from '../middleware/protect';
import { getBoundaries } from '../services/boundaries';

const router = Router();

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

// GET /api/boundaries
router.get(
  '/',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() });
      return;
    }

    const { lat, lng } = parsed.data;

    try {
      const result = await getBoundaries(lat, lng);
      res.json(result);
    } catch (err) {
      console.error('[Boundaries] Error:', err);
      res.status(502).json({ error: 'Failed to fetch boundary data from TIGERweb' });
    }
  })
);

export default router;
