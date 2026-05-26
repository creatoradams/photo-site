import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import Database from "better-sqlite3";
import archiver from "archiver";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createPortfolioStore } from "./portfolio-store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createPortfolioRoutes } from "./portfolio-routes.js";
import { createAdminRoutes } from "./admin-routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
const AUTH_SECRET = process.env.AUTH_SECRET || "dev-secret-change-me";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SITE_URL = process.env.SITE_URL || "http://localhost:4321";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const portfolioStore = createPortfolioStore({ dataDir: DATA_DIR });
const adminAuth = createAdminAuth({ authSecret: AUTH_SECRET, adminPassword: ADMIN_PASSWORD });
const CLIENT_FILES_DIR = process.env.CLIENT_FILES_DIR || path.join(DATA_DIR, "client-files");
const GALLERIES_PATH = path.join(DATA_DIR, "galleries.json");
const SESSION_DAYS = 7;
const MAGIC_MINUTES = 45;

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const db = new Database(path.join(DATA_DIR, "tokens.db"));
db.exec(`CREATE TABLE IF NOT EXISTS used_jti (jti TEXT PRIMARY KEY, used_at INTEGER);
CREATE TABLE IF NOT EXISTS rate_limit (key TEXT PRIMARY KEY, count INTEGER, window_start INTEGER);`);

function loadGalleries() {
  if (!fs.existsSync(GALLERIES_PATH)) return {};
  return JSON.parse(fs.readFileSync(GALLERIES_PATH, "utf8"));
}

function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase();
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

function safeFilename(name) {
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) return null;
  return path.basename(name);
}

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

const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

async function sendMagicLink(slug, email, token) {
  const link = `${SITE_URL}/api/auth/verify?token=${encodeURIComponent(token)}`;
  if (!transporter) {
    console.log("[dev] Magic link for", email, ":", link);
    return;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || "gallery@adamsphoto.net",
    to: email,
    subject: "Your gallery access link",
    text: `Click to access your gallery (expires in ${MAGIC_MINUTES} minutes):\n\n${link}\n`,
    html: `<p>Click to access your gallery (expires in ${MAGIC_MINUTES} minutes):</p><p><a href="${link}">${link}</a></p>`,
  });
}

function signMagic(slug, email) {
  const jti = crypto.randomUUID();
  return jwt.sign({ type: "magic", gallery: slug, email, jti }, AUTH_SECRET, { expiresIn: `${MAGIC_MINUTES}m` });
}

function signSession(slug, email) {
  return jwt.sign({ type: "session", gallery: slug, email }, AUTH_SECRET, { expiresIn: `${SESSION_DAYS}d` });
}

function verifyToken(token) {
  return jwt.verify(token, AUTH_SECRET);
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

app.post("/api/auth/request-link", linkLimiter, async (req, res) => {
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
    await sendMagicLink(slug, email, token);
  } catch (err) {
    console.error("SMTP error:", err);
  }
  res.json(generic);
});

app.get("/api/auth/verify", (req, res) => {
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
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_DAYS * 86400 * 1000,
    });
    res.redirect(`${SITE_URL}/client/${p.gallery}?unlocked=1`);
  } catch {
    res.status(400).send("This link is invalid or has expired.");
  }
});

app.get("/api/auth/session", (req, res) => {
  const slug = req.query.gallery;
  const s = getSession(req);
  res.json({ authenticated: !!(s && s.gallery === slug) });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("photo_session");
  res.json({ ok: true });
});

app.get("/api/gallery/:slug/manifest", (req, res) => {
  const slug = req.params.slug;
  if (!requireSession(req, res, slug)) return;
  const manifest = readManifest(slug);
  if (!manifest) return res.status(404).json({ error: "Not found" });
  res.json(manifest);
});

app.get("/api/preview", (req, res) => {
  const slug = req.query.gallery;
  const file = safeFilename(req.query.file);
  if (!requireSession(req, res, slug)) return;
  if (!file) return res.status(400).end();
  const dir = galleryDir(slug);
  const thumb = path.join(dir, "thumbs", file.replace(/\.[^.]+$/, ".webp"));
  const full = path.join(dir, file);
  const target = fs.existsSync(thumb) ? thumb : full;
  if (!fs.existsSync(target)) return res.status(404).end();
  res.sendFile(path.resolve(target));
});

app.post("/api/download/zip", (req, res) => {
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
  archive.on("error", (err) => { console.error(err); res.status(500).end(); });
  archive.pipe(res);
  for (const f of safe) {
    archive.file(path.join(dir, f), { name: f });
  }
  archive.finalize();
});

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.use("/api/portfolio", createPortfolioRoutes(portfolioStore));
app.use("/api/admin", createAdminRoutes(portfolioStore, adminAuth));

app.listen(PORT, () => {
  console.log(`Photo download service on :${PORT}`);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
});
