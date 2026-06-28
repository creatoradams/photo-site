import PhotoSwipeLightbox from "photoswipe/lightbox";

let lightbox: PhotoSwipeLightbox | null = null;

export type LightboxImage = {
  url: string;
  thumbUrl?: string;
  displayUrl?: string;
  width?: number | null;
  height?: number | null;
  alt?: string;
  croppedThumb?: boolean;
};

export function lightboxItemHtml(img: LightboxImage, index: number) {
  const w = img.width && img.width > 0 ? img.width : 2400;
  const h = img.height && img.height > 0 ? img.height : 1600;
  const thumbSrc = img.displayUrl || img.thumbUrl || img.url;
  const cropped = img.croppedThumb !== false;
  const alt = img.alt ? img.alt.replace(/"/g, "&quot;") : `Photo ${index + 1}`;

  return `
    <a
      href="${img.url}"
      class="gallery-lightbox-item"
      data-pswp-item
      data-pswp-width="${w}"
      data-pswp-height="${h}"
      ${cropped ? 'data-cropped="true"' : ""}
    >
      <img
        src="${thumbSrc}"
        alt="${alt}"
        width="${w}"
        height="${h}"
        loading="${index < 8 ? "eager" : "lazy"}"
        decoding="async"
      />
    </a>`;
}

/** Sync dimensions from loaded thumbnails when API metadata is missing. */
export function refreshLightboxDimensions(container: ParentNode) {
  container.querySelectorAll<HTMLAnchorElement>("a[data-pswp-item]").forEach((link) => {
    const img = link.querySelector("img");
    if (!img?.naturalWidth) return;
    if (link.dataset.pswpWidth && link.dataset.pswpWidth !== "2400") return;
    link.dataset.pswpWidth = String(img.naturalWidth);
    link.dataset.pswpHeight = String(img.naturalHeight);
  });
}

export function initGalleryLightbox(container?: ParentNode) {
  const root = container || document;
  // The container passed in is often the gallery element itself, so match it
  // directly before falling back to searching descendants.
  const gallery =
    root instanceof Element && root.matches("[data-gallery-lightbox]")
      ? root
      : root.querySelector<HTMLElement>("[data-gallery-lightbox]");
  if (!gallery) return null;

  refreshLightboxDimensions(gallery);

  if (lightbox) {
    lightbox.destroy();
    lightbox = null;
  }

  lightbox = new PhotoSwipeLightbox({
    gallery: gallery,
    children: "a[data-pswp-item]",
    pswpModule: () => import("photoswipe"),
    showHideAnimationType: "zoom",
    showAnimationDuration: 420,
    hideAnimationDuration: 360,
    zoomAnimationDuration: 420,
    easing: "cubic-bezier(0.4, 0, 0.22, 1)",
    preload: [1, 2],
    bgOpacity: 0.94,
    padding: { top: 48, bottom: 48, left: 16, right: 16 },
    initialZoomLevel: "fit",
    secondaryZoomLevel: 2,
    maxZoomLevel: 4,
  });

  lightbox.on("beforeOpen", () => {
    refreshLightboxDimensions(gallery);
  });

  lightbox.init();
  return lightbox;
}

export function destroyGalleryLightbox() {
  if (lightbox) {
    lightbox.destroy();
    lightbox = null;
  }
}
