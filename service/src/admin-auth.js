import jwt from "jsonwebtoken";
import crypto from "crypto";

const ADMIN_COOKIE = "photo_admin";
const ADMIN_DAYS = 14;
const JWT_ALGORITHMS = ["HS256"];

/** Constant-time string comparison (hash to fixed length first to avoid leaking length). */
function safeEqual(a, b) {
  const ah = crypto.createHash("sha256").update(String(a)).digest();
  const bh = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ah, bh);
}

export function createAdminAuth({ authSecret, adminPassword }) {
  function signAdmin() {
    return jwt.sign({ type: "admin" }, authSecret, {
      algorithm: "HS256",
      expiresIn: `${ADMIN_DAYS}d`,
    });
  }

  function verifyAdmin(token) {
    if (!token) return false;
    try {
      const p = jwt.verify(token, authSecret, { algorithms: JWT_ALGORITHMS });
      return p.type === "admin";
    } catch {
      return false;
    }
  }

  function getAdminFromReq(req) {
    return verifyAdmin(req.cookies?.[ADMIN_COOKIE]);
  }

  function requireAdmin(req, res, next) {
    if (!adminPassword) {
      return res.status(503).json({ error: "Admin not configured. Set ADMIN_PASSWORD in service/.env" });
    }
    if (!getAdminFromReq(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  }

  function login(password) {
    if (!adminPassword) return { ok: false, error: "Admin not configured" };
    if (!safeEqual(password, adminPassword)) return { ok: false, error: "Invalid password" };
    return { ok: true, token: signAdmin() };
  }

  function setAdminCookie(res, token) {
    res.cookie(ADMIN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: ADMIN_DAYS * 86400 * 1000,
    });
  }

  function clearAdminCookie(res) {
    res.clearCookie(ADMIN_COOKIE);
  }

  return {
    ADMIN_COOKIE,
    getAdminFromReq,
    requireAdmin,
    login,
    setAdminCookie,
    clearAdminCookie,
  };
}
