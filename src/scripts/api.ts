const API = "";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
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
  printCollectionUrl: string;
  cover: string | null;
  imageCount: number;
  images: { name: string; url: string; thumbUrl: string }[];
};

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long" });
}
