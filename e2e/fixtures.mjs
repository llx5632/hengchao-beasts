import {test as base,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

// Seed saves with the actual deployment's engine, not a second set of fixtures/rules.
const entry=await readFile(new URL('../deploy/index.html',import.meta.url),'utf8');
const version=entry.match(/<base href="\.\/(v[a-z0-9]+)\/">/)?.[1];
if(!version)throw new Error('请先生成并检查deploy部署包');
const deployed=new URL(`../deploy/${version}/`,import.meta.url);
export const {freshSession,SAVE_KEY,createLocalMatch}=await import(new URL('session.js',deployed));
export const {dispatch}=await import(new URL('engine.js',deployed));
export const {CARDS,CARD}=await import(new URL('data.js',deployed));

export const test=base.extend({
  page:async({page},use)=>{
    const failures=[];
    page.on('pageerror',error=>failures.push(error.message));
    page.on('console',message=>{if(message.type()==='error')failures.push(message.text());});
    page.on('response',response=>{if(response.status()>=400)failures.push(`${response.status()} ${response.url()}`);});
    page.on('requestfailed',request=>failures.push(`${request.url()}: ${request.failure()?.errorText}`));
    // Offline smoke: accidental remote dependencies fail instead of leaking into a site test.
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='127.0.0.1')return route.continue();
      failures.push(`非本地请求：${url.origin}`);return route.abort();
    });
    await use(page);
    expect(failures,'浏览器控制台、网络与资源检查').toEqual([]);
  },
});
export {expect};

export function session(){
  const value=freshSession();value.tutorial={version:1,status:'skipped'};return value;
}
export async function openSession(page,value=session()){
  await page.addInitScript(({key,value})=>{
    // Seed once per test context; a reload must read the UI's actual saved result.
    if(!sessionStorage.getItem('smoke-seeded')){
      localStorage.setItem(key,JSON.stringify(value));sessionStorage.setItem('smoke-seeded','1');
    }
    Math.random=()=>0.999;
  },{key:SAVE_KEY,value});
  await page.goto('./');
}
export async function saved(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);}
export async function noOverflow(page){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'页面不应横向溢出').toBe(true);
}
export async function loadedImages(page,selector='img'){
  const images=page.locator(selector);
  await expect(images.first()).toBeVisible();
  await expect.poll(()=>images.evaluateAll(imgs=>imgs.every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
}
export function battleSession(actor=0){
  const value=session();let match=createLocalMatch('battle',value.players);
  for(const player of [0,1])match=dispatch(match,{type:'select',player,ids:[value.players[player].cards.find(c=>c.cardId===['lujia','liejing'][player]).id]});
  match=dispatch(match,{type:'advance'});
  for(const player of [0,1])match=dispatch(match,{type:'rps',player,value:player===actor?'rock':'scissors'});
  value.match=dispatch(match,{type:'advance'});return value;
}
