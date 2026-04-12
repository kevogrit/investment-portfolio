import postgres from "postgres";

/**
 * Serverless-friendly Postgres client. Works with Supabase direct (5432) and pooled (6543) URLs.
 * @vercel/postgres rejects Supabase "direct" URLs — this driver does not.
 */
let _sql: ReturnType<typeof postgres> | null = null;

export function getSql() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("POSTGRES_URL is required");
  }
  if (!_sql) {
    _sql = postgres(url, {
      ssl: "require",
      max: 1,
      idle_timeout: 20,
      connect_timeout: 20,
      // PgBouncer / Supabase pooler: no prepared statements in transaction mode
      prepare: false,
    });
  }
  return _sql;
}
