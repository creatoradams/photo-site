import { api } from "./api";
import { applySiteTheme } from "./site-theme";

type ImageRef = { type: "gallery"; slug: string; name: string } | { type: "upload"; filename: string };
type PickerImage = { slug: string; galleryTitle: string; name: string; url: string; thumbUrl: string };

type HomePage = {
  layout:
    | "atelier"
    | "masonry"
    | "spotlight"
    | "minimal"
    | "timeless"
    | "fashion"
    | "editorial"
    | "travel"
    | "wedding"
    | "landscape";
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaUrl: string;
  heroImage: ImageRef | null;
  heroResolved?: { url: string };
  grid: { mode: "random" | "manual"; count: number; manual: ImageRef[] };
  showFeatured: boolean;
};

type TextPage = {
  title: string;
  paragraphs: string[];
  buttonText?: string;
  buttonUrl?: string;
  email?: string;
};

type AboutPage = TextPage & {
  heroPhoto?: ImageRef | null;
  accentPhoto?: ImageRef | null;
};

type ResolvedPhoto = {
  slug: string | null;
  name: string;
  url: string;
  gridUrl: string;
  thumbUrl: string;
};

let pickerImages: PickerImage[] = [];
let activeTab = "galleries";

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector<T>(sel)!;

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function show(el: HTMLElement | null, visible: boolean) {
  if (!el) return;
  el.classList.toggle("hidden", !visible);
}

function refKey(ref: ImageRef) {
  return ref.type === "gallery" ? `${ref.slug}:${ref.name}` : `upload:${ref.filename}`;
}

async function loadPickerImages() {
  const { images } = await api<{ images: PickerImage[] }>("/api/admin/site/images");
  pickerImages = images;
}

function renderImagePicker(
  container: HTMLElement,
  selected: Set<string>,
  onToggle: (ref: ImageRef) => void,
  single = false
) {
  if (!pickerImages.length) {
    container.innerHTML = `<p class="admin-muted">No gallery photos yet. Create a gallery under the <strong>Galleries</strong> tab, upload photos there, then come back here to pick them for the About page. You can still use <strong>Upload photos from computer</strong> below.</p>`;
    return;
  }
  container.innerHTML = pickerImages
    .map((img) => {
      const key = `${img.slug}:${img.name}`;
      const sel = selected.has(key);
      return `
      <button type="button" class="admin-cover-option site-pick-option ${sel ? "selected" : ""}" data-slug="${escapeHtml(img.slug)}" data-name="${escapeHtml(img.name)}">
        <img src="${img.thumbUrl}" alt="" />
        <span class="site-pick-label">${escapeHtml(img.galleryTitle)}</span>
      </button>`;
    })
    .join("");

  container.querySelectorAll<HTMLButtonElement>(".site-pick-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ref: ImageRef = { type: "gallery", slug: btn.dataset.slug!, name: btn.dataset.name! };
      const key = refKey(ref);
      if (single) {
        selected.clear();
        selected.add(key);
        container.querySelectorAll(".site-pick-option").forEach((el) => el.classList.remove("selected"));
        btn.classList.add("selected");
      } else {
        if (selected.has(key)) {
          selected.delete(key);
          btn.classList.remove("selected");
        } else {
          selected.add(key);
          btn.classList.add("selected");
        }
      }
      onToggle(ref);
    });
  });
}

