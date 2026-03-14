import 'dotenv/config';

// Direct PostgreSQL client for pipeline (raw SQL, not Prisma)
// Install: pnpm add pg @types/pg
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pool: any;

export function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
