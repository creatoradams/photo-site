import PhotoSwipeLightbox from "photoswipe/lightbox";
import { api, formatDate, type PortfolioGallery } from "./api";
import { setManageTab } from "./site-manage";

type State = {
  galleries: PortfolioGallery[];
  selected: string | null;
  authenticated: boolean;
  manageMode: boolean;
};

const state: State = { galleries: [], selected: null, authenticated: false, manageMode: false };
let lightbox: PhotoSwipeLightbox | null = null;
let storageIntervalId: number | null = null;

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector<T>(sel)!;

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function shareUrl(slug: string) {
  return `${location.origin}/galleries/view?slug=${encodeURIComponent(slug)}`;
}

function show(el: HTMLElement | null, visible: boolean) {
  if (!el) return;
  el.classList.toggle("hidden", !visible);
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

async function loadPublicGalleries() {
  const list = document.querySelector<HTMLElement>("[data-galleries-list]");
  if (!list) return;
  try {
    const { galleries } = await api<{ galleries: PortfolioGallery[] }>("/api/portfolio/galleries");
    if (!galleries.length) {
      list.innerHTML = `<p class="prose">No public galleries yet.</p>`;
      return;
    }
    list.innerHTML = galleries.map(albumCardHtml).join("");
  } catch {
    list.innerHTML = `<p class="message error">Galleries could not load. The site may need an update — try again shortly.</p>`;
  }
}

async function checkSession() {
  try {
    const { authenticated } = await api<{ authenticated: boolean }>("/api/admin/session");
    state.authenticated = authenticated;
    return authenticated;
  } catch {
    state.authenticated = false;
    return false;
  }
}

async function login(password: string) {
  await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) });
  state.authenticated = true;
}

async function logout() {
  await api("/api/admin/logout", { method: "POST" });
  state.authenticated = false;
  state.selected = null;
}

async function loadAdminGalleries() {
  const { galleries } = await api<{ galleries: PortfolioGallery[] }>("/api/admin/galleries");
  state.galleries = galleries;
  return galleries;
}

function isManagePage() {
  return !!document.querySelector("[data-manage-page]");
}

function renderManageToolbar() {
  const toolbar = document.querySelector<HTMLElement>("#manage-toolbar");
  if (!toolbar || !isManagePage()) return;

  if (state.authenticated) {
    toolbar.classList.remove("hidden");
    toolbar.innerHTML = `
      <button type="button" class="btn" id="btn-new-gallery">+ New gallery</button>
      <a href="/galleries" class="btn btn-secondary">View public galleries</a>
      <button type="button" class="btn btn-secondary" id="btn-logout">Sign out</button>`;
    $("#btn-new-gallery", toolbar).addEventListener("click", openNewGallery);
    $("#btn-logout", toolbar).addEventListener("click", () => logout().then(() => renderChrome()));
  } else {
    toolbar.classList.add("hidden");
    toolbar.innerHTML = "";
  }
}

function renderGalleryList() {
  const list = $("#admin-gallery-list");
  if (!state.galleries.length) {
    list.innerHTML = `<p class="prose">No galleries yet. Click <strong>+ New gallery</strong>.</p>`;
    return;
  }
  list.innerHTML = state.galleries
    .map(
      (g) => `
    <button type="button" class="admin-gallery-card ${state.selected === g.slug ? "active" : ""}" data-slug="${g.slug}">
      <div class="admin-gallery-card-cover">
        ${g.cover ? `<img src="${g.cover}" alt="" />` : `<span class="admin-placeholder">No cover</span>`}
      </div>
      <div class="admin-gallery-card-meta">
        <strong>${escapeHtml(g.title)}</strong>
        <span>${formatDate(g.date)} · ${g.imageCount} photos</span>
        ${g.private ? `<span class="badge badge-private">Private</span>` : ""}
        ${g.featured ? `<span class="badge badge-featured">Featured</span>` : ""}
      </div>
    </button>`
    )
    .join("");
  list.querySelectorAll<HTMLButtonElement>("[data-slug]").forEach((btn) => {
    btn.addEventListener("click", () => selectGallery(btn.dataset.slug!));
  });
}