async function saveHome(form: HTMLElement) {
  const manual: ImageRef[] = [];
  form.querySelectorAll<HTMLElement>("#manual-hidden-keys [data-manual-key]").forEach((el) => {
    manual.push({ type: "gallery", slug: el.dataset.slug!, name: el.dataset.name! });
  });

  const gridMode = ($("#home-grid-mode", form) as HTMLSelectElement).value as "random" | "manual";
  const heroType = ($('input[name="hero-type"]:checked', form) as HTMLInputElement)?.value || "none";

  let heroImage: ImageRef | null = null;
  if (heroType === "gallery") {
    const heroKey = form.getAttribute("data-hero-key");
    const match = pickerImages.find((i) => `${i.slug}:${i.name}` === heroKey);
    if (match) heroImage = { type: "gallery", slug: match.slug, name: match.name };
  } else if (heroType === "upload") {
    const existing = form.getAttribute("data-hero-upload");
    if (existing) heroImage = { type: "upload", filename: existing };
  }

  const body: Partial<HomePage> = {
    layout: ($("#home-layout", form) as HTMLSelectElement).value as HomePage["layout"],
    headline: ($("#home-headline", form) as HTMLInputElement).value,
    subheadline: ($("#home-subheadline", form) as HTMLInputElement).value,
    ctaText: ($("#home-cta-text", form) as HTMLInputElement).value,
    ctaUrl: ($("#home-cta-url", form) as HTMLInputElement).value,
    showFeatured: ($("#home-show-featured", form) as HTMLInputElement).checked,
    heroImage,
    grid: {
      mode: gridMode,
      count: Number(($("#home-grid-count", form) as HTMLInputElement).value) || 15,
      manual: gridMode === "manual" ? manual : [],
    },
  };

  const siteTheme = ($("#site-theme", form) as HTMLSelectElement).value;

  await Promise.all([
    api("/api/admin/site/pages/home", { method: "PATCH", body: JSON.stringify(body) }),
    api("/api/admin/site/settings", {
      method: "PATCH",
      body: JSON.stringify({ siteTheme }),
    }),
  ]);
}

