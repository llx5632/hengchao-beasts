import { CARDS, CARD, BEATS, ELEMENTS, METRICS, POINT_NUMBERS, pointMetricIndex, skillText } from './data.js';
import { dispatch, expectedPlayers, aiAction, randomInt } from './engine.js';
import { SAVE_KEY, freshSession, createLocalMatch, upgradeSession } from './session.js';
import { DIFFICULTIES, normalizeDifficulty } from './ai.js';
import { scheduledStep } from './flow.js';
import { SELECTION_SORTS, selectionCards, selectionSummary } from './selection.js';
import { previewSkill, battleEndedBySurrender, combatStatuses, resolveCombatAction } from './combat.js';
import { selectionDraft, normalizePresets, createPreset, resolvePreset, canLeaveSelection } from './roster.js';
import { newTutorial, normalizeTutorial, beginTutorialLesson, tutorialAction } from './tutorial.js';
import { renderTutorial } from './tutorial-ui.js';
import { EASTER_EGG_MESSAGES, FIREWORKS_DURATION, normalizeEasterEgg, unlockEasterEgg, nextEasterEgg, fireworksMarkup } from './easter-egg.js';

const KEY=SAVE_KEY, app=document.querySelector('#app');
const fresh=freshSession;
let store,hadSavedSession=false;
try { const saved=JSON.parse(localStorage.getItem(KEY)); hadSavedSession=saved?.version === 2 && saved.players?.length === 2;store=hadSavedSession?saved:fresh(); } catch { store=fresh(); }
const sessionUpdated=upgradeSession(store);
store.difficulty=normalizeDifficulty(store.difficulty);
store.autoAdvance=store.autoAdvance!==false;
store.battleCompact=store.battleCompact!==false;
store.lineupPresets=normalizePresets(store.lineupPresets);
store.selectionDrafts=store.selectionDrafts&&typeof store.selectionDrafts==='object'&&!Array.isArray(store.selectionDrafts)?store.selectionDrafts:{};
store.tutorial=normalizeTutorial(store.tutorial,!hadSavedSession);
store.easterEgg=normalizeEasterEgg(store.easterEgg);
if(store.match)store.match.difficulty=normalizeDifficulty(store.match.difficulty);
let route=store.match&&!(store.selectionLobby&&canLeaveSelection(store.match)) ? 'match' : 'home', draft=selectionDraft(store.match), filter='全部', owner=0, timer=null, toastTimer=null, previewCardId=null, paused=false;
let selectionElement='全部',selectionSort='default',selectionAscending=false,selectedOnly=false,draftOverviewOpen=false;
let presetsOpen=false,draftNotice=draft.length?'已恢复上次未封存的选卡。':'';
let storageFailed=false,readingOpen={log:false,lineup:false};
let eggTimer=null,eggAdvanceAt=0;
if(store.tutorial.status==='active')route='tutorial';
const name=p => store.players[p].name;
const esc=value => String(value).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=(text,action,cls='',attrs='') => `<button class="btn ${cls}" data-action="${action}" ${attrs}>${text}</button>`;
function save(){try{localStorage.setItem(KEY,JSON.stringify(store));storageFailed=false;return true;}catch{storageFailed=true;toast('存档未能写入浏览器，当前修改仅保留在本页，刷新可能丢失。');return false;}}
function saveDraft(){store.match.selectionDraft=[...draft];store.selectionDrafts[store.match.mode]=[...draft];return save();}
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.style.display='none',4200);}
function modal(title,body,action=null,label='确定'){
  const d=document.querySelector('#dialog');
  d.innerHTML=`<h2 id="dialog-title">${title}</h2>${body}<div class="dialog-actions">${btn(action?'取消':'知道了','close-dialog','ghost')}${action?btn(label,action):''}</div>`;
  d.showModal();
  scheduleAI();
}
function welcomeTutorial(){
  const d=document.querySelector('#dialog');
  d.innerHTML=`<div class="tutorial-welcome"><span class="crest" aria-hidden="true">✦</span><div class="eyebrow">欢迎来到衡潮群岛</div><h2 id="dialog-title">你的第一张谱印，<br>从这里开始</h2><p>这是一款原创异兽卡牌收集与对战游戏。在受“衡潮”影响的群岛上，你将作为探索者，用记录异兽属性、技能与体型的卡牌——“谱印”，与教学 AI 练习，再挑战正式对局。</p><div class="tutorial-intro-modes" aria-label="同一套谱印，两种玩法"><section><h3>战斗模式 · 相性决斗</h3><p>各选一张谱印，先看属性克制，再以猜拳争取进攻或撤退的机会。低阶异兽也有机会战胜高阶对手。</p></section><section><h3>拼点模式 · 衡量试炼</h3><p>各选五张谱印，秘密出点决定比较项目。HP、伤害、身高、体重都能成为优势，用自己的强项对抗对方的弱项。</p></section></div><p class="tutorial-intro-stakes"><strong>赢取谱印，也要懂得保住它。</strong>正式对局会按规则赢取或失去出战谱印，逐渐改变你的收藏。</p><div class="tutorial-safe-note"><strong>接下来，先安心练习</strong><p>按顺序体验属性克制、进攻与撤退、拼点强弱项。教学使用独立卡牌，不会改变你的正式收藏与已有对局；可以随时暂停，之后从大厅继续或重温。</p></div><div class="dialog-actions">${btn('暂不学习','tutorial-skip','ghost')}${btn('开始新手教程','tutorial-begin','','autofocus')}</div></div>`;
  d.showModal();scheduleAI();
}
function openTutorial(){
  if(store.match?.status==='active'&&!canLeaveSelection(store.match))return toast('请先完成当前正式对局，再重温教程。');
  if(store.tutorial.status==='paused'){store.tutorial.status='active';route='tutorial';save();render();window.scrollTo(0,0);return;}
  store.tutorial=newTutorial();route='home';save();render();welcomeTutorial();
}
function sendTutorial(action){
  try{
    store.tutorial=tutorialAction(store.tutorial,action);
    route=store.tutorial.status==='completed'?'home':'tutorial';save();render();
    if(action.type!=='choose'){window.scrollTo(0,0);document.querySelector('#tutorial-heading')?.focus({preventScroll:true});}
    if(store.tutorial.status==='completed')toast('新手教程已完成，正式收藏保持不变。可以开始自己的对局了。');
  }catch(error){toast(error.message);}
}
function scheduleEggFireworks(){
  clearTimeout(eggTimer);
  if(store.easterEgg?.status==='fireworks'&&!document.hidden&&document.querySelector('#easter-egg-dialog').open)eggTimer=setTimeout(finishEasterEgg,FIREWORKS_DURATION);
}
function showEasterEgg(){
  const egg=store.easterEgg,d=document.querySelector('#easter-egg-dialog');
  if(!egg||!['active','fireworks'].includes(egg.status))return;
  clearTimeout(eggTimer);
  d.className=egg.status==='fireworks'?'egg-fireworks-dialog':'';
  d.innerHTML=egg.status==='fireworks'?`<div class="egg-sky" aria-hidden="true">${fireworksMarkup()}</div><div class="egg-celebration"><h2 id="egg-message">谢谢你玩这个游戏</h2><p>愿你在衡潮群岛，继续遇见喜欢的异兽。</p>${btn('回到对局','egg-finish','ghost','autofocus')}</div>`:`<button class="egg-message-card ${egg.step===4?'is-letter':''}" data-action="egg-next" data-step="${egg.step}" autofocus><span class="egg-seal" aria-hidden="true">✦</span><span id="egg-message" class="egg-message-copy">${EASTER_EGG_MESSAGES[egg.step]}</span><span class="egg-click-hint">${egg.step===4?'点击弹窗，收下这份感谢':'点击弹窗，继续看看'} · 也可按 Enter 或空格</span></button><div class="egg-dialog-footer"><button class="egg-later" data-action="egg-pause">稍后继续</button></div>${storageFailed?'<p class="egg-save-note">当前进度未能写入浏览器，刷新可能丢失；稍后可重试保存。</p>':''}`;
  if(!d.open)d.showModal();
  document.querySelector('#easter-egg-dialog [autofocus]')?.focus({preventScroll:true});
  eggAdvanceAt=Date.now()+250;
  scheduleAI();scheduleEggFireworks();
}
function maybeOpenEasterEgg(){
  if(route==='tutorial'||store.tutorial.status==='welcome'||document.hidden)return;
  const egg=unlockEasterEgg(store);
  if(egg!==store.easterEgg){store.easterEgg=egg;save();}
  if(!egg||!['active','fireworks'].includes(egg.status))return;
  const d=document.querySelector('#easter-egg-dialog'),other=document.querySelector('dialog[open]');
  if(other&&other!==d)return;
  showEasterEgg();
}
function pauseEasterEgg(){
  clearTimeout(eggTimer);if(!store.easterEgg)return;
  store.easterEgg.status='paused';save();document.querySelector('#easter-egg-dialog').close();render();
}
function finishEasterEgg(){
  clearTimeout(eggTimer);if(store.easterEgg?.status!=='fireworks')return;
  store.easterEgg={...store.easterEgg,status:'completed',step:5};save();document.querySelector('#easter-egg-dialog').close();render();
}
function cardInfo(c){return `<div class="card-reading"><div class="eyebrow">${c.tier} · ${c.element}属性 · 克制${BEATS[c.element]}</div><h3>${c.name}</h3><p>基础 HP <b>${c.hp}</b> · 基础撤退 <b>${c.retreat}</b><br>身高 ${c.height}m · 体重 ${c.weight}kg</p><div class="reading-skills">${c.skills.map(s=>`<div><strong>${s.name}</strong><p>${skillText(s)}</p></div>`).join('')}</div><p class="story-text">${c.story}</p></div>`;}
function openCard(id){
  const c=CARD[id];if(!c)return;
  const d=document.querySelector('#card-dialog');
  d.innerHTML=`<header class="viewer-head"><div><div class="eyebrow">完整卡面 · 可滚动查看</div><h2 id="card-dialog-title">${c.name}</h2></div>${btn('关闭卡面','close-card','ghost small','autofocus')}</header><div class="viewer-body"><img src="/art/${encodeURIComponent(c.art)}" alt="${c.name}完整卡面" width="1024" height="1536">${cardInfo(c)}</div>`;
  d.showModal();scheduleAI();
}
function card(c,{instance=null,selected=false,details=false}={}){
  const tag=instance?'button':'article',artTag=instance?'div':'button';
  return `<${tag} class="beast-card ${selected?'selected':''}" data-element="${c.element}" ${instance?`data-action="choose-card" data-instance="${esc(instance)}" aria-pressed="${selected}" aria-label="选择 ${c.name}"`:''}>
    <div class="card-title"><b>${c.name}</b><span class="element">${c.element}</span></div>
    <${artTag} class="illustration ${c.art?'has-art':''}" ${instance?'':`data-action="zoom" data-card="${c.id}" aria-label="查看${c.name}插画大图"`}>${c.art?`<img src="/art/${encodeURIComponent(c.art)}" alt="${c.name}谱印插画">`:`<span class="sigil">${c.name.slice(-1)}</span>`}<span class="art-note">${c.art?'谱印插画':'图鉴谱印'}</span></${artTag}>
    ${selected?'<span class="selection-mark">✓</span>':''}
    <div class="card-stats"><span>基础 HP<strong>${c.hp}</strong></span><span>基础撤退<strong>${c.retreat}</strong></span></div>
    <div class="card-meta"><span>${c.tier} · 克制${BEATS[c.element]}</span><span>${c.height}m / ${c.weight}kg</span></div>
    ${details?`<div class="card-skills">${c.skills.map(s=>`<div><b>${s.name}</b>　${skillText(s)}</div>`).join('')}</div><p class="story">${c.story}</p>${btn('放大完整卡面','zoom','card-source ghost small',`data-card="${c.id}" aria-label="放大${c.name}完整卡面"`)}`:''}
  </${tag}>`;
}
function playedCard(c){return `<button class="played-card" data-action="zoom" data-card="${c.id}" aria-label="放大${c.name}完整卡面"><img src="/art/${encodeURIComponent(c.art)}" alt="${c.name}完整卡面" width="1024" height="1536"><span class="zoom-hint">⊕ 点击放大</span></button>`;}
function stateChange(last,field,player){if(!last?.before||!last.after)return '';const before=last.before[field][player],after=last.after[field][player],delta=after-before;if(!delta)return '';const good=field==='hp'?delta>0:delta<0;return `<span class="state-delta ${good?'benefit':'cost'}">${delta>0?'+':''}${delta}</span>`;}
function battleState(c,state,player,showChanges=false){const last=showChanges?state.last:null;return `<div class="battle-state"><p><span>${name(player)} · 剩余 HP</span><b>${state.hp[player]} / ${c.hp} ${stateChange(last,'hp',player)}</b></p><div class="hp-track"><div class="hp-fill" style="width:${state.hp[player]/c.hp*100}%"></div></div><p><span>本局剩余撤退</span><b>${state.remaining[player]} ${stateChange(last,'remaining',player)}</b></p>${store.match?.status==='active'?battleStatusView(state,player):''}</div>`;}
function hiddenCard(){return '<div class="hidden-card"><span class="crest">✦</span><p>衡潮谱印</p><small>对方卡牌尚未公开</small></div>';}
function header(){const active=store.match?.status==='active'&&!canLeaveSelection(store.match);return `<header class="topbar"><button class="brand" data-action="home"><span class="crest">✦</span><span><strong>衡潮群岛</strong><small>THE TIDEBORNE ARCHIPELAGO</small></span></button><nav class="nav" aria-label="主导航"><button data-action="home" class="${route==='home'||route==='match'?'active':''}">${active?'当前对局':'对局大厅'}</button><button data-action="codex" class="${route==='codex'?'active':''}">异兽图鉴</button><button data-action="collection" class="${route==='collection'?'active':''}">我的收藏</button><button data-action="help">规则</button></nav><span class="edition">玩家对 AI · 本地首版</span></header>`;}
function footer(){return '<footer class="footer"><span>衡潮群岛 / 原创异兽卡牌</span><span>本地浏览器保存 · 数值为候选设计 · 抽卡后续开放</span></footer>';}
function difficultyPicker(){return `<fieldset class="difficulty-picker"><legend>对手难度</legend><div class="difficulty-options">${Object.entries(DIFFICULTIES).map(([value,option])=>`<label class="difficulty-option ${store.difficulty===value?'selected':''}"><input type="radio" name="difficulty" value="${value}" data-action="difficulty" ${store.difficulty===value?'checked':''}><span><strong>${option.label}</strong><small>${option.description}</small></span></label>`).join('')}</div><p>开局前选择，整场使用同一难度。</p></fieldset>`;}
function home(){
  const a=store.players[0].cards.length,b=store.players[1].cards.length,pending=canLeaveSelection(store.match);
  return `${store.releaseNotice?`<div class="banner" role="status">${esc(store.releaseNotice)} ${btn('知道了','dismiss-release','ghost small')}</div>`:''}<section class="hero"><div class="hero-inner"><div><div class="eyebrow">FIELD NOTES · VOLUME 01</div><h1>与异兽相遇<br>在衡潮之间</h1><p>群岛随潮而变，谱印记录万物。选择你的异兽，以相性决斗争夺行动权，或在衡量试炼中一较高下。</p><div class="tagline"><span>五种自然属性</span><span>原创异兽谱印</span><span>两种对决</span></div></div><div class="fan" aria-label="三张已认可的概念卡"><img src="/art/${encodeURIComponent(CARD.tanling.art)}" alt="炭铃概念卡"><img src="/art/${encodeURIComponent(CARD.xuanjiao.art)}" alt="旋角羚概念卡"><img src="/art/${encodeURIComponent(CARD.fuchao.art)}" alt="负潮巨鳖概念卡"><span class="fan-caption">奇幻自然志 · 原创异兽谱印</span></div></div></section>
  <main class="wrap"><div class="section-heading"><div><div class="eyebrow">CHOOSE YOUR ENCOUNTER</div><h2>开启一场对决</h2></div><span class="subtle">玩家对 AI · 秘密提交，同时揭晓</span></div>
  ${pending?`<div class="banner selection-resume"><span>${store.match.mode==='point'?'拼点':'战斗'}选卡尚未封存，已保留 ${draft.length} 张选择，可继续选卡或切换模式。</span>${btn('继续选卡','resume-selection','small')}</div>`:''}${difficultyPicker()}<div class="modes"><article class="mode"><span class="number">01</span><div class="mode-kicker">相性决斗 / BATTLE</div><h3>一张谱印，一次交锋</h3><p>属性克制直接获胜。互不克制时，猜拳争夺行动权，选择技能进攻，或逐步撤退。</p><div class="mode-footer"><small class="subtle">各出战 1 张 · 胜者收卡</small>${btn('进入战斗　↗','start-battle','',!a||!b?'disabled':'')}</div></article>
  <article class="mode"><span class="number">02</span><div class="mode-kicker">衡量试炼 / POINT DUEL</div><h3>五次相逢，六种较量</h3><p>先公开双方五张阵容，再分别打乱。秘密选点，以总和决定比较项目。平手后亮牌，再次选点决胜。</p><div class="mode-footer"><small class="subtle">各出战 5 张 · 五小局</small>${btn('进入拼点　↗','start-point','',a<5||b<5?'disabled':'')}</div></article></div>
  <div class="player-strip">${store.players.map((p,i)=>`<div><strong>${p.name}</strong><span>${p.cards.length>=5?'可参加拼点':'不足五张，暂不可拼点'}</span></div>`).join('')}</div>
  <p class="footnote">你与 AI 初始均拥有全部可用异兽，每种一张。赢卡与失卡结果保存在当前浏览器。</p>
  <div class="toolbar" style="margin-top:20px">${store.easterEgg?.status==='paused'?btn('继续彩蛋','egg-resume','ghost small'):''}${btn(store.tutorial.status==='paused'?'继续新手教程':store.tutorial.status==='completed'?'重温新手教程':'新手教程','tutorial-open','ghost small')}${store.match?.status==='finished'?btn('查看上一场结果','last-match','ghost small'):''}${btn('恢复全部卡牌','reset','ghost small')}<span class="subtle">恢复后双方重新拥有全套卡牌，方便重复体验。</span></div></main>`;
}
function catalog(){
  const isCollection=route==='collection';
  const instances=isCollection?store.players[owner].cards:null;
  const cards=isCollection?instances.map(i=>({card:CARD[i.cardId],instance:i})):CARDS.map(card=>({card}));
  const visible=cards.filter(({card:c})=>filter==='全部'||c.element===filter);
  return `<main class="wrap"><div class="section-heading"><div><div class="eyebrow">${isCollection?'YOUR FIELD COLLECTION':'BESTIARY · ISLAND ENCOUNTERS'}</div><h2>${isCollection?'我的谱印收藏':'群岛异兽图鉴'}</h2></div><span class="subtle">${isCollection?instances.length:CARDS.length} 张${isCollection?'持有卡牌':'候选卡牌'}</span></div>
    <div class="toolbar">${isCollection?[0,1].map(p=>btn(name(p),'owner',owner===p?'small':'ghost small',`data-player="${p}"`)).join(''):''}${['全部',...ELEMENTS].map(e=>`<button class="filter ${filter===e?'active':''}" data-action="filter" data-value="${e}">${e}</button>`).join('')}</div>
    ${!isCollection?'<div class="banner">高低阶与数值依据异兽的背景、体型和能力设计。点击插画或下方放大按钮可查看完整卡面。<a href="/cards.html" target="_blank" rel="noopener">打开全部卡面总览 ↗</a></div>':''}
    <div class="collection-grid">${visible.map(({card:c})=>card(c,{details:true})).join('')}</div>${!visible.length?'<p class="empty">这个属性暂时没有持有卡牌。</p>':''}</main>`;
}
function scoreboard(m){return `<div class="scoreboard"><div class="player"><strong>${name(0)}</strong><span class="badge">${m.controls[0]==='ai'?'AI 代出':'本地玩家'}</span><small>持有 ${m.inventories[0].length} 张${m.mode==='point'?` · 已胜 ${m.scores[0]} 小局`:''}</small></div><div class="score">${m.mode==='point'?`${m.scores[0]}<span>:</span>${m.scores[1]}`:'VS'}</div><div class="player"><strong>${name(1)}</strong><span class="badge">AI 对手 · ${DIFFICULTIES[normalizeDifficulty(m.difficulty)].label}</span><small>持有 ${m.inventories[1].length} 张${m.mode==='point'?` · 已胜 ${m.scores[1]} 小局`:''}</small></div></div>`;}
function track(m,p=0){return `<div class="round-track">${[0,1,2,3,4].map(i=>{const r=m.rounds[i];return `<div class="round-cell"><small>第 ${i+1} 小局</small><b class="${r?.kind==='win'?(r.winner===p?'win':'loss'):''}">${!r?'—':r.kind==='same'?'＝':r.winner===p?'√':'×'}</b><span>${!r?'未进行':r.kind==='same'?'同卡跳过':r.winner===p?'获胜':'失利'}</span></div>`;}).join('')}</div>`;}
function battleBoard(m){const side=p=>{const c=CARD[m.battle.cards[p]];const visual=store.battleCompact?`<button class="combat-card" data-action="zoom" data-card="${c.id}" aria-label="放大${c.name}完整卡面"><img src="/art/${encodeURIComponent(c.art)}" alt="${c.name}卡面缩略图"><span><strong>${c.name}</strong><small>${c.element} · ${c.tier} · 点击查看完整卡面</small></span></button>`:playedCard(c);return `<div class="battle-combatant">${visual}${battleState(c,m.battle,p,['battle-turn','finished'].includes(m.phase)&&!battleEndedBySurrender(m))}</div>`;};return `<div class="board ${store.battleCompact?'compact-board':''}" aria-label="双方战斗状态">${side(0)}<span class="versus">VS</span>${side(1)}</div>`;}
function pointBoard(m,p,both=false){return `<div class="board">${both||p===0?playedCard(CARD[m.point.cards[0].cardId]):hiddenCard()}<span class="versus">VS</span>${both||p===1?playedCard(CARD[m.point.cards[1].cardId]):hiddenCard()}</div>`;}
function lineupPreview(m){
  const canConfirm=m.controls[0]==='human'&&!m.lineupReady[0];
  return `<section class="lineup-preview"><div class="panel center"><div class="eyebrow">先公开阵容 · 再分别打乱</div><h2>双方五张出战牌已公开</h2><p>出战卡已封存，不能更换。你可以查看、放大双方卡牌，了解各自阵容后再开始。</p><p>下方排列不代表出场顺序；确认后才会洗牌，每小局仍只直接展示自己的当前卡。</p></div>${m.lineups.map((cards,p)=>`<section class="lineup-side" aria-label="${name(p)}的公开阵容"><div class="section-heading"><h3>${name(p)} · 五张出战牌</h3><span class="badge">${m.lineupReady[p]?'已确认':'待确认'}</span></div><div class="lineup-grid">${cards.map(i=>`<figure>${playedCard(CARD[i.cardId])}<figcaption><strong>${CARD[i.cardId].name}</strong><span>${CARD[i.cardId].element} · ${CARD[i.cardId].tier}</span></figcaption></figure>`).join('')}</div></section>`).join('')}<div class="sticky-action"><span>${canConfirm?'确认后分别洗牌，出场顺序保密。':m.lineupReady[0]?'你已确认阵容，等待对方确认。':'AI 正在确认阵容。'}</span>${canConfirm?btn('已了解阵容，打乱并继续','lineup-ready'):''}</div></section>`;
}
function lineupReference(m){
  if(m.mode!=='point'||!m.lineups||m.phase==='lineup-reveal')return '';
  const played=new Set(m.rounds.flatMap(r=>r.cards.map(c=>c.id)));
  return `<details class="lineup-reference" ${readingOpen.lineup?'open':''}><summary>查看公开阵容与已出场卡</summary><p>仅标记已结束小局的出场卡；未结算卡的顺序保持保密。</p>${m.lineups.map((cards,p)=>`<section aria-label="${name(p)}的阵容记录"><h3>${name(p)} · ${cards.filter(c=>!played.has(c.id)).length} 张未结算</h3><div class="lineup-reference-grid">${cards.map(i=>`<button class="lineup-note ${played.has(i.id)?'used':''}" data-action="zoom" data-card="${i.cardId}" aria-label="查看${name(p)}阵容中的${CARD[i.cardId].name}"><strong>${CARD[i.cardId].name}</strong><span>${CARD[i.cardId].element} · ${played.has(i.id)?'已出场':'未结算'}</span></button>`).join('')}</div></section>`).join('')}</details>`;
}
function metricStrip(current=-1){return `<div class="metric-table" aria-label="六个比拼项">${METRICS.map((metric,i)=>`<div class="${i===current?'current':''}"><strong>${i+1}</strong>${metric.name}</div>`).join('')}</div>`;}
const rpsNames={rock:'石头',scissors:'剪刀',paper:'布'};
const rpsGlyphs={rock:'◉',scissors:'✂',paper:'▤'};
function rpsResult(m){
  if(battleEndedBySurrender(m)||!m.rps.every(Boolean))return '';
  const tie=m.rps[0]===m.rps[1],winner=tie?null:m.battle.actor;
  if(store.battleCompact&&['battle-action','battle-turn','finished'].includes(m.phase))return `<div class="rps-inline" role="status"><span>${name(0)} ${rpsGlyphs[m.rps[0]]} ${rpsNames[m.rps[0]]}</span><span>${name(1)} ${rpsGlyphs[m.rps[1]]} ${rpsNames[m.rps[1]]}</span><strong>${tie?'平手':`${name(winner)} 获得行动权`}</strong></div>`;
  return `<div class="rps-reveal" role="status"><div class="rps-hands">${[0,1].map(p=>`<div class="rps-hand ${winner===p?'rps-winner':''}"><small>${name(p)}</small><b aria-hidden="true">${rpsGlyphs[m.rps[p]]}</b><span>${rpsNames[m.rps[p]]}</span><em>${tie?'平手':winner===p?'获胜 · 获得行动权':'未获得行动权'}</em></div>`).join('')}</div><p>${tie?'双方平手，均不行动，重新猜拳。':`${name(winner)} 获得一次行动权，执行一次进攻或撤退。`}</p></div>`;
}
function actionFeedback(m){
  const last=battleEndedBySurrender(m)?null:m.battle?.last;if(!last)return '';
  const changes=last.before&&last.after?[0,1].flatMap(p=>['hp','remaining'].flatMap(field=>{const before=last.before[field][p],after=last.after[field][p];if(before===after)return [];return [`<div><span>${name(p)} · ${field==='hp'?'剩余 HP':'剩余撤退'}</span><strong>${before} → ${after} ${stateChange(last,field,p)}</strong></div>`];})).join(''):'';
  return `<div class="action-feedback" role="status"><strong>${name(last.player)} · ${esc(last.text)}</strong>${changes?`<div class="change-list">${changes}</div>`:''}</div>`;
}
function selectionPreview(m,p){const c=CARD[previewCardId]&&m.inventories[p].some(i=>i.cardId===previewCardId)?CARD[previewCardId]:CARD[m.inventories[p][0].cardId];return `<aside class="selection-preview" aria-label="选卡预览"><div class="eyebrow">出战前预览</div><div class="preview-overview">${playedCard(c)}<div><h3>${c.name}</h3><p>${c.tier} · ${c.element}属性 · 克制${BEATS[c.element]}<br>基础 HP <b>${c.hp}</b><br>基础撤退 <b>${c.retreat}</b><br>${c.height}m / ${c.weight}kg</p></div></div><div class="reading-skills">${c.skills.map(s=>`<div><strong>${s.name}</strong><p>${skillText(s)}</p></div>`).join('')}</div><p class="preview-story">${c.story}</p><small class="subtle">点击卡面可放大；预览不会提交出战卡。</small></aside>`;}
function selectionTools(m,p,visible){
  const hidden=draft.filter(id=>!visible.some(i=>i.id===id)).length;
  return `<section class="selection-tools" aria-label="选卡筛选与排序"><div class="toolbar">${['全部',...ELEMENTS].map(e=>btn(e==='全部'?'全部属性':e,'selection-element',`ghost small ${selectionElement===e?'active':''}`,`data-value="${e}" aria-label="${e==='全部'?'全部属性':`筛选${e}属性`}" aria-pressed="${selectionElement===e}"`)).join('')}</div><div class="selection-sort-row"><label for="selection-sort">排序<select id="selection-sort" data-action="selection-sort">${SELECTION_SORTS.map(o=>`<option value="${o.id}" ${selectionSort===o.id?'selected':''}>${o.label}</option>`).join('')}</select></label>${btn(selectionAscending?'从小到大 ↑':'从大到小 ↓','selection-direction','ghost small',selectionSort==='default'?'disabled':'')}<label class="selection-check"><input type="checkbox" data-action="selection-only" ${selectedOnly?'checked':''}>只看已选</label>${btn('清除筛选','selection-clear','ghost small')}</div><p>显示 ${visible.length} / ${m.inventories[p].length} 张${hidden?` · 已选的 ${hidden} 张被筛选隐藏，仍保留在阵容中`:''}</p></section>`;
}
function draftOverview(m,p,count){
  const summary=selectionSummary(m.inventories[p],draft);
  return `<section class="draft-panel" aria-label="已选阵容"><div class="draft-slots">${Array.from({length:count},(_,i)=>{const instance=summary.cards[i];if(!instance)return `<div class="draft-slot empty-slot"><span>${i+1}</span><small>待选择</small></div>`;const c=CARD[instance.cardId];return `<div class="draft-slot"><button data-action="zoom" data-card="${c.id}" aria-label="查看已选${c.name}完整卡面"><strong>${c.name}</strong><small>${c.element} · HP ${c.hp}</small></button>${btn('移除','remove-draft','ghost small',`data-instance="${esc(instance.id)}" aria-label="移除已选${c.name}（第${i+1}张）"`)}</div>`;}).join('')}</div><details class="draft-overview" ${draftOverviewOpen?'open':''}><summary>阵容概览 · 已选 ${summary.cards.length} / ${count} 张${summary.cards.length?' · 展开对比六项数值':''}</summary>${summary.cards.length?`<p class="draft-elements">${summary.elements.map(e=>`<span>${e.element}属性 ${e.count} 张</span>`).join('')}</p><p class="swipe-hint">可横向滑动查看完整数值</p><div class="draft-table-scroll"><table class="draft-table"><caption class="sr-only">已选卡牌的六项基础数值</caption><thead><tr><th scope="col">已选卡牌</th>${METRICS.map(metric=>`<th scope="col">${metric.name}</th>`).join('')}</tr></thead><tbody>${summary.cards.map(i=>{const c=CARD[i.cardId];return `<tr><th scope="row"><button data-action="zoom" data-card="${c.id}" aria-label="放大阵容中的${c.name}">${c.name}</button></th>${METRICS.map(metric=>`<td>${metric.read(c)}${metric.unit}</td>`).join('')}</tr>`;}).join('')}</tbody></table></div>`:'<p class="subtle">选择出战卡后，可在这里集中对比基础数值。</p>'}</details></section>`;
}
function presetTools(m,p,count){
  const presets=store.lineupPresets.filter(preset=>preset.mode===m.mode);
  return `<section class="preset-tools" aria-label="选卡保存与常用阵容"><div class="preset-save"><p role="status">${draftNotice?`${esc(draftNotice)} `:''}${storageFailed?'当前选择尚未写入存档，请重试保存。':'未封存的选择自动保存，刷新后可恢复。'}</p>${btn('保存为常用阵容','save-preset','ghost small',draft.length===count?'':'disabled')}</div><details class="preset-list" ${presetsOpen?'open':''}><summary>常用阵容 · ${presets.length} 套${m.mode==='battle'?'单卡方案':'五张阵容'}</summary>${presets.length?presets.map(preset=>{const result=resolvePreset(preset,m.inventories[p]);return `<div class="preset-row"><div><strong>${esc(preset.name)}</strong><p>${preset.cardIds.map(id=>CARD[id].name).join(' · ')}</p><small class="${result.missing.length?'preset-missing':''}">${result.missing.length?`缺少 ${result.missing.length} 张：${result.missing.map(id=>CARD[id].name).join('、')}`:'当前持有卡牌齐全'}</small></div><div class="toolbar">${btn(result.missing.length?'载入已有卡':'载入阵容','load-preset','ghost small',`data-preset="${esc(preset.id)}" aria-label="载入${esc(preset.name)}"`)}${btn('删除','delete-preset','ghost small',`data-preset="${esc(preset.id)}" aria-label="删除${esc(preset.name)}"`)}</div></div>`;}).join(''):'<p class="subtle">选齐出战卡后可保存，供之后的同模式对局使用。</p>'}</details></section>`;
}
function battleStatusView(b,p){
  return `<div class="combat-statuses" aria-label="${name(p)}的技能状态">${combatStatuses(b,p).map(s=>`<button class="combat-status ${s.active?'status-active':''}" data-action="battle-status" data-player="${p}" data-kind="${s.id}" aria-label="查看${name(p)}的${s.label}">${s.label}<span aria-hidden="true"> ⓘ</span></button>`).join('')}</div>`;
}
function skillButton(battle,p,skill,index){
  const actual=previewSkill(battle,p,index),b=actual.breakdown,notes=[];
  if(actual.effectSkipped)notes.push('伤害致胜后立即结算，附加效果不再触发。');
  else if(actual.lethal)notes.push('本次可击败对方，结束对局。');
  if(actual.selfDefeat)notes.push('警告：行动后持续伤害会使自己HP归零，判负失卡。');
  if(actual.draw)notes.push('双方持续伤害同时归零，本次判平局，各自保留卡牌。');
  if(skill.effect==='heal'&&!actual.effectSkipped)notes.push(actual.healing===0?'当前已满血，本次回血为 0。':`实际回血 ${actual.healing}`);
  if(skill.effect==='delay'&&!actual.effectSkipped)notes.push(actual.delay===0?'对方剩余撤退已达上限，本次阻退为 0。':`对方剩余撤退＋${actual.delay}`);
  if(skill.effect==='charge'&&!actual.effectSkipped)notes.push(battle.charge?.[p]?'已有蓄势，不叠加。':'获得蓄势：下次裂风突袭＋30。');
  if(skill.effect==='shield'&&!actual.effectSkipped)notes.push(`获得护盾${skill.amount}，下次受击消耗、不叠加。`);
  if(skill.effect==='burst')notes.push(b.bonus?'本次消耗蓄势。':'尚未蓄势，本次基础伤害35。');
  if(skill.effect==='echo')notes.push(battle.echo?.[p]?`回响记录${battle.echo[p]}，取一半向下取整、最多＋30；本次使用后清除。`:'没有受伤记录，本次不追加伤害。');
  if(skill.effect==='desperate')notes.push(battle.hp[p]<=60?'绝境已生效。':'当前HP高于60，绝境未生效。');
  if(skill.effect==='burn'&&!actual.effectSkipped)notes.push(`${battle.burn?.[1-p]?'刷新':'施加'}余烬烙印：之后2次任一方行动结束各受15伤害，不叠加。`);
  if(skill.effect==='mark'&&!actual.effectSkipped)notes.push(battle.mark?.[1-p]===p?'对方已有自己的晶痕，不叠加。':'给对方留下1个晶痕。');
  if(skill.effect==='bite')notes.push(b.bonus?'本次消耗对方晶痕，伤害＋25。':'对方没有自己的晶痕，本次基础伤害40。');
  if(skill.effect==='weaken'&&!actual.effectSkipped)notes.push(`${battle.weaken?.[1-p]?'刷新':'施加'}攻击削弱25%，之后2次进攻，不叠加。`);
  if(skill.effect==='root-strike')notes.push(b.bonus?`本次消耗1次根劲，使用后剩${battle.root[p]-1}次。`:'没有根劲，本次基础伤害45。');
  if(skill.effect==='root'&&!actual.effectSkipped)notes.push(actual.ownRetreatAdded?`自己剩余撤退${battle.remaining[p]} → ${actual.ownRetreat}，获得2次根劲。`:battle.root?.[p]?'已有根劲，不刷新、不重复增加撤退。':'自己剩余撤退已达5，本次无法蓄能，仅造成伤害。');
  for(const q of [0,1])if(actual.burnDamage[q])notes.push(`${name(q)}行动末烙印伤害 ${actual.burnDamage[q]}`);
  if(actual.burnSkipped)notes.push('本次立即结束，不再结算持续伤害。');
  const impact=`实际伤害 ${actual.damage}${skill.effect==='heal'?` · 实际回血 ${actual.healing}`:skill.effect==='delay'?` · 对方剩余撤退 +${actual.delay}`:''}`;
  const afterShield=Math.max(0,b.afterReduction-b.blocked);
  const calculation=`基础${b.base}${b.bonus?`＋强化${b.bonus}`:''}${b.multiplier!==1?`→削弱25%后${b.afterReduction}`:''}${b.blocked?`－护盾${b.blocked}`:''}＝${afterShield}${actual.damage<afterShield?`；实际扣血受剩余HP限制为${actual.damage}`:''}`;
  return `<button class="skill-button" data-action="attack" data-skill="${index}" aria-label="${skill.name}：${impact}${notes.length?'，'+notes.join(' '):''}"><em>${actual.damage}<small>实际直接伤害</small></em><strong>${skill.name}</strong><span class="skill-base">基础：${skillText(skill)}</span><span class="skill-actual">${impact}</span><span class="skill-projection">${calculation}<br>对方最终HP：${battle.hp[1-p]} → ${actual.targetHp}${skill.effect==='heal'||actual.burnDamage[p]?` · 自己最终HP：${battle.hp[p]} → ${actual.ownHp}`:''}</span>${notes.map(note=>`<span class="skill-notice ${actual.selfDefeat?'risk':actual.lethal?'lethal':''}">${note}</span>`).join('')}</button>`;
}
function retreatButton(b,p){
  const r=resolveCombatAction(b,p,{type:'retreat'}),burn=r.effects.burnDamage;
  const note=r.finished?(r.winner===null?' · 本次平局':r.winner===p?' · 持续伤害使对方归零，本次获胜':' · 警告：行动后持续伤害会使自己归零判负'):burn.some(Boolean)?` · 烙印：${burn.map((n,q)=>n?`${name(q)}－${n}HP`:'').filter(Boolean).join('，')}`:'';
  return btn(`选择撤退 · ${b.remaining[p]} → ${r.state.remaining[p]}${note}`,'retreat','ghost');
}
function privateTurn(m,p){
  if(m.phase==='select'){
    const count=m.mode==='point'?5:1;
    const visible=selectionCards(m.inventories[p],{element:selectionElement,sort:selectionSort,ascending:selectionAscending,selectedOnly,selectedIds:draft});
    const metric=selectionSort==='default'?null:METRICS[Number(selectionSort)];
    return `<div class="secret-heading"><h3>${name(p)} · 选择 ${count} 张出战卡</h3><span class="subtle">秘密选择 · 每张实际卡独立使用</span></div>${selectionTools(m,p,visible)}${draftOverview(m,p,count)}${presetTools(m,p,count)}<div class="selection-layout"><div>${visible.length?`<div class="collection-grid selection-grid">${visible.map(i=>`<div class="selection-tile">${card(CARD[i.cardId],{instance:i.id,selected:draft.includes(i.id)})}${metric?`<small class="selection-sort-value">${metric.name}<strong>${metric.read(CARD[i.cardId])}${metric.unit}</strong></small>`:''}${btn('预览技能','preview-card','ghost small',`data-card="${i.cardId}" aria-label="预览${CARD[i.cardId].name}技能"`)}</div>`).join('')}</div>`:`<div class="selection-empty"><p>当前筛选下没有卡牌。</p>${btn('清除筛选，查看全部卡牌','selection-clear','ghost')}</div>`}</div>${selectionPreview(m,p)}</div><div class="sticky-action"><span>已选 <b>${draft.length} / ${count}</b> 张${m.mode==='point'?'，封存后先公开双方阵容，再洗牌':''}</span>${btn('封存出战卡','submit-cards','',draft.length!==count?'disabled':'')}</div>`;
  }
  if(m.phase==='lineup-reveal')return lineupPreview(m);
  if(m.phase==='between'){
    const remaining=5-m.round, penalty=Math.ceil(remaining/2);
    return `<section class="panel center"><div class="eyebrow">第 ${m.round+1} 小局开始前 · ${name(p)} 的秘密决定</div><h2>${m.round===0?'五张谱印已封存':'下一次相逢，即将开始'}</h2><p>剩余 ${remaining} 张未出场卡。此时投降会随机输掉 ${penalty} 张；若双方都投降，整场平局且双方免罚。</p><p>下一张卡尚未公开。双方决定封存后一起公布。</p><div class="toolbar" style="justify-content:center">${btn('继续下一小局','decision','', 'data-value="continue"')}${btn(`投降 · 随机失去 ${penalty} 张`,'decision','danger','data-value="surrender"')}</div></section>${track(m,p)}`;
  }
  if(m.phase==='point')return `${pointBoard(m,p,m.point.revealed)}<section class="panel center"><div class="eyebrow">${name(p)} · 第 ${m.round+1} 小局${m.point.comparisons.length?' · 亮牌重比':''}</div><h3>请选择本次点数</h3><p>双方各选 0～6，总和对应下方编号，超过 6 循环；双方均出 0 时亮牌重比。</p><div class="options points">${POINT_NUMBERS.map(n=>`<button class="option" data-action="point" data-value="${n}" aria-label="选择点数 ${n}">${n}</button>`).join('')}</div>${btn('随机选择 0～6','random-point','ghost')}${metricStrip()}</section>`;
  if(m.phase==='rps')return `${battleBoard(m)}<section class="panel center"><div class="eyebrow">${name(p)} · 秘密出拳</div><h3>石头、剪刀、布</h3><p>双方选定后同时揭晓，只有胜者获得一次行动权。</p><div class="options">${[['rock','◉','石头'],['scissors','✂','剪刀'],['paper','▤','布']].map(([v,g,n])=>`<button class="option" data-action="rps" data-value="${v}" aria-label="出${n}"><b>${g}</b>${n}</button>`).join('')}</div></section>`;
  if(m.phase==='battle-action'){
    const c=CARD[m.battle.cards[p]];
    return `${battleBoard(m)}<section class="panel"><div class="eyebrow">${name(p)} · 获得一次行动权</div><h3>进攻，或为撤退争取一步</h3>${rpsResult(m)}<div class="skills">${c.skills.map((s,i)=>skillButton(m.battle,p,s,i)).join('')}</div><div class="toolbar">${retreatButton(m.battle,p)}${btn('主动投降并失去当前卡','battle-surrender','danger',`data-player="${p}"`)}</div><p class="footnote">技能按钮按当前局势显示本次实际效果；伤害致胜后，后续附加效果不再触发。卡牌基础值保持不变。</p></section>`;
  }
  return '';
}
function comparisonView(comparison){
  if(!comparison)return '';
  const points=`<p class="revealed-points">${comparison.numbers.map((value,p)=>`<span>${name(p)} 出点 <strong>${value}</strong></span>`).join('')}</p>`;
  if(comparison.kind==='double-zero')return `<div class="comparison">${points}<h3>双方均出 0 · 本次平手</h3><p>本次不比较属性，双方当前卡牌已公开；不推进小局、不交换卡牌。</p>${metricStrip()}</div>`;
  const metric=METRICS[comparison.metric],tie=comparison.values[0]===comparison.values[1],winner=comparison.values[0]>comparison.values[1]?0:1;
  return `<div class="comparison">${points}${comparison.metric!==pointMetricIndex(comparison.sum)?'<p class="legacy-comparison">此为调整前的已结算结果；下一次比拼使用当前编号规则。</p>':''}<h3>本次比拼 · ${metric.name}</h3><div class="comparison-values">${comparison.values.map((value,p)=>`<div class="${!tie&&winner===p?'value-winner':''}"><small>${name(p)}</small><strong>${value}<span>${metric.unit}</span></strong><b>${tie?'同分':winner===p?'较大 · 获胜':'失利'}</b></div>`).join('')}</div>${metricStrip(comparison.metric)}</div>`;
}
function sharedTurn(m){
  if(m.phase==='lineup-reveal')return lineupPreview(m);
  if(m.phase==='battle-reveal')return `${battleBoard(m)}<section class="panel center"><h3>双方亮牌 · 互不克制</h3><p>独立对局状态已初始化为满血和基础撤退点数。</p>${btn('开始猜拳','advance')}</section>`;
  if(m.phase==='rps-result')return `${battleBoard(m)}<section class="panel center"><h3>猜拳揭晓 · ${name(m.battle.actor)} 获胜</h3>${rpsResult(m)}${btn(m.battle.actor===0&&m.controls[0]==='human'?'选择本次行动':'进入胜者行动','advance')}</section>`;
  if(m.phase==='rps-tie')return `${battleBoard(m)}<section class="panel center"><h3>猜拳平手 · 重新出拳</h3>${rpsResult(m)}${btn('重新猜拳','advance')}</section>`;
  if(m.phase==='battle-turn')return `${battleBoard(m)}<section class="panel center"><h3>${name(m.battle.last.player)} 的行动结束</h3>${rpsResult(m)}${actionFeedback(m)}${btn('进入下一轮猜拳','advance')}</section>`;
  if(m.phase==='point-tie')return `${pointBoard(m,0,true)}<section class="panel center"><h3>比拼平手 · 双方卡牌已公开</h3>${comparisonView(m.point.comparisons.at(-1))}<p>使用当前两张卡重新选点，直到分出胜负。</p>${btn('使用原卡重新选点','advance')}</section>`;
  if(m.phase==='round-result'){
    const r=m.rounds.at(-1);
    return `${pointBoard(m,0,true)}<section class="panel center"><div class="eyebrow">第 ${m.round} 小局结束</div><h3>${r.kind==='same'?'同一种异兽 · 直接跳过':`${name(r.winner)} 获胜`}</h3>${comparisonView(r.comparison)}<p>${r.kind==='same'?'双方各自保留卡牌，本局已计入进度。':'胜者保留自己的卡，并获得对方本次出场卡。两张出场卡均不再参与后续小局。'}</p>${btn(m.round===5?'查看整场结果':'前往下一小局','advance')}${track(m)}</section>`;
  }
  if(m.phase==='battle-action')return `${battleBoard(m)}<section class="panel center"><h3>${name(m.battle.actor)} 正在选择行动</h3>${rpsResult(m)}<p>本次只有猜拳胜者执行一次进攻或撤退。</p></section>`;
  const board=m.mode==='battle'&&m.battle?battleBoard(m):m.mode==='point'&&m.phase==='point'?pointBoard(m,0,m.point.revealed):'';
  return `${board}<div class="loading" role="status">群岛 AI 正在思考…${m.controls[0]==='human'?'<small>你的选择已封存，双方完成后同时揭晓。</small>':''}</div>`;
}
function finalView(m){
  const transfers=m.transfers.map(t=>`${name(t.from)} → ${name(t.to)}：${CARD[t.cardId].name}（${t.reason}）`);
  return `<section class="panel center"><div class="eyebrow">ENCOUNTER COMPLETE · 对局已结算</div><div class="result-title ${m.winner===null?'draw':''}">${m.winner===null?'整场平局':`${name(m.winner)} 胜利`}</div><p>${esc(m.reason)}${m.winner!==null?`<br>${name(1-m.winner)} 失败`:''}</p>${m.mode==='point'?`${track(m,0)}<p class="footnote">以上 √ / × 以${name(0)}视角显示；${name(1)}的胜负相反。＝ 代表同卡跳过。</p>`:`${battleBoard(m)}${rpsResult(m)}${actionFeedback(m)}`}<div class="transfer-list">${transfers.length?transfers.map(esc).join('<br>'):'本场没有发生卡牌转移，双方保留原卡。'}</div><div class="toolbar" style="justify-content:center">${btn('返回对局大厅','finish-home')}${btn('查看收藏','finish-collection','ghost')}</div></section>`;
}
function flowOptions(){return {autoAdvance:store.autoAdvance,paused,dialogOpen:!!document.querySelector('dialog[open], .log[open], .lineup-reference[open]'),hidden:document.hidden};}
function flowControls(m){
  if(m.status!=='active')return '';
  const status=flowStatus(m);
  return `<div class="flow-controls"><div class="toolbar">${btn('自动推进','auto-toggle',`ghost small ${store.autoAdvance?'enabled':''}`,`role="switch" aria-checked="${store.autoAdvance}"`)}${btn(paused?'继续自动处理':'暂停自动处理','pause','ghost small',`aria-pressed="${paused}"`)}</div><small role="status">${status}</small></div>`;
}
function flowStatus(m){
  const options=flowOptions(),step=scheduledStep(m,options);
  return paused?'已暂停自动处理，可手动操作。':options.dialogOpen?'正在查看内容，自动处理已暂停。':m.phase==='lineup-reveal'&&!m.lineupReady[0]&&m.controls[0]==='human'?'查看阵容后请手动确认，不会自动洗牌。':step?.kind==='advance'?`约 ${step.delay/1000} 秒后继续，也可点击下方按钮。`:step?.kind==='ai'?'等待 AI 提交。':expectedPlayers(m).includes(0)?'等待你的选择，不会自动提交。':'手动推进：点击下方按钮继续。';
}
function matchView(){
  const m=store.match;
  if(!m){route='home';return home();}
  const myTurn=expectedPlayers(m).includes(0)&&m.controls[0]==='human';
  const battleView=m.mode==='battle'&&m.battle;
  const tools=(canLeaveSelection(m)?btn('返回对局大厅','home','ghost small'):'')+(battleView?btn(store.battleCompact?'切换完整视图':'切换紧凑视图','battle-layout','ghost small',`aria-pressed="${store.battleCompact}"`):'')+(m.status==='active'?btn(m.controls[0]==='ai'?'恢复自己操作':'暂离 / AI代出','control','ghost small')+(battleView?btn('投降','battle-surrender','danger small'):''):'');
  const content=m.status==='finished'?finalView(m):myTurn?privateTurn(m,0):sharedTurn(m);
  return `<main class="wrap ${battleView?'battle-match':''} ${battleView&&store.battleCompact?'compact':''}"><div class="match-head"><div><div class="eyebrow">${m.mode==='battle'?'相性决斗 / BATTLE':'衡量试炼 / POINT DUEL'}</div><h2>${m.status==='finished'?'对局结果':m.mode==='battle'?'相性决斗':m.phase==='lineup-reveal'?'衡量试炼 · 阵容展示':`衡量试炼 · ${Math.min(m.phase==='round-result'?m.round:m.round+1,5)} / 5`}</h2></div><div class="match-tools">${tools}</div></div>${scoreboard(m)}${flowControls(m)}${battleView&&store.battleCompact&&m.status==='active'?`<div class="combat-layout">${content}</div>`:content}${lineupReference(m)}<details class="log" ${readingOpen.log?'open':''}><summary>查看已公开的对局记录（${m.history.length}）</summary><ol>${m.history.map(t=>`<li>${esc(t)}</li>`).join('')}</ol></details></main>`;
}
function render({resetReading=false}={}){
  if(resetReading)readingOpen={log:false,lineup:false};
  else for(const [key,selector] of [['log','.log'],['lineup','.lineup-reference']]){const node=document.querySelector(selector);if(node)readingOpen[key]=node.open;}
  app.innerHTML=`<div class="shell">${route==='tutorial'?'':header()}${storageFailed?`<div class="save-warning" role="alert"><span>存档未能写入浏览器，当前修改仅保留在本页，刷新可能丢失。</span>${btn('重试保存','retry-save','ghost small')}</div>`:''}${route==='tutorial'?renderTutorial(store.tutorial,playedCard):route==='match'?matchView():route==='home'?home():catalog()}${footer()}</div>`;scheduleAI();
}
function send(action){try{const beforePhase=store.match.phase;store.match=dispatch(store.match,action);store.players.forEach((p,i)=>p.cards=structuredClone(store.match.inventories[i]));draft=selectionDraft(store.match);if(store.match.phase!=='select'||store.match.selections[0]!==null){delete store.match.selectionDraft;delete store.selectionDrafts[store.match.mode];draftNotice='';}save();render();if(beforePhase!==store.match.phase){if(store.match.phase==='lineup-reveal')window.scrollTo(0,0);else if(store.match.mode==='battle'&&store.battleCompact)document.querySelector('.combat-layout')?.scrollIntoView({block:'start'});}maybeOpenEasterEgg();}catch(error){toast(error.message);}}
function scheduleAI(){
  clearTimeout(timer);
  const m=store.match;
  if(route!=='match')return;
  const status=document.querySelector('.flow-controls [role="status"]');if(status&&m?.status==='active')status.textContent=flowStatus(m);
  const step=scheduledStep(m,flowOptions());if(!step)return;
  timer=setTimeout(()=>{
    if(store.match!==m||route!=='match')return;
    const current=scheduledStep(m,flowOptions());
    if(!current||current.kind!==step.kind||current.player!==step.player)return;
    const action=step.kind==='advance'?{type:'advance'}:aiAction(m,step.player);
    if(action)send(action);
  },step.delay);
}
function start(mode){
  try{
    const current=store.match;
    if(current?.status==='active'&&!canLeaveSelection(current))return toast('本场已封存，请先完成当前对局。');
    if(canLeaveSelection(current))saveDraft();
    if(canLeaveSelection(current)&&current.mode===mode){store.match.difficulty=normalizeDifficulty(store.difficulty);}
    else{store.match=createLocalMatch(mode,store.players,store.difficulty);store.match.selectionDraft=store.selectionDrafts[mode];}
    draft=selectionDraft(store.match);store.match.selectionDraft=[...draft];store.selectionLobby=false;route='match';previewCardId=null;paused=false;
    selectionElement='全部';selectionSort='default';selectionAscending=false;selectedOnly=false;draftOverviewOpen=false;draftNotice=draft.length?'已恢复未封存的选卡。':'';presetsOpen=false;
    save();render({resetReading:true});window.scrollTo(0,0);
  }catch(e){toast(e.message);}
}
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');if(!target||target.disabled)return;
  const a=target.dataset.action,m=store.match,p=0;
  if(a==='egg-next'){
    if(Date.now()<eggAdvanceAt)return;
    const next=nextEasterEgg(store.easterEgg,Number(target.dataset.step));
    if(next!==store.easterEgg){store.easterEgg=next;save();showEasterEgg();}return;
  }
  if(a==='egg-pause')return pauseEasterEgg();
  if(a==='egg-finish')return finishEasterEgg();
  if(a==='egg-resume'&&store.easterEgg?.status==='paused'){store.easterEgg.status=store.easterEgg.step===5?'fireworks':'active';save();showEasterEgg();return;}
  if(a==='close-dialog'){document.querySelector('#dialog').close();return;}
  if(a==='close-card'){document.querySelector('#card-dialog').close();return;}
  if(a==='dismiss-release'){delete store.releaseNotice;save();render();return;}
  if(a==='retry-save'){const saved=save();render();if(saved)toast('已成功写入浏览器存档。');return;}
  if(a==='zoom')return openCard(target.dataset.card);
  if(a==='tutorial-open')return openTutorial();
  if(a==='tutorial-begin'){store.tutorial=beginTutorialLesson(store.tutorial);route='tutorial';document.querySelector('#dialog').close();save();render();window.scrollTo(0,0);return;}
  if(a==='tutorial-skip'){store.tutorial=newTutorial('skipped');document.querySelector('#dialog').close();save();render();return;}
  if(a==='tutorial-pause'){store.tutorial.status='paused';route='home';save();render();window.scrollTo(0,0);return;}
  if(route==='tutorial'){
    const type=a.replace(/^tutorial-/,''),action={type};
    if(type==='choose')action.id=target.dataset.instance;
    if(type==='rps')action.value=target.dataset.value;
    if(type==='point')action.value=Number(target.dataset.value);
    if(type==='attack')action.skill=Number(target.dataset.skill);
    if(a.startsWith('tutorial-'))sendTutorial(action);
    return;
  }
  if(a==='battle-status'){const status=combatStatuses(m.battle,Number(target.dataset.player)).find(s=>s.id===target.dataset.kind);if(status)modal(status.label,`<p>${esc(status.detail)}</p>`);return;}
  if(a==='battle-layout'){store.battleCompact=!store.battleCompact;save();render();document.querySelector('.battle-match')?.scrollIntoView({block:'start'});return;}
  if(a==='save-preset'){
    if(m?.phase!=='select'||m.selections[0]!==null)return;
    const modeName=m.mode==='point'?'拼点阵容':'战斗方案';
    modal('保存常用阵容',`<p>按异兽种类与张数保存，下次匹配当前持有的副本，不会自动封存出战。</p><p>${draft.map(id=>CARD[m.inventories[0].find(i=>i.id===id).cardId].name).join(' · ')}</p><label class="preset-name-label" for="preset-name">阵容名称<input id="preset-name" maxlength="20" value="${modeName} ${store.lineupPresets.filter(s=>s.mode===m.mode).length+1}" autocomplete="off"></label>`,'confirm-save-preset','保存阵容');return;
  }
  if(a==='confirm-save-preset'){
    try{const preset=createPreset(crypto.randomUUID(),document.querySelector('#preset-name').value,m.mode,m.inventories[0],draft);store.lineupPresets.push(preset);if(!save()){store.lineupPresets.pop();render();return;}presetsOpen=true;document.querySelector('#dialog').close();render();toast('已保存常用阵容。');}catch(error){toast(error.message);}return;
  }
  if(a==='load-preset'){
    const preset=store.lineupPresets.find(s=>s.id===target.dataset.preset&&s.mode===m?.mode);
    if(!preset||m.phase!=='select'||m.selections[0]!==null)return;
    const result=resolvePreset(preset,m.inventories[0]);draft=result.ids;
    draftNotice=result.missing.length?`已载入 ${draft.length} 张，缺少 ${result.missing.length} 张：${result.missing.map(id=>CARD[id].name).join('、')}。`:`已载入“${preset.name}”，请检查后封存。`;
    selectionElement='全部';selectedOnly=false;saveDraft();render();return;
  }
  if(a==='delete-preset'){store.lineupPresets=store.lineupPresets.filter(s=>s.id!==target.dataset.preset);const saved=save();render();if(saved)toast('已删除常用阵容，当前选卡保留。');return;}
  if(a==='preview-card'){previewCardId=target.dataset.card;render();if(matchMedia('(max-width: 800px)').matches)document.querySelector('.selection-preview').scrollIntoView({block:'start'});return;}
  if(a==='auto-toggle'){store.autoAdvance=!store.autoAdvance;save();render();return;}
  if(a==='pause'){paused=!paused;render();return;}
  if(a==='selection-element'){selectionElement=target.dataset.value;render();return;}
  if(a==='selection-direction'){selectionAscending=!selectionAscending;render();return;}
  if(a==='selection-clear'){selectionElement='全部';selectedOnly=false;render();return;}
  if(a==='remove-draft'){draft=draft.filter(id=>id!==target.dataset.instance);draftNotice='';saveDraft();render();return;}
  if(a==='help'){modal('谱印对决 · 玩法说明','<p><b>玩家对 AI：</b>你与 AI 初始各有全套异兽，每种一张。你只操作自己一侧，AI 自动选卡、选点和出拳；双方完成选择后同时揭晓。拼点在普通平手前隐藏 AI 的当前卡。</p><p><b>战斗：</b>秘密选一张并同时亮牌。火→草→岩→风→水→火，克制直接判胜；中立时秘密猜拳，胜者进攻或撤退。撤退剩余点数减到 0 判平局。</p><p><b>拼点：</b>双方先秘密封存五张，同时公开阵容；确认后分别打乱。小局开始只直接展示自己的卡，对方的当前卡仍保密。秘密选 0～6 或随机，双方揭晓后，点数总和对应下方编号，超过 6 循环；双方均出 0 时直接判本次平手，亮牌后用原卡重新选点，不推进小局、不交换卡牌。编号依次为：1名字、2最大HP、3基础撤退、4最高基础伤害、5身高、6体重。平手亮牌后用原卡重选，同卡跳过。</p><p><b>收藏：</b>胜者拿走败者当前卡。拼点投降按剩余5/4/3/2/1张随机罚3/2/2/1/1张；双方在小局之间秘密决定，一起公布。</p><p><b>技能：</b>回血不超过最大HP；阻退增加对方本局剩余撤退，上限暂为基础值＋2。伤害致胜后立即结算。持续伤害在任一方实际行动结束时触发，首次施加从下次行动起，猜拳不触发；直接击败或撤退成功立即结束，免除后续持续伤害。</p><p>你可以暂离并由 AI 接管自己一侧，随后恢复操作。对手始终由 AI 控制；真实联网掉线与重连留待联网阶段。</p>');return;}
  if(['home','codex','collection'].includes(a)){
    if(canLeaveSelection(m)){store.selectionLobby=true;saveDraft();route=a;filter='全部';render();window.scrollTo(0,0);return;}
    if(m?.status==='active'){if(a==='home'){route='match';render();}else toast('本场对局进行中，结束后可查看图鉴与收藏。');return;}
    route=a;filter='全部';render();window.scrollTo(0,0);return;
  }
  if(a==='resume-selection'&&canLeaveSelection(m))return start(m.mode);
  if(a==='start-battle')return start('battle');if(a==='start-point')return start('point');
  if(a==='difficulty'){if(m?.status==='active'&&!canLeaveSelection(m))return;store.difficulty=normalizeDifficulty(target.value);save();render();return;}
  if(a==='owner'){owner=Number(target.dataset.player);render();return;}
  if(a==='filter'){filter=target.dataset.value;render();return;}
  if(a==='last-match'){route='match';render();return;}
  if(a==='reset'){
    modal('恢复全部卡牌？','<p>你与 AI 将重新拥有全套异兽，每种一张。当前收藏与上一场记录将被替换，仅影响本浏览器。</p>','confirm-reset','恢复全部卡牌');return;
  }
  if(a==='confirm-reset'){
    const presets=store.lineupPresets,compact=store.battleCompact,tutorial=store.tutorial;clearTimeout(eggTimer);store=fresh();store.easterEgg=null;store.lineupPresets=presets;store.battleCompact=compact;store.tutorial=tutorial;store.selectionDrafts={};store.selectionLobby=false;draft=[];draftNotice='';route='home';save();document.querySelector('#dialog').close();render();return;
  }
  if(a==='choose-card'){
    const id=target.dataset.instance,count=m.mode==='point'?5:1;
    previewCardId=m.inventories[p].find(i=>i.id===id)?.cardId;
    if(draft.includes(id))draft=draft.filter(i=>i!==id);else if(count===1)draft=[id];else if(draft.length<count)draft.push(id);else return toast('已选满五张，请先取消一张。');
    draftNotice='';saveDraft();render();return;
  }
  if(a==='submit-cards')return send({type:'select',player:p,ids:[...draft]});
  if(a==='lineup-ready')return send({type:'lineup-ready',player:p});
  if(a==='decision')return send({type:'decision',player:p,value:target.dataset.value});
  if(a==='point'||a==='random-point')return send({type:'point',player:p,value:a==='point'?Number(target.dataset.value):POINT_NUMBERS[randomInt(POINT_NUMBERS.length)]});
  if(a==='rps')return send({type:'rps',player:p,value:target.dataset.value});
  if(a==='attack')return send({type:'attack',player:p,skill:Number(target.dataset.skill)});
  if(a==='retreat')return send({type:'retreat',player:p});
  if(a==='advance')return send({type:'advance'});
  if(a==='battle-surrender'){
    modal('主动投降？','<p>本场将判定失败，当前出战卡输给 AI。</p>','confirm-battle-surrender','投降并失去当前卡');return;
  }
  if(a==='confirm-battle-surrender'){document.querySelector('#dialog').close();return send({type:'surrender',player:0});}
  if(a==='control')return send({type:'control',player:0,control:m.controls[0]==='human'?'ai':'human'});
  if(a==='finish-home'||a==='finish-collection'){route=a==='finish-home'?'home':'collection';owner=0;filter='全部';render();window.scrollTo(0,0);}
});
document.addEventListener('change',event=>{
  const target=event.target;if(store.match?.phase!=='select')return;
  if(target.dataset.action==='selection-sort'){
    selectionSort=SELECTION_SORTS.some(o=>o.id===target.value)?target.value:'default';render();document.querySelector('#selection-sort')?.focus({preventScroll:true});
  }else if(target.dataset.action==='selection-only'){
    selectedOnly=target.checked;render();document.querySelector('[data-action="selection-only"]')?.focus({preventScroll:true});
  }
});
for(const d of document.querySelectorAll('dialog')){
  d.addEventListener('close',()=>{if(store.tutorial.status==='welcome'){store.tutorial.status='skipped';save();}if(d.id==='easter-egg-dialog'&&['active','fireworks'].includes(store.easterEgg?.status)){clearTimeout(eggTimer);store.easterEgg.status='paused';save();render();}scheduleAI();});
  if(d.id==='easter-egg-dialog'){
    d.addEventListener('cancel',event=>{event.preventDefault();if(store.easterEgg?.status==='fireworks')finishEasterEgg();else pauseEasterEgg();});
    continue;
  }
  d.addEventListener('click',event=>{if(event.target!==d)return;const r=d.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)d.close();});
}
document.addEventListener('visibilitychange',()=>{scheduleAI();scheduleEggFireworks();});
document.addEventListener('toggle',event=>{if(!event.target.isConnected)return;if(event.target.matches?.('.preset-list')){presetsOpen=event.target.open;return;}if(event.target.matches?.('.draft-overview')){draftOverviewOpen=event.target.open;return;}if(event.target.matches?.('.log, .lineup-reference')){readingOpen[event.target.matches('.log')?'log':'lineup']=event.target.open;scheduleAI();}},true);
if(sessionUpdated||!hadSavedSession)save();
render();
if(store.tutorial.status==='welcome')welcomeTutorial();
else maybeOpenEasterEgg();
