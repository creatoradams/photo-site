import { api } from "./api";

type GridImage = {
  slug: string | null;
  name: string;
  url: string;
  thumbUrl: string;
  gridUrl?: string;
  displayUrl?: string;
  isHero?: boolean;
};

export type HomeLayout =
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

type HomePage = {
  layout: HomeLayout;
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaUrl: string;
  showFeatured: boolean;
  heroResolved?: { url: string; gridUrl?: string };
};

const ABOVE_FOLD = 8;
const LAYOUT_CLASSES: HomeLayout[] = [
  "atelier",
  "masonry",
  "spotlight",
  "minimal",
  "timeless",
  "fashion",
  "editorial",
  "travel",
  "wedding",
  "landscape",
];

const HERO_LAYOUTS: HomeLayout[] = ["editorial", "travel", "wedding", "landscape"];

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function displaySrc(img: GridImage) {
  return img.displayUrl || img.gridUrl || img.url || img.thumbUrl;
}

function heroImageSrc(page: HomePage, images: GridImage[]) {
  if (page.heroResolved?.url) {
    const u = page.heroResolved.url;
    return `${u}${u.includes("?") ? "&" : "?"}size=display`;
  }
  const hero = images.find((i) => i.isHero);
  if (hero) return hero.url || displaySrc(hero);
  const first = images[0];
  return first ? first.url || displaySrc(first) : null;
}

function renderMasonry(grid: HTMLElement, images: GridImage[]) {
  grid.classList.remove("home-masonry--loading");
  if (!images.length) {
    grid.innerHTML = `<p class="prose home-masonry-empty">Add photos to your galleries to fill the home page grid.</p>`;
    return;
  }
  grid.innerHTML = images
    .map(
      (img, i) => `
    <div class="home-masonry-item${img.isHero ? " is-hero" : ""}">
      <img src="${displaySrc(img)}" alt="" width="720" height="480" loading="${i < ABOVE_FOLD ? "eager" : "lazy"}" decoding="async" fetchpriority="${i < 4 ? "high" : "auto"}" />
    </div>`
    )
    .join("");
}

type FeaturedGallery = {
  slug: string;
  title: string;
  cover: string | null;
};

function albumCardHtml(g: FeaturedGallery) {
  const cover = g.cover || "/favicon.svg";
  return `
    <a href="/galleries/view?slug=${encodeURIComponent(g.slug)}" class="album-card">
      <img src="${cover}" alt="${escapeHtml(g.title)}" loading="lazy" width="800" height="600" />
      <div class="meta">
        <h2>${escapeHtml(g.title)}</h2>
      </div>
    </a>`;
}

function fillIntro(root: HTMLElement, page: HomePage) {
  const headline = root.querySelector<HTMLElement>("[data-home-headline]");
  const sub = root.querySelector<HTMLElement>("[data-home-subheadline]");
  const cta = root.querySelector<HTMLAnchorElement>("[data-home-cta]");
  if (headline) headline.textContent = page.headline || "";
  if (sub) sub.textContent = page.subheadline || "";
  if (cta) {
    cta.textContent = page.ctaText || "View galleries";
    cta.href = page.ctaUrl || "/galleries";
  }
}

function fillHeroCover(root: HTMLElement, page: HomePage, src: string | null) {
  const cover = root.querySelector<HTMLElement>("[data-home-hero-cover]");
  const img = root.querySelector<HTMLImageElement>("[data-home-hero-cover-img]");
  const headline = root.querySelector<HTMLElement>("[data-home-hero-headline]");
  const sub = root.querySelector<HTMLElement>("[data-home-hero-subheadline]");
  const cta = root.querySelector<HTMLAnchorElement>("[data-home-hero-cta]");
  if (!cover || !src) return;
  cover.classList.remove("hidden");
  if (img) img.src = src;
  if (headline) headline.textContent = page.headline || "";
  if (sub) sub.textContent = page.subheadline || "";
  if (cta) {
    cta.textContent = page.ctaText || "View galleries";
    cta.href = page.ctaUrl || "/galleries";
  }
}

