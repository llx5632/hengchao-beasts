// Reproduce CI before pushing: copy only publishable repository files, no GDD art.
import {cp,mkdtemp,readdir,rm,stat} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {publishPaths} from './publish.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),prefix='hengchao-ci-',temp=await mkdtemp(join(tmpdir(),prefix));
try{
  for(const path of publishPaths){
    const source=join(root,path);
    if(await stat(source).catch(e=>{if(e.code==='ENOENT')return null;throw e;}))await cp(source,join(temp,path),{recursive:true});
  }
  const tests=(await readdir(join(temp,'test'))).filter(f=>f.endsWith('.test.mjs')).map(f=>join('test',f));
  for(const args of [['--test',...tests],['scripts/check-deploy.mjs']]){
    const result=spawnSync(process.execPath,args,{cwd:temp,env:{...process.env,CI:'true'},stdio:'inherit'});
    if(result.error)throw result.error;
    if(result.status!==0)throw new Error(`干净检出检查失败（退出码${result.status}）；尚未提交或推送。`);
  }
  console.log('干净检出检查通过：仅发布范围内文件，无仓库外原图、deploy-art或QA资料依赖。');
}finally{
  // Only remove the unique temporary directory created above, within OS temp.
  if(dirname(resolve(temp))!==resolve(tmpdir())||!basename(temp).startsWith(prefix))throw new Error('临时清理路径超出预期');
  await rm(temp,{recursive:true,force:true});
}
