# Go live on adamsphoto.co

This matches the hosting stack: **Ubuntu VPS**, **Node.js 20+**, **Caddy**, **systemd** for the download API, and **DNS** for `adamsphoto.co`.

## What is already built

| Piece | Status |
|-------|--------|
| Astro portfolio (home, galleries, about, contact, prints) | Done |
| PhotoSwipe lightbox + optimized images | Done |
| Client galleries (`/client/{slug}`) + magic-link auth | Done |
| Node download service (ZIP, previews, SMTP) | Done |
| `deploy/Caddyfile` for `adamsphoto.co` | Done |
| `deploy/photo-download.service` | Done |

Sample content uses placeholder SVGs. Replace with your real JPEGs before launch.

---

## 1. VPS

Create an Ubuntu 22.04 or 24.04 VPS (DigitalOcean, Linode, Vultr, Hetzner, etc.). Note the public IP.

SSH in as root (or a sudo user):

```bash
ssh root@YOUR_VPS_IP
```

---

## 2. DNS (adamsphoto.co)

At your domain registrar (e.g. Google Domains / Squarespace):

| Type | Name | Value |
|------|------|-------|
| A | `@` | `YOUR_VPS_IP` |
| A | `www` | `YOUR_VPS_IP` |

Wait for DNS to propagate (often 5–30 minutes). Caddy will obtain HTTPS certificates automatically once DNS points here.

---

## 3. Server bootstrap (one time)

From your **local** machine, copy the deploy folder and run the script:

```bash
cd photo-site
scp deploy/Caddyfile deploy/photo-download.service deploy/env.example deploy/bootstrap-server.sh root@YOUR_VPS_IP:/root/photo-deploy/
ssh root@YOUR_VPS_IP 'cd /root/photo-deploy && bash bootstrap-server.sh'
```

Or SSH in and paste the commands from `bootstrap-server.sh` manually.

Create production secrets:

```bash
ssh root@YOUR_VPS_IP
openssl rand -hex 32   # use output as AUTH_SECRET
nano /etc/photo-site/env   # copy from deploy/env.example, fill SMTP + AUTH_SECRET
chmod 600 /etc/photo-site/env
```

**SMTP** — use SendGrid, Amazon SES, Mailgun, or similar. Magic links will not send without valid `SMTP_*` values.

---

## 4. Deploy the site and API

On your **Windows/Mac** dev machine (project root):

```bash
npm install
cd service && npm install && cd ..
npm run build
```

Upload static site + service (adjust `user@` and host):

```bash
rsync -avz --delete dist/ user@YOUR_VPS_IP:/var/www/photo-site/
rsync -avz --exclude node_modules --exclude data/tokens.db service/ user@YOUR_VPS_IP:/opt/photo-site/service/
ssh user@YOUR_VPS_IP 'cd /opt/photo-site/service && npm ci --omit=dev'
```

Copy server gallery config (after you have client deliveries):

```bash
scp service/data/galleries.json user@YOUR_VPS_IP:/opt/photo-site/service/data/galleries.json
rsync -avz service/data/client-files/ user@YOUR_VPS_IP:/data/client-files/
```

On the VPS, fix ownership and start the API:

```bash
chown -R www-data:www-data /var/www/photo-site /opt/photo-site /data/client-files
systemctl start photo-download
systemctl status photo-download
systemctl reload caddy
```

---

## 5. Verify

1. https://adamsphoto.co — home and public galleries load  
2. https://adamsphoto.co/client/sample-client — email gate (use an allowlisted email from `client-galleries.config.json`)  
3. Request magic link → check inbox (or service logs if SMTP not set)  
4. After unlock: thumbnails, select images, download ZIP  

```bash
journalctl -u photo-download -f
journalctl -u caddy -f
```

---

## 6. Ongoing workflow

**New public album**

1. Add images under `public/albums/my-album/`  
2. Add `src/content/albums/my-album/index.md`  
3. `npm run build` → `rsync` `dist/` to `/var/www/photo-site/`

**New client delivery**

1. Put full-res JPEGs in `deliveries/{slug}/`  
2. Add emails in `client-galleries.config.json`  
3. `npm run deploy-client -- {slug}`  
4. Rsync `/data/client-files/{slug}/` and `galleries.json` to the VPS  
5. Send client: `https://adamsphoto.co/client/{slug}`

**Resend magic link**

```bash
npm run send-magic-link -- sample-client client@example.com
```

---

## File layout on the VPS

```
/var/www/photo-site/          # Astro static build (Caddy file_server)
/opt/photo-site/service/      # Node API (systemd)
/data/client-files/{slug}/    # Full-res JPEGs + manifest (not web-accessible)
/etc/photo-site/env           # Secrets (AUTH_SECRET, SMTP)
/etc/caddy/Caddyfile          # adamsphoto.co + reverse_proxy /api/*
```

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| Certificate error | DNS A records not pointing to VPS yet |
| 502 on `/api/*` | `systemctl status photo-download`, port 8080 listening |
| Magic link not received | SMTP credentials, `SMTP_FROM` domain verified with provider |
| Downloads fail | `galleries.json` paths, files under `/data/client-files/` |
| Permission denied | `chown www-data:www-data` on web root, service, and client files |
