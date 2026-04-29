import type { NextConfig } from 'next';

const config: NextConfig = {
  // Drizzle/postgres are server-only; opt them out of client bundling.
  serverExternalPackages: ['postgres', 'drizzle-orm'],
};

export default config;
