import express from "express";
import sharp from "sharp";
import fs from "fs";

export function createPortfolioRoutes(store) {
  const router = express.Router();

  router.get("/galleries", (_req, res) => {
    res.json({ galleries: store.listGalleries({ includePrivate: false }) });
  });

  router.get("/galleries/:slug", (req, res) => {
    const gallery = store.getGallery(req.params.slug, { includePrivate: false });
    if (!gallery) return res.status(404).json({ error: "Not found" });
    res.json({ gallery });
  });

  router.get("/images/:slug/:filename", async (req, res) => {
    const filePath = store.resolveImagePath(req.params.slug, req.params.filename);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).end();

    if (req.query.size === "thumb") {
      try {
        const buf = await sharp(filePath)
          .resize({ width: 600, height: 600, fit: "cover" })
          .webp({ quality: 80 })
          .toBuffer();
        res.setHeader("Content-Type", "image/webp");
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.send(buf);
      } catch {
        return res.status(500).end();
      }
    }

    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.sendFile(filePath);
  });

  return router;
}
