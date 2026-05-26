import express from "express";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024, files: 30 },
});

export function createAdminRoutes(store, adminAuth) {
  const router = express.Router();

  router.post("/login", (req, res) => {
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

  router.post("/galleries/:slug/images", upload.array("images", 30), async (req, res) => {
    try {
      const result = await store.addImages(req.params.slug, req.files || []);
      if (!result) return res.status(404).json({ error: "Not found" });
      res.json(result);
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  router.delete("/galleries/:slug/images/:filename", (req, res) => {
    const gallery = store.removeImage(req.params.slug, req.params.filename);
    if (!gallery) return res.status(404).json({ error: "Not found" });
    res.json({ gallery });
  });

  return router;
}
