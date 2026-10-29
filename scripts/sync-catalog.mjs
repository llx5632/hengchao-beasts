import { readFile,writeFile } from 'node:fs/promises';
import { CARDS } from '../dist/data.js';
const file=new URL('../dist/cards.html',import.meta.url);
let html=await readFile(file,'utf8');
html=html.replace('十五异兽卡面','异兽卡面总览').replace('十五异兽谱印','异兽谱印总览').replace('十二张新卡与三张修订卡。','展示当前可用的异兽卡牌。');
const figures=CARDS.map(c=>`<figure data-element="${c.element}"><a href="/art/${encodeURIComponent(c.art)}" target="_blank" rel="noopener"><img src="/art/${encodeURIComponent(c.art)}" alt="${c.name}完整卡面" loading="lazy"></a><figcaption><b>${c.name}</b><span>${c.element} · HP ${c.hp} · 撤退 ${c.retreat}</span></figcaption></figure>`).join('\n');
html=html.slice(0,html.indexOf('<main>')+6)+figures+html.slice(html.indexOf('</main>'));
await writeFile(file,html);
