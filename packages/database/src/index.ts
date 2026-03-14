// Prisma client wrapper
// Run `pnpm db:generate` after setting DATABASE_URL to enable full types

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PrismaClientClass: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  PrismaClientClass = require('@prisma/client').PrismaClient;
} catch {
  // Prisma not yet generated — this is expected before first `prisma generate`
  PrismaClientClass = class MockPrismaClient {
    // placeholder
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalForPrisma = globalThis as unknown as { prisma: any };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma: any =
  globalForPrisma.prisma ??
  new PrismaClientClass({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export { PrismaClientClass as PrismaClient };
