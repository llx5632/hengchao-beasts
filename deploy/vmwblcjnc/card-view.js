import { BEATS, skillText } from './data.js';
import { esc, btn } from './ui.js';

export function cardInfo(c){return `<div class="card-reading"><div class="eyebrow">${c.tier} · ${c.element}属性 · 克制${BEATS[c.element]}</div><h3>${c.name}</h3><p>基础 HP <b>${c.hp}</b> · 基础撤退 <b>${c.retreat}</b><br>身高 ${c.height}m · 体重 ${c.weight}kg</p><div class="reading-skills">${c.skills.map(s=>`<div><strong>${s.name}</strong><p>${skillText(s)}</p></div>`).join('')}</div><p class="story-text">${c.story}</p></div>`;}
export function card(c,{instance=null,selected=false,details=false}={}){
  const tag=instance?'button':'article',artTag=instance?'div':'button';
  return `<${tag} class="beast-card ${selected?'selected':''}" data-element="${c.element}" ${instance?`data-action="choose-card" data-instance="${esc(instance)}" aria-pressed="${selected}" aria-label="选择 ${c.name}"`:''}>
    <div class="card-title"><b>${c.name}</b><span class="element">${c.element}</span></div>
    <${artTag} class="illustration ${c.art?'has-art':''}" ${instance?'':`data-action="zoom" data-card="${c.id}" aria-label="查看${c.name}插画大图"`}>${c.art?`<img src="${c.art}" alt="${c.name}谱印插画">`:`<span class="sigil">${c.name.slice(-1)}</span>`}<span class="art-note">${c.art?'谱印插画':'图鉴谱印'}</span></${artTag}>
    ${selected?'<span class="selection-mark">✓</span>':''}
    <div class="card-stats"><span>基础 HP<strong>${c.hp}</strong></span><span>基础撤退<strong>${c.retreat}</strong></span></div>
    <div class="card-meta"><span>${c.tier} · 克制${BEATS[c.element]}</span><span>${c.height}m / ${c.weight}kg</span></div>
    ${details?`<div class="card-skills">${c.skills.map(s=>`<div><b>${s.name}</b>　${skillText(s)}</div>`).join('')}</div><p class="story">${c.story}</p>${btn('放大完整卡面','zoom','card-source ghost small',`data-card="${c.id}" aria-label="放大${c.name}完整卡面"`)}`:''}
  </${tag}>`;
}
export function playedCard(c){return `<button class="played-card" data-action="zoom" data-card="${c.id}" aria-label="放大${c.name}完整卡面"><img src="${c.art}" alt="${c.name}完整卡面" width="1024" height="1536"><span class="zoom-hint">⊕ 点击放大</span></button>`;}
