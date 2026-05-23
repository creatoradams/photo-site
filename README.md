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

## Local setup

```bash
cd photo-site
npm install
cd service && npm install && cd ..

cp .env.example service/.env
# Edit service/.env: AUTH_SECRET, SITE_URL, SMTP_*

cp client-galleries.config.example.json client-galleries.config.json
```

### Run locally

Terminal 1 — API:
```bash
cd service
cp data/galleries.example.json data/galleries.json
# Edit galleries.json paths for your machine
npm run dev
```

Terminal 2 — site:
```bash
npm run dev
```

Visit http://localhost:4321 — client demo: http://localhost:4321/client/sample-client

Without SMTP, magic links are printed in the service console.

## Add a public album

1. Add images to `public/albums/my-album/`
2. Create `src/content/albums/my-album/index.md` with frontmatter (see sample-wedding)
3. `npm run build`

## Add a client gallery

1. Export full-res JPEGs to `deliveries/my-client/`
2. Add entry to `client-galleries.config.json`
3. `npm run deploy-client -- my-client`
4. Send client: `https://yourdomain.com/client/my-client`

## Production deploy (adamsphoto.co)

**Full step-by-step:** [`deploy/VPS-SETUP.md`](deploy/VPS-SETUP.md) — Ubuntu VPS, Node 20+, Caddy, systemd, DNS.

Quick rsync after build:

```bash
npm run build
rsync -avz --delete dist/ user@YOUR_VPS_IP:/var/www/photo-site/
rsync -avz --exclude node_modules service/ user@YOUR_VPS_IP:/opt/photo-site/service/
rsync -avz service/data/client-files/ user@YOUR_VPS_IP:/data/client-files/
```

Server configs: `deploy/Caddyfile`, `deploy/photo-download.service`, `deploy/env.example`, `deploy/bootstrap-server.sh`.

## Customize

- Site name: `src/components/Header.astro`, `astro.config.mjs` (`site` URL)
- Contact: `src/pages/contact.astro`
- Prints URL: `src/pages/prints.astro`
