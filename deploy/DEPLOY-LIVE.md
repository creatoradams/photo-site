# Deploy updates to adamsphoto.net

Your live site already has the API (`/api/health` works). You need to deploy **new frontend + new API code** so gallery uploads work at **https://adamsphoto.net/galleries**.

## On your computer

```bash
cd photo-site
npm install
npm run build
cd service && npm install && cd ..
```

Set your server SSH user/host (example):

```bash
$env:DEPLOY_HOST="root@YOUR_SERVER_IP"   # PowerShell
# export DEPLOY_HOST=root@YOUR_SERVER_IP   # Mac/Linux
npm run deploy:live
```

Or run the rsync commands manually:

```bash
rsync -avz --delete dist/ $DEPLOY_HOST:/var/www/photo-site/
rsync -avz --exclude node_modules --exclude data/tokens.db service/ $DEPLOY_HOST:/opt/photo-site/service/
ssh $DEPLOY_HOST "cd /opt/photo-site/service && npm ci --omit=dev && systemctl restart photo-download"
```

## On the server (one time)

1. Add to `/etc/photo-site/env`:

```
ADMIN_PASSWORD=your-chosen-password
SITE_URL=https://adamsphoto.net
```

2. Update Caddyfile from `deploy/Caddyfile` (domain `adamsphoto.net`).

3. `systemctl restart photo-download caddy`

## Verify

- https://adamsphoto.net/api/portfolio/galleries — should return JSON (not 404)
- https://adamsphoto.net/galleries — click **+ Add gallery**, sign in, upload photos
