#!/bin/bash
set -e
cp -r /tmp/photo-deploy-dist/. /var/www/photo-site/
for f in admin-routes.js portfolio-store.js portfolio-routes.js index.js site-content-store.js site-routes.js; do
  [ -f "/tmp/$f" ] && cp "/tmp/$f" /opt/photo-site/service/src/
done
cd /opt/photo-site/service && npm ci --omit=dev
systemctl restart photo-download
find /var/www/photo-site -type d -exec chmod 755 {} \;
find /var/www/photo-site -type f -exec chmod 644 {} \;
chmod 755 /opt/photo-site/service/src
chmod 644 /opt/photo-site/service/src/*.js
echo DEPLOY_OK
