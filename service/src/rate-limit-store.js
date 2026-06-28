import Database from "better-sqlite3";
import path from "path";
import { DATA_DIR, MAGIC_MINUTES } from "./config.js";

/**
 * SQLite-backed store for magic-link replay protection (used_jti) and a simple
 * fixed-window rate limiter (rate_limit) keyed by arbitrary strings.
 */
export function createTokenStore() {
  const db = new Database(path.join(DATA_DIR, "tokens.db"));
  db.exec(`CREATE TABLE IF NOT EXISTS used_jti (jti TEXT PRIMARY KEY, used_at INTEGER);
CREATE TABLE IF NOT EXISTS rate_limit (key TEXT PRIMARY KEY, count INTEGER, window_start INTEGER);`);

  function checkRate(key, max = 3, windowMs = 15 * 60 * 1000) {
    const now = Date.now();
    const row = db.prepare("SELECT count, window_start FROM rate_limit WHERE key = ?").get(key);
    if (!row || now - row.window_start > windowMs) {
      db.prepare("INSERT OR REPLACE INTO rate_limit (key, count, window_start) VALUES (?, 1, ?)").run(key, now);
      return true;
    }
    if (row.count >= max) return false;
    db.prepare("UPDATE rate_limit SET count = count + 1 WHERE key = ?").run(key);
    return true;
  }

  // Prune expired bookkeeping rows so these tables don't grow unbounded. A used
  // jti is only meaningful until its magic token would have expired anyway, and
  // rate-limit windows are at most 15 minutes.
  function cleanup() {
    try {
      db.prepare("DELETE FROM used_jti WHERE used_at < ?").run(Date.now() - MAGIC_MINUTES * 60 * 1000);
      db.prepare("DELETE FROM rate_limit WHERE window_start < ?").run(Date.now() - 15 * 60 * 1000);
    } catch (err) {
      console.error("Token cleanup failed:", err);
    }
  }

  cleanup();
  setInterval(cleanup, 60 * 60 * 1000).unref();

  return { db, checkRate, cleanup };
}
