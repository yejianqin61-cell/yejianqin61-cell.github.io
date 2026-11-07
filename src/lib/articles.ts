import type { CollectionEntry } from 'astro:content';

export type Article = CollectionEntry<'posts'>;

const withoutExtension = (id: string) => id.replace(/\.(?:md|mdx)$/, '');

export const articlePath = (article: Article) => {
  const { date } = article.data;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  return `/${year}/${month}/${day}/${withoutExtension(article.id)}/`;
};

export const byNewest = (articles: Article[]) =>
  [...articles].sort((first, second) => second.data.date.getTime() - first.data.date.getTime());

export const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Singapore',
  }).format(date);
