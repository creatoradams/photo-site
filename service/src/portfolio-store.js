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
      printCollectionUrl: g.printCollectionUrl || "",
      cover: cover ? imageUrl(g.slug, cover) : null,
      imageCount: (g.images || []).length,
      images: (g.images || []).map((name) => ({
        name,
        url: imageUrl(g.slug, name),
        thumbUrl: imageUrl(g.slug, name, true),
      })),
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    };
  }

  function imageUrl(slug, filename, thumb = false) {
    const base = `/api/portfolio/images/${encodeURIComponent(slug)}/${encodeURIComponent(filename)}`;
    return thumb ? `${base}?size=thumb` : base;
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

  async function addImages(slug, files) {
    const catalog = readCatalog();
    const g = catalog.galleries[slug];
    if (!g) return null;
    const dir = galleryDir(slug);
    fs.mkdirSync(dir, { recursive: true });
    const added = [];

    for (const file of files) {
      const ext = path.extname(file.originalname || "").toLowerCase();
      if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) continue;
      const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.webp`;
      const dest = path.join(dir, name);
      await sharp(file.buffer)
        .rotate()
        .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(dest);
      g.images.push(name);
      added.push(name);
      if (!g.cover) g.cover = name;
    }

    g.updatedAt = new Date().toISOString();
    writeCatalog(catalog);
    return { gallery: serializeGallery(g), added };
  }

  function removeImage(slug, filename) {
    const catalog = readCatalog();
    const g = catalog.galleries[slug];
    if (!g) return null;
    const safe = path.basename(filename);
    g.images = g.images.filter((n) => n !== safe);
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
  };
}
