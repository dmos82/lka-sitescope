import { Router, Request, Response } from 'express';
import { prisma } from '@lka/database';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected', ts: new Date().toISOString() });
  }
});

export default router;
