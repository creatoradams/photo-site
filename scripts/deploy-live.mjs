#!/usr/bin/env node
/**
 * Deploy site + API to production VPS.
 * Usage: DEPLOY_HOST=root@your-server npm run deploy:live
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const host = process.env.DEPLOY_HOST;

if (!host) {
  console.error("Set DEPLOY_HOST, e.g. DEPLOY_HOST=root@1.2.3.4 npm run deploy:live");
  process.exit(1);
}

if (!fs.existsSync(path.join(root, "dist"))) {
  console.error("Run npm run build first");
  process.exit(1);
}

const cmds = [
  `rsync -avz --delete "${root}/dist/" ${host}:/var/www/photo-site/`,
  `rsync -avz --exclude node_modules --exclude data/tokens.db "${root}/service/" ${host}:/opt/photo-site/service/`,
  `ssh ${host} "cd /opt/photo-site/service && npm ci --omit=dev && systemctl restart photo-download"`,
];

for (const cmd of cmds) {
  console.log(">", cmd);
  execSync(cmd, { stdio: "inherit", shell: true });
}

console.log("\nDone. Open https://adamsphoto.net/galleries and click + Add gallery");
