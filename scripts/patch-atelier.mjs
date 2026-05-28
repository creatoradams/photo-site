import fs from "fs";
const p = process.argv[2] || "/opt/photo-site/service/data/site-pages.json";
const d = JSON.parse(fs.readFileSync(p, "utf8"));
if (!d.pages) d.pages = {};
d.pages.home = d.pages.home || {};
d.pages.home.layout = "atelier";
if (!d.pages.galleries) {
  d.pages.galleries = {
    title: "Galleries",
    eyebrow: "Portfolio",
    paragraphs: ["Collections of weddings, portraits, and editorial work."],
  };
}
if (!d.settings) d.settings = {};
d.settings.siteTheme = "dark";
const out = "/tmp/site-pages-patched.json";
fs.writeFileSync(out, JSON.stringify(d, null, 2));
console.log("Wrote", out);
