// 生成可静态托管的部署目录。
// 结构：deploy/index.html + deploy/v<stamp>/（全部资源）。
// 用版本化子目录刷新资源缓存，入口通过相对 base 兼容 GitHub Pages 项目子路径。
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

// 删除前限定目标为本项目的部署产物目录。
if (out !== join(resolve(here, '..'), 'deploy')) throw new Error('部署输出目录超出预期范围');

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
  .replace('<head>', `<head>\n  <base href="./v${stamp}/">`);
await writeFile(join(out, 'index.html'), indexHtml);

const flat = (await readFile(join(body, 'app.js'), 'utf8')) + cardsHtml + indexHtml;
console.log(`部署目录已生成: ${out}`);
console.log(`版本目录: v${stamp}（卡面 ${entries.length} 张 -> art/*${ext}）`);
console.log('剩余绝对路径引用:', [...flat.matchAll(/(href|src)="\//g)].length);
