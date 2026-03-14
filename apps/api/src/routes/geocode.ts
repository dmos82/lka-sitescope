import { Router, Response } from 'express';
import { z } from 'zod';
import { protect, asyncHandler, AuthRequest } from '../middleware/protect';

const router = Router();

const querySchema = z.object({
  address: z.string().min(3).max(500),
  country: z.enum(['US', 'CA']).optional(),
});

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    country_code?: string;
  };
}

// GET /api/locations/search?address=...&country=US
router.get(
  '/search',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() });
      return;
    }

    const { address, country } = parsed.data;

    // Use Nominatim (OpenStreetMap) for geocoding
    const params = new URLSearchParams({
      format: 'json',
      q: address,
      limit: '5',
      addressdetails: '1',
      'accept-language': 'en',
      ...(country === 'US' ? { countrycodes: 'us' } : {}),
      ...(country === 'CA' ? { countrycodes: 'ca' } : {}),
      ...(country == null ? { countrycodes: 'us,ca' } : {}),
    });

    const url = `https://nominatim.openstreetmap.org/search?${params}`;

    try {
      const nominatimRes = await fetch(url, {
        headers: {
          'User-Agent': `LKA-SiteScope/1.0 (${process.env.NOMINATIM_CONTACT_EMAIL ?? 'contact@lkasitescope.com'})`,
          'Accept-Language': 'en',
        },
      });

      if (!nominatimRes.ok) {
        res.status(502).json({ error: 'Geocoding service unavailable' });
        return;
      }

      const results = (await nominatimRes.json()) as NominatimResult[];

      const formatted = results.map((r) => ({
        address: r.display_name,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        country: r.address?.country_code?.toUpperCase() ?? 'US',
      }));

      res.json(formatted);
    } catch (err) {
      console.error('[Geocode] Error:', err);
      res.status(502).json({ error: 'Geocoding failed' });
    }
  })
);

export default router;
