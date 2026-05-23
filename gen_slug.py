from pathlib import Path
ROOT = Path(__file__).resolve().parent

def w(rel, content):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    print("wrote", rel)

SLUG = r"""---
import Layout from "../../layouts/Layout.astro";
import { getCollection } from "astro:content";

export async function getStaticPaths() {
  const galleries = await getCollection("client-galleries");
  return galleries.map((g) => ({
    params: { slug: g.data.slug },
    props: { gallery: g },
  }));
}

const { gallery } = Astro.props;
const slug = gallery.data.slug;
---
<Layout title={gallery.data.title} description="Private client gallery" noindex={true}>
  <div class="container" data-client-gallery={slug}>
    <h1 class="page-title">{gallery.data.title}</h1>
    {gallery.data.description && <p class="prose">{gallery.data.description}</p>}
    <section id="gate" class="prose">
      <p>Enter your email to receive a secure access link.</p>
      <form id="request-form">
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" required autocomplete="email" />
        </div>
        <button type="submit" class="btn" id="request-btn">Send access link</button>
      </form>
      <p id="request-msg" class="message hidden"></p>
    </section>
    <section id="gallery-section" class="hidden">
      <div class="client-toolbar">
        <button type="button" class="btn btn-secondary" id="select-all">Select all</button>
        <button type="button" class="btn btn-secondary" id="clear-all">Clear</button>
        <span id="selection-count">0 selected</span>
        <button type="button" class="btn" id="download-selected" disabled>Download selected</button>
        <button type="button" class="btn" id="download-all">Download all</button>
        <button type="button" class="btn btn-secondary" id="logout-btn">Sign out</button>
      </div>
      <div id="client-grid" class="client-grid"></div>
      <p id="download-status" class="hidden"><span class="spinner"></span> Preparing download…</p>
    </section>
  </div>
  <script>
    import { initClientGallery } from "../../scripts/client-gallery.ts";
    const el = document.querySelector("[data-client-gallery]");
    const s = el?.getAttribute("data-client-gallery");
    if (s) initClientGallery(s);
  </script>
</Layout>
"""

w("src/pages/client/[slug].astro", SLUG)
print("done slug")