async function renderHomeEditor(panel: HTMLElement) {
  await loadPickerImages();
  const [{ page, gridImages }, { settings }] = await Promise.all([
    api<{ page: HomePage; gridImages: PickerImage[] }>("/api/admin/site/pages/home"),
    api<{ settings: { siteTheme: string } }>("/api/admin/site/settings"),
  ]);

  const manualKeys = new Set((page.grid?.manual || []).map((r) => refKey(r)));
  const heroKey =
    page.heroImage?.type === "gallery" ? `${page.heroImage.slug}:${page.heroImage.name}` : "";
  const layout = page.layout || "masonry";

  panel.innerHTML = `
    <div class="site-editor">
      <div class="site-editor-header">
        <h2>Home page</h2>
        <div class="site-editor-actions">
          <a href="/" class="btn btn-secondary" target="_blank" rel="noreferrer">Preview home</a>
          <button type="button" class="btn" id="site-save-home">Save home page</button>
        </div>
      </div>

      <div class="site-editor-grid">
        <section class="site-editor-section">
          <h3>Site appearance</h3>
          <div class="form-group">
            <label for="site-theme">Color theme</label>
            <select id="site-theme">
              <option value="dark" ${settings.siteTheme === "dark" ? "selected" : ""}>Dark</option>
              <option value="light" ${settings.siteTheme === "light" ? "selected" : ""}>Light</option>
            </select>
          </div>
          <div class="form-group">
            <label for="home-layout">Home page template</label>
            <select id="home-layout">
              <optgroup label="Studio (recommended)">
                <option value="atelier" ${layout === "atelier" ? "selected" : ""}>Atelier — editorial hero, marquee, category pills</option>
              </optgroup>
              <optgroup label="Classic">
                <option value="masonry" ${layout === "masonry" ? "selected" : ""}>Masonry grid — full photo wall</option>
                <option value="spotlight" ${layout === "spotlight" ? "selected" : ""}>Spotlight — large hero + grid below</option>
                <option value="minimal" ${layout === "minimal" ? "selected" : ""}>Minimal — headline &amp; compact grid</option>
              </optgroup>
              <optgroup label="Photography templates (Wix-style)">
                <option value="timeless" ${layout === "timeless" ? "selected" : ""}>Timeless — elegant serif portfolio</option>
                <option value="fashion" ${layout === "fashion" ? "selected" : ""}>Fashion clean — horizontal photo strip</option>
                <option value="editorial" ${layout === "editorial" ? "selected" : ""}>Editorial — bold hero with overlay text</option>
                <option value="travel" ${layout === "travel" ? "selected" : ""}>Travel — cool full-bleed hero + adventures</option>
                <option value="wedding" ${layout === "wedding" ? "selected" : ""}>Wedding — romantic hero overlay</option>
                <option value="landscape" ${layout === "landscape" ? "selected" : ""}>Landscape — wide earthy image rows</option>
              </optgroup>
            </select>
            <p class="admin-muted">Inspired by <a href="https://www.wix.com/website/templates/html/photography" target="_blank" rel="noreferrer">Wix photography templates</a>.</p>
          </div>
        </section>

        <section class="site-editor-section">
          <h3>Intro text</h3>
          <p class="admin-muted">Used on Atelier, minimal, timeless, and hero-overlay templates (editorial, travel, wedding, landscape).</p>
          <div class="form-group">
            <label for="home-headline">Headline</label>
            <input type="text" id="home-headline" value="${escapeHtml(page.headline || "")}" />
          </div>
          <div class="form-group">
            <label for="home-subheadline">Subheadline</label>
            <textarea id="home-subheadline" rows="2">${escapeHtml(page.subheadline || "")}</textarea>
          </div>
          <div class="form-group">
            <label for="home-cta-text">Button text</label>
            <input type="text" id="home-cta-text" value="${escapeHtml(page.ctaText || "")}" />
          </div>
          <div class="form-group">
            <label for="home-cta-url">Button link</label>
            <input type="text" id="home-cta-url" value="${escapeHtml(page.ctaUrl || "/galleries")}" />
          </div>
        </section>

        <section class="site-editor-section">
          <h3>Page options</h3>
          <label class="checkbox-row">
            <input type="checkbox" id="home-show-featured" ${page.showFeatured ? "checked" : ""} />
            Show collection chapters on home (Atelier) or featured section (other layouts)
          </label>
        </section>

        <section class="site-editor-section">
          <h3>Featured landing photo</h3>
          <p class="admin-muted">Shown first in the masonry grid (optional).</p>
          <div class="hero-type-row">
            <label><input type="radio" name="hero-type" value="none" ${!page.heroImage ? "checked" : ""} /> None</label>
            <label><input type="radio" name="hero-type" value="gallery" ${page.heroImage?.type === "gallery" ? "checked" : ""} /> From gallery</label>
            <label><input type="radio" name="hero-type" value="upload" ${page.heroImage?.type === "upload" ? "checked" : ""} /> Upload image</label>
          </div>
          <div id="hero-gallery-pick" class="${page.heroImage?.type === "gallery" ? "" : "hidden"}">
            <div id="hero-picker" class="admin-cover-picker site-image-picker"></div>
          </div>
          <div id="hero-upload-pick" class="${page.heroImage?.type === "upload" ? "" : "hidden"}">
            <label class="btn btn-secondary admin-upload-btn">
              Upload hero image
              <input type="file" id="hero-upload-input" accept="image/*" hidden />
            </label>
            ${page.heroResolved?.url ? `<img src="${page.heroResolved.url}" alt="" class="hero-preview-thumb" />` : ""}
          </div>
        </section>

        <section class="site-editor-section site-editor-section--wide" id="home-grid-section">
          <h3>Masonry photo grid</h3>
          <p class="admin-muted" id="home-grid-atelier-note" style="${layout === "atelier" ? "" : "display:none"}">Atelier uses a horizontal film strip and full-width collection chapters — not this grid. These settings still control which photos appear in the film strip.</p>
          <div class="form-group">
            <label for="home-grid-mode">Grid photos</label>
            <select id="home-grid-mode">
              <option value="random" ${page.grid?.mode !== "manual" ? "selected" : ""}>Random from all galleries</option>
              <option value="manual" ${page.grid?.mode === "manual" ? "selected" : ""}>Hand-picked photos</option>
            </select>
          </div>
          <div id="home-random-options" class="${page.grid?.mode === "manual" ? "hidden" : ""}">
            <div class="form-group">
              <label for="home-grid-count">Number of photos (random)</label>
              <input type="number" id="home-grid-count" min="4" max="60" value="${page.grid?.count ?? 15}" />
            </div>
          </div>
          <div id="home-manual-options" class="${page.grid?.mode === "manual" ? "" : "hidden"}">
            <p class="admin-muted">Click photos to include in the home grid.</p>
            <div id="manual-picker" class="admin-cover-picker site-image-picker"></div>
            <div id="manual-hidden-keys" class="hidden">
              ${(page.grid?.manual || [])
                .map(
                  (r) =>
                    `<span data-manual-key="${refKey(r)}" data-slug="${r.slug}" data-name="${r.name}"></span>`
                )
                .join("")}
            </div>
          </div>
          <p class="admin-muted">Preview: ${gridImages?.length ?? 0} photos currently on home.</p>
        </section>
      </div>
    </div>`;

  if (heroKey) panel.setAttribute("data-hero-key", heroKey);
  if (page.heroImage?.type === "upload" && page.heroImage.filename) {
    panel.setAttribute("data-hero-upload", page.heroImage.filename);
  }

  const heroSelected = new Set(heroKey ? [heroKey] : []);
  const manualSelected = new Set(manualKeys);

  const syncManualHidden = () => {
    const hidden = $("#manual-hidden-keys", panel);
    hidden.innerHTML = [...manualSelected]
      .map((key) => {
        const [slug, name] = key.split(":");
        return `<span data-manual-key="${key}" data-slug="${slug}" data-name="${name}"></span>`;
      })
      .join("");
  };

  renderImagePicker($("#hero-picker", panel), heroSelected, (ref) => {
    panel.setAttribute("data-hero-key", refKey(ref));
    ($('input[name="hero-type"][value="gallery"]', panel) as HTMLInputElement).checked = true;
  }, true);

  renderImagePicker($("#manual-picker", panel), manualSelected, () => syncManualHidden());

  $("#home-grid-mode", panel).addEventListener("change", (e) => {
    const mode = (e.target as HTMLSelectElement).value;
    show($("#home-random-options", panel), mode !== "manual");
    show($("#home-manual-options", panel), mode === "manual");
  });

  panel.querySelectorAll('input[name="hero-type"]').forEach((input) => {
    input.addEventListener("change", () => {
      const v = (input as HTMLInputElement).value;
      show($("#hero-gallery-pick", panel), v === "gallery");
      show($("#hero-upload-pick", panel), v === "upload");
    });
  });

  $("#hero-upload-input", panel).addEventListener("change", async () => {
    const input = $("#hero-upload-input", panel) as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("image", file);
    const result = await api<{ page: HomePage }>("/api/admin/site/home/hero", { method: "POST", body: form });
    if (result.page.heroImage?.type === "upload") {
      panel.setAttribute("data-hero-upload", result.page.heroImage.filename);
    }
    ($('input[name="hero-type"][value="upload"]', panel) as HTMLInputElement).checked = true;
    show($("#hero-gallery-pick", panel), false);
    show($("#hero-upload-pick", panel), true);
    await renderHomeEditor(panel);
  });

  $("#site-save-home", panel).addEventListener("click", async () => {
    const theme = ($("#site-theme", panel) as HTMLSelectElement).value;
    await saveHome(panel);
    if (theme === "light" || theme === "dark") applySiteTheme(theme);
    alert("Home page saved.");
    await renderHomeEditor(panel);
  });
}

