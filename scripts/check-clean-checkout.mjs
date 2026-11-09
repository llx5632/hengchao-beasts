// Reproduce CI before pushing: copy only publishable repository files, no GDD art.
import {cp,mkdtemp,readdir,rm,stat} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {publishPaths} from './publish.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),prefix='hengchao-ci-',temp=await mkdtemp(join(tmpdir(),prefix));
const browser=process.argv.includes('--browser');
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
  if(browser){
    if(!process.env.npm_execpath)throw new Error('请通过 npm.cmd run check:clean:browser 调用，以使用当前npm安装锁定依赖。');
    for(const args of [[process.env.npm_execpath,'ci','--no-audit','--no-fund'],['scripts/check-browser.mjs']]){
      const result=spawnSync(process.execPath,args,{cwd:temp,env:{...process.env,CI:'true'},stdio:'inherit'});
      if(args[0]==='scripts/check-browser.mjs')await cp(join(temp,'browser-results'),join(root,'browser-results','clean'),{recursive:true})
        .catch(error=>{if(error.code!=='ENOENT')throw error;});
      if(result.error)throw result.error;
      if(result.status!==0)throw new Error(`隔离浏览器检查失败（退出码${result.status}），未提交或推送。`);
    }
  }
  console.log('干净检出检查通过：仅发布范围内文件，无仓库外原图、deploy-art或QA资料依赖。');
}finally{
  // Only remove the unique temporary directory created above, within OS temp.
  if(dirname(resolve(temp))!==resolve(tmpdir())||!basename(temp).startsWith(prefix))throw new Error('临时清理路径超出预期');
  await rm(temp,{recursive:true,force:true});
}
