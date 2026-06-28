import express from "express";
import { isWebpVariant, sendWebpVariant, sendOriginalImage } from "./image-service.js";

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

    if (isWebpVariant(req.query.size)) {
      return void (await sendWebpVariant(res, filePath, req.query.size));
    }

    sendOriginalImage(res, filePath);
  });

  return router;
}
