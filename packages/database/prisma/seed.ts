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
  {
    email: 'analyst@lka.com',
    password: 'AnalystPass123!',
    name: 'Site Analyst',
    role: 'analyst',
  },
  {
    email: 'viewer@lka.com',
    password: 'ViewerPass123!',
    name: 'Franchise Viewer',
    role: 'viewer',
  },
];

const LKA_LOCATIONS = [
  {
    name: 'LKA Vancouver Main',
    address: '1234 West Broadway, Vancouver, BC',
    lat: 49.2634,
    lng: -123.1577,
    country: 'CA',
    status: 'OPEN',
    territory_radius_miles: 15,
  },
  {
    name: 'LKA Seattle Pioneer Square',
    address: '123 1st Ave S, Seattle, WA',
    lat: 47.6018,
    lng: -122.3316,
    country: 'US',
    status: 'OPEN',
    territory_radius_miles: 15,
  },
  {
    name: 'LKA Portland Pearl District',
    address: '1200 NW Marshall St, Portland, OR',
    lat: 45.5280,
    lng: -122.6843,
    country: 'US',
    status: 'COMING_SOON',
    territory_radius_miles: 15,
  },
  {
    name: 'LKA San Francisco Hayes Valley',
    address: '400 Grove St, San Francisco, CA',
    lat: 37.7768,
    lng: -122.4241,
    country: 'US',
    status: 'OPEN',
    territory_radius_miles: 12,
  },
  {
    name: 'LKA Denver Cherry Creek',
    address: '2800 E 2nd Ave, Denver, CO',
    lat: 39.7173,
    lng: -104.9624,
    country: 'US',
    status: 'OPEN',
    territory_radius_miles: 15,
  },
];

async function main() {
  console.log('[Seed] Starting database seed...');

  // Create users
  let adminUser: { id: string } | null = null;
  for (const user of USERS) {
    const password_hash = await bcrypt.hash(user.password, BCRYPT_ROUNDS);
    const created = await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role },
      create: { email: user.email, password_hash, name: user.name, role: user.role },
    });
    console.log(`[Seed] User: ${created.email} (${created.role})`);
    if (user.role === 'admin') adminUser = created;
  }

  if (!adminUser) throw new Error('Admin user not created');

  // Create LKA locations
  for (const loc of LKA_LOCATIONS) {
    const created = await prisma.lkaLocation.upsert({
      where: { id: `seed_${loc.name.replace(/\s+/g, '_').toLowerCase()}` },
      update: { status: loc.status },
      create: {
        id: `seed_${loc.name.replace(/\s+/g, '_').toLowerCase()}`,
        ...loc,
        created_by_id: adminUser.id,
      },
    });
    console.log(`[Seed] Location: ${created.name} (${created.status})`);
  }

  console.log('[Seed] Complete!');
  console.log('');
  console.log('Login credentials:');
  console.log('  admin@lka.com    / AdminPass123!');
  console.log('  analyst@lka.com  / AnalystPass123!');
  console.log('  viewer@lka.com   / ViewerPass123!');
}

main()
  .catch((e) => {
    console.error('[Seed] Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
