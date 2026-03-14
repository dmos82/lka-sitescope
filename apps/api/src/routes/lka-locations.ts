import { Router, Response } from 'express';
import { prisma } from '@lka/database';
import { lkaLocationSchema } from '@lka/shared';
import { protect, requireRole, asyncHandler, AuthRequest } from '../middleware/protect';

const router = Router();

// GET /api/lka-locations — all authenticated users
router.get(
  '/',
  protect,
  asyncHandler(async (_req: AuthRequest, res: Response): Promise<void> => {
    const locations = await prisma.lkaLocation.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(locations);
  })
);

// GET /api/lka-locations/nearby — check territory conflicts
router.get(
  '/nearby',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const radiusMiles = parseFloat((req.query.radius_miles as string) ?? '15');

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ error: 'lat and lng are required' });
      return;
    }

    // Use PostGIS ST_DWithin for proximity check
    const radiusMeters = radiusMiles * 1609.344;
    const locations = await prisma.$queryRaw<Array<{ id: string; name: string; distance_miles: number }>>`
      SELECT l.id, l.name, l.address, l.lat, l.lng, l.status,
             ST_Distance(
               ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
               ST_SetSRID(ST_MakePoint(l.lng, l.lat), 4326)::geography
             ) / 1609.344 AS distance_miles
      FROM lka_locations l
      WHERE ST_DWithin(
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(l.lng, l.lat), 4326)::geography,
        ${radiusMeters}
      )
      ORDER BY distance_miles ASC
    `;

    res.json(locations);
  })
);

// POST /api/lka-locations — admin only
router.post(
  '/',
  protect,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = lkaLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    const data = {
      ...parsed.data,
      opening_date: parsed.data.opening_date ? new Date(parsed.data.opening_date) : undefined,
      created_by_id: req.user!.sub,
    };

    const location = await prisma.lkaLocation.create({ data });
    res.status(201).json(location);
  })
);

// PATCH /api/lka-locations/:id — admin only
router.patch(
  '/:id',
  protect,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = lkaLocationSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    const updateData = {
      ...parsed.data,
      opening_date: parsed.data.opening_date ? new Date(parsed.data.opening_date) : undefined,
    };

    const location = await prisma.lkaLocation.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json(location);
  })
);

// DELETE /api/lka-locations/:id — admin only
router.delete(
  '/:id',
  protect,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    await prisma.lkaLocation.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  })
);

export default router;