function paragraphsToTextarea(paragraphs: string[]) {
  return (paragraphs || []).join("\n\n");
}

function textareaToParagraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function readSlotRef(panel: HTMLElement, slot: "hero" | "accent"): ImageRef | null {
  const el = panel.querySelector<HTMLElement>(`[data-slot-ref="${slot}"]`);
  if (!el) return null;
  if (el.dataset.refType === "gallery" && el.dataset.slug && el.dataset.name) {
    return { type: "gallery", slug: el.dataset.slug, name: el.dataset.name };
  }
  if (el.dataset.refType === "upload" && el.dataset.filename) {
    return { type: "upload", filename: el.dataset.filename };
  }
  return null;
}

function writeSlotRef(panel: HTMLElement, slot: "hero" | "accent", ref: ImageRef | null) {
  const holder = panel.querySelector<HTMLElement>(`[data-slot-ref="${slot}"]`);
  if (!holder) return;
  if (!ref) {
    holder.removeAttribute("data-ref-type");
    holder.removeAttribute("data-slug");
    holder.removeAttribute("data-name");
    holder.removeAttribute("data-filename");
    return;
  }
  holder.dataset.refType = ref.type;
  if (ref.type === "gallery") {
    holder.dataset.slug = ref.slug;
    holder.dataset.name = ref.name;
    holder.removeAttribute("data-filename");
  } else {
    holder.dataset.filename = ref.filename;
    holder.removeAttribute("data-slug");
    holder.removeAttribute("data-name");
  }
}

