import express from "express";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import archiver from "archiver";

const IMAGE_MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

function imageMime(filePath) {
  return IMAGE_MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function getWebpCachePath(filePath, cacheKey) {
  const dir = path.join(path.dirname(filePath), ".img-cache");
  const base = path.basename(filePath, path.extname(filePath));
  return {
    dir,
    path: path.join(dir, `${base}.${cacheKey}.webp`),
  };
}

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

    const cacheLong = "public, max-age=604800, immutable";

    if (req.query.size === "thumb") {
      try {
        const cache = getWebpCachePath(filePath, "thumb-600-600-80");
        if (fs.existsSync(cache.path)) {
          res.setHeader("Content-Type", "image/webp");
          res.setHeader("Cache-Control", cacheLong);
          return res.sendFile(cache.path);
        }
        const buf = await sharp(filePath)
          .rotate()
          .resize({ width: 600, height: 600, fit: "cover" })
          .webp({ quality: 80 })
          .toBuffer();
        fs.mkdirSync(cache.dir, { recursive: true });
        fs.writeFileSync(cache.path, buf);
        res.setHeader("Content-Type", "image/webp");
        res.setHeader("Cache-Control", cacheLong);
        return res.sendFile(cache.path);
      } catch {
        return res.status(500).end();
      }
    }

    if (req.query.size === "grid") {
      try {
        const cache = getWebpCachePath(filePath, "grid-720-82");
        if (fs.existsSync(cache.path)) {
          res.setHeader("Content-Type", "image/webp");
          res.setHeader("Cache-Control", cacheLong);
          return res.sendFile(cache.path);
        }
        const buf = await sharp(filePath)
          .rotate()
          .resize({ width: 720, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
        fs.mkdirSync(cache.dir, { recursive: true });
        fs.writeFileSync(cache.path, buf);
        res.setHeader("Content-Type", "image/webp");
        res.setHeader("Cache-Control", cacheLong);
        return res.sendFile(cache.path);
      } catch {
        return res.status(500).end();
      }
    }

    if (req.query.size === "display") {
      try {
        const cache = getWebpCachePath(filePath, "display-1920-88");
        if (fs.existsSync(cache.path)) {
          res.setHeader("Content-Type", "image/webp");
          res.setHeader("Cache-Control", cacheLong);
          return res.sendFile(cache.path);
        }
        const buf = await sharp(filePath)
          .rotate()
          .resize({ width: 1920, withoutEnlargement: true })
          .webp({ quality: 88 })
          .toBuffer();
        fs.mkdirSync(cache.dir, { recursive: true });
        fs.writeFileSync(cache.path, buf);
        res.setHeader("Content-Type", "image/webp");
        res.setHeader("Cache-Control", cacheLong);
        return res.sendFile(cache.path);
      } catch {
        return res.status(500).end();
      }
    }

    res.setHeader("Content-Type", imageMime(filePath));
    res.setHeader("Cache-Control", "public, max-age=86400");
    if (req.query.download === "1") {
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
    }
    res.sendFile(filePath);
  });

  return router;
}
