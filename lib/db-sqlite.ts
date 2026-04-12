/**
 * Local development storage when POSTGRES_URL is not set.
 * Uses a file next to the project: portfolio_next.sqlite
 */
import Database from "better-sqlite3";
import path from "path";
import type { Portfolio } from "./types";
import { defaultPortfolio, normalizePortfolio } from "./types";

const DB_FILE = path.join(process.cwd(), "portfolio_next.sqlite");

let _db: Database.Database | null = null;

export type SqliteUserRow = {
  id: number;
  email: string;
  password_hash: string;
  email_verified: number;
  verification_token: string | null;
  verification_token_expires: string | null;
  google_sub: string | null;
};

function migrateUsersTable(db: Database.Database) {
  const rows = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const names = new Set(rows.map((r) => r.name));
  if (!names.has("email_verified")) {
    db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1");
  }
  if (!names.has("verification_token")) {
    db.exec("ALTER TABLE users ADD COLUMN verification_token TEXT");
  }
  if (!names.has("verification_token_expires")) {
    db.exec("ALTER TABLE users ADD COLUMN verification_token_expires TEXT");
  }
  if (!names.has("google_sub")) {
    db.exec("ALTER TABLE users ADD COLUMN google_sub TEXT");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL");
  }
}

function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_FILE);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS portfolios (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data_json TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  migrateUsersTable(_db);
  return _db;
}

function rowToUser(row: SqliteUserRow | undefined) {
  if (!row) return undefined;
  return {
    id: row.id,
    email: row.email,
    password_hash: row.password_hash,
    email_verified: row.email_verified === 1,
    verification_token: row.verification_token,
    verification_token_expires: row.verification_token_expires,
    google_sub: row.google_sub,
  };
}

export function sqliteGetUserByEmail(email: string) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, email, password_hash, email_verified, verification_token, verification_token_expires, google_sub
       FROM users WHERE email = ?`
    )
    .get(email) as SqliteUserRow | undefined;
  return rowToUser(row);
}

export function sqliteGetUserByVerificationToken(token: string) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, email, password_hash, email_verified, verification_token, verification_token_expires, google_sub
       FROM users WHERE verification_token = ?`
    )
    .get(token) as SqliteUserRow | undefined;
  return rowToUser(row);
}

export function sqliteGetUserByGoogleSub(sub: string) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, email, password_hash, email_verified, verification_token, verification_token_expires, google_sub
       FROM users WHERE google_sub = ?`
    )
    .get(sub) as SqliteUserRow | undefined;
  return rowToUser(row);
}

export function sqliteCreateUser(
  email: string,
  passwordHash: string,
  verificationToken: string,
  verificationExpiresIso: string
) {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, email_verified, verification_token, verification_token_expires)
       VALUES (?, ?, 0, ?, ?)`
    )
    .run(email, passwordHash, verificationToken, verificationExpiresIso);
  return { id: Number(info.lastInsertRowid), email };
}

export function sqliteCreateGoogleUser(email: string, googleSub: string) {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, email_verified, google_sub)
       VALUES (?, '', 1, ?)`
    )
    .run(email, googleSub);
  return { id: Number(info.lastInsertRowid), email };
}

export function sqliteMarkEmailVerified(userId: number) {
  const db = getDb();
  db.prepare(
    `UPDATE users SET email_verified = 1, verification_token = NULL, verification_token_expires = NULL WHERE id = ?`
  ).run(userId);
}

export function sqliteLinkGoogleToUser(userId: number, googleSub: string) {
  const db = getDb();
  db.prepare(`UPDATE users SET google_sub = ?, email_verified = 1 WHERE id = ?`).run(googleSub, userId);
}

export function sqliteLoadPortfolio(userId: number): Portfolio {
  const db = getDb();
  const row = db.prepare("SELECT data_json FROM portfolios WHERE user_id = ?").get(userId) as
    | { data_json: string }
    | undefined;
  if (!row) return defaultPortfolio();
  try {
    return normalizePortfolio(JSON.parse(row.data_json));
  } catch {
    return defaultPortfolio();
  }
}

export function sqliteSavePortfolio(userId: number, data: Portfolio) {
  const db = getDb();
  const json = JSON.stringify(data);
  db.prepare(
    `
    INSERT INTO portfolios (user_id, data_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      data_json = excluded.data_json,
      updated_at = datetime('now')
  `
  ).run(userId, json);
}
