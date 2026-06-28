import path from "path";

export function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase();
}

/** Reject path-traversal attempts; returns a bare filename or null. */
export function safeFilename(name) {
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) return null;
  return path.basename(name);
}

/** Escape text for safe interpolation into HTML email bodies. */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
