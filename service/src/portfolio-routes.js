import express from "express";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import { isWebpVariant, sendWebpVariant, sendOriginalImage } from "./image-service.js";

export function createPortfolioRoutes(store) {
  const router = express.Router();

  router.get("/galleries", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
    res.json({ galleries: store.listGalleries({ includePrivate: false }) });
  });

  router.post("/galleries/:slug/download", (req, res) => {
    const slug = req.params.slug;
    const gallery = store.getGallery(slug, { includePrivate: true });
    if (!gallery) return res.status(404).json({ error: "Not found" });

    const files = req.body?.files;
    if (!Array.isArray(files) || !files.length) {
      return res.status(400).json({ error: "No files selected" });
    }

    const allowed = new Set(gallery.images.map((img) => img.name));
    const safe = files.map((f) => path.basename(String(f))).filter((f) => allowed.has(f));
    if (!safe.length) return res.status(400).json({ error: "No valid files" });

    const zipName =
      (gallery.title || slug).replace(/[^\w\s-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) ||
      slug;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipName}.zip"`);
    const archive = archiver("zip", { zlib: { level: 5 } });
    archive.on("error", (err) => {
      console.error(err);
      if (!res.headersSent) res.status(500).end();
    });
    archive.pipe(res);
    for (const name of safe) {
      const filePath = store.resolveImagePath(slug, name);
      if (filePath && fs.existsSync(filePath)) archive.file(filePath, { name });
    }
    archive.finalize();
  });

  // Public listing hides private albums; direct link works for anyone you share it with.
  router.get("/galleries/:slug", async (req, res) => {
    await store.ensureGalleryImageMeta(req.params.slug);
    const gallery = store.getGallery(req.params.slug, { includePrivate: true });
    if (!gallery) return res.status(404).json({ error: "Not found" });
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json({ gallery });
  });

  router.get("/images/:slug/:filename", async (req, res) => {
    const filePath = store.resolveImagePath(req.params.slug, req.params.filename);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).end();

    if (isWebpVariant(req.query.size)) {
      return void (await sendWebpVariant(res, filePath, req.query.size));
    }

    sendOriginalImage(res, filePath, {
      cacheControl: "public, max-age=86400",
      download: req.query.download === "1",
    });
  });

  return router;
}
