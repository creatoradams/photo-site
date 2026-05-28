export type DownloadItem = { url: string; filename: string };

export function safeFilenameBase(title: string) {
  return (title || "photo").replace(/[^\w\s.-]+/g, "").trim().replace(/\s+/g, "-") || "photo";
}

function fileExtension(name: string, mime: string) {
  if (name.includes(".")) return name.slice(name.lastIndexOf("."));
  if (mime.includes("jpeg")) return ".jpg";
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("tiff")) return ".tif";
  return ".jpg";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Phones/tablets only — desktop browsers may still expose navigator.share. */
function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function fetchAsFile(url: string, filename: string): Promise<File> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("fetch failed");
  const blob = await res.blob();
  const type = blob.type || "application/octet-stream";
  const ext = fileExtension(filename, type);
  const stem = filename.includes(".") ? filename.replace(/\.[^.]+$/, "") : filename;
  const name = filename.includes(".") ? filename : `${stem}${ext}`;
  return new File([blob], name, { type });
}

function saveWithAnchor(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function canShareFiles(files: File[]) {
  return typeof navigator.share === "function" && navigator.canShare?.({ files }) === true;
}

function acceptTypesFor(file: File) {
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : ".jpg";
  const mime = file.type || "image/jpeg";
  return [{ description: "Image", accept: { [mime]: [ext] } }];
}

/** Pick a folder (Pictures, Downloads, etc.) and save all files there. */
async function saveToDirectory(files: File[]) {
  const dir = await window.showDirectoryPicker!({ mode: "readwrite" });
  for (const file of files) {
    const handle = await dir.getFileHandle(file.name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
  }
}

/** Ask where to save each file (Save As dialog). */
async function saveWithPickers(files: File[]) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const handle = await window.showSaveFilePicker!({
      suggestedName: file.name,
      types: acceptTypesFor(file),
    });
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
    if (i < files.length - 1) await delay(200);
  }
}

async function saveOnDesktop(files: File[]) {
  try {
    if (files.length > 1 && typeof window.showDirectoryPicker === "function") {
      await saveToDirectory(files);
      return;
    }
    if (typeof window.showSaveFilePicker === "function") {
      await saveWithPickers(files);
      return;
    }
  } catch (err) {
    if ((err as DOMException).name === "AbortError") return;
    throw err;
  }

  for (let i = 0; i < files.length; i++) {
    saveWithAnchor(files[i]!);
    if (i < files.length - 1) await delay(400);
  }
}

async function saveOnMobile(files: File[]) {
  if (canShareFiles(files)) {
    try {
      await navigator.share({ files });
      return;
    } catch (err) {
      if ((err as DOMException).name === "AbortError") return;
    }
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    if (canShareFiles([file])) {
      try {
        await navigator.share({ files: [file] });
        if (i < files.length - 1) await delay(400);
        continue;
      } catch (err) {
        if ((err as DOMException).name === "AbortError") {
          if (i < files.length - 1) await delay(400);
          continue;
        }
      }
    }
    saveWithAnchor(file);
    if (i < files.length - 1) await delay(400);
  }
}

/** Save photos individually — folder/save dialogs on desktop, share sheet on phones. */
export async function downloadImages(
  items: DownloadItem[],
  options?: { onProgress?: (current: number, total: number) => void }
) {
  if (!items.length) return;

  const total = items.length;
  const files: File[] = [];

  for (let i = 0; i < items.length; i++) {
    options?.onProgress?.(i + 1, total);
    files.push(await fetchAsFile(items[i]!.url, items[i]!.filename));
  }

  if (isMobileDevice()) {
    await saveOnMobile(files);
  } else {
    await saveOnDesktop(files);
  }
}
