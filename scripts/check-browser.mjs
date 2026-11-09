import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkDeploy} from './check-deploy.mjs';

let cli;
try{cli=fileURLToPath(import.meta.resolve('@playwright/test/cli'));}
catch{throw new Error('浏览器检查需要开发依赖：先运行 npm.cmd ci，再运行 npx.cmd playwright install chromium。');}
await checkDeploy();
const result=spawnSync(process.execPath,[cli,'test',...process.argv.slice(2)],{
  cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit',env:process.env,
});
if(result.error)throw result.error;
process.exitCode=result.status??1;
