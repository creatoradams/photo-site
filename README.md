# Photography Website

Self-hosted portfolio (Astro) + private client galleries with magic-link access and full-res ZIP downloads.

## Structure

- `src/` — Astro static site (public galleries, about, contact, prints)
- `src/pages/client/[slug].astro` — private client gallery (email magic link)
- `service/` — Node download API (auth, previews, ZIP)
- `deliveries/<slug>/` — full-res JPEGs per client (not committed)
- `client-galleries.config.json` — allowed emails per gallery (gitignored)

## Prerequisites

1. [Node.js](https://nodejs.org/) 20+ (includes npm)
2. VPS with Caddy or Nginx
3. SMTP credentials (SendGrid, SES, etc.)
