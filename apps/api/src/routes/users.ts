import { Router, Response } from 'express';
import { hash } from 'bcryptjs';
import { prisma } from '@lka/database';
import { createUserSchema, updateUserSchema } from '@lka/shared';
import { protect, requireRole, asyncHandler, AuthRequest } from '../middleware/protect';

const router = Router();
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS ?? '10', 10);

// GET /api/users — admin only
router.get(
  '/',
  protect,
  requireRole('admin'),
  asyncHandler(async (_req: AuthRequest, res: Response): Promise<void> => {
    const users = await prisma.user.findMany({
      select: {
        id: true, email: true, name: true, role: true,
        is_active: true, created_at: true, updated_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
    res.json(users);
  })
);

// POST /api/users — admin only
router.post(
  '/',
  protect,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const { email, password, name, role } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }

    const password_hash = await hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: { email, password_hash, name, role },
      select: { id: true, email: true, name: true, role: true, is_active: true, created_at: true },
    });

    res.status(201).json(user);
  })
);

// PATCH /api/users/:id — admin only
router.patch(
  '/:id',
  protect,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    const { password, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest };
    if (password) {
      updateData.password_hash = await hash(password, BCRYPT_ROUNDS);
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, is_active: true, updated_at: true },
    });

    res.json(user);
  })
);

// DELETE /api/users/:id — admin only (soft delete via is_active)
router.delete(
  '/:id',
  protect,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    await prisma.user.update({
      where: { id: req.params.id },
      data: { is_active: false, active_session_ids: [] },
    });
    res.json({ success: true });
  })
);

export default router;
