import { api } from "./api";

const STORAGE_KEY = "site-theme";

export type SiteTheme = "dark" | "light";

export function applySiteTheme(theme: SiteTheme) {
  document.documentElement.dataset.theme = theme;
  document.body?.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

function readCachedTheme(): SiteTheme | null {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    if (t === "light" || t === "dark") return t;
  } catch {
    /* ignore */
  }
  return null;
}

export async function loadSiteTheme() {
  const cached = readCachedTheme();
  if (cached) applySiteTheme(cached);

  try {
    const { settings } = await api<{ settings: { siteTheme: string } }>("/api/site/settings", {
      cache: "no-store",
    });
    if (settings.siteTheme === "light" || settings.siteTheme === "dark") {
      applySiteTheme(settings.siteTheme);
    }
  } catch {
    /* keep cached or default */
  }
}

applySiteTheme(readCachedTheme() || "dark");
loadSiteTheme();

document.addEventListener("astro:page-load", loadSiteTheme);
document.addEventListener("astro:after-swap", () => {
  applySiteTheme(readCachedTheme() || "dark");
  loadSiteTheme();
});
