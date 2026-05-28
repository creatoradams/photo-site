import { api } from "./api";

async function applyNavSettings() {
  try {
    const { settings } = await api<{ settings: { printsEnabled: boolean } }>("/api/site/settings");
    const link = document.querySelector<HTMLElement>('[data-nav-link="prints"]');
    if (!link) return;
    link.classList.toggle("hidden", !settings.printsEnabled);
  } catch {
    const link = document.querySelector<HTMLElement>('[data-nav-link="prints"]');
    link?.classList.add("hidden");
  }
}

applyNavSettings();
document.addEventListener("astro:page-load", applyNavSettings);
