import { prisma } from '@lka/database';
import { Request } from 'express';

interface AuditOptions {
  userId: string;
  action: string;
  entity?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  req?: Request;
}

/**
 * Write a single audit log entry.
 * Fire-and-forget — errors are logged but never thrown to callers.
 */
export function auditLog(opts: AuditOptions): void {
  const { userId, action, entity, entityId, meta, req } = opts;

  prisma.auditLog
    .create({
      data: {
        user_id: userId,
        action,
        entity: entity ?? null,
        entity_id: entityId ?? null,
        ip_address: req ? getClientIp(req) : null,
        user_agent: req?.headers['user-agent'] ?? null,
        meta: meta ?? undefined,
      },
    })
    .catch((err: unknown) => {
      console.error('[AuditLog] Failed to write:', err);
    });
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}
