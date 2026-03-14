import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../lib/jwt';
import { prisma } from '@lka/database';

export interface AuthRequest extends Request {
  user?: JWTPayload & { dbRole?: string };
}

export async function protect(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (req.cookies?.refresh_token) {
      // Allow refresh token route to read from cookie
      token = req.cookies.refresh_token;
    }

    if (!token) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const payload = await verifyToken(token);

    // Verify session is still active
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, is_active: true, active_session_ids: true },
    });

    if (!user || !user.is_active) {
      res.status(401).json({ error: 'User not found or inactive' });
      return;
    }

    if (!user.active_session_ids.includes(payload.sessionId)) {
      res.status(401).json({ error: 'Session invalidated' });
      return;
    }

    req.user = { ...payload, dbRole: user.role };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const userRole = req.user.dbRole ?? req.user.role;
    if (!roles.includes(userRole)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

export function asyncHandler(
  fn: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
