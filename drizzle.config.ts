import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load .env.local first (project convention, gitignored), fall back to .env.
config({ path: '.env.local' });
config({ path: '.env' });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Check .env.local.');
}

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
