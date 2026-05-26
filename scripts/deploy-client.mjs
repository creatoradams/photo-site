#!/usr/bin/env node
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
console.log(`Share: ${process.env.SITE_URL || "https://adamsphoto.net"}/client/${slug}`);
