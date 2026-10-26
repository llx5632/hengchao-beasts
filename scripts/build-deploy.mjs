// 生成可静态托管的部署目录。
// 结构：deploy/index.html + deploy/v<stamp>/（全部资源）。
// 原因：托管端 CDN 会缓存裸路径资源、且拒绝带 query 的静态请求（403），
// 所以用版本化子目录做缓存刷新；index.html 本身不缓存。
// 卡面压成 WebP（scripts/compress-art.py），全部相对路径 + ASCII 文件名。
// 用法: node scripts/build-deploy.mjs
import { readFile, writeFile, mkdir, rm, copyFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../dist');
const out = resolve(here, '../deploy');
const artDir = resolve(here, '../../卡牌/当前卡面');
const webpDir = resolve(here, '../deploy-art');
const hasWebp = await readdir(webpDir).then(() => true).catch(() => false);
const ext = hasWebp ? '.webp' : '.png';

const artSrc = await readFile(join(dist, 'card-art.js'), 'utf8');
const entries = [...artSrc.matchAll(/"([A-Za-z0-9_]+)":\s*"([^"]+)"/g)].map(([, id, p]) => ({ id, path: p }));
if (!entries.length) throw new Error('未能解析 card-art.js 中的卡面映射');

await rm(out, { recursive: true, force: true });
const stamp = Date.now().toString(36);
const body = join(out, `v${stamp}`);
await mkdir(join(body, 'art'), { recursive: true });

for (const name of await readdir(dist)) await copyFile(join(dist, name), join(body, name));
for (const { id, path } of entries) {
  const from = hasWebp ? join(webpDir, `${id}.webp`) : join(artDir, path.split('/').pop());
  await copyFile(from, join(body, 'art', `${id}${ext}`));
}

await writeFile(join(body, 'card-art.js'), [
  '// Current card faces generated from the approved concept style. Deploy build: ASCII names, relative paths.',
  'export const CURRENT_ART = Object.freeze({',
  entries.map(({ id }) => `  "${id}": "art/${id}${ext}"`).join(',\n'),
  '});',
  ''
].join('\n'));

const rel = text => text
  .replace(/\/art\/\$\{encodeURIComponent\(([^)]+)\)\}/g, '${$1}')
  .replace(/(href|src)="\/cards\.html"/g, '$1="cards.html"')
  .replace(/(href|src)="\/style\.css"/g, '$1="style.css"')
  .replace(/(href|src)="\/app\.js"/g, '$1="app.js"');

const byPath = new Map(entries.map(({ id, path }) => [path, id]));
const cardsHtml = rel(await readFile(join(dist, 'cards.html'), 'utf8'))
  .replace(/\/art\/([^"]*?)\.png/g, (m, encoded) => {
    const id = byPath.get(`${decodeURIComponent(encoded)}.png`);
    return id ? `art/${id}${ext}` : m;
  });

await writeFile(join(body, 'app.js'), rel(await readFile(join(dist, 'app.js'), 'utf8')));
await writeFile(join(body, 'cards.html'), cardsHtml);
await rm(join(body, 'index.html'));

const indexHtml = rel(await readFile(join(dist, 'index.html'), 'utf8'))
  .replaceAll('"style.css"', `"v${stamp}/style.css"`)
  .replaceAll('"app.js"', `"v${stamp}/app.js"`);
await writeFile(join(out, 'index.html'), indexHtml);

const flat = (await readFile(join(body, 'app.js'), 'utf8')) + cardsHtml + indexHtml;
console.log(`部署目录已生成: ${out}`);
console.log(`版本目录: v${stamp}（卡面 ${entries.length} 张 -> art/*${ext}）`);
console.log('剩余绝对路径引用:', [...flat.matchAll(/(href|src)="\//g)].length);
