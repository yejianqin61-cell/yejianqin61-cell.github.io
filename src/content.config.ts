import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articleSchema = z.object({
  title: z.string(),
  date: z.coerce.date(),
  categories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

const posts = defineCollection({
  loader: glob({
    base: './source/_posts',
    generateId: ({ entry }) => entry.replace(/\.(?:md|mdx)$/, ''),
    pattern: '**/*.{md,mdx}',
  }),
  schema: articleSchema,
});

const pages = defineCollection({
  loader: glob({ base: './source/about', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    type: z.string().optional(),
  }),
});

export const collections = { posts, pages };
