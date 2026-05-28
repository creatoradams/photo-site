import { api, formatDate, type PortfolioGallery } from "./api";

type State = {
  galleries: PortfolioGallery[];
  selected: string | null;
  authenticated: boolean;
};

const state: State = { galleries: [], selected: null, authenticated: false };

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector<T>(sel)!;

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function show(el: HTMLElement | null, visible: boolean) {
  if (!el) return;
  el.classList.toggle("hidden", !visible);
}

async function checkSession() {
  const { authenticated } = await api<{ authenticated: boolean }>("/api/admin/session");
  state.authenticated = authenticated;
  return authenticated;
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

async function loadGalleries() {
  const { galleries } = await api<{ galleries: PortfolioGallery[] }>("/api/admin/galleries");
  state.galleries = galleries;
  return galleries;
}

function renderGalleryList() {
  const list = $("#admin-gallery-list");
  if (!state.galleries.length) {
    list.innerHTML = `<p class="prose">No galleries yet. Click <strong>+ New gallery</strong> to create one.</p>`;
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
        <p class="admin-muted">${g.private ? "Private — hidden from public site" : "Public"} · <a href="/galleries/view?slug=${encodeURIComponent(g.slug)}" target="_blank" rel="noreferrer">Preview</a></p>
      </div>
      <div class="admin-detail-actions">
        <button type="button" class="btn btn-secondary" id="btn-settings">Settings</button>
        <label class="btn admin-upload-btn">
          + Add photos
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
        <div class="admin-image-item" data-name="${img.name}">
          <img src="${img.thumbUrl}" alt="" />
          <div class="admin-image-actions">
            ${g.cover?.includes(img.name) ? `<span class="badge">Cover</span>` : `<button type="button" class="btn-text" data-set-cover="${img.name}">Set cover</button>`}
            <button type="button" class="btn-text btn-danger" data-delete="${img.name}">Delete</button>
          </div>
        </div>`
              )
              .join("")
          : `<p class="prose admin-muted">No photos yet. Click <strong>+ Add photos</strong> to upload.</p>`
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
      await refresh();
      selectGallery(g.slug);
    });
  });

  panel.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this image?")) return;
      await api(`/api/admin/galleries/${g.slug}/images/${encodeURIComponent(btn.dataset.delete!)}`, {
        method: "DELETE",
      });
      await refresh();
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
    await refresh();
    selectGallery(slug);
    status.textContent = "Upload complete.";
  } catch (e) {
    status.textContent = e instanceof Error ? e.message : "Upload failed";
    status.classList.add("message", "error");
  }
  input.value = "";
  setTimeout(() => status.classList.add("hidden"), 3000);
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
    await refresh();
    selectGallery(g.slug);
  });

  const deleteBtn = $("#settings-delete", modal);
  const newDelete = deleteBtn.cloneNode(true);
  deleteBtn.replaceWith(newDelete);
  newDelete.addEventListener("click", async () => {
    if (!confirm(`Delete gallery "${g.title}" and all its photos? This cannot be undone.`)) return;
    await api(`/api/admin/galleries/${g.slug}`, { method: "DELETE" });
    show(modal, false);
    state.selected = null;
    await refresh();
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
  await refresh();
  selectGallery(gallery.slug);
}

async function selectGallery(slug: string) {
  state.selected = slug;
  renderGalleryList();
  const { gallery } = await api<{ gallery: PortfolioGallery }>(`/api/admin/galleries/${slug}`);
  renderGalleryDetail(gallery);
}

async function refresh() {
  await loadGalleries();
  renderGalleryList();
}

function renderApp() {
  show($("#login-screen"), !state.authenticated);
  show($("#admin-app"), state.authenticated);
  if (state.authenticated) {
    renderGalleryList();
    if (!state.selected) {
      $("#admin-detail").innerHTML = `<p class="prose admin-muted">Select a gallery or create a new one.</p>`;
    }
  }
}

async function init() {
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#login-error");
    err.classList.add("hidden");
    try {
      await login(($("#login-password") as HTMLInputElement).value);
      await refresh();
      renderApp();
    } catch (ex) {
      err.textContent = ex instanceof Error ? ex.message : "Login failed";
      err.classList.remove("hidden");
    }
  });

  $("#btn-logout").addEventListener("click", async () => {
    await logout();
    renderApp();
  });

  $("#btn-new-gallery").addEventListener("click", openNewGallery);
  $("#new-create").addEventListener("click", () => createGallery().catch((e) => alert(e.message)));
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => show(btn.closest(".modal") as HTMLElement, false));
  });

  const authed = await checkSession();
  if (authed) await refresh();
  renderApp();
}

init();
