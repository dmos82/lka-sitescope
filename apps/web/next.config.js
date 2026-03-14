/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Workspace packages
  },
  transpilePackages: ['@lka/shared'],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  },
};

module.exports = nextConfig;
