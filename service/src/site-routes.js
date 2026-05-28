import express from "express";
import path from "path";
import fs from "fs";
import sharp from "sharp";

const IMAGE_MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

const CACHE_LONG = "public, max-age=604800, immutable";

function getWebpCachePath(filePath, cacheKey) {
  const dir = path.join(path.dirname(filePath), ".img-cache");
  const base = path.basename(filePath, path.extname(filePath));
  return {
    dir,
    path: path.join(dir, `${base}.${cacheKey}.webp`),
  };
}

export function createSiteRoutes(siteStore) {
  const router = express.Router();

  router.get("/settings", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.json({ settings: siteStore.getSettings() });
  });

  router.get("/pages/:id", (req, res) => {
    const id = req.params.id;
    const resolved = siteStore.getPageResolved(id, { includePrivate: false });
    if (!resolved) return res.status(404).json({ error: "Not found" });
    const cache =
      id === "home" ? "no-cache, no-store, must-revalidate" : "public, max-age=60";
    res.setHeader("Cache-Control", cache);
    res.json(resolved);
  });

  router.get("/assets/:filename", async (req, res) => {
    const filePath = siteStore.resolveAssetPath(req.params.filename);
    if (!filePath) return res.status(404).end();

    if (req.query.size === "grid") {
      try {
        const cache = getWebpCachePath(filePath, "grid-720-82");
        if (fs.existsSync(cache.path)) {
          res.setHeader("Content-Type", "image/webp");
          res.setHeader("Cache-Control", CACHE_LONG);
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
        res.setHeader("Cache-Control", CACHE_LONG);
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
          res.setHeader("Cache-Control", CACHE_LONG);
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
        res.setHeader("Cache-Control", CACHE_LONG);
        return res.sendFile(cache.path);
      } catch {
        return res.status(500).end();
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", IMAGE_MIME[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", CACHE_LONG);
    res.sendFile(filePath);
  });

  return router;
}
