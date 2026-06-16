import fs from "fs";
import path from "path";
import crypto from "crypto";

const DEFAULT_PAGES = {
  home: {
    layout: "atelier",
    headline: "Stories told in light",
    subheadline: "Wedding, portrait, and editorial photography — honest moments, artful frames.",
    ctaText: "View galleries",
    ctaUrl: "/galleries",
    heroImage: null,
    grid: { mode: "random", count: 15, manual: [] },
    showFeatured: true,
  },
  about: {
    title: "About",
    paragraphs: [
      "I'm a photographer specializing in weddings, portraits, and editorial work.",
      "Available for commissions worldwide. Get in touch to discuss your project.",
    ],
    heroPhoto: null,
    accentPhoto: null,
  },
  prints: {
    title: "Prints",
    paragraphs: ["Order fine art prints from select collections."],
    buttonText: "Visit print shop",
    buttonUrl: "https://example.com/prints",
  },
  contact: {
    title: "Contact",
    paragraphs: ["I'd love to hear about your project."],
    email: "hello@adamsphoto.net",
  },
  galleries: {
    title: "Galleries",
    eyebrow: "Portfolio",
    paragraphs: ["Collections of weddings, portraits, and editorial work."],
  },
};

const HOME_LAYOUTS = [
  "atelier",
  "masonry",
  "spotlight",
  "minimal",
  "timeless",
  "fashion",
  "editorial",
  "travel",
  "wedding",
  "landscape",
];
const SITE_THEMES = ["dark", "light"];

const DEFAULT_SETTINGS = {
  printsEnabled: false,
  siteTheme: "dark",
};

