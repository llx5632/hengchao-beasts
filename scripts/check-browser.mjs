import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkDeploy} from './check-deploy.mjs';

let cli;
try{cli=fileURLToPath(import.meta.resolve('@playwright/test/cli'));}
catch{throw new Error('浏览器检查需要开发依赖：先运行 npm.cmd ci，再运行 npx.cmd playwright install chromium。');}
await checkDeploy();
// Launch Node directly so Windows does not require cmd.exe to start the server.
const cwd=fileURLToPath(new URL('../',import.meta.url));
const server=spawn(process.execPath,['scripts/serve-browser-tests.mjs'],{cwd,env:process.env,stdio:['ignore','pipe','inherit']});
try{
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('浏览器测试服务启动超时')),10000);
    const ready=()=>{clearTimeout(timeout);resolve();};
    server.stdout.once('data',ready);
    server.once('error',error=>{clearTimeout(timeout);reject(error);});
    server.once('exit',code=>{clearTimeout(timeout);reject(new Error(`浏览器测试服务提前退出（${code}）`));});
  });
  const result=spawnSync(process.execPath,[cli,'test',...process.argv.slice(2)],{
    cwd,stdio:'inherit',env:{...process.env,BROWSER_TEST_SERVER_MANAGED:'1'},
  });
  if(result.error)throw result.error;
  process.exitCode=result.status??1;
}finally{
  if(server.pid&&server.exitCode===null){
    server.kill();
    await new Promise(resolve=>server.once('exit',resolve));
  }
}
