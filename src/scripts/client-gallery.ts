
export function initClientGallery(slug: string) {
  const gate = document.getElementById("gate");
  const gallerySection = document.getElementById("gallery-section");
  const form = document.getElementById("request-form") as HTMLFormElement | null;
  const requestMsg = document.getElementById("request-msg");
  const grid = document.getElementById("client-grid");
  const countEl = document.getElementById("selection-count");
  const downloadSelected = document.getElementById("download-selected") as HTMLButtonElement;
  const downloadAll = document.getElementById("download-all") as HTMLButtonElement;
  const downloadStatus = document.getElementById("download-status");
  let files: { name: string }[] = [];
  const selected = new Set<string>();

  const showMsg = (text: string, ok: boolean) => {
    if (!requestMsg) return;
    requestMsg.textContent = text;
    requestMsg.classList.remove("hidden");
    requestMsg.classList.toggle("success", ok);
    requestMsg.classList.toggle("error", !ok);
  };

  const updateCount = () => {
    if (countEl) countEl.textContent = `${selected.size} selected`;
    if (downloadSelected) downloadSelected.disabled = selected.size === 0;
  };

  const renderGrid = () => {
    if (!grid) return;
    grid.innerHTML = "";
    for (const f of files) {
      const item = document.createElement("label");
      item.className = "client-item" + (selected.has(f.name) ? " selected" : "");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selected.has(f.name);
      cb.onchange = () => {
        if (cb.checked) selected.add(f.name); else selected.delete(f.name);
        item.classList.toggle("selected", cb.checked);
        updateCount();
      };
      const img = document.createElement("img");
      img.src = `/api/preview?gallery=${encodeURIComponent(slug)}&file=${encodeURIComponent(f.name)}`;
      img.alt = f.name;
      img.loading = "lazy";
      item.append(cb, img);
      grid.appendChild(item);
    }
    updateCount();
  };

  const checkSession = async () => {
    const res = await fetch(`/api/auth/session?gallery=${encodeURIComponent(slug)}`, { credentials: "include" });
    if (!res.ok) return false;
    return (await res.json()).authenticated === true;
  };

  const loadManifest = async () => {
    const res = await fetch(`/api/gallery/${encodeURIComponent(slug)}/manifest`, { credentials: "include" });
    if (!res.ok) throw new Error("manifest");
    files = (await res.json()).files || [];
    renderGrid();
  };

  const showGallery = async () => {
    gate?.classList.add("hidden");
    gallerySection?.classList.remove("hidden");
    await loadManifest();
  };

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("email") as HTMLInputElement;
    const btn = document.getElementById("request-btn") as HTMLButtonElement;
    btn.disabled = true;
    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ gallery: slug, email: input.value }),
      });
      showMsg((await res.json()).message || "Check your inbox.", true);
    } catch { showMsg("Something went wrong.", false); }
    finally { btn.disabled = false; }
  });

  const downloadZip = async (fileList: string[] | null) => {
    downloadStatus?.classList.remove("hidden");
    downloadSelected.disabled = downloadAll.disabled = true;
    try {
      const res = await fetch("/api/download/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ gallery: slug, files: fileList }),
      });
      if (!res.ok) throw new Error("fail");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = slug + ".zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { alert("Download failed."); }
    finally {
      downloadStatus?.classList.add("hidden");
      downloadSelected.disabled = selected.size === 0;
      downloadAll.disabled = false;
    }
  };

  document.getElementById("select-all")?.addEventListener("click", () => { files.forEach(f => selected.add(f.name)); renderGrid(); });
  document.getElementById("clear-all")?.addEventListener("click", () => { selected.clear(); renderGrid(); });
  downloadSelected?.addEventListener("click", () => downloadZip([...selected]));
  downloadAll?.addEventListener("click", () => downloadZip(null));
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    location.reload();
  });

  (async () => { if (await checkSession()) await showGallery(); })();
}
