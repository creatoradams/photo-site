#!/usr/bin/env bash
# One-time Ubuntu VPS setup for adamsphoto.co
# Run as root on a fresh Ubuntu 22.04/24.04 VPS: bash bootstrap-server.sh
set -euo pipefail

echo "==> Packages"
apt-get update
apt-get install -y curl ca-certificates gnupg rsync

echo "==> Node.js 20"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

echo "==> Caddy"
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

echo "==> Directories"
mkdir -p /var/www/photo-site
mkdir -p /opt/photo-site/service
mkdir -p /data/client-files
mkdir -p /etc/photo-site
chown -R www-data:www-data /var/www/photo-site /opt/photo-site /data/client-files

echo "==> Caddy site config"
install -m 644 Caddyfile /etc/caddy/Caddyfile
systemctl enable caddy
systemctl restart caddy

echo "==> systemd service"
install -m 644 photo-download.service /etc/systemd/system/photo-download.service
systemctl daemon-reload
systemctl enable photo-download

echo ""
echo "Next steps:"
echo "  1. Create /etc/photo-site/env from env.example (AUTH_SECRET, SMTP_*)"
echo "  2. Deploy app files (see VPS-SETUP.md)"
echo "  3. systemctl start photo-download"
echo "  4. Point adamsphoto.co A record to this server's IP"
