import fs from "fs";
const p = process.argv[2] || "/opt/photo-site/service/data/site-pages.json";
const count = Number(process.argv[3]) || 15;
if (!fs.existsSync(p)) {
  console.log("no file");
  process.exit(0);
}
const d = JSON.parse(fs.readFileSync(p, "utf8"));
if (d.pages?.home?.grid) {
  d.pages.home.grid.count = count;
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
  console.log("set count to", count);
}
