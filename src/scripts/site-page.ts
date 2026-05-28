import { api } from "./api";

type TextPage = {
  title: string;
  eyebrow?: string;
  paragraphs: string[];
  buttonText?: string;
  buttonUrl?: string;
  email?: string;
};

type ResolvedPhoto = {
  url: string;
  gridUrl: string;
  thumbUrl: string;
};

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

async function loadPage(id: string, root: HTMLElement) {
  const bodyEl = root.querySelector<HTMLElement>("[data-page-body]");
  const extraEl = root.querySelector<HTMLElement>("[data-page-extra]");

  try {
    if (id === "prints") {
      const { settings } = await api<{ settings: { printsEnabled: boolean } }>("/api/site/settings");
      if (!settings.printsEnabled) {
        window.location.replace("/");
        return;
      }
    }

    if (id === "about") {
      const { page, heroPhoto, accentPhoto } = await api<{
        page: TextPage;
        heroPhoto?: ResolvedPhoto | null;
        accentPhoto?: ResolvedPhoto | null;
      }>("/api/site/pages/about");

      const titleEl = root.querySelector<HTMLElement>("[data-page-title]");
      const hero = root.querySelector<HTMLElement>("[data-about-hero]");
      const heroBg = root.querySelector<HTMLElement>("[data-about-hero-bg]");
      const accentSection = root.querySelector<HTMLElement>("[data-about-accent]");
      const accentImg = root.querySelector<HTMLImageElement>("[data-about-accent-img]");

      if (titleEl) titleEl.textContent = page.title;
      if (bodyEl) {
        bodyEl.innerHTML = (page.paragraphs || [])
          .map((p) => `<p>${escapeHtml(p)}</p>`)
          .join("");
      }

      if (heroPhoto?.url && heroBg) {
        heroBg.style.backgroundImage = `url("${heroPhoto.url}")`;
        hero?.classList.add("about-hero--has-image");
      } else {
        hero?.classList.remove("about-hero--has-image");
        if (heroBg) heroBg.style.backgroundImage = "";
      }

      if (accentPhoto?.url && accentSection && accentImg) {
        accentImg.src = accentPhoto.gridUrl || accentPhoto.url;
        accentSection.classList.remove("hidden");
      } else {
        accentSection?.classList.add("hidden");
      }

      document.title = `${page.title} — adamsphoto`;
      return;
    }

    const titleEl = root.querySelector<HTMLElement>("[data-page-title]");
    const eyebrowEl = root.querySelector<HTMLElement>("[data-page-eyebrow]");
    const { page } = await api<{ page: TextPage }>(`/api/site/pages/${id}`);
    if (titleEl) titleEl.textContent = page.title;
    if (eyebrowEl && page.eyebrow) eyebrowEl.textContent = page.eyebrow;
    if (bodyEl) {
      bodyEl.innerHTML = (page.paragraphs || [])
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join("");
    }
    if (extraEl && id === "prints" && page.buttonText && page.buttonUrl) {
      extraEl.innerHTML = `<a href="${escapeHtml(page.buttonUrl)}" class="btn" target="_blank" rel="noopener noreferrer">${escapeHtml(page.buttonText)}</a>`;
      extraEl.classList.remove("hidden");
    }
    if (extraEl && id === "contact" && page.email) {
      extraEl.innerHTML = `<p>Email me at <a href="mailto:${escapeHtml(page.email)}">${escapeHtml(page.email)}</a></p>`;
      extraEl.classList.remove("hidden");
    }
    document.title = `${page.title} — adamsphoto`;
  } catch {
    if (bodyEl) bodyEl.innerHTML = `<p class="message error">Could not load page content.</p>`;
  }
}

function init() {
  const root = document.querySelector<HTMLElement>("[data-site-page]");
  if (!root) return;
  const id = root.getAttribute("data-site-page");
  if (!id) return;
  loadPage(id, root);
}

init();
document.addEventListener("astro:page-load", init);
