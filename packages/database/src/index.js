"use strict";
// Prisma client wrapper
// Run `pnpm db:generate` after setting DATABASE_URL to enable full types
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaClient = exports.prisma = void 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PrismaClientClass;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    exports.PrismaClient = PrismaClientClass = require('@prisma/client').PrismaClient;
}
catch {
    // Prisma not yet generated — this is expected before first `prisma generate`
    exports.PrismaClient = PrismaClientClass = class MockPrismaClient {
    };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalForPrisma = globalThis;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
exports.prisma = globalForPrisma.prisma ??
    new PrismaClientClass({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
if (process.env.NODE_ENV !== 'production')
    globalForPrisma.prisma = exports.prisma;
//# sourceMappingURL=index.js.map