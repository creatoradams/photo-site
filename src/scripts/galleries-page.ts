import PhotoSwipeLightbox from "photoswipe/lightbox";
import { api, formatDate, type PortfolioGallery } from "./api";

type State = {
  galleries: PortfolioGallery[];
  selected: string | null;
  authenticated: boolean;
  manageMode: boolean;
};

const state: State = { galleries: [], selected: null, authenticated: false, manageMode: false };
let lightbox: PhotoSwipeLightbox | null = null;

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
          <input type="file" id="upload-input" accept="image/jpeg,image/png,image/webp" multiple hidden />
        </label>
      </div>
    </div>
    <div class="admin-image-grid" id="admin-images">
      ${
        g.images.length
          ? g.images
              .map(
                (img) => `
        <div class="admin-image-item" data-name="${img.name}">
          <img src="${img.thumbUrl}" alt="" />
          <div class="admin-image-actions">
            ${g.cover?.includes(img.name) ? `<span class="badge">Cover</span>` : `<button type="button" class="btn-text" data-set-cover="${img.name}">Set cover</button>`}
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

async function uploadImages(slug: string, input: HTMLInputElement) {
  if (!input.files?.length) return;
  const form = new FormData();
  for (const file of input.files) form.append("images", file);
  const status = $("#upload-status");
  status.textContent = "Uploading…";
  status.classList.remove("hidden");
  try {
    await api(`/api/admin/galleries/${slug}/images`, { method: "POST", body: form });
    await refreshManage();
    selectGallery(slug);
    await loadPublicGalleries();
    status.textContent = "Upload complete.";
  } catch (e) {
    status.textContent = e instanceof Error ? e.message : "Upload failed";
    status.classList.add("message", "error");
  }
  input.value = "";
  setTimeout(() => status.classList.add("hidden"), 4000);
}

function openSettings(g: PortfolioGallery) {
  const modal = $("#settings-modal");
  show(modal, true);
  ($("#settings-title", modal) as HTMLInputElement).value = g.title;
  ($("#settings-desc", modal) as HTMLTextAreaElement).value = g.description;
  ($("#settings-date", modal) as HTMLInputElement).value = g.date;
  ($("#settings-print", modal) as HTMLInputElement).value = g.printCollectionUrl;
  ($("#settings-private", modal) as HTMLInputElement).checked = g.private;
  ($("#settings-featured", modal) as HTMLInputElement).checked = g.featured;

  const saveBtn = $("#settings-save", modal);
  const newSave = saveBtn.cloneNode(true);
  saveBtn.replaceWith(newSave);
  newSave.addEventListener("click", async () => {
    await api(`/api/admin/galleries/${g.slug}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: ($("#settings-title", modal) as HTMLInputElement).value,
        description: ($("#settings-desc", modal) as HTMLTextAreaElement).value,
        date: ($("#settings-date", modal) as HTMLInputElement).value,
        printCollectionUrl: ($("#settings-print", modal) as HTMLInputElement).value,
        private: ($("#settings-private", modal) as HTMLInputElement).checked,
        featured: ($("#settings-featured", modal) as HTMLInputElement).checked,
      }),
    });
    show(modal, false);
    await refreshManage();
    selectGallery(g.slug);
    await loadPublicGalleries();
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
    await loadPublicGalleries();
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

async function createGallery() {
  const modal = $("#new-modal");
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
  show($("#manage-galleries-view"), on && state.authenticated);
  if (on && state.authenticated) {
    refreshManage();
    if (!state.selected) {
      $("#admin-detail").innerHTML = `<p class="prose admin-muted">Select a gallery on the left, or create a new one.</p>`;
    }
  }
  if (on && !state.authenticated) openLogin();
}

function renderChrome() {
  if (!isManagePage()) return;
  renderManageToolbar();
  if (state.authenticated) {
    setManageMode(true);
  } else {
    show($("#manage-galleries-view"), false);
    openLogin();
  }
}

async function init() {
  if (!isManagePage()) return;

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