function renderGalleryDetail(g: PortfolioGallery) {
  const panel = $("#admin-detail");
  panel.innerHTML = `
    <div class="admin-detail-header">
      <div>
        <h2>${escapeHtml(g.title)}</h2>
        <p class="admin-muted">${g.private ? "Private — hidden from /galleries; share link below" : "Public — listed on /galleries"}</p>
        <p class="admin-share-link"><strong>Link:</strong> <a href="${shareUrl(g.slug)}" target="_blank" rel="noreferrer">${shareUrl(g.slug)}</a></p>
      </div>
      <div class="admin-detail-actions">
        <button type="button" class="btn btn-secondary" id="btn-settings">Settings</button>
        <label class="btn admin-upload-btn">
          + Add photos from computer
          <input type="file" id="upload-input" accept="image/*" multiple hidden />
        </label>
      </div>
    </div>
    <div class="admin-image-grid" id="admin-images">
      ${
        g.images.length
          ? g.images
              .map(
                (img) => `
        <div class="admin-image-item ${g.cover?.includes(img.name) ? "is-cover" : ""}" data-name="${img.name}">
          <img src="${img.thumbUrl}" alt="" />
          ${g.cover?.includes(img.name) ? `<span class="admin-cover-badge">Cover</span>` : ""}
          <div class="admin-image-actions">
            <button type="button" class="btn-text" data-set-cover="${img.name}">Use as cover</button>
            <button type="button" class="btn-text btn-danger" data-delete="${img.name}">Delete</button>
          </div>
        </div>`
              )
              .join("")
          : `<p class="prose admin-muted">No photos yet. Click <strong>+ Add photos from computer</strong>.</p>`
      }
    </div>`;

  $("#btn-settings", panel).addEventListener("click", () => openSettings(g));
  const uploadInput = $("#upload-input", panel) as HTMLInputElement;
  uploadInput.addEventListener("change", () => uploadImages(g.slug, uploadInput));

  panel.querySelectorAll<HTMLButtonElement>("[data-set-cover]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/admin/galleries/${g.slug}`, {
        method: "PATCH",
        body: JSON.stringify({ cover: btn.dataset.setCover }),
      });
      await refreshManage();
      selectGallery(g.slug);
    });
  });

  panel.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this image?")) return;
      await api(`/api/admin/galleries/${g.slug}/images/${encodeURIComponent(btn.dataset.delete!)}`, {
        method: "DELETE",
      });
      await refreshManage();
      selectGallery(g.slug);
    });
  });
}

const UPLOAD_CONCURRENCY = 4;

async function uploadImages(slug: string, input: HTMLInputElement) {
  const files = input.files ? [...input.files] : [];
  input.value = "";
  if (!files.length) return;

  const status = $("#upload-status");
  status.classList.remove("hidden", "error");
  let totalAdded = 0;
  let totalSkipped = 0;
  const total = files.length;
  let completed = 0;
  let nextIndex = 0;

  status.textContent = `Uploading 0 of ${total}…`;

  async function uploadOne(file: File) {
    const form = new FormData();
    form.append("images", file);
    const result = await api<{
      gallery: PortfolioGallery;
      added: string[];
      skipped?: { name: string; reason: string }[];
    }>(`/api/admin/galleries/${slug}/images`, { method: "POST", body: form });
    totalAdded += result.added?.length ?? 0;
    totalSkipped += result.skipped?.length ?? 0;
    completed += 1;
    status.textContent = `Uploading ${completed} of ${total}…`;
  }

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= files.length) break;
      await uploadOne(files[i]!);
    }
  }

  try {
    const workers = Math.min(UPLOAD_CONCURRENCY, files.length);
    await Promise.all(Array.from({ length: workers }, () => worker()));

    await refreshManage();
    selectGallery(slug);

    if (totalAdded === 0) {
      status.textContent =
        totalSkipped > 0
          ? "No photos were added. Try JPEG or PNG, or upload fewer at a time."
          : "No photos were added.";
      status.classList.add("error");
    } else {
      status.textContent =
        totalSkipped > 0
          ? `Added ${totalAdded} photo(s). ${totalSkipped} skipped.`
          : `Added ${totalAdded} photo(s).`;
    }
  } catch (e) {
    status.textContent = e instanceof Error ? e.message : "Upload failed";
    status.classList.add("error");
  }

  setTimeout(() => status.classList.add("hidden"), 8000);
}

function currentCoverFilename(g: PortfolioGallery) {
  if (!g.cover) return "";
  const match = g.images.find((img) => g.cover?.includes(img.name));
  return match?.name || "";
}