function renderFashionStrip(strip: HTMLElement, images: GridImage[]) {
  const picks = images.slice(0, 8);
  if (!picks.length) {
    strip.classList.add("hidden");
    return;
  }
  strip.classList.remove("hidden");
  strip.innerHTML = picks
    .map(
      (img, i) => `
    <div class="home-fashion-strip__item">
      <img src="${displaySrc(img)}" alt="" width="480" height="640" loading="${i < 3 ? "eager" : "lazy"}" />
    </div>`
    )
    .join("");
}

function atelierPortalHtml(g: FeaturedGallery, index: number) {
  const cover = g.cover ? `${g.cover}${g.cover.includes("?") ? "&" : "?"}size=display` : "/favicon.svg";
  const flip = index % 2 === 1 ? " atelier-portal--flip" : "";
  return `
    <article class="atelier-portal${flip}">
      <a class="atelier-portal__link" href="/galleries/view?slug=${encodeURIComponent(g.slug)}" aria-label="View gallery">
        <div class="atelier-portal__visual">
          <img src="${cover}" alt="" loading="${index < 2 ? "eager" : "lazy"}" width="1400" height="900" />
        </div>
        <div class="atelier-portal__copy atelier-portal__copy--minimal" aria-hidden="true">
          <span class="atelier-portal__enter">View</span>
        </div>
      </a>
    </article>`;
}

function renderAtelierFilm(track: HTMLElement, galleries: FeaturedGallery[]) {
  const picks = galleries;
  if (!picks.length) {
    track.closest(".atelier-film")?.classList.add("hidden");
    return;
  }
  const section = track.closest(".atelier-film");
  section?.classList.remove("hidden");
  section?.classList.add("is-visible");
  track.innerHTML = picks
    .map(
      (gallery, i) => {
        const cover = gallery.cover ? `${gallery.cover}${gallery.cover.includes("?") ? "&" : "?"}size=display` : "/favicon.svg";
        return `
    <a class="atelier-film__frame" href="/galleries/view?slug=${encodeURIComponent(gallery.slug)}" aria-label="View ${escapeHtml(gallery.title)} gallery">
      <img src="${cover}" alt="${escapeHtml(gallery.title)}" width="760" height="980" loading="${i < 3 ? "eager" : "lazy"}" />
      <span class="atelier-film__overlay">
        <span class="atelier-film__name">${escapeHtml(gallery.title)}</span>
      </span>
    </a>`;
      }
    )
    .join("");
}