function setupAboutPhotoSlot(
  panel: HTMLElement,
  slot: "hero" | "accent",
  ref: ImageRef | null,
  resolved: ResolvedPhoto | null,
  otherSelected: Set<string>
) {
  const preview = $(`#about-${slot}-preview`, panel);
  const picker = $(`#about-${slot}-picker`, panel);
  const selected = new Set(ref ? [refKey(ref)] : []);

  const updatePreview = () => {
    const current = readSlotRef(panel, slot);
    if (!current) {
      preview.innerHTML = `<p class="admin-muted">No photo selected</p>`;
      return;
    }
    const src = resolved?.thumbUrl || resolved?.gridUrl || "";
    preview.innerHTML = src
      ? `<img src="${src}" alt="" class="about-slot-preview-img" /><button type="button" class="btn-text about-slot-clear" data-clear-slot="${slot}">Remove</button>`
      : `<p class="admin-muted">Photo unavailable</p>`;
    preview.querySelector<HTMLButtonElement>(`[data-clear-slot="${slot}"]`)?.addEventListener("click", () => {
      writeSlotRef(panel, slot, null);
      selected.clear();
      renderImagePicker(picker, selected, () => {}, true);
      updatePreview();
    });
  };
  updatePreview();

  renderImagePicker(
    picker,
    selected,
    (picked) => {
      writeSlotRef(panel, slot, picked);
      selected.clear();
      selected.add(refKey(picked));
      const pick = pickerImages.find((i) => i.slug === picked.slug && i.name === picked.name);
      if (pick) {
        preview.innerHTML = `<img src="${pick.thumbUrl}" alt="" class="about-slot-preview-img" /><button type="button" class="btn-text about-slot-clear" data-clear-slot="${slot}">Remove</button>`;
        preview.querySelector<HTMLButtonElement>(`[data-clear-slot="${slot}"]`)?.addEventListener("click", () => {
          writeSlotRef(panel, slot, null);
          selected.clear();
          renderImagePicker(picker, selected, () => {}, true);
          updatePreview();
        });
      }
      renderImagePicker(picker, selected, () => {}, true);
    },
    true
  );

  // Exclude other slot's image from showing as "selected" in this picker
  picker.querySelectorAll<HTMLButtonElement>(".site-pick-option").forEach((btn) => {
    const key = `${btn.dataset.slug}:${btn.dataset.name}`;
    if (otherSelected.has(key) && !selected.has(key)) btn.classList.remove("selected");
  });

  const uploadInput = $(`#about-${slot}-upload`, panel) as HTMLInputElement;
  const freshUpload = uploadInput.cloneNode(true) as HTMLInputElement;
  uploadInput.replaceWith(freshUpload);
  freshUpload.addEventListener("change", async () => {
    const file = freshUpload.files?.[0];
    freshUpload.value = "";
    if (!file) return;
    const form = new FormData();
    form.append("image", file);
    const result = await api<{ page: AboutPage; heroPhoto?: ResolvedPhoto; accentPhoto?: ResolvedPhoto }>(
      `/api/admin/site/about/${slot}/photo`,
      { method: "POST", body: form }
    );
    const newRef = slot === "hero" ? result.page.heroPhoto : result.page.accentPhoto;
    const newResolved = slot === "hero" ? result.heroPhoto : result.accentPhoto;
    if (newRef) {
      writeSlotRef(panel, slot, newRef);
      selected.clear();
      selected.add(refKey(newRef));
      const src = newResolved?.thumbUrl || newResolved?.gridUrl || "";
      preview.innerHTML = src
        ? `<img src="${src}" alt="" class="about-slot-preview-img" /><button type="button" class="btn-text about-slot-clear" data-clear-slot="${slot}">Remove</button>`
        : preview.innerHTML;
      preview.querySelector<HTMLButtonElement>(`[data-clear-slot="${slot}"]`)?.addEventListener("click", () => {
        writeSlotRef(panel, slot, null);
        selected.clear();
        renderImagePicker(picker, selected, () => {}, true);
        updatePreview();
      });
      renderImagePicker(picker, selected, () => {}, true);
    }
  });
}

