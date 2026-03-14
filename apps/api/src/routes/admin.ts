import { Router, Response } from 'express';
import { prisma } from '@lka/database';
import { protect, requireRole, asyncHandler, AuthRequest } from '../middleware/protect';

const router = Router();

/**
 * GET /api/admin/stats
 * Returns high-level system statistics for the admin dashboard.
 */
router.get(
  '/stats',
  protect,
  requireRole('admin'),
  asyncHandler(async (_req: AuthRequest, res: Response): Promise<void> => {
    const [
      totalUsers,
      activeUsers,
      totalLocations,
      totalAnalyses,
      totalPartners,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { is_active: true } }),
      prisma.lkaLocation.count(),
      prisma.savedAnalysis.count(),
      prisma.partner.count(),
    ]);

    const openLocations = await prisma.lkaLocation.count({ where: { status: 'OPEN' } });
    const comingSoonLocations = await prisma.lkaLocation.count({ where: { status: 'COMING_SOON' } });
    const closedLocations = await prisma.lkaLocation.count({ where: { status: 'CLOSED' } });

    // Recent analyses
    const recentAnalyses = await prisma.savedAnalysis.findMany({
      take: 10,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        address: true,
        score: true,
        letter_grade: true,
        country: true,
        created_at: true,
        user_id: true,
      },
    });

    // Score distribution
    const scoreDistribution = await prisma.$queryRaw<Array<{ grade: string; count: bigint }>>`
      SELECT letter_grade as grade, COUNT(*) as count
      FROM saved_analyses
      WHERE letter_grade IS NOT NULL
      GROUP BY letter_grade
      ORDER BY letter_grade
    `;

    res.json({
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
      },
      locations: {
        total: totalLocations,
        open: openLocations,
        coming_soon: comingSoonLocations,
        closed: closedLocations,
      },
      analyses: {
        total: totalAnalyses,
        partners: totalPartners,
        score_distribution: scoreDistribution.map((row: { grade: string; count: bigint }) => ({
          grade: row.grade,
          count: Number(row.count),
        })),
      },
      recent_analyses: recentAnalyses,
      generated_at: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/admin/audit-log
 * Returns the audit log entries (paginated).
 */
router.get(
  '/audit-log',
  protect,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const page = parseInt((req.query.page as string) ?? '1', 10);
    const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 200);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      prisma.auditLog.count(),
    ]);

    res.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  })
);

export default router;