function renderAtelierPortals(section: HTMLElement, galleries: FeaturedGallery[]) {
  if (!galleries.length) {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");
  section.innerHTML = galleries.map((g, i) => atelierPortalHtml(g, i)).join("");
}

type ReelScrollState = {
  track: HTMLElement;
  cleanup: () => void;
};

const reelScrollState: { current: ReelScrollState | null } = { current: null };

/** Chrome treats wheel on document/window/body as passive; attach to non-root elements only. */
function reelWheelTargets(track: HTMLElement): HTMLElement[] {
  const targets: HTMLElement[] = [track];
  const main = document.getElementById("main-content");
  if (main) targets.push(main);
  const header = document.querySelector<HTMLElement>(".site-header--studio");
  if (header) targets.push(header);
  return targets;
}

function wheelDeltaPx(event: WheelEvent) {
  let delta = event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 16;
  else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= window.innerHeight * 0.85;
  return delta;
}

function wheelHorizontalDelta(event: WheelEvent) {
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return event.deltaX;
  return wheelDeltaPx(event);
}

function reelMaxScroll(track: HTMLElement) {
  return Math.max(0, track.scrollWidth - track.clientWidth);
}

function reelScrollBy(track: HTMLElement, delta: number) {
  const max = reelMaxScroll(track);
  if (max < 1) return false;
  const before = track.scrollLeft;
  track.scrollLeft = Math.min(max, Math.max(0, before + delta));
  return track.scrollLeft !== before;
}

function disableReelScroll() {
  reelScrollState.current?.cleanup();
  reelScrollState.current = null;
}

function enableReelScroll(track: HTMLElement) {
  disableReelScroll();
  track.tabIndex = 0;

  let wheelSnapTimer: number | undefined;

  const onWheel = (event: WheelEvent) => {
    if ((event as WheelEvent & { _reelWheelHandled?: boolean })._reelWheelHandled) return;
    (event as WheelEvent & { _reelWheelHandled?: boolean })._reelWheelHandled = true;

    if (!document.body.classList.contains("home-reel-page")) return;

    const delta = wheelHorizontalDelta(event);
    if (!delta) return;
    if (reelMaxScroll(track) < 1) return;

    event.preventDefault();

    track.classList.add("is-reel-wheeling");
    window.clearTimeout(wheelSnapTimer);
    wheelSnapTimer = window.setTimeout(() => {
      track.classList.remove("is-reel-wheeling");
    }, 180);

    reelScrollBy(track, delta);
  };

  let dragging = false;
  let startX = 0;
  let startScroll = 0;
  let dragged = false;

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    dragging = true;
    dragged = false;
    startX = event.clientX;
    startScroll = track.scrollLeft;
    track.setPointerCapture(event.pointerId);
    track.classList.add("is-reel-dragging");
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    const dx = event.clientX - startX;
    if (Math.abs(dx) > 4) dragged = true;
    track.scrollLeft = startScroll - dx;
  };

  const endDrag = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    track.classList.remove("is-reel-dragging");
    try {
      track.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  };

  const onFrameClick = (event: MouseEvent) => {
    if (!dragged) return;
    event.preventDefault();
    event.stopPropagation();
    dragged = false;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!document.body.classList.contains("home-reel-page")) return;
    const step = Math.min(420, Math.max(240, track.clientWidth * 0.55));
    if (event.key === "ArrowRight") {
      event.preventDefault();
      reelScrollBy(track, step);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      reelScrollBy(track, -step);
    }
  };

  const wheelOpts: AddEventListenerOptions = { passive: false, capture: true };
  const wheelTargets = reelWheelTargets(track);
  for (const el of wheelTargets) {
    el.addEventListener("wheel", onWheel, wheelOpts);
  }
  track.addEventListener("pointerdown", onPointerDown);
  track.addEventListener("pointermove", onPointerMove);
  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", endDrag);
  track.addEventListener("click", onFrameClick, true);
  window.addEventListener("keydown", onKeyDown);

  reelScrollState.current = {
    track,
    cleanup: () => {
      window.clearTimeout(wheelSnapTimer);
      track.classList.remove("is-reel-wheeling");
      for (const el of wheelTargets) {
        el.removeEventListener("wheel", onWheel, { capture: true });
      }
      track.removeEventListener("pointerdown", onPointerDown);
      track.removeEventListener("pointermove", onPointerMove);
      track.removeEventListener("pointerup", endDrag);
      track.removeEventListener("pointercancel", endDrag);
      track.removeEventListener("click", onFrameClick, true);
      window.removeEventListener("keydown", onKeyDown);
    },
  };
}

async function loadReelGalleries(): Promise<FeaturedGallery[]> {
  const { galleries } = await api<{ galleries: FeaturedGallery[] }>("/api/portfolio/galleries", {
    cache: "no-store",
  });
  return (galleries || []).map((g) => ({
    slug: g.slug,
    title: g.title,
    cover: g.cover,
  }));
}

