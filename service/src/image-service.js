import fs from "fs";
import path from "path";
import sharp from "sharp";

export const IMAGE_MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

export const CACHE_LONG = "public, max-age=604800, immutable";

// On-the-fly WebP variants. Each is cached to disk after first generation.
const VARIANTS = {
  thumb: { cacheKey: "thumb-600-600-80", resize: { width: 600, height: 600, fit: "cover" }, quality: 80 },
  grid: { cacheKey: "grid-720-82", resize: { width: 720, withoutEnlargement: true }, quality: 82 },
  display: { cacheKey: "display-1920-88", resize: { width: 1920, withoutEnlargement: true }, quality: 88 },
};

export function imageMime(filePath) {
  return IMAGE_MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

export function isWebpVariant(size) {
  return typeof size === "string" && Object.prototype.hasOwnProperty.call(VARIANTS, size);
}

function webpCachePath(filePath, cacheKey) {
  const dir = path.join(path.dirname(filePath), ".img-cache");
  const base = path.basename(filePath, path.extname(filePath));
  return { dir, path: path.join(dir, `${base}.${cacheKey}.webp`) };
}

/**
 * Send a cached/generated WebP variant of an image. Returns true if the response
 * was handled (sent or errored), false if the variant name was unknown.
 */
export async function sendWebpVariant(res, filePath, variantName) {
  const variant = VARIANTS[variantName];
  if (!variant) return false;
  const cache = webpCachePath(filePath, variant.cacheKey);
  try {
    if (!fs.existsSync(cache.path)) {
      const buf = await sharp(filePath)
        .rotate()
        .resize(variant.resize)
        .webp({ quality: variant.quality })
        .toBuffer();
      fs.mkdirSync(cache.dir, { recursive: true });
      fs.writeFileSync(cache.path, buf);
    }
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", CACHE_LONG);
    res.sendFile(cache.path);
  } catch {
    if (!res.headersSent) res.status(500).end();
  }
  return true;
}

/** Send the original image bytes with the given cache policy. */
export function sendOriginalImage(res, filePath, { cacheControl = CACHE_LONG, download = false } = {}) {
  res.setHeader("Content-Type", imageMime(filePath));
  res.setHeader("Cache-Control", cacheControl);
  if (download) {
    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
  }
  res.sendFile(filePath);
}
