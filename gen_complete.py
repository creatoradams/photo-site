from pathlib import Path
ROOT = Path(__file__).resolve().parent

def w(rel, content):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    print("wrote", rel)

w("src/pages/about.astro", """---
import Layout from "../layouts/Layout.astro";
---
<Layout title=\"About\" description=\"About Your Name Photography.\">
  <div class=\"container prose\">
    <h1 class=\"page-title\">About</h1>
    <p>Wedding, portrait, and landscape photography.</p>
  </div>
</Layout>
""")

w("src/pages/contact.astro", """---
import Layout from "../layouts/Layout.astro";
---
<Layout title=\"Contact\" description=\"Contact Your Name Photography.\">
  <div class=\"container prose\">
    <h1 class=\"page-title\">Contact</h1>
    <p>Reach me at hello@yourdomain.com</p>
  </div>
</Layout>
""")

w("src/pages/prints.astro", """---
import Layout from "../layouts/Layout.astro";
---
<Layout title=\"Prints\" description=\"Order fine art prints.\">
  <div class=\"container prose\">
    <h1 class=\"page-title\">Prints</h1>
    <p><a href=\"https://example.com/prints\" class=\"btn\" target=\"_blank\" rel=\"noopener\">Visit print shop</a></p>
  </div>
</Layout>
""")

print("part1")