function enableAtelierReveal(root: HTMLElement) {
  const targets = root.querySelectorAll<HTMLElement>(
    ".atelier-film, .atelier-portal, .atelier-vignette, .studio-cta-band"
  );
  if (!targets.length) return;
  if (!("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
  );
  targets.forEach((el) => observer.observe(el));
}

function fillAtelier(root: HTMLElement, page: HomePage, heroSrc: string | null, _galleries: FeaturedGallery[]) {
  const headline = root.querySelector<HTMLElement>("[data-studio-headline]");
  const cta = root.querySelector<HTMLAnchorElement>("[data-studio-cta]");
  const heroBg = root.querySelector<HTMLElement>("[data-studio-hero-bg]");
  const heroImg = root.querySelector<HTMLImageElement>("[data-studio-hero-bg-img]");

  const h = page.headline || "Stories told in light";
  if (headline) {
    const parts = h.split(/\s+in\s+/i);
    if (parts.length >= 2) {
      headline.innerHTML = `${escapeHtml(parts[0])} in <em>${escapeHtml(parts.slice(1).join(" in "))}</em>`;
    } else {
      headline.textContent = h;
    }
  }
  if (cta) {
    cta.textContent = page.ctaText || "View the work";
    cta.href = page.ctaUrl || "/galleries";
  }

  if (heroSrc && heroBg && heroImg) {
    heroBg.classList.remove("hidden");
    heroImg.src = heroSrc;
  }
}

function resetHomeSections(root: HTMLElement) {
  const landing = root.querySelector<HTMLElement>("[data-home-landing]");
  landing?.classList.remove(...LAYOUT_CLASSES.map((c) => `home-landing--${c}`));

  const intro = root.querySelector<HTMLElement>("[data-home-intro]");
  intro?.classList.add("hidden");
  intro?.classList.remove("home-intro--timeless");
  root.querySelector("[data-home-hero-cover]")?.classList.add("hidden");
  root.querySelector("[data-home-spotlight]")?.classList.add("hidden");
  root.querySelector("[data-home-fashion-strip]")?.classList.add("hidden");
  root.querySelector("[data-studio-hero-bg]")?.classList.add("hidden");
  root.querySelector("[data-atelier-film]")?.classList.add("hidden");
  root.querySelector("[data-atelier-portals]")?.classList.add("hidden");
  root.querySelector("[data-atelier-vignette]")?.classList.add("hidden");
  root.querySelector("[data-home-masonry-wrap]")?.classList.add("hidden");

  const masonry = root.querySelector<HTMLElement>("[data-home-masonry]");
  masonry?.classList.remove("home-masonry--compact", "home-masonry--landscape", "home-masonry--framed");
}

function applyHomeLayout(
  root: HTMLElement,
  page: HomePage,
  gridImages: GridImage[],
  masonry: HTMLElement | null,
  reelGalleries: FeaturedGallery[] = []
) {
  resetHomeSections(root);

  const landing = root.querySelector<HTMLElement>("[data-home-landing]");
  const layout = page.layout || "atelier";
  landing?.classList.add(`home-landing--${layout}`);

  const skipHero = page.heroResolved || gridImages.find((i) => i.isHero) ? 1 : 0;
  const gridAfterHero = gridImages.slice(skipHero);

  if (layout === "atelier") {
    fillAtelier(root, page, heroImageSrc(page, gridImages), reelGalleries);
    const film = root.querySelector<HTMLElement>("[data-atelier-film-track]");
    const portals = root.querySelector<HTMLElement>("[data-atelier-portals]");
    const vignette = root.querySelector<HTMLElement>("[data-atelier-vignette]");
    if (film) renderAtelierFilm(film, reelGalleries);
    portals?.classList.add("hidden");
    vignette?.classList.add("hidden");
    enableAtelierReveal(root);
    if (masonry) {
      masonry.innerHTML = "";
      masonry.classList.remove("home-masonry--loading");
    }
    return;
  }

  root.querySelector("[data-home-masonry-wrap]")?.classList.remove("hidden");

  if (layout === "minimal" || layout === "timeless") {
    root.querySelector("[data-home-intro]")?.classList.remove("hidden");
    if (layout === "timeless") {
      root.querySelector("[data-home-intro]")?.classList.add("home-intro--timeless");
    }
    fillIntro(root, page);
    if (masonry) {
      renderMasonry(masonry, gridImages.slice(0, layout === "timeless" ? 18 : 12));
      masonry.classList.add("home-masonry--compact");
    }
    return;
  }

  if (layout === "fashion") {
    const strip = root.querySelector<HTMLElement>("[data-home-fashion-strip]");
    if (strip) renderFashionStrip(strip, gridImages);
    if (masonry) {
      renderMasonry(masonry, gridImages.slice(0, 9));
      masonry.classList.add("home-masonry--compact");
    }
    return;
  }

  if (HERO_LAYOUTS.includes(layout)) {
    fillHeroCover(root, page, heroImageSrc(page, gridImages));
    if (masonry) {
      renderMasonry(masonry, gridAfterHero);
      if (layout === "landscape") masonry.classList.add("home-masonry--landscape");
    }
    return;
  }

  if (layout === "spotlight") {
    const src = heroImageSrc(page, gridImages);
    const spotlight = root.querySelector<HTMLElement>("[data-home-spotlight]");
    const spotlightImg = root.querySelector<HTMLImageElement>("[data-home-spotlight-img]");
    if (src && spotlight && spotlightImg) {
      spotlight.classList.remove("hidden");
      spotlightImg.src = src;
    }
    if (masonry) renderMasonry(masonry, gridAfterHero);
    return;
  }

  if (masonry) renderMasonry(masonry, gridImages);
}

async function init() {
  const root = document.querySelector<HTMLElement>("[data-home-page]");
  if (!root) {
    disableReelScroll();
    document.body.classList.remove("home-reel-page");
    return;
  }
  document.body.classList.add("home-reel-page");

  const landing = root.querySelector<HTMLElement>("[data-home-landing]");
  const masonry = root.querySelector<HTMLElement>("[data-home-masonry]");
  const featured = root.querySelector<HTMLElement>("[data-featured-galleries]");
  const featuredSection = root.querySelector<HTMLElement>("[data-home-featured-section]");

  if (masonry) masonry.classList.add("home-masonry--loading");

  try {
    const [homeRes, portfolioGalleries] = await Promise.all([
      api<{
        page: HomePage;
        gridImages: GridImage[];
        featuredGalleries?: FeaturedGallery[];
        allGalleries?: FeaturedGallery[];
      }>("/api/site/pages/home", { cache: "no-store" }),
      loadReelGalleries().catch(() => [] as FeaturedGallery[]),
    ]);
    const { page, gridImages, featuredGalleries, allGalleries: homeAllGalleries } = homeRes;

    const reelGalleries =
      portfolioGalleries.length > 0
        ? portfolioGalleries
        : homeAllGalleries?.length
          ? homeAllGalleries
          : featuredGalleries || [];

    const featuredList =
      page.layout === "atelier" ? reelGalleries : (featuredGalleries || []).slice(0, 24);
    applyHomeLayout(root, page, gridImages || [], masonry, featuredList);
    if (page.layout === "atelier") {
      const track = root.querySelector<HTMLElement>("[data-atelier-film-track]");
      const film = root.querySelector<HTMLElement>("[data-atelier-film]");
      if (track) {
        film?.setAttribute("data-reel-count", String(track.querySelectorAll(".atelier-film__frame").length));
        track.scrollLeft = 0;
        enableReelScroll(track);
        requestAnimationFrame(() => enableReelScroll(track));
        window.addEventListener(
          "load",
          () => {
            enableReelScroll(track);
          },
          { once: true }
        );
      }
    }
    masonry?.removeAttribute("aria-busy");

    const isAtelier = page.layout === "atelier";
    if (featuredSection) {
      featuredSection.classList.toggle("hidden", isAtelier || !page.showFeatured);
    }

    if (!isAtelier && page.showFeatured && featured) {
      if (!featuredList.length) featuredSection?.classList.add("hidden");
      else featured.innerHTML = featuredList.map(albumCardHtml).join("");
    }
  } catch {
    disableReelScroll();
    document.body.classList.remove("home-reel-page");
    const track = root.querySelector<HTMLElement>("[data-atelier-film-track]");
    if (track) track.innerHTML = "";
    if (landing) landing.classList.add("home-landing--atelier", "home-landing--fallback");
    if (masonry) {
      masonry.classList.remove("home-masonry--loading");
      masonry.innerHTML = "";
    }
  }
}

init();
document.addEventListener("astro:page-load", init);
