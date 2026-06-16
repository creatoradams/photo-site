const API = "";

export async function api<T>(
  path: string,
  init?: RequestInit & { cache?: RequestCache }
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
  return data as T;
}

export type PortfolioGallery = {
  slug: string;
  title: string;
  description: string;
  date: string;
  private: boolean;
  featured: boolean;
  homeOrder: number | null;
  printCollectionUrl: string;
  cover: string | null;
  imageCount: number;
  images: {
    name: string;
    url: string;
    thumbUrl: string;
    gridUrl?: string;
    displayUrl?: string;
    width?: number | null;
    height?: number | null;
  }[];
};

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

function ordinalSuffix(day: number) {
  const v = day % 100;
  if (v >= 11 && v <= 13) return "TH";
  switch (day % 10) {
    case 1:
      return "ST";
    case 2:
      return "ND";
    case 3:
      return "RD";
    default:
      return "TH";
  }
}

export function formatGalleryDate(dateStr: string) {
  const d = new Date(dateStr);
  const month = d.toLocaleString("en-US", { month: "long" }).toUpperCase();
  const day = d.getDate();
  return `${month} ${day}${ordinalSuffix(day)}, ${d.getFullYear()}`;
}
