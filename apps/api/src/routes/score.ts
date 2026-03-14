import { Router, Response } from 'express';
import { z } from 'zod';
import { calculateScore, detectCountry, COUNTRY_CONFIG } from '@lka/shared';
import { protect, asyncHandler, AuthRequest } from '../middleware/protect';

const router = Router();

const scoreBodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  trade_area_miles: z.number().min(1).max(50).default(5),
  income_threshold: z.number().min(0).optional(),
  country: z.enum(['US', 'CA']).optional(),
  // Raw factor inputs (provided by client after fetching demographic/POI data)
  factors: z.object({
    target_households_count: z.number().min(0),
    competitor_score: z.number().min(0).max(100),
    school_quality_score: z.number().min(0),
    population_growth_pct: z.number(),
    community_poi_count: z.number().min(0),
    commercial_real_estate_ok: z.boolean(),
  }),
});

// POST /api/score
router.post(
  '/',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = scoreBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    const { lat, lng, country: countryOverride, factors } = parsed.data;
    const country = countryOverride ?? detectCountry(lat, lng);
    const config = COUNTRY_CONFIG[country];

    const result = calculateScore(factors, country);

    res.json({
      ...result,
      lat,
      lng,
      trade_area_miles: parsed.data.trade_area_miles,
      income_threshold: parsed.data.income_threshold ?? config.default_income_threshold,
    });
  })
);

export default router;
