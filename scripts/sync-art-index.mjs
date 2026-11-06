// Local authoring only: the original PNGs and formal index live in the GDD.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { CARDS } from '../dist/data.js';
import './sync-catalog.mjs';

const artRoot = new URL('../../卡牌/', import.meta.url);
const indexFile = new URL('当前卡面/正式资源索引.json', artRoot);
const previous = JSON.parse(await readFile(indexFile, 'utf8'));
const cards = [];
for (const card of CARDS) {
  assert(card.art.startsWith('当前卡面/'), `${card.name}尚未正式归档`);
  const bytes = await readFile(new URL(card.art, artRoot));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const old = previous.cards.find(c => c.id === card.id);
  if (old) assert.equal(sha256, old.sha256, `${card.name}与上次登记的成图不一致`);
  cards.push({id:card.id, name:card.name, file:card.art, sha256, formal_archive:true});
}
// Keep the previous deployment evidence explicitly historical, not a claim about this build.
const { release, ...index } = previous;
if (release) index.previous_release_snapshot = release;
await writeFile(indexFile, JSON.stringify({...index, date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()), card_count:cards.length, cards,
  note:'现行采用资源索引，由运行映射生成；首批资源清单及生成记录保留历史语境。索引更新不代表重新发布。'
}, null, 2) + '\n');
const html = await readFile(new URL('../dist/cards.html', import.meta.url), 'utf8');
const offline = html.replace(/\/art\/([^"\s]+)/g, (_, path) => {
  const relative = decodeURIComponent(path).replace(/^当前卡面\//, '');
  return encodeURIComponent(relative);
});
await writeFile(new URL('当前卡面/卡面总览.html', artRoot), offline);
console.log(`正式索引与离线图鉴已同步：${cards.length}张，原图SHA256与既有登记一致。`);
