// Explicit local authoring check: original PNGs live outside this Git repository.
import {readFile} from 'node:fs/promises';
import {CARDS} from '../dist/data.js';
const selected=process.argv.slice(2),cards=selected.length?CARDS.filter(c=>selected.includes(c.id)):CARDS;
if(selected.some(id=>!cards.some(c=>c.id===id)))throw new Error('存在未知卡牌ID');
for(const card of cards){
  const png=await readFile(new URL(`../../卡牌/${card.art}`,import.meta.url));
  if(png.length<33||png.toString('hex',0,8)!=='89504e470d0a1a0a'||png.readUInt32BE(16)!==1024||png.readUInt32BE(20)!==1536)throw new Error(`${card.name}原图必须是1024×1536 PNG`);
}
console.log(`本地原图检查通过：${cards.length}张1024×1536 PNG（此检查需要本机项目资产，不在CI运行）。`);
