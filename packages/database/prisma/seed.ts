import 'dotenv/config';
import bcrypt from 'bcryptjs';

// Use dynamic require since prisma generate may not have run yet
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS ?? '10', 10);

const USERS = [
  {
    email: 'admin@lka.com',
    password: 'AdminPass123!',
    name: 'LKA Admin',
    role: 'admin',
  },
];

async function main() {
  console.log('[Seed] Starting database seed...');

  for (const user of USERS) {
    const password_hash = await bcrypt.hash(user.password, BCRYPT_ROUNDS);
    const created = await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role },
      create: { email: user.email, password_hash, name: user.name, role: user.role },
    });
    console.log(`[Seed] User: ${created.email} (${created.role})`);
  }

  console.log('[Seed] Complete!');
  console.log('');
  console.log('Login: admin@lka.com / AdminPass123!');
}

main()
  .catch((e) => {
    console.error('[Seed] Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
