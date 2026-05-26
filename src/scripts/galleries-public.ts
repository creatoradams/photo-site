import PhotoSwipeLightbox from "photoswipe/lightbox";
import { api, formatDate, type PortfolioGallery } from "./api";

let lightbox: PhotoSwipeLightbox | null = null;

function initLightbox() {
  const gallery = document.querySelector("[data-gallery-lightbox]");
  if (!gallery) return;
  if (lightbox) {
    lightbox.destroy();
    lightbox = null;
  }
  lightbox = new PhotoSwipeLightbox({
    gallery: "[data-gallery-lightbox]",
    children: "a",
    pswpModule: () => import("photoswipe"),
  });
  lightbox.init();
}

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

function galleryGridHtml(g: PortfolioGallery) {
  return g.images
    .map(
      (img, i) => `
    <a href="${img.url}" data-pswp-width="2400" data-pswp-height="1600" target="_blank" rel="noreferrer">
      <img src="${img.thumbUrl}" alt="${escapeHtml(g.title)} — image ${i + 1}" loading="${i < 6 ? "eager" : "lazy"}" width="600" height="400" />
    </a>`
    )
    .join("");
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

async function loadGalleryList(container: HTMLElement) {
  const { galleries } = await api<{ galleries: PortfolioGallery[] }>("/api/portfolio/galleries");
  if (!galleries.length) {
    container.innerHTML = `<p class="prose">No galleries yet. Check back soon.</p>`;
    return;
  }
  container.innerHTML = galleries.map(albumCardHtml).join("");
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

async function loadGalleryDetail(root: HTMLElement) {
  const params = new URLSearchParams(location.search);
  const slug = params.get("slug");
  if (!slug) {
    location.href = "/galleries";
    return;
  }
  const { gallery } = await api<{ gallery: PortfolioGallery }>(
    `/api/portfolio/galleries/${encodeURIComponent(slug)}`
  );
  const titleEl = root.querySelector("[data-gallery-title]");
  const descEl = root.querySelector("[data-gallery-desc]");
  const gridEl = root.querySelector("[data-gallery-grid]");
  const printEl = root.querySelector("[data-gallery-print]");

  if (titleEl) titleEl.textContent = gallery.title;
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
  if (gridEl) {
    gridEl.innerHTML = gallery.images.length
      ? galleryGridHtml(gallery)
      : `<p class="prose">This gallery has no images yet.</p>`;
    initLightbox();
  }
  document.title = `${gallery.title} — adamsphoto`;
}

function init() {
  const list = document.querySelector<HTMLElement>("[data-galleries-list]");
  const featured = document.querySelector<HTMLElement>("[data-featured-galleries]");
  const detail = document.querySelector<HTMLElement>("[data-gallery-detail]");

  if (list) loadGalleryList(list).catch(() => {
    list.innerHTML = `<p class="message error">Could not load galleries. Is the API running?</p>`;
  });
  if (featured) loadFeatured(featured).catch(() => featured.closest("section")?.classList.add("hidden"));
  if (detail) loadGalleryDetail(detail).catch(() => {
    detail.innerHTML = `<p class="message error">Gallery not found.</p><a href="/galleries" class="btn">Back to galleries</a>`;
  });
}

init();
document.addEventListener("astro:page-load", init);
