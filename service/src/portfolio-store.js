import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";

export function createPortfolioStore({ dataDir }) {
  const portfolioDir = path.join(dataDir, "portfolio");
  const catalogPath = path.join(dataDir, "portfolio-galleries.json");

  function ensureDirs() {
    fs.mkdirSync(portfolioDir, { recursive: true });
    if (!fs.existsSync(catalogPath)) {
      const seed = {
        galleries: {
          "sample-wedding": {
            slug: "sample-wedding",
            title: "Sample Wedding",
            description: "A celebration in the mountains — sample portfolio album.",
            date: "2025-06-15",
            private: false,
            featured: true,
            printCollectionUrl: "",
            cover: null,
            images: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      };
      fs.writeFileSync(catalogPath, JSON.stringify(seed, null, 2));
    }
  }

  function readCatalog() {
    ensureDirs();
    return JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  }

  function writeCatalog(catalog) {
    fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
  }

  function galleryDir(slug) {
    return path.join(portfolioDir, slug);
  }

  function slugify(title) {
    const base = String(title || "gallery")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "gallery";
    const catalog = readCatalog();
    if (!catalog.galleries[base]) return base;
    return `${base}-${crypto.randomBytes(3).toString("hex")}`;
  }

  function listGalleries({ includePrivate = false } = {}) {
    const catalog = readCatalog();
    const items = Object.values(catalog.galleries)
      .filter((g) => includePrivate || !g.private)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items.map(serializeGallery);
  }

  function getGallery(slug, { includePrivate = false } = {}) {
    const catalog = readCatalog();
    const g = catalog.galleries[slug];
    if (!g) return null;
    if (g.private && !includePrivate) return null;
    return serializeGallery(g);
  }

  function serializeGallery(g) {
    const cover = g.cover || g.images?.[0] || null;
    return {
      slug: g.slug,
      title: g.title,
      description: g.description || "",
      date: g.date,
      private: !!g.private,
      featured: !!g.featured,
      homeOrder: typeof g.homeOrder === "number" ? g.homeOrder : null,
      printCollectionUrl: g.printCollectionUrl || "",
      cover: cover ? imageUrl(g.slug, cover) : null,
      imageCount: (g.images || []).length,
      images: (g.images || []).map((name) => {
        const meta = g.imageMeta?.[name];
        return {
          name,
          url: imageUrl(g.slug, name),
          thumbUrl: imageUrl(g.slug, name, "thumb"),
          gridUrl: imageUrl(g.slug, name, "grid"),
          displayUrl: imageUrl(g.slug, name, "display"),
          width: meta?.width ?? null,
          height: meta?.height ?? null,
        };
      }),
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    };
  }

  function imageUrl(slug, filename, size = false) {
    const base = `/api/portfolio/images/${encodeURIComponent(slug)}/${encodeURIComponent(filename)}`;
    if (size === "thumb") return `${base}?size=thumb`;
    if (size === "grid") return `${base}?size=grid`;
    if (size === "display") return `${base}?size=display`;
    return base;
  }

  async function readImageDimensions(filePath) {
    const meta = await sharp(filePath).rotate().metadata();
    return {
      width: meta.width || 2400,
      height: meta.height || 1600,
    };
  }

  async function ensureGalleryImageMeta(slug) {
    const catalog = readCatalog();
    const g = catalog.galleries[slug];
    if (!g) return;
    let dirty = false;
    if (!g.imageMeta) g.imageMeta = {};
    for (const name of g.images || []) {
      if (g.imageMeta[name]?.width) continue;
      const fp = path.join(galleryDir(slug), name);
      if (!fs.existsSync(fp)) continue;
      try {
        g.imageMeta[name] = await readImageDimensions(fp);
        dirty = true;
      } catch (e) {
        console.error("Could not read image dimensions:", name, e);
      }
    }
    if (dirty) writeCatalog(catalog);
  }

  function createGallery({ title, description, date, private: isPrivate, featured, printCollectionUrl }) {
    const catalog = readCatalog();
    const slug = slugify(title);
    const now = new Date().toISOString();
    const entry = {
      slug,
      title: title || "Untitled gallery",
      description: description || "",
      date: date || now.slice(0, 10),
      private: !!isPrivate,
      featured: !!featured,
      printCollectionUrl: printCollectionUrl || "",
      cover: null,
      images: [],
      createdAt: now,
      updatedAt: now,
    };
    catalog.galleries[slug] = entry;
    writeCatalog(catalog);
    fs.mkdirSync(galleryDir(slug), { recursive: true });
    return serializeGallery(entry);
  }

  function updateGallery(slug, patch) {
    const catalog = readCatalog();
    const g = catalog.galleries[slug];
    if (!g) return null;
    if (patch.title !== undefined) g.title = String(patch.title).trim() || g.title;
    if (patch.description !== undefined) g.description = String(patch.description);
    if (patch.date !== undefined) g.date = String(patch.date).slice(0, 10);
    if (patch.private !== undefined) g.private = !!patch.private;
    if (patch.featured !== undefined) g.featured = !!patch.featured;
    if (patch.homeOrder !== undefined) {
      const n =
        patch.homeOrder === null || patch.homeOrder === "" ? null : Number(patch.homeOrder);
      if (n === null || !Number.isFinite(n)) delete g.homeOrder;
      else g.homeOrder = n;
    }
    if (patch.printCollectionUrl !== undefined) g.printCollectionUrl = String(patch.printCollectionUrl);
    if (patch.cover !== undefined) {
      const cover = patch.cover ? path.basename(patch.cover) : null;
      g.cover = cover && g.images.includes(cover) ? cover : g.cover;
    }
    g.updatedAt = new Date().toISOString();
    writeCatalog(catalog);
    return serializeGallery(g);
  }

  function deleteGallery(slug) {
    const catalog = readCatalog();
    if (!catalog.galleries[slug]) return false;
    delete catalog.galleries[slug];
    writeCatalog(catalog);
    const dir = galleryDir(slug);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    return true;
  }

  const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".tif", ".tiff"]);

  async function saveUploadedImage(file, destPath, ext) {
    const extLower = ext.toLowerCase();

    // HEIC/HEIF: convert to max-quality JPEG (required for broad browser support).
    if (extLower === ".heic" || extLower === ".heif") {
      const jpgPath = destPath.replace(/\.[^.]+$/, ".jpg");
      await sharp(file.buffer)
        .rotate()
        .jpeg({ quality: 100, mozjpeg: true, chromaSubsampling: "4:4:4" })
        .toFile(jpgPath);
      return path.basename(jpgPath);
    }

    // JPEG: keep original bytes when possible; rotate only when EXIF orientation requires it.
    if (extLower === ".jpg" || extLower === ".jpeg") {
      const meta = await sharp(file.buffer).metadata();
      if (meta.orientation && meta.orientation > 1) {
        await sharp(file.buffer)
          .rotate()
          .jpeg({ quality: 100, mozjpeg: true, chromaSubsampling: "4:4:4" })
          .toFile(destPath);
      } else {
        fs.writeFileSync(destPath, file.buffer);
      }
      return path.basename(destPath);
    }

    // PNG / WebP / TIFF: store without resizing or lossy recompression.
    if (extLower === ".png" || extLower === ".webp" || extLower === ".tif" || extLower === ".tiff") {
      fs.writeFileSync(destPath, file.buffer);
      return path.basename(destPath);
    }

    // Unknown image type: normalize to max-quality JPEG without resizing.
    const jpgPath = destPath.replace(/\.[^.]+$/, ".jpg");
    await sharp(file.buffer)
      .rotate()
      .jpeg({ quality: 100, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toFile(jpgPath);
    return path.basename(jpgPath);
  }

  async function addImages(slug, files) {
    const catalog = readCatalog();
    const g = catalog.galleries[slug];
    if (!g) return null;
    const dir = galleryDir(slug);
    fs.mkdirSync(dir, { recursive: true });
    const added = [];
    const skipped = [];

    for (const file of files || []) {
      let ext = path.extname(file.originalname || "").toLowerCase();
      const mime = (file.mimetype || "").toLowerCase();
      const okExt = ALLOWED_EXT.has(ext) || mime.startsWith("image/");
      if (!okExt) {
        skipped.push({ name: file.originalname || "file", reason: "Unsupported file type" });
        continue;
      }
      if (!ext && mime.includes("jpeg")) ext = ".jpg";
      if (!ext && mime.includes("png")) ext = ".png";
      if (!ext && mime.includes("webp")) ext = ".webp";
      if (!ext) ext = ".jpg";

      const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
      const dest = path.join(dir, name);
      try {
        const savedName = await saveUploadedImage(file, dest, ext);
        g.images.push(savedName);
        if (!g.imageMeta) g.imageMeta = {};
        try {
          g.imageMeta[savedName] = await readImageDimensions(path.join(dir, savedName));
        } catch {
          /* dimensions optional */
        }
        added.push(savedName);
        if (!g.cover) g.cover = savedName;
      } catch (e) {
        console.error("Image processing failed:", file.originalname, e);
        skipped.push({ name: file.originalname || "file", reason: "Could not process image" });
      }
    }

    g.updatedAt = new Date().toISOString();
    writeCatalog(catalog);
    return { gallery: serializeGallery(g), added, skipped };
  }

  function removeImage(slug, filename) {
    const catalog = readCatalog();
    const g = catalog.galleries[slug];
    if (!g) return null;
    const safe = path.basename(filename);
    g.images = g.images.filter((n) => n !== safe);
    if (g.imageMeta) delete g.imageMeta[safe];
    if (g.cover === safe) g.cover = g.images[0] || null;
    const filePath = path.join(galleryDir(slug), safe);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    g.updatedAt = new Date().toISOString();
    writeCatalog(catalog);
    return serializeGallery(g);
  }

  function resolveImagePath(slug, filename) {
    const safe = path.basename(filename);
    const catalog = readCatalog();
    const g = catalog.galleries[slug];
    if (!g || !g.images.includes(safe)) return null;
    return path.join(galleryDir(slug), safe);
  }

  ensureDirs();
  return {
    listGalleries,
    getGallery,
    createGallery,
    updateGallery,
    deleteGallery,
    addImages,
    removeImage,
    resolveImagePath,
    readCatalog,
    ensureGalleryImageMeta,
  };
}