function renderCoverPicker(g: PortfolioGallery, modal: HTMLElement) {
  const section = $("#settings-cover-section", modal);
  const grid = $("#settings-cover-grid", modal);
  const hidden = $("#settings-cover", modal) as HTMLInputElement;
  const current = currentCoverFilename(g);

  if (!g.images.length) {
    section.classList.add("hidden");
    hidden.value = "";
    return;
  }

  section.classList.remove("hidden");
  hidden.value = current || g.images[0].name;

  grid.innerHTML = g.images
    .map(
      (img) => `
    <button type="button" class="admin-cover-option ${hidden.value === img.name ? "selected" : ""}" data-cover="${img.name}">
      <img src="${img.thumbUrl}" alt="" />
    </button>`
    )
    .join("");

  grid.querySelectorAll<HTMLButtonElement>("[data-cover]").forEach((btn) => {
    btn.addEventListener("click", () => {
      hidden.value = btn.dataset.cover || "";
      grid.querySelectorAll(".admin-cover-option").forEach((el) => el.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });
}

async function openSettings(g: PortfolioGallery) {
  const modal = $("#settings-modal");
  const fresh = await api<{ gallery: PortfolioGallery }>(`/api/admin/galleries/${g.slug}`);
  g = fresh.gallery;

  show(modal, true);
  ($("#settings-title", modal) as HTMLInputElement).value = g.title;
  ($("#settings-desc", modal) as HTMLTextAreaElement).value = g.description;
  ($("#settings-date", modal) as HTMLInputElement).value = g.date;
  ($("#settings-print", modal) as HTMLInputElement).value = g.printCollectionUrl;
  ($("#settings-private", modal) as HTMLInputElement).checked = g.private;
  ($("#settings-featured", modal) as HTMLInputElement).checked = g.featured;
  renderCoverPicker(g, modal);

  const saveBtn = $("#settings-save", modal);
  const newSave = saveBtn.cloneNode(true);
  saveBtn.replaceWith(newSave);
  newSave.addEventListener("click", async () => {
    const coverInput = ($("#settings-cover", modal) as HTMLInputElement).value;
    await api(`/api/admin/galleries/${g.slug}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: ($("#settings-title", modal) as HTMLInputElement).value,
        description: ($("#settings-desc", modal) as HTMLTextAreaElement).value,
        date: ($("#settings-date", modal) as HTMLInputElement).value,
        printCollectionUrl: ($("#settings-print", modal) as HTMLInputElement).value,
        private: ($("#settings-private", modal) as HTMLInputElement).checked,
        featured: ($("#settings-featured", modal) as HTMLInputElement).checked,
        cover: coverInput || undefined,
      }),
    });
    show(modal, false);
    await refreshManage();
    selectGallery(g.slug);
  });

  const deleteBtn = $("#settings-delete", modal);
  const newDelete = deleteBtn.cloneNode(true);
  deleteBtn.replaceWith(newDelete);
  newDelete.addEventListener("click", async () => {
    if (!confirm(`Delete "${g.title}" and all photos?`)) return;
    await api(`/api/admin/galleries/${g.slug}`, { method: "DELETE" });
    show(modal, false);
    state.selected = null;
    await refreshManage();
    $("#admin-detail").innerHTML = `<p class="prose admin-muted">Select a gallery or create a new one.</p>`;
  });
}

function openNewGallery() {
  const modal = $("#new-modal");
  show(modal, true);
  ($("#new-title", modal) as HTMLInputElement).value = "";
  ($("#new-desc", modal) as HTMLTextAreaElement).value = "";
  ($("#new-date", modal) as HTMLInputElement).value = new Date().toISOString().slice(0, 10);
  ($("#new-private", modal) as HTMLInputElement).checked = false;
  ($("#new-featured", modal) as HTMLInputElement).checked = false;
}

let creatingGallery = false;

async function createGallery() {
  if (creatingGallery) return;
  creatingGallery = true;
  const createBtn = document.querySelector<HTMLButtonElement>("#new-create");
  if (createBtn) createBtn.disabled = true;

  const modal = $("#new-modal");
  try {
    const { gallery } = await api<{ gallery: PortfolioGallery }>("/api/admin/galleries", {
      method: "POST",
      body: JSON.stringify({
        title: ($("#new-title", modal) as HTMLInputElement).value,
        description: ($("#new-desc", modal) as HTMLTextAreaElement).value,
        date: ($("#new-date", modal) as HTMLInputElement).value,
        private: ($("#new-private", modal) as HTMLInputElement).checked,
        featured: ($("#new-featured", modal) as HTMLInputElement).checked,
      }),
    });
    show(modal, false);
    await refreshManage();
    selectGallery(gallery.slug);
    await loadPublicGalleries();
  } catch (e) {
    alert(e instanceof Error ? e.message : "Could not create gallery");
  } finally {
    creatingGallery = false;
    if (createBtn) createBtn.disabled = false;
  }
}

async function selectGallery(slug: string) {
  state.selected = slug;
  renderGalleryList();
  const { gallery } = await api<{ gallery: PortfolioGallery }>(`/api/admin/galleries/${slug}`);
  renderGalleryDetail(gallery);
}

async function refreshManage() {
  await loadAdminGalleries();
  renderGalleryList();
}

function openLogin() {
  show($("#login-modal"), true);
  ($("#login-password") as HTMLInputElement).focus();
}

function setManageMode(on: boolean) {
  if (!isManagePage()) return;
  state.manageMode = on;
  if (on && state.authenticated) {
    setManageTab("galleries");
    refreshManage();
    if (!state.selected) {
      $("#admin-detail").innerHTML = `<p class="prose admin-muted">Select a gallery on the left, or create a new one.</p>`;
    }
  } else if (!state.authenticated) {
    show($("#manage-galleries-view"), false);
    show($("#manage-pages-view"), false);
    openLogin();
  }
}

function renderChrome() {
  if (!isManagePage()) return;
  renderManageToolbar();
  if (state.authenticated) {
    setManageMode(true);
    const storageSection = document.querySelector<HTMLElement>("[data-manage-storage]");
    storageSection?.classList.remove("hidden");
    loadStorageUsage().catch(() => {
      const body = $("#storage-body", document);
      body.innerHTML = `<p class="admin-muted">Could not load storage usage.</p>`;
    });

    const refreshBtn = document.querySelector<HTMLButtonElement>("#btn-refresh-storage");
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = "1";
      refreshBtn.addEventListener("click", () => {
        loadStorageUsage().catch(() => undefined);
      });
    }

    if (storageIntervalId == null) {
      storageIntervalId = window.setInterval(() => {
        loadStorageUsage().catch(() => undefined);
      }, 60000);
    }
  } else {
    show($("#manage-galleries-view"), false);
    openLogin();
    const storageSection = document.querySelector<HTMLElement>("[data-manage-storage]");
    storageSection?.classList.add("hidden");
    if (storageIntervalId != null) {
      window.clearInterval(storageIntervalId);
      storageIntervalId = null;
    }
  }
}

function formatBytes(bytes: number) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log10(n) / 3));
  const v = n / Math.pow(1024, i);
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

async function loadStorageUsage() {
  const status = $("#storage-status", document);
  const body = $("#storage-body", document);
  if (!status || !body) return;

  status.textContent = "Loading storage…";
  body.innerHTML = "";

  const res = await api<{
    dataDir: string;
    root: { totalBytes: number; freeBytes: number; usedBytes: number };
    dataDirStats: { totalBytes: number; freeBytes: number; usedBytes: number };
  }>("/api/admin/system/storage");

  const rootUsed = formatBytes(res.root.usedBytes);
  const rootTotal = formatBytes(res.root.totalBytes);
  const rootFree = formatBytes(res.root.freeBytes);

  const dataUsed = formatBytes(res.dataDirStats.usedBytes);
  const dataTotal = formatBytes(res.dataDirStats.totalBytes);
  const dataFree = formatBytes(res.dataDirStats.freeBytes);

  status.textContent = "Storage usage";
  body.innerHTML = `
    <div style="display:grid; gap:0.5rem;">
      <p style="margin:0;"><strong>/</strong>: ${rootUsed} used of ${rootTotal} (${rootFree} free)</p>
      <p style="margin:0;"><strong>DATA_DIR</strong>: ${dataUsed} used of ${dataTotal} (${dataFree} free)</p>
      <p style="margin:0;" class="admin-muted">Path: <code>${escapeHtml(res.dataDir)}</code></p>
    </div>
  `;
}

let managePageListenersBound = false;

async function init() {
  if (!isManagePage()) return;
  if (managePageListenersBound) {
    const authed = await checkSession();
    renderChrome();
    return;
  }
  managePageListenersBound = true;

  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => show(btn.closest(".modal") as HTMLElement, false));
  });

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#login-error");
    err.classList.add("hidden");
    try {
      await login(($("#login-password") as HTMLInputElement).value);
      show($("#login-modal"), false);
      setManageMode(true);
      renderChrome();
    } catch (ex) {
      err.textContent = ex instanceof Error ? ex.message : "Wrong password or server needs update";
      err.classList.remove("hidden");
    }
  });

  $("#new-create").addEventListener("click", () => createGallery().catch((e) => alert(e.message)));

  const authed = await checkSession();
  renderChrome();
}

init();
document.addEventListener("astro:page-load", init);
