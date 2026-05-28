import { api, formatDate, formatGalleryDate, type PortfolioGallery } from "./api";
import { downloadImages, safeFilenameBase } from "./download-images";
import {
  destroyGalleryLightbox,
  initGalleryLightbox,
  lightboxItemHtml,
} from "./photoswipe-lightbox";

function albumCardHtml(g: PortfolioGallery) {
  const cover = g.cover || "/favicon.svg";
  return `
    <a href="/galleries/view?slug=${encodeURIComponent(g.slug)}" class="album-card">
      <img src="${cover}" alt="${escapeHtml(g.title)}" loading="lazy" width="800" height="600" />
      <div class="meta">
        <h2>${escapeHtml(g.title)}</h2>
        <time datetime="${g.date}">${formatDate(g.date)}</time>
      </div>
    </a>`;
}

function galleryRowHtml(g: PortfolioGallery, index: number) {
  const cover = g.cover || "/favicon.svg";
  const num = String(index + 1).padStart(2, "0");
  const flip = index % 2 === 1 ? " galleries-row--flip" : "";
  return `
    <a href="/galleries/view?slug=${encodeURIComponent(g.slug)}" class="galleries-row${flip}">
      <span class="galleries-row__num" aria-hidden="true">${num}</span>
      <div class="galleries-row__visual">
        <img src="${cover}" alt="" loading="lazy" width="900" height="600" />
      </div>
      <div class="galleries-row__meta">
        <h2>${escapeHtml(g.title)}</h2>
        ${g.date ? `<time datetime="${g.date}">${formatDate(g.date)}</time>` : ""}
        <span class="galleries-row__cta">View collection</span>
      </div>
    </a>`;
}

