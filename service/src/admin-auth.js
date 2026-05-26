import jwt from "jsonwebtoken";

const ADMIN_COOKIE = "photo_admin";
const ADMIN_DAYS = 14;

export function createAdminAuth({ authSecret, adminPassword }) {
  function signAdmin() {
    return jwt.sign({ type: "admin" }, authSecret, { expiresIn: `${ADMIN_DAYS}d` });
  }

  function verifyAdmin(token) {
    if (!token) return false;
    try {
      const p = jwt.verify(token, authSecret);
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
    if (password !== adminPassword) return { ok: false, error: "Invalid password" };
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