async function renderAboutEditor(panel: HTMLElement) {
  await loadPickerImages();
  const { page, heroPhoto, accentPhoto } = await api<{
    page: AboutPage;
    heroPhoto?: ResolvedPhoto | null;
    accentPhoto?: ResolvedPhoto | null;
  }>("/api/admin/site/pages/about");

  panel.innerHTML = `
    <div class="site-editor">
      <div class="site-editor-header">
        <h2>About</h2>
        <div class="site-editor-actions">
          <a href="/about" class="btn btn-secondary" target="_blank" rel="noreferrer">Preview</a>
          <button type="button" class="btn" id="site-save-page">Save</button>
        </div>
      </div>

      <section class="site-editor-section site-editor-section--wide about-photos-panel">
        <h3>About page photos (2 max)</h3>
        <p class="admin-muted">Photo 1 fills the background behind your title and text. Photo 2 appears below as a single large image.</p>

        <div class="about-slot" data-slot="hero">
          <h4>1. Background photo (behind About title &amp; text)</h4>
          <div id="about-hero-preview" class="about-slot-preview"></div>
          <span data-slot-ref="hero" class="hidden"></span>
          <p class="about-picker-label">Pick from galleries:</p>
          <div id="about-hero-picker" class="admin-cover-picker site-image-picker about-gallery-picker"></div>
          <label class="btn btn-secondary admin-upload-btn">
            Upload background photo
            <input type="file" id="about-hero-upload" accept="image/*" hidden />
          </label>
        </div>

        <div class="about-slot" data-slot="accent">
          <h4>2. Second photo (below the text)</h4>
          <div id="about-accent-preview" class="about-slot-preview"></div>
          <span data-slot-ref="accent" class="hidden"></span>
          <p class="about-picker-label">Pick from galleries:</p>
          <div id="about-accent-picker" class="admin-cover-picker site-image-picker about-gallery-picker"></div>
          <label class="btn btn-secondary admin-upload-btn">
            Upload second photo
            <input type="file" id="about-accent-upload" accept="image/*" hidden />
          </label>
        </div>
      </section>

      <div class="form-group">
        <label for="page-title">Page title</label>
        <input type="text" id="page-title" value="${escapeHtml(page.title)}" />
      </div>
      <div class="form-group">
        <label for="page-body">About text (blank line between paragraphs)</label>
        <textarea id="page-body" rows="6">${escapeHtml(paragraphsToTextarea(page.paragraphs))}</textarea>
      </div>
    </div>`;

  writeSlotRef(panel, "hero", page.heroPhoto || null);
  writeSlotRef(panel, "accent", page.accentPhoto || null);

  setupAboutPhotoSlot(panel, "hero", page.heroPhoto || null, heroPhoto || null, new Set());
  setupAboutPhotoSlot(
    panel,
    "accent",
    page.accentPhoto || null,
    accentPhoto || null,
    new Set(page.heroPhoto ? [refKey(page.heroPhoto)] : [])
  );

  $("#site-save-page", panel).addEventListener("click", async () => {
    await api("/api/admin/site/pages/about", {
      method: "PATCH",
      body: JSON.stringify({
        title: ($("#page-title", panel) as HTMLInputElement).value,
        paragraphs: textareaToParagraphs(($("#page-body", panel) as HTMLTextAreaElement).value),
        heroPhoto: readSlotRef(panel, "hero"),
        accentPhoto: readSlotRef(panel, "accent"),
      }),
    });
    alert("About page saved.");
    await renderAboutEditor(panel);
  });
}

