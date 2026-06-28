import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import fs from "fs";

import { PORT, DATA_DIR, ALLOWED_ORIGINS, AUTH_SECRET, ADMIN_PASSWORD } from "./config.js";
import { securityHeaders } from "./security.js";
import { createPortfolioStore } from "./portfolio-store.js";
import { createSiteContentStore } from "./site-content-store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createMailer } from "./mailer.js";
import { createTokenStore } from "./rate-limit-store.js";
import { createPortfolioRoutes } from "./portfolio-routes.js";
import { createSiteRoutes } from "./site-routes.js";
import { createAdminRoutes } from "./admin-routes.js";
import { createClientRoutes } from "./client-routes.js";
import { createContactRoutes } from "./contact-routes.js";

// Stores create their data directories on init, so build them before anything
// (e.g. the token DB) that assumes DATA_DIR already exists.
const portfolioStore = createPortfolioStore({ dataDir: DATA_DIR });
const siteStore = createSiteContentStore({ dataDir: DATA_DIR, portfolioStore });
const adminAuth = createAdminAuth({ authSecret: AUTH_SECRET, adminPassword: ADMIN_PASSWORD });
const mailer = createMailer();
const tokenStore = createTokenStore();

const app = express();
// Behind Caddy (reverse proxy): trust the first proxy hop so req.ip and
// express-rate-limit key on the real client IP, not the proxy's.
app.set("trust proxy", 1);

app.use(securityHeaders);
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin (no origin header) and explicit allowed origins.
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error("CORS: origin not allowed"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use(createClientRoutes({ db: tokenStore.db, checkRate: tokenStore.checkRate, mailer }));
app.use(createContactRoutes({ checkRate: tokenStore.checkRate, mailer }));
app.use("/api/portfolio", createPortfolioRoutes(portfolioStore));
app.use("/api/site", createSiteRoutes(siteStore));
app.use("/api/admin", createAdminRoutes(portfolioStore, adminAuth, siteStore));

app.listen(PORT, () => {
  console.log(`Photo download service on :${PORT}`);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
});
