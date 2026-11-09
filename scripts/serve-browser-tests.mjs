// Serve only the repository's deploy artifact, including its real Pages subpath.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../deploy/',import.meta.url));
const prefix='/hengchao-beasts/';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(!pathname.startsWith(prefix)){res.writeHead(404);res.end('Not found');return;}
    const file=resolve(root,pathname.slice(prefix.length)||'index.html');
    if(!file.startsWith(resolve(root)+sep)||!(await stat(file)).isFile())throw new Error('Not found');
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('Not found');}
});
const port=Number(process.env.BROWSER_TEST_PORT||4173);
server.listen(port,'127.0.0.1',()=>console.log(`Browser smoke: http://127.0.0.1:${port}${prefix}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
