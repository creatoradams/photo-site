from pathlib import Path
ROOT = Path(__file__).resolve().parent

def w(rel, content):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    print("wrote", rel)

w("deploy/Caddyfile", """yourdomain.com {
    root * /var/www/photo-site
    file_server

    handle /api/* {
        reverse_proxy localhost:8080
    }

    encode gzip zstd
}
""")

w("deploy/photo-download.service", """[Unit]
Description=Photo site download service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/photo-site/service
EnvironmentFile=/etc/photo-site/env
ExecStart=/usr/bin/node src/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
""")

w("client-galleries.config.example.json", """{
  "sample-client": {
    "allowedEmails": ["client@example.com"],
    "localDir": "./deliveries/sample-client"
  }
}
""")

DEPLOY_CLIENT = r"""#!/usr/bin/env node
/**
 * Deploy a client gallery: generate manifest + thumbs, update galleries.json
 * Usage: node scripts/deploy-client.mjs <slug>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const slug = process.argv[2];
if (!slug) {
  console.error("Usage: node scripts/deploy-client.mjs <slug>");
  process.exit(1);
}

const configPath = path.join(root, "client-galleries.config.json");
if (!fs.existsSync(configPath)) {
  console.error("Create client-galleries.config.json from client-galleries.config.example.json");
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const entry = config[slug];
if (!entry) {
  console.error(`No config for slug: ${slug}`);
  process.exit(1);
}

const srcDir = path.resolve(root, entry.localDir || `./deliveries/${slug}`);
const serviceData = path.join(root, "service", "data", "client-files", slug);
const thumbsDir = path.join(serviceData, "thumbs");

if (!fs.existsSync(srcDir)) {
  console.error(`Source dir not found: ${srcDir}`);
  process.exit(1);
}

fs.mkdirSync(thumbsDir, { recursive: true });

const imageExt = /\.(jpe?g|png|webp)$/i;
const files = fs.readdirSync(srcDir).filter((f) => imageExt.test(f) && !f.startsWith("."));
const manifest = { files: [] };

for (const name of files.sort()) {
  const full = path.join(srcDir, name);
  const stat = fs.statSync(full);
  manifest.files.push({ name, size: stat.size });
  console.log("  ", name);
}

fs.cpSync(srcDir, serviceData, { recursive: true, filter: (src) => {
  const base = path.basename(src);
  return base !== "manifest.json" && !src.includes(`${path.sep}thumbs${path.sep}`);
}});

fs.writeFileSync(path.join(serviceData, "manifest.json"), JSON.stringify(manifest, null, 2));

const galleriesPath = path.join(root, "service", "data", "galleries.json");
let galleries = {};
if (fs.existsSync(galleriesPath)) galleries = JSON.parse(fs.readFileSync(galleriesPath, "utf8"));
galleries[slug] = {
  dir: serviceData.replace(/\\/g, "/"),
  allowedEmails: entry.allowedEmails || [],
};
fs.writeFileSync(galleriesPath, JSON.stringify(galleries, null, 2));

console.log(`\nDeployed ${slug} to ${serviceData}`);
console.log(`Manifest: ${manifest.files.length} files`);
console.log("\nNext: rsync service/data/client-files/ to your VPS /data/client-files/");
console.log("Copy service/data/galleries.json to VPS /etc/photo-site/ or service/data/");
console.log(`Share: ${process.env.SITE_URL || "https://yourdomain.com"}/client/${slug}`);
"""

w("scripts/deploy-client.mjs", DEPLOY_CLIENT)

SEND_LINK = r"""#!/usr/bin/env node
/** Usage: node scripts/send-magic-link.mjs <slug> <email> */
const slug = process.argv[2];
const email = process.argv[3];
const base = process.env.API_URL || "http://localhost:8080";
const res = await fetch(`${base}/api/auth/request-link`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ gallery: slug, email }),
});
const data = await res.json();
console.log(data.message || res.status);
"""

w("scripts/send-magic-link.mjs", SEND_LINK)

README = """# Photography Website

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

## Production deploy

```bash
npm run build
rsync -avz --delete dist/ user@server:/var/www/photo-site/
rsync -avz service/ user@server:/opt/photo-site/service/
rsync -avz service/data/client-files/ user@server:/data/client-files/
```

See `deploy/Caddyfile` and `deploy/photo-download.service`.

## Customize

- Site name: `src/components/Header.astro`, `astro.config.mjs` (`site` URL)
- Contact: `src/pages/contact.astro`
- Prints URL: `src/pages/prints.astro`
"""

w("README.md", README)
print("deploy scripts done")