async function renderGalleriesPageEditor(panel: HTMLElement) {
  const { page } = await api<{ page: TextPage & { eyebrow?: string } }>("/api/admin/site/pages/galleries");

  panel.innerHTML = `
    <div class="site-editor">
      <div class="site-editor-header">
        <h2>Portfolio page</h2>
        <p class="admin-muted">Text at the top of <a href="/galleries" target="_blank" rel="noreferrer">/galleries</a> (the public gallery index).</p>
        <div class="site-editor-actions">
          <a href="/galleries" class="btn btn-secondary" target="_blank" rel="noreferrer">Preview</a>
          <button type="button" class="btn" id="site-save-page">Save</button>
        </div>
      </div>
      <div class="form-group">
        <label for="page-eyebrow">Eyebrow label (small text above title)</label>
        <input type="text" id="page-eyebrow" value="${escapeHtml(page.eyebrow || "")}" />
      </div>
      <div class="form-group">
        <label for="page-title">Page title</label>
        <input type="text" id="page-title" value="${escapeHtml(page.title)}" />
      </div>
      <div class="form-group">
        <label for="page-body">Intro (blank line between paragraphs)</label>
        <textarea id="page-body" rows="6">${escapeHtml(paragraphsToTextarea(page.paragraphs))}</textarea>
      </div>
    </div>`;

  $("#site-save-page", panel).addEventListener("click", async () => {
    await api("/api/admin/site/pages/galleries", {
      method: "PATCH",
      body: JSON.stringify({
        eyebrow: ($("#page-eyebrow", panel) as HTMLInputElement).value,
        title: ($("#page-title", panel) as HTMLInputElement).value,
        paragraphs: textareaToParagraphs(($("#page-body", panel) as HTMLTextAreaElement).value),
      }),
    });
    alert("Portfolio page saved.");
    await renderGalleriesPageEditor(panel);
  });
}

