import { CARDS, CARD, ELEMENTS } from './data.js';
import { btn } from './ui.js';
import { card } from './card-view.js';

export function renderCatalog({isCollection,players,owner,filter}){
  const name=p=>players[p].name;
  const instances=isCollection?players[owner].cards:null;
  const cards=isCollection?instances.map(i=>({card:CARD[i.cardId],instance:i})):CARDS.map(card=>({card}));
  const visible=cards.filter(({card:c})=>filter==='全部'||c.element===filter);
  return `<main class="wrap"><div class="section-heading"><div><div class="eyebrow">${isCollection?'YOUR FIELD COLLECTION':'BESTIARY · ISLAND ENCOUNTERS'}</div><h2>${isCollection?'我的谱印收藏':'群岛异兽图鉴'}</h2></div><span class="subtle">${isCollection?instances.length:CARDS.length} 张${isCollection?'持有卡牌':'可用谱印'}</span></div>
    <div class="toolbar">${isCollection?[0,1].map(p=>btn(name(p),'owner',owner===p?'small':'ghost small',`data-player="${p}"`)).join(''):''}${['全部',...ELEMENTS].map(e=>`<button class="filter ${filter===e?'active':''}" data-action="filter" data-value="${e}">${e}</button>`).join('')}</div>
    ${!isCollection?'<div class="banner">高低阶与数值依据异兽的背景、体型和能力设计。点击插画或下方放大按钮可查看完整卡面。<a href="/cards.html" target="_blank" rel="noopener">打开全部卡面总览 ↗</a></div>':''}
    <div class="collection-grid">${visible.map(({card:c})=>card(c,{details:true})).join('')}</div>${!visible.length?'<p class="empty">这个属性暂时没有持有卡牌。</p>':''}</main>`;
}
