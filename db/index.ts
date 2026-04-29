import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

// Lazy connection — tests and dry-runs that don't touch the DB don't
// pay the connect cost. Real ingestion calls getDb() once per process.
export function getDb() {
  if (_db) return _db;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Add it to .env.local or pass it explicitly. See README for setup.',
    );
  }

  _client = postgres(url, {
    // Neon is PgBouncer'd — `prepare: false` avoids prepared-statement
    // collisions. Harmless for direct Postgres connections too.
    prepare: false,
    max: 1,
  });
  _db = drizzle(_client, { schema });
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.end({ timeout: 5 });
    _client = null;
    _db = null;
  }
}

export { schema };
