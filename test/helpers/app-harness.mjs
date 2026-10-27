import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as data from '../../dist/data.js';
import * as engine from '../../dist/engine.js';
import * as session from '../../dist/session.js';
import * as ai from '../../dist/ai.js';
import * as flow from '../../dist/flow.js';
import * as selection from '../../dist/selection.js';
import * as combat from '../../dist/combat.js';
import * as roster from '../../dist/roster.js';

// Run the real UI handlers with an isolated storage adapter and clock.
// Only details/dialog behavior used by these regressions is represented here;
// layout and normal interaction are checked separately in the browser.
const source=(await readFile(new URL('../../dist/app.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
export function appHarness(saved=null) {
  const listeners={},timers=new Map(),nodes=new Map(),storage=new Map();
  if(saved)storage.set(session.SAVE_KEY,JSON.stringify(saved));
  let sequence=0,blocked=false,html='',renders=0;
  const toast={style:{}},input={value:'测试阵容'};
  const dialog=()=>({open:false,showModal(){this.open=true;},close(){this.open=false;}});
  const dialogs=[dialog(),dialog()];
  const status={textContent:''};
  const app={get innerHTML(){return html;},set innerHTML(value){
    html=value;renders++;
    for(const node of nodes.values())node.isConnected=false;
    nodes.clear();
    for(const [,attributes] of value.matchAll(/<details\b([^>]*)>/g)){
      const classes=attributes.match(/class="([^"]+)"/)?.[1].split(/\s+/)??[];
      const node={open:/\bopen(?:\s|$|=)/.test(attributes),isConnected:true,matches(selector){return selector.split(',').some(s=>classes.includes(s.trim().slice(1)));}};
      for(const cls of classes)nodes.set(`.${cls}`,node);
    }
  }};
  const document={hidden:false,querySelector(selector){
    const fixed={'#app':app,'#toast':toast,'#dialog':dialogs[0],'#card-dialog':dialogs[1],'#preset-name':input};
    if(selector in fixed)return fixed[selector];
    if(selector==='dialog[open], .log[open], .lineup-reference[open]')return dialogs.find(d=>d.open)??['.log','.lineup-reference'].map(s=>nodes.get(s)).find(n=>n?.open)??null;
    if(selector==='.flow-controls [role="status"]')return html.includes('class="flow-controls"')?status:null;
    return nodes.get(selector)??null;
  },querySelectorAll(){return [];},addEventListener(name,handler){listeners[name]=handler;}};
  const context=vm.createContext({...data,...engine,...session,...ai,...flow,...selection,...combat,...roster,
    structuredClone,crypto,console,document,
    localStorage:{getItem:key=>storage.get(key)??null,setItem(key,value){if(blocked)throw new Error('QuotaExceededError');storage.set(key,value);}},
    setTimeout(callback,delay){const id=++sequence;timers.set(id,{callback,delay});return id;},clearTimeout(id){timers.delete(id);},
    window:{scrollTo(){}},matchMedia(){return {matches:false};}
  });
  vm.runInContext(source,context);
  return {
    run:code=>vm.runInContext(code,context),context,document,app,toast,input,dialog:dialogs[0],storage,status,
    get renders(){return renders;},get delays(){return [...timers.values()].map(t=>t.delay);},
    blockStorage(value=true){blocked=value;},
    click(action,extra={}){listeners.click({target:{closest:()=>({dataset:{action,...extra}})}});},
    toggle(selector,open){const target=nodes.get(selector);if(!target)throw new Error(`Missing ${selector}`);target.open=open;listeners.toggle({target});return target;},
    visibility(hidden){document.hidden=hidden;listeners.visibilitychange();}
  };
}
