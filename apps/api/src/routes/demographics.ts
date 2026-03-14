import { Router, Response } from 'express';
import { z } from 'zod';
import { protect, asyncHandler, AuthRequest } from '../middleware/protect';
import { getDemographicsForLocation } from '../services/census';

const router = Router();

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  income_threshold: z.coerce.number().min(0).optional(),
  trade_area_miles: z.coerce.number().min(1).max(50).optional().default(5),
});

// GET /api/demographics
router.get(
  '/',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() });
      return;
    }

    const { lat, lng, income_threshold } = parsed.data;

    const result = await getDemographicsForLocation(lat, lng, income_threshold);

    if (!result) {
      res.status(404).json({
        error: 'No census data found for this location',
        hint: 'Location may be outside US coverage',
      });
      return;
    }

    res.json(result);
  })
);

export default router;
