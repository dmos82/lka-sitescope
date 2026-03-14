import { Router, Request, Response } from 'express';
import { prisma } from '@lka/database';
import { saveAnalysisSchema } from '@lka/shared';
import { protect, requireRole, asyncHandler, AuthRequest } from '../middleware/protect';
import { auditLog } from '../lib/audit';

const router = Router();

// GET /api/saved — list user's saved analyses
router.get(
  '/',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const analyses = await prisma.savedAnalysis.findMany({
      where: { user_id: req.user!.sub },
      orderBy: { created_at: 'desc' },
      select: {
        id: true, address: true, lat: true, lng: true, country: true,
        score: true, letter_grade: true, trade_area_miles: true,
        share_token: true, created_at: true,
      },
    });
    res.json(analyses);
  })
);

// POST /api/saved — save a new analysis (analyst or admin)
router.post(
  '/',
  protect,
  requireRole('analyst', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = saveAnalysisSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    const analysis = await prisma.savedAnalysis.create({
      data: { ...parsed.data, user_id: req.user!.sub },
    });

    auditLog({ userId: req.user!.sub, action: 'ANALYSIS_CREATE', entity: 'SavedAnalysis', entityId: analysis.id, meta: { address: analysis.address }, req });
    res.status(201).json(analysis);
  })
);

// GET /api/saved/:id — get single analysis with partners
router.get(
  '/:id',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const analysis = await prisma.savedAnalysis.findFirst({
      where: { id: req.params.id, user_id: req.user!.sub },
      include: { partners: true },
    });

    if (!analysis) {
      res.status(404).json({ error: 'Analysis not found' });
      return;
    }

    res.json(analysis);
  })
);

// DELETE /api/saved/:id (analyst or admin)
router.delete(
  '/:id',
  protect,
  requireRole('analyst', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const analysis = await prisma.savedAnalysis.findFirst({
      where: { id: req.params.id, user_id: req.user!.sub },
    });

    if (!analysis) {
      res.status(404).json({ error: 'Analysis not found' });
      return;
    }

    await prisma.savedAnalysis.delete({ where: { id: req.params.id } });
    auditLog({ userId: req.user!.sub, action: 'ANALYSIS_DELETE', entity: 'SavedAnalysis', entityId: req.params.id, req });
    res.json({ success: true });
  })
);

// GET /api/saved/:id/share — get share token
router.get(
  '/:id/share',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const analysis = await prisma.savedAnalysis.findFirst({
      where: { id: req.params.id, user_id: req.user!.sub },
      select: { share_token: true },
    });

    if (!analysis) {
      res.status(404).json({ error: 'Analysis not found' });
      return;
    }

    const shareUrl = `${process.env.FRONTEND_URL}/shared/${analysis.share_token}`;
    res.json({ share_token: analysis.share_token, url: shareUrl });
  })
);

// GET /api/saved/export — CSV export of all user analyses
router.get(
  '/export',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const analyses = await prisma.savedAnalysis.findMany({
      where: { user_id: req.user!.sub },
      orderBy: { created_at: 'desc' },
    });

    type AnalysisRow = (typeof analyses)[number];
    const rows = [
      'Address,Country,Score,Grade,Trade Area (mi),Income Threshold,Created At',
      ...analyses.map((a: AnalysisRow) =>
        [
          `"${a.address.replace(/"/g, '""')}"`,
          a.country,
          a.score ?? '',
          a.letter_grade ?? '',
          a.trade_area_miles,
          a.income_threshold ?? '',
          new Date(a.created_at).toISOString(),
        ].join(',')
      ),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="saved-analyses.csv"');
    res.send(rows);
  })
);

// GET /api/saved/shared/:token — public view (no auth)
router.get(
  '/shared/:token',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const analysis = await prisma.savedAnalysis.findUnique({
      where: { share_token: req.params.token },
      include: { partners: { select: { id: true, name: true, category: true, distance_miles: true, status: true } } },
    });

    if (!analysis) {
      res.status(404).json({ error: 'Shared analysis not found' });
      return;
    }

    // Return a read-only view
    res.json({
      address: analysis.address,
      score: analysis.score,
      letter_grade: analysis.letter_grade,
      score_breakdown: analysis.score_breakdown,
      trade_area_miles: analysis.trade_area_miles,
      created_at: analysis.created_at,
      partners: analysis.partners,
    });
  })
);

export default router;
