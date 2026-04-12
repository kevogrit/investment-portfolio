import { defaultPortfolio, normalizePortfolio, Portfolio } from "./types";
import {
  sqliteCreateGoogleUser,
  sqliteCreateUser,
  sqliteGetUserByEmail,
  sqliteGetUserByGoogleSub,
  sqliteGetUserByVerificationToken,
  sqliteLinkGoogleToUser,
  sqliteLoadPortfolio,
  sqliteMarkEmailVerified,
  sqliteSavePortfolio,
} from "./db-sqlite";

let schemaReady = false;

export type UserRow = {
  id: number;
  email: string;
  password_hash: string;
  email_verified: boolean;
  verification_token: string | null;
  verification_token_expires: string | null;
  google_sub: string | null;
};

function usePostgres(): boolean {
  return Boolean(process.env.POSTGRES_URL);
}

export async function ensureSchema() {
  if (!usePostgres() || schemaReady) return;
  const { sql } = await import("@vercel/postgres");
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS portfolios (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT TRUE`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMPTZ`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_uidx
    ON users (google_sub)
    WHERE google_sub IS NOT NULL
  `;
  schemaReady = true;
}

function pgRowToUser(row: {
  id: number;
  email: string;
  password_hash: string;
  email_verified: boolean | null;
  verification_token: string | null;
  verification_token_expires: Date | string | null;
  google_sub: string | null;
}): UserRow {
  return {
    id: row.id,
    email: row.email,
    password_hash: row.password_hash,
    email_verified: row.email_verified !== false,
    verification_token: row.verification_token,
    verification_token_expires:
      row.verification_token_expires instanceof Date
        ? row.verification_token_expires.toISOString()
        : row.verification_token_expires
          ? String(row.verification_token_expires)
          : null,
    google_sub: row.google_sub,
  };
}

export async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  if (!usePostgres()) {
    return sqliteGetUserByEmail(email);
  }
  await ensureSchema();
  const { sql } = await import("@vercel/postgres");
  const res = await sql`
    SELECT id, email, password_hash, email_verified, verification_token, verification_token_expires, google_sub
    FROM users WHERE email = ${email}
  `;
  const row = res.rows[0] as Parameters<typeof pgRowToUser>[0] | undefined;
  return row ? pgRowToUser(row) : undefined;
}

export async function getUserByVerificationToken(token: string): Promise<UserRow | undefined> {
  if (!usePostgres()) {
    return sqliteGetUserByVerificationToken(token);
  }
  await ensureSchema();
  const { sql } = await import("@vercel/postgres");
  const res = await sql`
    SELECT id, email, password_hash, email_verified, verification_token, verification_token_expires, google_sub
    FROM users WHERE verification_token = ${token}
  `;
  const row = res.rows[0] as Parameters<typeof pgRowToUser>[0] | undefined;
  return row ? pgRowToUser(row) : undefined;
}

export async function getUserByGoogleSub(sub: string): Promise<UserRow | undefined> {
  if (!usePostgres()) {
    return sqliteGetUserByGoogleSub(sub);
  }
  await ensureSchema();
  const { sql } = await import("@vercel/postgres");
  const res = await sql`
    SELECT id, email, password_hash, email_verified, verification_token, verification_token_expires, google_sub
    FROM users WHERE google_sub = ${sub}
  `;
  const row = res.rows[0] as Parameters<typeof pgRowToUser>[0] | undefined;
  return row ? pgRowToUser(row) : undefined;
}

export async function createUser(
  email: string,
  passwordHash: string,
  verificationToken: string,
  verificationExpiresIso: string
): Promise<{ id: number; email: string }> {
  if (!usePostgres()) {
    return sqliteCreateUser(email, passwordHash, verificationToken, verificationExpiresIso);
  }
  await ensureSchema();
  const { sql } = await import("@vercel/postgres");
  const res = await sql`
    INSERT INTO users (email, password_hash, email_verified, verification_token, verification_token_expires)
    VALUES (${email}, ${passwordHash}, FALSE, ${verificationToken}, ${verificationExpiresIso}::timestamptz)
    RETURNING id, email
  `;
  return res.rows[0] as { id: number; email: string };
}

export async function createGoogleUser(email: string, googleSub: string): Promise<{ id: number; email: string }> {
  if (!usePostgres()) {
    return sqliteCreateGoogleUser(email, googleSub);
  }
  await ensureSchema();
  const { sql } = await import("@vercel/postgres");
  const res = await sql`
    INSERT INTO users (email, password_hash, email_verified, google_sub)
    VALUES (${email}, '', TRUE, ${googleSub})
    RETURNING id, email
  `;
  return res.rows[0] as { id: number; email: string };
}

export async function markEmailVerified(userId: number): Promise<void> {
  if (!usePostgres()) {
    sqliteMarkEmailVerified(userId);
    return;
  }
  await ensureSchema();
  const { sql } = await import("@vercel/postgres");
  await sql`
    UPDATE users
    SET email_verified = TRUE, verification_token = NULL, verification_token_expires = NULL
    WHERE id = ${userId}
  `;
}

export async function linkGoogleToUser(userId: number, googleSub: string): Promise<void> {
  if (!usePostgres()) {
    sqliteLinkGoogleToUser(userId, googleSub);
    return;
  }
  await ensureSchema();
  const { sql } = await import("@vercel/postgres");
  await sql`
    UPDATE users SET google_sub = ${googleSub}, email_verified = TRUE WHERE id = ${userId}
  `;
}

/** JSONB may arrive as object or string depending on driver; strings must parse or normalize drops data. */
function coercePortfolioFromDb(raw: unknown): Portfolio {
  if (raw == null) return defaultPortfolio();
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return defaultPortfolio();
    }
  }
  return normalizePortfolio(data) || defaultPortfolio();
}

export async function loadPortfolio(userId: number): Promise<Portfolio> {
  if (!usePostgres()) {
    return sqliteLoadPortfolio(userId);
  }
  await ensureSchema();
  const { sql } = await import("@vercel/postgres");
  const res = await sql`SELECT data_json FROM portfolios WHERE user_id = ${userId}`;
  if (!res.rows[0]) return defaultPortfolio();
  return coercePortfolioFromDb(res.rows[0].data_json);
}

export async function savePortfolio(userId: number, data: Portfolio) {
  if (!usePostgres()) {
    sqliteSavePortfolio(userId, data);
    return;
  }
  await ensureSchema();
  const { sql } = await import("@vercel/postgres");
  await sql`
    INSERT INTO portfolios (user_id, data_json, updated_at)
    VALUES (${userId}, ${JSON.stringify(data)}::jsonb, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      data_json = EXCLUDED.data_json,
      updated_at = NOW()
  `;
}
