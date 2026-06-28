import express from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import rateLimit from "express-rate-limit";
import {
  AUTH_SECRET,
  SITE_URL,
  SESSION_DAYS,
  MAGIC_MINUTES,
  CLIENT_FILES_DIR,
  GALLERIES_PATH,
  IS_PROD,
} from "./config.js";
import { normalizeEmail, safeFilename } from "./util.js";

/**
 * Client gallery delivery: passwordless magic-link auth plus authorized access
 * to private client files (manifest, previews, ZIP downloads).
 */
export function createClientRoutes({ db, checkRate, mailer }) {
  const router = express.Router();

  function loadGalleries() {
    if (!fs.existsSync(GALLERIES_PATH)) return {};
    return JSON.parse(fs.readFileSync(GALLERIES_PATH, "utf8"));
  }

  function galleryConfig(slug) {
    const all = loadGalleries();
    return all[slug] || null;
  }

  function galleryDir(slug) {
    const cfg = galleryConfig(slug);
    if (!cfg) return null;
    return cfg.dir || path.join(CLIENT_FILES_DIR, slug);
  }

  function readManifest(slug) {
    const dir = galleryDir(slug);
    if (!dir) return null;
    const mp = path.join(dir, "manifest.json");
    if (!fs.existsSync(mp)) return { files: [] };
    return JSON.parse(fs.readFileSync(mp, "utf8"));
  }

  function signMagic(slug, email) {
    const jti = crypto.randomUUID();
    return jwt.sign({ type: "magic", gallery: slug, email, jti }, AUTH_SECRET, {
      algorithm: "HS256",
      expiresIn: `${MAGIC_MINUTES}m`,
    });
  }

  function signSession(slug, email) {
    return jwt.sign({ type: "session", gallery: slug, email }, AUTH_SECRET, {
      algorithm: "HS256",
      expiresIn: `${SESSION_DAYS}d`,
    });
  }

  function verifyToken(token) {
    return jwt.verify(token, AUTH_SECRET, { algorithms: ["HS256"] });
  }

  function getSession(req) {
    const token = req.cookies?.photo_session;
    if (!token) return null;
    try {
      const p = verifyToken(token);
      if (p.type !== "session") return null;
      return p;
    } catch {
      return null;
    }
  }

  function requireSession(req, res, slug) {
    const s = getSession(req);
    if (!s || s.gallery !== slug) {
      res.status(401).json({ error: "Unauthorized" });
      return null;
    }
    return s;
  }

  const linkLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

  router.post("/api/auth/request-link", linkLimiter, async (req, res) => {
    const slug = req.body?.gallery;
    const email = normalizeEmail(req.body?.email);
    const cfg = galleryConfig(slug);
    const generic = { message: "If your email is on file for this gallery, we sent you a link." };

    if (!cfg || !email) return res.json(generic);

    const allowed = (cfg.allowedEmails || []).map(normalizeEmail);
    if (!allowed.includes(email)) return res.json(generic);

    const ipKey = `link:${req.ip}:${slug}:${email}`;
    if (!checkRate(ipKey)) return res.json(generic);

    const token = signMagic(slug, email);
    try {
      await mailer.sendMagicLink(slug, email, token);
    } catch (err) {
      console.error("SMTP error:", err);
    }
    res.json(generic);
  });

  router.get("/api/auth/verify", (req, res) => {
    const token = req.query.token;
    if (!token) return res.status(400).send("Invalid link");
    try {
      const p = verifyToken(token);
      if (p.type !== "magic") throw new Error("bad type");
      const used = db.prepare("SELECT 1 FROM used_jti WHERE jti = ?").get(p.jti);
      if (used) throw new Error("used");
      db.prepare("INSERT INTO used_jti (jti, used_at) VALUES (?, ?)").run(p.jti, Date.now());
      const session = signSession(p.gallery, p.email);
      res.cookie("photo_session", session, {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: "strict",
        maxAge: SESSION_DAYS * 86400 * 1000,
      });
      res.redirect(`${SITE_URL}/client/${p.gallery}?unlocked=1`);
    } catch {
      res.status(400).send("This link is invalid or has expired.");
    }
  });

  router.get("/api/auth/session", (req, res) => {
    const slug = req.query.gallery;
    const s = getSession(req);
    res.json({ authenticated: !!(s && s.gallery === slug) });
  });

  router.post("/api/auth/logout", (req, res) => {
    res.clearCookie("photo_session");
    res.json({ ok: true });
  });

  router.get("/api/gallery/:slug/manifest", (req, res) => {
    const slug = req.params.slug;
    if (!requireSession(req, res, slug)) return;
    const manifest = readManifest(slug);
    if (!manifest) return res.status(404).json({ error: "Not found" });
    res.json(manifest);
  });

  router.get("/api/preview", (req, res) => {
    const slug = req.query.gallery;
    const file = safeFilename(req.query.file);
    if (!requireSession(req, res, slug)) return;
    if (!file) return res.status(400).end();
    const dir = galleryDir(slug);
    const thumb = path.join(dir, "thumbs", file.replace(/\.[^.]+$/, ".webp"));
    const full = path.join(dir, file);
    const wantFull = req.query.full === "1";
    const target = wantFull ? full : fs.existsSync(thumb) ? thumb : full;
    if (!fs.existsSync(target)) return res.status(404).end();
    res.sendFile(path.resolve(target));
  });

  router.post("/api/download/zip", (req, res) => {
    const slug = req.body?.gallery;
    if (!requireSession(req, res, slug)) return;
    const dir = galleryDir(slug);
    const manifest = readManifest(slug);
    const allowed = new Set((manifest?.files || []).map((f) => f.name));
    let files = req.body?.files;
    if (!files || files === "*" || (Array.isArray(files) && files.length === 0)) {
      files = [...allowed];
    }
    if (!Array.isArray(files)) return res.status(400).json({ error: "Invalid files" });
    const safe = files.map(safeFilename).filter((f) => f && allowed.has(f));
    if (!safe.length) return res.status(400).json({ error: "No files" });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${slug}.zip"`);
    const archive = archiver("zip", { zlib: { level: 5 } });
    archive.on("error", (err) => {
      console.error(err);
      res.status(500).end();
    });
    archive.pipe(res);
    for (const f of safe) {
      archive.file(path.join(dir, f), { name: f });
    }
    archive.finalize();
  });

  return router;
}
