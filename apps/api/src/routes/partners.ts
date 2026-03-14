import { Router, Response } from 'express';
import { prisma } from '@lka/database';
import { updatePartnerSchema } from '@lka/shared';
import { protect, asyncHandler, AuthRequest } from '../middleware/protect';

const router = Router();

// GET /api/partners?analysis_id=xxx
router.get(
  '/',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { analysis_id } = req.query;
    if (!analysis_id || typeof analysis_id !== 'string') {
      res.status(400).json({ error: 'analysis_id is required' });
      return;
    }

    // Verify the analysis belongs to the user
    const analysis = await prisma.savedAnalysis.findFirst({
      where: { id: analysis_id, user_id: req.user!.sub },
    });

    if (!analysis) {
      res.status(404).json({ error: 'Analysis not found' });
      return;
    }

    const partners = await prisma.partner.findMany({
      where: { analysis_id },
      orderBy: [{ category: 'asc' }, { distance_miles: 'asc' }],
    });

    res.json(partners);
  })
);

// PATCH /api/partners/:id
router.patch(
  '/:id',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = updatePartnerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    // Verify ownership via the analysis
    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      include: { analysis: { select: { user_id: true } } },
    });

    if (!partner || partner.analysis.user_id !== req.user!.sub) {
      res.status(404).json({ error: 'Partner not found' });
      return;
    }

    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: parsed.data,
    });

    res.json(updated);
  })
);

// GET /api/partners/export?analysis_id=xxx
router.get(
  '/export',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { analysis_id } = req.query;
    if (!analysis_id || typeof analysis_id !== 'string') {
      res.status(400).json({ error: 'analysis_id is required' });
      return;
    }

    const analysis = await prisma.savedAnalysis.findFirst({
      where: { id: analysis_id, user_id: req.user!.sub },
    });
    if (!analysis) {
      res.status(404).json({ error: 'Analysis not found' });
      return;
    }

    const partners = await prisma.partner.findMany({
      where: { analysis_id },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    type PartnerRow = typeof partners[number];
    const rows = [
      'Name,Category,Sub Type,Address,Distance (mi),Status,Phone,Notes',
      ...partners.map((p: PartnerRow) =>
        [
          `"${p.name}"`,
          p.category,
          p.sub_type ?? '',
          `"${p.address ?? ''}"`,
          p.distance_miles?.toFixed(2) ?? '',
          p.status,
          p.phone ?? '',
          `"${(p.notes ?? '').replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="partners-${analysis_id}.csv"`);
    res.send(rows);
  })
);

export default router;
