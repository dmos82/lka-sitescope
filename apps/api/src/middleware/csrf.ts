import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';

// In-memory token store: token → { expiresAt }
// Tokens are single-use with 1h expiry
const CSRF_STORE = new Map<string, { expiresAt: number }>();
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Paths exempt from CSRF validation (session-establishing endpoints)
const CSRF_EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
]);

/**
 * Generate a new CSRF token and store it.
 */
export function generateCsrfToken(): string {
  const token = randomBytes(32).toString('hex');
  CSRF_STORE.set(token, { expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

/**
 * Middleware: validate CSRF token for state-changing methods (POST, PATCH, DELETE, PUT).
 * Exempt paths (login, refresh) skip validation.
 * Token is consumed after validation.
 */
export function csrfProtect(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();

  // Only enforce on state-changing methods
  if (!['POST', 'PATCH', 'DELETE', 'PUT'].includes(method)) {
    next();
    return;
  }

  // Exempt session-establishing endpoints
  if (CSRF_EXEMPT_PATHS.has(req.path)) {
    next();
    return;
  }

  const token =
    (req.headers['x-csrf-token'] as string) ??
    (req.body as Record<string, string> | undefined)?.csrf_token;

  if (!token) {
    res.status(403).json({ error: 'CSRF token missing' });
    return;
  }

  const entry = CSRF_STORE.get(token);
  if (!entry) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  if (Date.now() > entry.expiresAt) {
    CSRF_STORE.delete(token);
    res.status(403).json({ error: 'CSRF token expired' });
    return;
  }

  // Consume the token (single-use)
  CSRF_STORE.delete(token);
  next();
}