function galleryGridHtml(g: PortfolioGallery) {
  return g.images
    .map((img, i) =>
      lightboxItemHtml(
        {
          url: img.url,
          displayUrl: img.displayUrl,
          thumbUrl: img.thumbUrl,
          width: img.width,
          height: img.height,
          alt: `${g.title} — image ${i + 1}`,
          croppedThumb: true,
        },
        i
      )
    )
    .join("");
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function setupGalleryDownload(root: HTMLElement, gallery: PortfolioGallery) {
  const toolbar = root.querySelector<HTMLElement>("[data-gallery-toolbar]");
  const gridEl = root.querySelector<HTMLElement>("[data-gallery-grid]");
  const selectToggle = root.querySelector<HTMLButtonElement>("[data-gallery-select-toggle]");
  const selectLabel = root.querySelector<HTMLElement>("[data-gallery-select-label]");
  const downloadBtn = root.querySelector<HTMLButtonElement>("[data-gallery-download]");
  const countEl = root.querySelector<HTMLElement>("[data-gallery-selection-count]");
  const statusEl = root.querySelector<HTMLElement>("[data-gallery-download-status]");
  const statusText = root.querySelector<HTMLElement>("[data-gallery-download-status-text]");

  if (!toolbar || !gridEl || !selectToggle || !downloadBtn) return;

  let selectMode = false;
  const selected = new Set<string>();

  const updateToolbar = () => {
    const n = selected.size;
    if (countEl) {
      countEl.textContent = n ? `${n} selected` : "";
      countEl.classList.toggle("hidden", !selectMode || n === 0);
    }
    downloadBtn.classList.toggle("hidden", !selectMode || n === 0);
    selectToggle.setAttribute("aria-pressed", selectMode ? "true" : "false");
    selectToggle.classList.toggle("is-active", selectMode);
    if (selectLabel) selectLabel.textContent = selectMode ? "Done" : "Select photos";
  };

  const renderViewGrid = () => {
    gridEl.classList.remove("gallery-grid--select");
    gridEl.innerHTML = galleryGridHtml(gallery);
    initGalleryLightbox(gridEl);
  };

  const renderSelectGrid = () => {
    destroyGalleryLightbox();
    gridEl.classList.add("gallery-grid--select");
    gridEl.innerHTML = "";
    for (const img of gallery.images) {
      const item = document.createElement("label");
      item.className = "client-item" + (selected.has(img.name) ? " selected" : "");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selected.has(img.name);
      cb.setAttribute("aria-label", `Select photo ${img.name}`);
      cb.addEventListener("change", () => {
        if (cb.checked) selected.add(img.name);
        else selected.delete(img.name);
        item.classList.toggle("selected", cb.checked);
        updateToolbar();
      });
      const image = document.createElement("img");
      image.src = img.thumbUrl;
      image.alt = "";
      image.loading = "lazy";
      image.width = 600;
      image.height = 400;
      item.append(cb, image);
      gridEl.appendChild(item);
    }
  };

  const setSelectMode = (on: boolean) => {
    selectMode = on;
    if (!on) selected.clear();
    if (selectMode) renderSelectGrid();
    else renderViewGrid();
    updateToolbar();
  };

  selectToggle.addEventListener("click", () => setSelectMode(!selectMode));

  downloadBtn.addEventListener("click", async () => {
    if (!selected.size) return;
    const base = safeFilenameBase(gallery.title || gallery.slug);
    const ordered = gallery.images.filter((img) => selected.has(img.name));
    const items = ordered.map((img, i) => ({
      url: `${img.url}${img.url.includes("?") ? "&" : "?"}download=1`,
      filename: `${base}-${String(i + 1).padStart(3, "0")}${img.name.includes(".") ? img.name.slice(img.name.lastIndexOf(".")) : ".jpg"}`,
    }));

    statusEl?.classList.remove("hidden");
    downloadBtn.disabled = true;
    selectToggle.disabled = true;
    try {
      await downloadImages(items, {
        onProgress: (current, total) => {
          if (statusText) {
            statusText.textContent =
              total === 1
                ? "Saving photo…"
                : `Saving photo ${current} of ${total}…`;
          }
        },
      });
    } catch {
      alert("Download failed. Please try again.");
    } finally {
      statusEl?.classList.add("hidden");
      if (statusText) statusText.textContent = "Saving photos…";
      downloadBtn.disabled = false;
      selectToggle.disabled = false;
    }
  });

  if (gallery.images.length) {
    toolbar.classList.remove("hidden");
    renderViewGrid();
  } else {
    toolbar.classList.add("hidden");
    gridEl.innerHTML = `<p class="prose">This gallery has no images yet.</p>`;
  }
}

async function loadGalleryList(container: HTMLElement) {
  const { galleries } = await api<{ galleries: PortfolioGallery[] }>("/api/portfolio/galleries");
  if (!galleries.length) {
    container.innerHTML = `<p class="prose">No galleries yet. Check back soon.</p>`;
    return;
  }
  const useRows = container.classList.contains("galleries-editorial-list");
  container.innerHTML = useRows
    ? galleries.map((g, i) => galleryRowHtml(g, i)).join("")
    : galleries.map(albumCardHtml).join("");
}

async function loadFeatured(container: HTMLElement, limit = 3) {
  const { galleries } = await api<{ galleries: PortfolioGallery[] }>("/api/portfolio/galleries");
  const featured = galleries.filter((g) => g.featured).slice(0, limit);
  if (!featured.length) {
    container.closest("section")?.classList.add("hidden");
    return;
  }
  container.innerHTML = featured.map(albumCardHtml).join("");
}

function scrollToGalleryPhotos(page: HTMLElement) {
  const body = page.querySelector<HTMLElement>("[data-gallery-body]");
  if (!body) return;
  body.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadGalleryDetail(detailRoot: HTMLElement) {
  const page = detailRoot.closest<HTMLElement>("[data-gallery-page]");
  if (!page) return;

  const params = new URLSearchParams(location.search);
  const slug = params.get("slug");
  if (!slug) {
    location.href = "/galleries";
    return;
  }

  const scrollToGrid = params.get("view") === "grid";

  const { gallery } = await api<{ gallery: PortfolioGallery }>(
    `/api/portfolio/galleries/${encodeURIComponent(slug)}`
  );

  const coverBg = page.querySelector<HTMLElement>("[data-gallery-cover-bg]");
  const coverTitle = page.querySelector<HTMLElement>("[data-gallery-cover-title]");
  const coverDate = page.querySelector<HTMLTimeElement>("[data-gallery-cover-date]");
  const titleEl = detailRoot.querySelector("[data-gallery-title]");
  const descEl = detailRoot.querySelector("[data-gallery-desc]");
  const printEl = detailRoot.querySelector("[data-gallery-print]");
  const enterBtn = page.querySelector<HTMLButtonElement>("[data-gallery-enter]");

  const coverUrl =
    gallery.cover ||
    gallery.images[0]?.url ||
    gallery.images[0]?.displayUrl ||
    null;
  if (coverBg && coverUrl) {
    coverBg.style.backgroundImage = `url("${coverUrl}")`;
  }

  const title = gallery.title.toUpperCase();
  if (coverTitle) coverTitle.textContent = title;
  if (titleEl) titleEl.textContent = gallery.title;
  if (coverDate && gallery.date) {
    coverDate.textContent = formatGalleryDate(gallery.date);
    coverDate.dateTime = gallery.date;
    coverDate.classList.remove("hidden");
  } else {
    coverDate?.classList.add("hidden");
  }

  if (descEl) {
    if (gallery.description) {
      descEl.textContent = gallery.description;
      descEl.classList.remove("hidden");
    } else {
      descEl.classList.add("hidden");
    }
  }
  if (printEl && gallery.printCollectionUrl) {
    (printEl as HTMLAnchorElement).href = gallery.printCollectionUrl;
    printEl.classList.remove("hidden");
  }

  if (enterBtn && !enterBtn.dataset.bound) {
    enterBtn.dataset.bound = "1";
    enterBtn.addEventListener("click", () => scrollToGalleryPhotos(page));
  }

  setupGalleryDownload(detailRoot, gallery);
  document.title = `${gallery.title} — adamsphoto`;

  if (scrollToGrid) {
    requestAnimationFrame(() => scrollToGalleryPhotos(page));
  }
}

function init() {
  const list = document.querySelector<HTMLElement>("[data-galleries-list]");
  const featured = document.querySelector<HTMLElement>("[data-featured-galleries]");
  const detail = document.querySelector<HTMLElement>("[data-gallery-detail]");

  if (list) loadGalleryList(list).catch(() => {
    list.innerHTML = `<p class="message error">Could not load galleries. Is the API running?</p>`;
  });
  if (featured) loadFeatured(featured).catch(() => featured.closest("section")?.classList.add("hidden"));
  if (detail) {
    loadGalleryDetail(detail).catch(() => {
      detail.innerHTML = `<p class="message error">Gallery not found.</p><a href="/galleries" class="btn">Back to galleries</a>`;
    });
  }
}

init();
document.addEventListener("astro:page-load", init);
