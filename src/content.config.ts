import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const albums = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/albums" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    cover: z.string(),
    featured: z.boolean().default(false),
    printCollectionUrl: z.string().url().optional(),
    images: z.array(z.string()).default([]),
  }),
});

const clientGalleries = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/client-galleries" }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    cover: z.string().optional(),
  }),
});

export const collections = { albums, "client-galleries": clientGalleries };
