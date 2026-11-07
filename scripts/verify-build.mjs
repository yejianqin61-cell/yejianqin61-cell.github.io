import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
const root = new URL('../dist/', import.meta.url);
const expectedFiles = [
  'index.html',
  'articles/index.html',
  'categories/index.html',
  'tags/index.html',
  'about/index.html',
  '2026/10/15/15.三数之和/index.html',
  '2026/09/09/XMFLS-Fortress-001/index.html',
  '2026/10/30/日志/2026/10.30日志/index.html',
  'images/posts/2026-10-30/image-20261030144100542.png',
];

for (const file of expectedFiles) {
  await access(new URL(file, root), constants.R_OK);
}

const article = await readFile(
  new URL('2026/11/02/日志/2026/11.2日志/index.html', root),
  'utf8',
);

for (const text of ['日志：2026-11-02', '计算机网络知识日志']) {
  if (!article.includes(text)) {
    throw new Error(`文章构建结果缺少：${text}`);
  }
}

const illustratedArticle = await readFile(
  new URL('2026/10/30/日志/2026/10.30日志/index.html', root),
  'utf8',
);

if (!illustratedArticle.includes('/images/posts/2026-10-30/')) {
  throw new Error('带图片文章没有保留图片地址。');
}

const categoryIndex = await readFile(new URL('categories/index.html', root), 'utf8');
if (!categoryIndex.includes('技术 / 数据结构与算法')) {
  throw new Error('分类索引没有生成。');
}

console.log(`Verified ${expectedFiles.length} static outputs and one long article.`);