export function createSiteContentStore({ dataDir, portfolioStore }) {
  const contentPath = path.join(dataDir, "site-pages.json");
  const assetsDir = path.join(dataDir, "site-assets");

  function ensureDirs() {
    fs.mkdirSync(assetsDir, { recursive: true });
    if (!fs.existsSync(contentPath)) {
      fs.writeFileSync(
        contentPath,
        JSON.stringify({ pages: DEFAULT_PAGES, settings: DEFAULT_SETTINGS }, null, 2)
      );
    }
  }

  function readRaw() {
    ensureDirs();
    const data = JSON.parse(fs.readFileSync(contentPath, "utf8"));
    if (!data.settings) data.settings = { ...DEFAULT_SETTINGS };
    if (!data.pages) data.pages = {};
    if (!data.pages.galleries) data.pages.galleries = structuredClone(DEFAULT_PAGES.galleries);
    return data;
  }

  function getSettings() {
    const data = readRaw();
    return normalizeSettings(data.settings);
  }

  function normalizeSettings(settings) {
    const siteTheme = SITE_THEMES.includes(settings?.siteTheme) ? settings.siteTheme : "dark";
    return {
      printsEnabled: Boolean(settings?.printsEnabled),
      siteTheme,
    };
  }

  function normalizeHome(home) {
    const h = { ...DEFAULT_PAGES.home, ...home };
    if (!HOME_LAYOUTS.includes(h.layout)) h.layout = "atelier";
    if (!h.grid) h.grid = { ...DEFAULT_PAGES.home.grid };
    return h;
  }

  function updateSettings(patch) {
    const data = readRaw();
    data.settings = normalizeSettings({ ...data.settings, ...patch });
    writeRaw(data);
    return getSettings();
  }

  function writeRaw(data) {
    fs.writeFileSync(contentPath, JSON.stringify(data, null, 2));
  }

  function getPage(id) {
    const data = readRaw();
    const page = data.pages[id] ? structuredClone(data.pages[id]) : null;
    if (id === "about" && page) return normalizeAbout(page);
    if (id === "home" && page) return normalizeHome(page);
    return page;
  }

  function normalizeAbout(about) {
    const a = { ...about };
    if (Array.isArray(a.photos)) {
      if (!a.heroPhoto && a.photos[0]) a.heroPhoto = a.photos[0];
      if (!a.accentPhoto && a.photos[1]) a.accentPhoto = a.photos[1];
      delete a.photos;
    }
    if (a.heroPhoto === undefined) a.heroPhoto = null;
    if (a.accentPhoto === undefined) a.accentPhoto = null;
    return a;
  }

  function updatePage(id, patch) {
    const allowed = ["home", "about", "prints", "contact", "galleries"];
    if (!allowed.includes(id)) return null;
    const data = readRaw();
    if (!data.pages[id]) data.pages[id] = structuredClone(DEFAULT_PAGES[id]);
    if (id === "about") {
      data.pages[id] = normalizeAbout({ ...data.pages[id], ...patch });
    } else if (id === "home") {
      data.pages[id] = normalizeHome({ ...data.pages[id], ...patch });
    } else {
      data.pages[id] = { ...data.pages[id], ...patch };
    }
    writeRaw(data);
    return getPageResolved(id, { includePrivate: true });
  }

  function imageRefUrl(ref) {
    if (!ref) return null;
    if (ref.type === "upload" && ref.filename) {
      return `/api/site/assets/${encodeURIComponent(ref.filename)}`;
    }
    if (ref.type === "gallery" && ref.slug && ref.name) {
      return `/api/portfolio/images/${encodeURIComponent(ref.slug)}/${encodeURIComponent(ref.name)}`;
    }
    return null;
  }

  function resolveImageRef(ref) {
    const url = imageRefUrl(ref);
    if (!url) return null;
    const thumbUrl =
      ref.type === "gallery"
        ? `${url}?size=thumb`
        : url;
    return { ...ref, url, thumbUrl };
  }

  function collectGalleryImages({ includePrivate = false, featuredOnly = false } = {}) {
    const galleries = portfolioStore.listGalleries({ includePrivate });
    const out = [];
    for (const g of galleries) {
      if (featuredOnly && !g.featured) continue;
      for (const img of g.images) {
        out.push({
          slug: g.slug,
          galleryTitle: g.title,
          name: img.name,
          url: img.url,
          thumbUrl: img.thumbUrl,
          gridUrl: img.gridUrl,
          displayUrl: img.displayUrl,
        });
      }
    }
    return out;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function resolveGrid(home, { includePrivate = false } = {}) {
    const grid = home.grid || { mode: "random", count: 15, manual: [] };
    const heroRef = home.heroImage;
    // "Selected for homepage": galleries marked as featured should be the only source.
    const featuredOnly = true;
    let items = [];

    if (grid.mode === "manual" && Array.isArray(grid.manual) && grid.manual.length) {
      items = grid.manual
        .map((ref) => {
          const g = portfolioStore.getGallery(ref.slug, { includePrivate: true });
          if (!g) return null;
          if (featuredOnly && !g.featured) return null;
          const img = g.images.find((i) => i.name === ref.name);
          if (!img) return null;
          return {
            slug: ref.slug,
            name: img.name,
            url: img.url,
            thumbUrl: img.thumbUrl,
            gridUrl: img.gridUrl,
            displayUrl: img.displayUrl,
            isHero: heroRef?.type === "gallery" && heroRef.slug === ref.slug && heroRef.name === ref.name,
          };
        })
        .filter(Boolean);
    } else {
      const pool = collectGalleryImages({ includePrivate, featuredOnly: true });
      const count = Math.min(Math.max(Number(grid.count) || 15, 1), 60);
      items = shuffle(pool).slice(0, count).map((img) => ({
        ...img,
        isHero: heroRef?.type === "gallery" && heroRef.slug === img.slug && heroRef.name === img.name,
      }));
    }

    if (heroRef?.type === "upload" && heroRef.filename) {
      const heroUrl = imageRefUrl(heroRef);
      const heroGridUrl = `${heroUrl}${heroUrl.includes("?") ? "&" : "?"}size=grid`;
      const heroDisplayUrl = `${heroUrl}${heroUrl.includes("?") ? "&" : "?"}size=display`;
      const heroItem = {
        slug: null,
        name: heroRef.filename,
        url: heroUrl,
        thumbUrl: heroGridUrl,
        gridUrl: heroGridUrl,
        displayUrl: heroDisplayUrl,
        isHero: true,
      };
      const idx = items.findIndex((i) => i.isHero);
      if (idx >= 0) items.splice(idx, 1);
      items.unshift(heroItem);
    } else if (heroRef?.type === "gallery") {
      const heroGallery = portfolioStore.getGallery(heroRef.slug, { includePrivate: true });
      if (!heroGallery) return items;
      if (featuredOnly && !heroGallery.featured) return items;

      const idx = items.findIndex((i) => i.isHero);
      if (idx > 0) {
        const [hero] = items.splice(idx, 1);
        items.unshift(hero);
      } else if (idx < 0) {
        const resolved = resolveImageRef(heroRef);
        if (resolved?.url) {
          const img = heroGallery.images.find((i) => i.name === heroRef.name);
          items.unshift({
            slug: heroRef.slug,
            name: heroRef.name,
            url: resolved.url,
            thumbUrl: resolved.thumbUrl,
            gridUrl: img?.gridUrl || resolved.thumbUrl,
            displayUrl: img?.displayUrl || img?.gridUrl,
            isHero: true,
          });
        }
      }
    }

    return items;
  }

  function resolvePhotoRef(ref) {
    if (!ref) return null;
    if (ref.type === "gallery" && ref.slug && ref.name) {
      const g = portfolioStore.getGallery(ref.slug, { includePrivate: true });
      const img = g?.images.find((i) => i.name === ref.name);
      if (!img) return null;
      return {
        slug: ref.slug,
        name: img.name,
        url: img.url,
        gridUrl: img.gridUrl || img.url,
        displayUrl: img.displayUrl || img.gridUrl,
        thumbUrl: img.thumbUrl,
      };
    }
    if (ref.type === "upload" && ref.filename) {
      const url = imageRefUrl(ref);
      if (!url) return null;
      const gridUrl = `${url}${url.includes("?") ? "&" : "?"}size=grid`;
      const displayUrl = `${url}${url.includes("?") ? "&" : "?"}size=display`;
      return {
        slug: null,
        name: ref.filename,
        url,
        gridUrl,
        displayUrl,
        thumbUrl: gridUrl,
      };
    }
    return null;
  }

  function getPageResolved(id, opts = {}) {
    if (id === "prints" && !opts.includePrivate && !getSettings().printsEnabled) {
      return null;
    }
    const page = getPage(id);
    if (!page) return null;

    if (id === "home") {
      const home = normalizeHome(structuredClone(page));
      home.heroResolved = resolveImageRef(home.heroImage);
      const gridImages = resolveGrid(home, opts);
      const mapGallery = (g) => ({
        slug: g.slug,
        title: g.title,
        cover: g.cover,
        date: g.date,
      });
      const listed = portfolioStore.listGalleries({ includePrivate: opts.includePrivate });
      const allGalleries = listed.map(mapGallery);
      // Featured galleries drive the home page reel. Sort by the manual
      // homeOrder (lower = first); galleries without an order fall to the end,
      // ordered by date (newest first) as a stable tiebreak.
      const featuredGalleries = listed
        .filter((g) => g.featured)
        .sort((a, b) => {
          const ao = typeof a.homeOrder === "number" ? a.homeOrder : Infinity;
          const bo = typeof b.homeOrder === "number" ? b.homeOrder : Infinity;
          if (ao !== bo) return ao - bo;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        })
        .map(mapGallery);
      return { page: home, gridImages, featuredGalleries, allGalleries };
    }

    if (id === "about") {
      const about = normalizeAbout(structuredClone(page));
      return {
        page: about,
        heroPhoto: resolvePhotoRef(about.heroPhoto),
        accentPhoto: resolvePhotoRef(about.accentPhoto),
      };
    }

    return { page };
  }

  function listPickerImages() {
    return collectGalleryImages({ includePrivate: true });
  }

  function saveAssetUpload(file, prefix = "asset") {
    ensureDirs();
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const name = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
    fs.writeFileSync(path.join(assetsDir, name), file.buffer);
    return { type: "upload", filename: name };
  }

  function saveHeroUpload(file) {
    return saveAssetUpload(file, "hero");
  }

  function setAboutPhoto(slot, file) {
    const page = normalizeAbout(getPage("about") || structuredClone(DEFAULT_PAGES.about));
    const ref = saveAssetUpload(file, "about");
    if (slot === "hero") page.heroPhoto = ref;
    else if (slot === "accent") page.accentPhoto = ref;
    else return null;
    return updatePage("about", { heroPhoto: page.heroPhoto, accentPhoto: page.accentPhoto });
  }

  function resolveAssetPath(filename) {
    const safe = path.basename(filename);
    const p = path.join(assetsDir, safe);
    return fs.existsSync(p) ? p : null;
  }

  ensureDirs();
  return {
    getSettings,
    updateSettings,
    getPage,
    getPageResolved,
    updatePage,
    listPickerImages,
    saveHeroUpload,
    saveAssetUpload,
    setAboutPhoto,
    resolveAssetPath,
    imageRefUrl,
  };
}
