// CI must validate the committed deployment, never the workstation's art folder.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {CARDS} from '../dist/data.js';

export async function checkDeploy(root=new URL('../deploy/',import.meta.url),expectedCards=CARDS){
  const entry=await readFile(new URL('index.html',root),'utf8'),version=entry.match(/<base href="\.\/(v[a-z0-9]+)\/">/)?.[1];
  assert(version,'部署入口缺少合法版本目录');
  const base=new URL(`${version}/`,root),dir=fileURLToPath(base);
  const {CURRENT_ART}=await import(new URL('card-art.js',base));
  const {CARDS:deployedCards}=await import(new URL('data.js',base));
  const withoutArt=cards=>cards.map(({art,...card})=>card);
  assert.deepEqual(withoutArt(deployedCards),withoutArt(expectedCards),'部署数据与当前源码不一致，请重新构建');
  assert.deepEqual(Object.keys(CURRENT_ART).sort(),expectedCards.map(c=>c.id).sort(),'部署卡面映射与当前卡池不一致');
  const catalog=await readFile(new URL('cards.html',base),'utf8');
  for(const card of expectedCards){
    const relative=CURRENT_ART[card.id],path=resolve(dir,relative);
    assert(path.startsWith(resolve(dir)+sep)&&/^art\/[a-z0-9_]+\.(webp|png)$/.test(relative),`${card.name}部署图必须位于版本目录内`);
    const bytes=await readFile(path);
    const valid=relative.endsWith('.webp')?bytes.length>=20&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP':bytes.length>=33&&bytes.toString('hex',0,8)==='89504e470d0a1a0a';
    assert(valid,`${card.name}部署图片格式无效`);
    assert(catalog.includes(`${card.name}完整卡面`)&&catalog.includes(relative),`${card.name}未正确列入部署图鉴`);
  }
  return {version,cards:expectedCards.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const result=await checkDeploy();console.log(`部署资源检查通过：${result.version}，${result.cards}种卡牌、数据、卡面与图鉴一致。`);
}
