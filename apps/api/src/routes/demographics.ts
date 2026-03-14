import { Router, Response } from 'express';
import { z } from 'zod';
import { protect, asyncHandler, AuthRequest } from '../middleware/protect';
import { detectCountry } from '@lka/shared';
import {
  getDemographicsForLocation,
  getDemographicsForPlace,
  getDemographicsForRadius,
} from '../services/census';
import { getCanadianDemographics } from '../services/statscan';

const router = Router();

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  income_threshold: z.coerce.number().min(0).optional(),
  trade_area_miles: z.coerce.number().min(1).max(50).optional().default(5),
  /** level controls which geography level to use for US demographics */
  level: z.enum(['place', 'tract', 'radius']).optional().default('place'),
  /** radius in miles — used when level=radius */
  radius_miles: z.coerce.number().min(1).max(50).optional().default(5),
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

    const { lat, lng, income_threshold, level, radius_miles } = parsed.data;

    const country = detectCountry(lat, lng);

    let result;
    if (country === 'CA') {
      // Canadian data always at dissemination area level
      result = await getCanadianDemographics(lat, lng, income_threshold);
    } else {
      // US: choose geography level
      if (level === 'tract') {
        result = await getDemographicsForLocation(lat, lng, income_threshold);
      } else if (level === 'radius') {
        result = await getDemographicsForRadius(lat, lng, radius_miles, income_threshold);
      } else {
        // Default: place (city/town)
        result = await getDemographicsForPlace(lat, lng, income_threshold);
      }
    }

    if (!result) {
      res.status(404).json({
        error: 'No census data found for this location',
        hint: country === 'CA'
          ? 'Location may be in an area without StatsCan coverage'
          : 'Location may be outside US coverage',
      });
      return;
    }

    res.json(result);
  })
);

export default router;
