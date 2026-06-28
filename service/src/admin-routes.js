import express from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Brute-force protection for the single admin password.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});

function statfsBytes(targetPath) {
  const s = fs.statfsSync(targetPath);
  const blockSize = Number(s.bsize || s.blockSize || 4096);
  const totalBytes = Number(s.blocks) * blockSize;
  const freeBytes = Number(s.bavail || s.bfree) * blockSize;
  return { totalBytes, freeBytes, usedBytes: totalBytes - freeBytes };
}

/** Allow only http/https URLs; returns null for empty/falsy values, throws for invalid. */
function sanitizeUrl(raw) {
  if (raw === undefined || raw === null || raw === "") return raw;
  try {
    const u = new URL(String(raw));
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad protocol");
    return u.href;
  } catch {
    return null; // reject unsafe URLs silently (store will treat null as cleared)
  }
}

function sanitizePageBody(id, body) {
  if (!body || typeof body !== "object") return body;
  const b = { ...body };
  // Sanitize CTA URLs on home page and any page with a link field
  if (b.ctaUrl !== undefined) b.ctaUrl = sanitizeUrl(b.ctaUrl);
  if (b.link !== undefined) b.link = sanitizeUrl(b.link);
  if (b.printsUrl !== undefined) b.printsUrl = sanitizeUrl(b.printsUrl);
  if (b.buttonUrl !== undefined) b.buttonUrl = sanitizeUrl(b.buttonUrl);
  return b;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 200 },
});

export function createAdminRoutes(store, adminAuth, siteStore) {
  const router = express.Router();

  router.post("/login", loginLimiter, (req, res) => {
    const result = adminAuth.login(req.body?.password || "");
    if (!result.ok) return res.status(401).json({ error: result.error });
    adminAuth.setAdminCookie(res, result.token);
    res.json({ ok: true });
  });

  router.post("/logout", (req, res) => {
    adminAuth.clearAdminCookie(res);
    res.json({ ok: true });
  });

  router.get("/session", (req, res) => {
    res.json({ authenticated: adminAuth.getAdminFromReq(req) });
  });

  router.use(adminAuth.requireAdmin);

  router.get("/galleries", (_req, res) => {
    res.json({ galleries: store.listGalleries({ includePrivate: true }) });
  });

  router.post("/galleries", (req, res) => {
    const gallery = store.createGallery(req.body || {});
    res.status(201).json({ gallery });
  });

  router.get("/galleries/:slug", (req, res) => {
    const gallery = store.getGallery(req.params.slug, { includePrivate: true });
    if (!gallery) return res.status(404).json({ error: "Not found" });
    res.json({ gallery });
  });

  router.patch("/galleries/:slug", (req, res) => {
    const gallery = store.updateGallery(req.params.slug, req.body || {});
    if (!gallery) return res.status(404).json({ error: "Not found" });
    res.json({ gallery });
  });

  router.delete("/galleries/:slug", (req, res) => {
    const ok = store.deleteGallery(req.params.slug);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  });

  router.post("/galleries/:slug/images", (req, res) => {
    upload.array("images", 200)(req, res, async (err) => {
      if (err) {
        const msg =
          err.code === "LIMIT_FILE_COUNT"
            ? "Too many files in one batch (max 200). Upload in smaller groups."
            : err.message || "Upload failed";
        return res.status(400).json({ error: msg });
      }
      try {
        const result = await store.addImages(req.params.slug, req.files || []);
        if (!result) return res.status(404).json({ error: "Not found" });
        res.json(result);
      } catch (e) {
        console.error("Upload error:", e);
        res.status(500).json({ error: "Upload failed" });
      }
    });
  });

  router.delete("/galleries/:slug/images/:filename", (req, res) => {
    const gallery = store.removeImage(req.params.slug, req.params.filename);
    if (!gallery) return res.status(404).json({ error: "Not found" });
    res.json({ gallery });
  });

  const PAGE_IDS = ["home", "about", "galleries", "prints", "contact"];

  router.get("/site/settings", (_req, res) => {
    res.json({ settings: siteStore.getSettings() });
  });

  router.patch("/site/settings", (req, res) => {
    const settings = siteStore.updateSettings(req.body || {});
    res.json({ settings });
  });

  router.get("/site/images", (_req, res) => {
    res.json({ images: siteStore.listPickerImages() });
  });

  // Admin-only: report disk usage so you can monitor growth.
  router.get("/system/storage", (_req, res) => {
    const dataDir = process.env.DATA_DIR
      ? String(process.env.DATA_DIR)
      : path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");

    const root = statfsBytes("/");
    const dataDirStats = statfsBytes(dataDir);

    res.json({ dataDir, root, dataDirStats });
  });

  router.get("/site/pages/:id", (req, res) => {
    if (!PAGE_IDS.includes(req.params.id)) return res.status(404).json({ error: "Not found" });
    const resolved = siteStore.getPageResolved(req.params.id, { includePrivate: true });
    if (!resolved) return res.status(404).json({ error: "Not found" });
    res.json(resolved);
  });

  router.patch("/site/pages/:id", (req, res) => {
    if (!PAGE_IDS.includes(req.params.id)) return res.status(404).json({ error: "Not found" });
    const safeBody = sanitizePageBody(req.params.id, req.body || {});
    const resolved = siteStore.updatePage(req.params.id, safeBody);
    if (!resolved) return res.status(404).json({ error: "Not found" });
    res.json(resolved);
  });

  router.post("/site/home/hero", (req, res) => {
    upload.single("image")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed" });
      if (!req.file) return res.status(400).json({ error: "No image" });
      try {
        const heroImage = siteStore.saveHeroUpload(req.file);
        const resolved = siteStore.updatePage("home", { heroImage });
        res.json(resolved);
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Upload failed" });
      }
    });
  });

  router.post("/site/about/:slot/photo", (req, res) => {
    const slot = req.params.slot;
    if (slot !== "hero" && slot !== "accent") return res.status(400).json({ error: "Invalid slot" });
    upload.single("image")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed" });
      if (!req.file) return res.status(400).json({ error: "No image" });
      try {
        const resolved = siteStore.setAboutPhoto(slot, req.file);
        res.json(resolved);
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Upload failed" });
      }
    });
  });

  return router;
}
