import { Router, Response } from 'express';
import { prisma } from '@lka/database';
import { protect, requireRole, asyncHandler, AuthRequest } from '../middleware/protect';

const router = Router();

type FreshnessStatus = 'fresh' | 'stale' | 'missing';

interface DataSource {
  name: string;
  table: string | null;
  description: string;
  last_updated: string | null;
  record_count: number | null;
  freshness: FreshnessStatus;
  freshness_threshold_days: number;
}

function getFreshness(lastUpdated: Date | null, thresholdDays: number): FreshnessStatus {
  if (!lastUpdated) return 'missing';
  const daysSince = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= thresholdDays) return 'fresh';
  if (daysSince <= thresholdDays * 2) return 'stale';
  return 'missing';
}

/**
 * GET /api/data-health
 * Returns health metrics for all data sources: pipeline tables, Prisma models.
 * Admin-only endpoint.
 */
router.get(
  '/',
  protect,
  requireRole('admin'),
  asyncHandler(async (_req: AuthRequest, res: Response): Promise<void> => {
    const sources: DataSource[] = [];

    // ── Prisma model counts ─────────────────────────────────────────────
    const [
      userCount,
      locationCount,
      analysisCount,
      partnerCount,
      auditLogCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.lkaLocation.count(),
      prisma.savedAnalysis.count(),
      prisma.partner.count(),
      prisma.auditLog.count(),
    ]);

    const latestAnalysis = await prisma.savedAnalysis.findFirst({
      orderBy: { created_at: 'desc' },
      select: { created_at: true },
    });

    const latestAuditLog = await prisma.auditLog.findFirst({
      orderBy: { created_at: 'desc' },
      select: { created_at: true },
    });

    sources.push({
      name: 'Users',
      table: 'users',
      description: 'Application user accounts',
      last_updated: null,
      record_count: userCount,
      freshness: 'fresh',
      freshness_threshold_days: 0,
    });

    sources.push({
      name: 'LKA Locations',
      table: 'lka_locations',
      description: 'Known LKA franchise locations',
      last_updated: null,
      record_count: locationCount,
      freshness: locationCount > 0 ? 'fresh' : 'missing',
      freshness_threshold_days: 0,
    });

    sources.push({
      name: 'Saved Analyses',
      table: 'saved_analyses',
      description: 'User-saved site analyses',
      last_updated: latestAnalysis?.created_at?.toISOString() ?? null,
      record_count: analysisCount,
      freshness: 'fresh',
      freshness_threshold_days: 0,
    });

    sources.push({
      name: 'Partners',
      table: 'partners',
      description: 'Partner POIs linked to analyses',
      last_updated: null,
      record_count: partnerCount,
      freshness: 'fresh',
      freshness_threshold_days: 0,
    });

    sources.push({
      name: 'Audit Log',
      table: 'audit_logs',
      description: 'Security and activity audit trail',
      last_updated: latestAuditLog?.created_at?.toISOString() ?? null,
      record_count: auditLogCount,
      freshness: latestAuditLog ? getFreshness(latestAuditLog.created_at, 1) : 'missing',
      freshness_threshold_days: 1,
    });

    // ── Pipeline table checks ────────────────────────────────────────────
    const pipelineTables = [
      { name: 'Schools (NCES)', table: 'schools', description: 'School locations from NCES CCD data', thresholdDays: 90 },
      { name: 'Foursquare POI', table: 'foursquare_poi', description: 'POI data imported from Foursquare', thresholdDays: 30 },
      { name: 'IMLS Libraries', table: 'imls_libraries', description: 'Public library data from IMLS', thresholdDays: 365 },
    ];

    for (const pt of pipelineTables) {
      try {
        const tableExists = await prisma.$queryRaw`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = ${pt.table}
          ) as exists
        ` as Array<{ exists: boolean }>;

        if (!tableExists[0]?.exists) {
          sources.push({
            name: pt.name,
            table: pt.table,
            description: pt.description,
            last_updated: null,
            record_count: null,
            freshness: 'missing',
            freshness_threshold_days: pt.thresholdDays,
          });
          continue;
        }

        // Get count and latest updated_at
        const stats = await prisma.$queryRawUnsafe(`
          SELECT COUNT(*)::int as count,
                 MAX(updated_at) as last_updated
          FROM ${pt.table}
        `) as Array<{ count: number; last_updated: Date | null }>;

        const stat = stats[0];
        sources.push({
          name: pt.name,
          table: pt.table,
          description: pt.description,
          last_updated: stat?.last_updated?.toISOString() ?? null,
          record_count: stat?.count ?? 0,
          freshness: getFreshness(stat?.last_updated ?? null, pt.thresholdDays),
          freshness_threshold_days: pt.thresholdDays,
        });
      } catch {
        sources.push({
          name: pt.name,
          table: pt.table,
          description: pt.description,
          last_updated: null,
          record_count: null,
          freshness: 'missing',
          freshness_threshold_days: pt.thresholdDays,
        });
      }
    }

    // ── External API status ─────────────────────────────────────────────
    const externalApis = [
      {
        name: 'US Census ACS API',
        description: 'American Community Survey demographic data',
        configured: true, // Always available (no key required for basic use)
      },
      {
        name: 'StatsCan Profile API',
        description: 'Canadian Census demographic data',
        configured: true,
      },
      {
        name: 'OpenStreetMap Overpass',
        description: 'POI and geographic data',
        configured: true,
      },
      {
        name: 'OpenRouteService',
        description: 'Drive-time isochrones',
        configured: !!process.env.ORS_API_KEY,
      },
      {
        name: 'Nominatim',
        description: 'Geocoding and reverse geocoding',
        configured: true,
      },
    ];

    res.json({
      generated_at: new Date().toISOString(),
      summary: {
        total_sources: sources.length,
        fresh: sources.filter((s) => s.freshness === 'fresh').length,
        stale: sources.filter((s) => s.freshness === 'stale').length,
        missing: sources.filter((s) => s.freshness === 'missing').length,
      },
      sources,
      external_apis: externalApis,
    });
  })
);

export default router;
