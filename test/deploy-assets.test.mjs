import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {checkDeploy} from '../scripts/check-deploy.mjs';

async function fixture(t,{missing=false,stale=false}={}){
  const dir=await mkdtemp(join(tmpdir(),'hengchao-assets-'));
  t.after(async()=>{assert.equal(dirname(resolve(dir)),resolve(tmpdir()));assert(basename(dir).startsWith('hengchao-assets-'));await rm(dir,{recursive:true,force:true});});
  await mkdir(join(dir,'vtest/art'),{recursive:true});
  const card={id:'jiejing',name:'截径棘虎',hp:145,art:'art/jiejing.png'};
  await writeFile(join(dir,'package.json'),JSON.stringify({type:'module'}));
  await writeFile(join(dir,'index.html'),'<base href="./vtest/">');
  await writeFile(join(dir,'vtest/card-art.js'),`export const CURRENT_ART={jiejing:'art/jiejing.png'};`);
  await writeFile(join(dir,'vtest/data.js'),`export const CARDS=${JSON.stringify([{...card,hp:stale?140:145}])};`);
  await writeFile(join(dir,'vtest/cards.html'),'<img src="art/jiejing.png" alt="截径棘虎完整卡面">');
  if(!missing)await writeFile(join(dir,'vtest/art/jiejing.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'));
  return [pathToFileURL(dir+'/'),[card]];
}
test('部署校验在无仓库外资产的独立目录运行',async t=>{
  assert.deepEqual(await checkDeploy(...await fixture(t)),{version:'vtest',cards:1});
});
test('部署缺图时明确失败，不能继续发布',async t=>{
  await assert.rejects(checkDeploy(...await fixture(t,{missing:true})),{code:'ENOENT'});
});
test('部署数据过期时明确失败，要求重新构建',async t=>{
  await assert.rejects(checkDeploy(...await fixture(t,{stale:true})),/部署数据与当前源码不一致/);
});
