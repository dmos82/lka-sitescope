import { Router, Request, Response } from 'express';
import { compare, hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { prisma } from '@lka/database';
import { signAccessToken, signRefreshToken, verifyToken } from '../lib/jwt';
import { loginSchema } from '@lka/shared';
import { asyncHandler, AuthRequest } from '../middleware/protect';

const router = Router();

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.is_active) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const sessionId = randomUUID();

    // Add sessionId to active sessions
    await prisma.user.update({
      where: { id: user.id },
      data: { active_session_ids: { push: sessionId } },
    });

    const tokenPayload = { sub: user.id, email: user.email, role: user.role, sessionId };
    const accessToken = await signAccessToken(tokenPayload);
    const refreshToken = await signRefreshToken(tokenPayload);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      token: accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  })
);

// POST /api/auth/refresh
router.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      res.status(401).json({ error: 'No refresh token' });
      return;
    }

    const payload = await verifyToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || !user.is_active || !user.active_session_ids.includes(payload.sessionId)) {
      res.status(401).json({ error: 'Session invalidated' });
      return;
    }

    const newSessionId = randomUUID();

    // Replace old sessionId with new one
    await prisma.user.update({
      where: { id: user.id },
      data: {
        active_session_ids: user.active_session_ids
          .filter((id: string) => id !== payload.sessionId)
          .concat(newSessionId),
      },
    });

    const tokenPayload = { sub: user.id, email: user.email, role: user.role, sessionId: newSessionId };
    const newAccessToken = await signAccessToken(tokenPayload);
    const newRefreshToken = await signRefreshToken(tokenPayload);

    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      token: newAccessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  })
);

// POST /api/auth/logout
router.post(
  '/logout',
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const refreshToken = req.cookies?.refresh_token;
    if (refreshToken) {
      try {
        const payload = await verifyToken(refreshToken);
        await prisma.user.update({
          where: { id: payload.sub },
          data: {
            active_session_ids: {
              set: (
                await prisma.user.findUnique({
                  where: { id: payload.sub },
                  select: { active_session_ids: true },
                })
              )?.active_session_ids.filter((id: string) => id !== payload.sessionId) ?? [],
            },
          },
        });
      } catch {
        // Token already invalid — that's fine
      }
    }

    res.clearCookie('refresh_token');
    res.json({ success: true });
  })
);

export default router;