async function renderTextEditor(panel: HTMLElement, id: "prints" | "contact", title: string) {
  const [{ page }, settingsRes] = await Promise.all([
    api<{ page: TextPage }>(`/api/admin/site/pages/${id}`),
    id === "prints"
      ? api<{ settings: { printsEnabled: boolean } }>("/api/admin/site/settings")
      : Promise.resolve({ settings: { printsEnabled: true } }),
  ]);
  const isPrints = id === "prints";
  const isContact = id === "contact";
  const printsEnabled = settingsRes.settings.printsEnabled;

  panel.innerHTML = `
    <div class="site-editor">
      <div class="site-editor-header">
        <h2>${title}</h2>
        <div class="site-editor-actions">
          ${isPrints && printsEnabled ? `<a href="/${id}" class="btn btn-secondary" target="_blank" rel="noreferrer">Preview</a>` : ""}
          <button type="button" class="btn" id="site-save-page">Save</button>
        </div>
      </div>
      ${
        isPrints
          ? `
      <div class="form-group site-settings-toggle">
        <label class="checkbox-row">
          <input type="checkbox" id="prints-enabled" ${printsEnabled ? "checked" : ""} />
          Show Prints in site navigation
        </label>
        <p class="admin-muted">When off, the Prints tab is hidden from visitors. You can still edit the page content here and turn it back on later.</p>
      </div>`
          : ""
      }
      <div class="form-group">
        <label for="page-title">Page title</label>
        <input type="text" id="page-title" value="${escapeHtml(page.title)}" />
      </div>
      <div class="form-group">
        <label for="page-body">Content (blank line between paragraphs)</label>
        <textarea id="page-body" rows="10">${escapeHtml(paragraphsToTextarea(page.paragraphs))}</textarea>
      </div>
      ${
        isPrints
          ? `
      <div class="form-group">
        <label for="page-button-text">Button text</label>
        <input type="text" id="page-button-text" value="${escapeHtml(page.buttonText || "")}" />
      </div>
      <div class="form-group">
        <label for="page-button-url">Button URL</label>
        <input type="text" id="page-button-url" value="${escapeHtml(page.buttonUrl || "")}" />
      </div>`
          : ""
      }
      ${
        isContact
          ? `
      <div class="form-group">
        <label for="page-email">Email address</label>
        <input type="email" id="page-email" value="${escapeHtml(page.email || "")}" />
      </div>`
          : ""
      }
    </div>`;

  $("#site-save-page", panel).addEventListener("click", async () => {
    const body: TextPage = {
      title: ($("#page-title", panel) as HTMLInputElement).value,
      paragraphs: textareaToParagraphs(($("#page-body", panel) as HTMLTextAreaElement).value),
    };
    if (isPrints) {
      body.buttonText = ($("#page-button-text", panel) as HTMLInputElement).value;
      body.buttonUrl = ($("#page-button-url", panel) as HTMLInputElement).value;
    }
    if (isContact) {
      body.email = ($("#page-email", panel) as HTMLInputElement).value;
    }
    const saves = [
      api(`/api/admin/site/pages/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    ];
    if (isPrints) {
      const enabled = ($("#prints-enabled", panel) as HTMLInputElement).checked;
      saves.push(
        api("/api/admin/site/settings", {
          method: "PATCH",
          body: JSON.stringify({ printsEnabled: enabled }),
        })
      );
    }
    await Promise.all(saves);
    alert("Page saved.");
    if (isPrints) renderTextEditor(panel, "prints", "Prints");
  });
}

async function renderPageEditor(tab: string) {
  const panel = $("#manage-page-editor");
  panel.innerHTML = `<p class="admin-muted">Loading…</p>`;
  try {
    if (tab === "home") await renderHomeEditor(panel);
    else if (tab === "portfolio") await renderGalleriesPageEditor(panel);
    else if (tab === "about") await renderAboutEditor(panel);
    else if (tab === "prints") await renderTextEditor(panel, "prints", "Prints");
    else if (tab === "contact") await renderTextEditor(panel, "contact", "Contact");
  } catch (e) {
    panel.innerHTML = `<p class="message error">${escapeHtml(e instanceof Error ? e.message : "Could not load editor")}</p>`;
  }
}

export function setManageTab(tab: string) {
  if (!document.querySelector("[data-manage-page]")) return;
  activeTab = tab;

  document.querySelectorAll<HTMLButtonElement>("[data-manage-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.manageTab === tab);
  });

  const isGalleries = tab === "galleries";
  show($("#manage-galleries-view"), isGalleries);
  show($("#manage-pages-view"), !isGalleries);

  if (!isGalleries) renderPageEditor(tab);
}

let siteManageListenersBound = false;

export function initSiteManage() {
  if (!document.querySelector("[data-manage-page]")) return;
  if (siteManageListenersBound) return;
  siteManageListenersBound = true;

  document.querySelectorAll<HTMLButtonElement>("[data-manage-tab]").forEach((btn) => {
    btn.addEventListener("click", () => setManageTab(btn.dataset.manageTab || "galleries"));
  });
}
