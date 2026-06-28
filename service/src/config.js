import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const NODE_ENV = process.env.NODE_ENV || "development";
export const IS_PROD = NODE_ENV === "production";
export const PORT = process.env.PORT || 8080;

export const AUTH_SECRET = process.env.AUTH_SECRET || "dev-secret-change-me";
if (IS_PROD && AUTH_SECRET === "dev-secret-change-me") {
  console.error(
    "FATAL: AUTH_SECRET is the default dev value. Set a strong secret in .env before running in production."
  );
  process.exit(1);
}

export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
export const SITE_URL = process.env.SITE_URL || "http://localhost:4321";
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
export const CLIENT_FILES_DIR = process.env.CLIENT_FILES_DIR || path.join(DATA_DIR, "client-files");
export const GALLERIES_PATH = path.join(DATA_DIR, "galleries.json");

export const SESSION_DAYS = 7;
export const MAGIC_MINUTES = 45;

// Where contact-form inquiries are delivered. Falls back to the SMTP sender.
export const CONTACT_TO = process.env.CONTACT_TO || process.env.SMTP_FROM || "hello@adamsphoto.net";

// In production only the live site may call the API with credentials; in dev we
// also allow the local Astro/dev origins.
export const ALLOWED_ORIGINS = IS_PROD
  ? [SITE_URL].filter(Boolean)
  : [SITE_URL, "http://localhost:4321", "http://localhost:3000"].filter(Boolean);

export const SMTP = {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.SMTP_FROM || "gallery@adamsphoto.net",
};
