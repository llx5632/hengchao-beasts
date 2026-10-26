import { CARDS, CARD, BEATS, ELEMENTS, METRICS, skillText } from './data.js';
import { dispatch, expectedPlayers, aiAction, randomInt } from './engine.js';
import { SAVE_KEY, freshSession, createLocalMatch } from './session.js';

const KEY=SAVE_KEY, app=document.querySelector('#app');
const fresh=freshSession;
let store;
try { const saved=JSON.parse(localStorage.getItem(KEY)); store=saved?.version === 2 && saved.players?.length === 2 ? saved : fresh(); } catch { store=fresh(); }
let route=store.match ? 'match' : 'home', draft=[], filter='全部', owner=0, timer=null, toastTimer=null;
const name=p => store.players[p].name;
const esc=value => String(value).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=(text,action,cls='',attrs='') => `<button class="btn ${cls}" data-action="${action}" ${attrs}>${text}</button>`;
function save(){try{localStorage.setItem(KEY,JSON.stringify(store));}catch{toast('浏览器存储不可用，本次数据仅保留在当前页面。');}}
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.style.display='none',4200);}
function modal(title,body,action=null,label='确定'){
  const d=document.querySelector('#dialog');
  d.innerHTML=`<h2>${title}</h2>${body}<div class="dialog-actions">${btn(action?'取消':'知道了','close-dialog','ghost')}${action?btn(label,action):''}</div>`;
  d.showModal();
}
function card(c,{instance=null,selected=false,details=false}={}){
  const tag=instance?'button':'article';
  return `<${tag} class="beast-card ${selected?'selected':''}" data-element="${c.element}" ${instance?`data-action="choose-card" data-instance="${esc(instance)}" aria-pressed="${selected}" aria-label="选择 ${c.name}"`:''}>
    <div class="card-title"><b>${c.name}</b><span class="element">${c.element}</span></div>
    <div class="illustration ${c.art?'has-art':''}">${c.art?`<img src="${c.art}" alt="${c.name}谱印插画">`:`<span class="sigil">${c.name.slice(-1)}</span>`}<span class="art-note">${c.art?'谱印插画':'图鉴谱印'}</span></div>
    ${selected?'<span class="selection-mark">✓</span>':''}
    <div class="card-stats"><span>基础 HP<strong>${c.hp}</strong></span><span>基础撤退<strong>${c.retreat}</strong></span></div>
    <div class="card-meta"><span>${c.tier} · 克制${BEATS[c.element]}</span><span>${c.height}m / ${c.weight}kg</span></div>
    ${details?`<div class="card-skills">${c.skills.map(s=>`<div><b>${s.name}</b>　${skillText(s)}</div>`).join('')}</div><p class="story">${c.story}</p>${c.art?`<a class="card-source" href="${c.art}" target="_blank" rel="noopener">查看${c.name}完整卡面 ↗</a>`:''}`:''}
  </${tag}>`;
}
function playedCard(c){return `<article class="played-card"><img src="${c.art}" alt="${c.name}完整卡面" width="1024" height="1536"></article>`;}
function battleState(c,state,player){return `<div class="battle-state"><p><span>${name(player)} · 剩余 HP</span><b>${state.hp[player]} / ${c.hp}</b></p><div class="hp-track"><div class="hp-fill" style="width:${state.hp[player]/c.hp*100}%"></div></div><p><span>本局剩余撤退</span><b>${state.remaining[player]}</b></p></div>`;}
function hiddenCard(){return '<div class="hidden-card"><span class="crest">✦</span><p>衡潮谱印</p><small>对方卡牌尚未公开</small></div>';}
function header(){const active=store.match?.status==='active';return `<header class="topbar"><button class="brand" data-action="home"><span class="crest">✦</span><span><strong>衡潮群岛</strong><small>THE TIDEBORNE ARCHIPELAGO</small></span></button><nav class="nav" aria-label="主导航"><button data-action="home" class="${route==='home'||route==='match'?'active':''}">${active?'当前对局':'对局大厅'}</button><button data-action="codex" class="${route==='codex'?'active':''}">异兽图鉴</button><button data-action="collection" class="${route==='collection'?'active':''}">我的收藏</button><button data-action="help">规则</button></nav><span class="edition">玩家对 AI · 本地首版</span></header>`;}
function footer(){return '<footer class="footer"><span>衡潮群岛 / 原创异兽卡牌</span><span>本地浏览器保存 · 数值为候选设计 · 抽卡后续开放</span></footer>';}
function home(){
  const a=store.players[0].cards.length,b=store.players[1].cards.length;
  return `<section class="hero"><div class="hero-inner"><div><div class="eyebrow">FIELD NOTES · VOLUME 01</div><h1>与异兽相遇<br>在衡潮之间</h1><p>群岛随潮而变，谱印记录万物。选择你的异兽，以相性决斗争夺行动权，或在衡量试炼中一较高下。</p><div class="tagline"><span>五种自然属性</span><span>十五种异兽</span><span>两种对决</span></div></div><div class="fan" aria-label="三张已认可的概念卡"><img src="${CARD.tanling.art}" alt="炭铃概念卡"><img src="${CARD.xuanjiao.art}" alt="旋角羚概念卡"><img src="${CARD.fuchao.art}" alt="负潮巨鳖概念卡"><span class="fan-caption">奇幻自然志 · 原创异兽谱印</span></div></div></section>
  <main class="wrap"><div class="section-heading"><div><div class="eyebrow">CHOOSE YOUR ENCOUNTER</div><h2>开启一场对决</h2></div><span class="subtle">玩家对 AI · 秘密提交，同时揭晓</span></div>
  <div class="modes"><article class="mode"><span class="number">01</span><div class="mode-kicker">相性决斗 / BATTLE</div><h3>一张谱印，一次交锋</h3><p>属性克制直接获胜。互不克制时，猜拳争夺行动权，选择技能进攻，或逐步撤退。</p><div class="mode-footer"><small class="subtle">各出战 1 张 · 胜者收卡</small>${btn('进入战斗　↗','start-battle','',!a||!b?'disabled':'')}</div></article>
  <article class="mode"><span class="number">02</span><div class="mode-kicker">衡量试炼 / POINT DUEL</div><h3>五次相逢，六种较量</h3><p>五张卡打乱顺序，秘密选点，以总和决定比较项目。平手后亮牌，再次选点决胜。</p><div class="mode-footer"><small class="subtle">各出战 5 张 · 五小局</small>${btn('进入拼点　↗','start-point','',a<5||b<5?'disabled':'')}</div></article></div>
  <div class="player-strip">${store.players.map((p,i)=>`<div><strong>${p.name}</strong><span>收藏 ${p.cards.length} 张　/　${p.cards.length>=5?'可参加拼点':'不足五张，暂不可拼点'}</span></div>`).join('')}</div>
  <p class="footnote">本地首版中，你与 AI 初始均拥有全部 15 种异兽，每种一张。赢卡与失卡结果保存在当前浏览器。</p>
  <div class="toolbar" style="margin-top:20px">${store.match?.status==='finished'?btn('查看上一场结果','last-match','ghost small'):''}${btn('恢复全部卡牌','reset','ghost small')}<span class="subtle">恢复后双方重新拥有全部 15 张，方便重复体验。</span></div></main>`;
}
function catalog(){
  const isCollection=route==='collection';
  const instances=isCollection?store.players[owner].cards:null;
  const cards=isCollection?instances.map(i=>({card:CARD[i.cardId],instance:i})):CARDS.map(card=>({card}));
  const visible=cards.filter(({card:c})=>filter==='全部'||c.element===filter);
  return `<main class="wrap"><div class="section-heading"><div><div class="eyebrow">${isCollection?'YOUR FIELD COLLECTION':'BESTIARY · FIFTEEN ENCOUNTERS'}</div><h2>${isCollection?'我的谱印收藏':'群岛异兽图鉴'}</h2></div><span class="subtle">${isCollection?instances.length:15} 张${isCollection?'持有卡牌':'候选卡牌'}</span></div>
    <div class="toolbar">${isCollection?[0,1].map(p=>btn(name(p),'owner',owner===p?'small':'ghost small',`data-player="${p}"`)).join(''):''}${['全部',...ELEMENTS].map(e=>`<button class="filter ${filter===e?'active':''}" data-action="filter" data-value="${e}">${e}</button>`).join('')}</div>
    ${!isCollection?'<div class="banner">高低阶与数值依据异兽的背景、体型和能力设计。卡面采用当前候选设定；点击各卡下方链接可查看完整卡面。<a href="cards.html" target="_blank" rel="noopener">打开全部卡面总览 ↗</a></div>':''}
    <div class="collection-grid">${visible.map(({card:c})=>card(c,{details:true})).join('')}</div>${!visible.length?'<p class="empty">这个属性暂时没有持有卡牌。</p>':''}</main>`;
}
function scoreboard(m){return `<div class="scoreboard"><div class="player"><strong>${name(0)}</strong><span class="badge">${m.controls[0]==='ai'?'AI 代出':'本地玩家'}</span><small>持有 ${m.inventories[0].length} 张${m.mode==='point'?` · 已胜 ${m.scores[0]} 小局`:''}</small></div><div class="score">${m.mode==='point'?`${m.scores[0]}<span>:</span>${m.scores[1]}`:'VS'}</div><div class="player"><strong>${name(1)}</strong><span class="badge">${'AI 对手'}</span><small>持有 ${m.inventories[1].length} 张${m.mode==='point'?` · 已胜 ${m.scores[1]} 小局`:''}</small></div></div>`;}
function track(m,p=0){return `<div class="round-track">${[0,1,2,3,4].map(i=>{const r=m.rounds[i];return `<div class="round-cell"><small>第 ${i+1} 小局</small><b class="${r?.kind==='win'?(r.winner===p?'win':'loss'):''}">${!r?'—':r.kind==='same'?'＝':r.winner===p?'√':'×'}</b><span>${!r?'未进行':r.kind==='same'?'同卡跳过':r.winner===p?'获胜':'失利'}</span></div>`;}).join('')}</div>`;}
function battleBoard(m){const side=p=>{const c=CARD[m.battle.cards[p]];return `<div class="battle-combatant">${playedCard(c)}${battleState(c,m.battle,p)}</div>`;};return `<div class="board">${side(0)}<span class="versus">VS</span>${side(1)}</div>`;}
function pointBoard(m,p,both=false){return `<div class="board">${both||p===0?playedCard(CARD[m.point.cards[0].cardId]):hiddenCard()}<span class="versus">VS</span>${both||p===1?playedCard(CARD[m.point.cards[1].cardId]):hiddenCard()}</div>`;}
function metricStrip(current=-1){return `<div class="metric-table">${METRICS.map((metric,i)=>`<div class="${i===current?'current':''}"><strong>${i}</strong>${metric.name}</div>`).join('')}</div>`;}
const rpsNames={rock:'石头',scissors:'剪刀',paper:'布'};
function privateTurn(m,p){
  if(m.phase==='select'){
    const count=m.mode==='point'?5:1;
    return `<div class="secret-heading"><h3>${name(p)} · 选择 ${count} 张出战卡</h3><span class="subtle">秘密选择 · 每张实际卡独立使用</span></div><div class="collection-grid">${m.inventories[p].map(i=>card(CARD[i.cardId],{instance:i.id,selected:draft.includes(i.id)})).join('')}</div><div class="sticky-action"><span>已选 <b>${draft.length} / ${count}</b> 张${m.mode==='point'?'，提交后将打乱出场顺序':''}</span>${btn('封存出战卡','submit-cards','',draft.length!==count?'disabled':'')}</div>`;
  }
  if(m.phase==='between'){
    const remaining=5-m.round, penalty=Math.ceil(remaining/2);
    return `<section class="panel center"><div class="eyebrow">第 ${m.round+1} 小局开始前 · ${name(p)} 的秘密决定</div><h2>${m.round===0?'五张谱印已封存':'下一次相逢，即将开始'}</h2><p>剩余 ${remaining} 张未出场卡。此时投降会随机输掉 ${penalty} 张；若双方都投降，整场平局且双方免罚。</p><p>下一张卡尚未公开。双方决定封存后一起公布。</p><div class="toolbar" style="justify-content:center">${btn('继续下一小局','decision','', 'data-value="continue"')}${btn(`投降 · 随机失去 ${penalty} 张`,'decision','danger','data-value="surrender"')}</div></section>${track(m,p)}`;
  }
  if(m.phase==='point')return `${pointBoard(m,p,m.point.revealed)}<section class="panel center"><div class="eyebrow">${name(p)} · 第 ${m.round+1} 小局${m.point.comparisons.length?' · 亮牌重比':''}</div><h3>请选择本次点数</h3><p>双方点数相加后模 6，决定共同比较的项目。</p><div class="options points">${[1,2,3,4,5,6].map(n=>`<button class="option" data-action="point" data-value="${n}" aria-label="选择点数 ${n}">${n}</button>`).join('')}</div>${btn('随机选择 1～6','random-point','ghost')}${metricStrip()}</section>`;
  if(m.phase==='rps')return `${battleBoard(m)}<section class="panel center"><div class="eyebrow">${name(p)} · 秘密出拳</div><h3>石头、剪刀、布</h3><p>双方选定后同时揭晓，只有胜者获得一次行动权。</p><div class="options">${[['rock','◉','石头'],['scissors','✂','剪刀'],['paper','▤','布']].map(([v,g,n])=>`<button class="option" data-action="rps" data-value="${v}" aria-label="出${n}"><b>${g}</b>${n}</button>`).join('')}</div></section>`;
  if(m.phase==='battle-action'){
    const c=CARD[m.battle.cards[p]];
    return `${battleBoard(m)}<section class="panel"><div class="eyebrow">${name(p)} · 获得一次行动权</div><h3>进攻，或为撤退争取一步</h3><div class="rps-result">${name(0)}：${rpsNames[m.rps[0]]}　/　${name(1)}：${rpsNames[m.rps[1]]}</div><div class="skills">${c.skills.map((s,i)=>`<button class="skill-button" data-action="attack" data-skill="${i}"><em>${s.damage}</em><strong>${s.name}</strong><span>${skillText(s)}</span></button>`).join('')}</div><div class="toolbar">${btn(`选择撤退 · ${m.battle.remaining[p]} → ${m.battle.remaining[p]-1}`,'retreat','ghost')}${btn('主动投降并失去当前卡','battle-surrender','danger',`data-player="${p}"`)}</div><p class="footnote">行动后若对局未结束，重新猜拳。当前状态单独显示，卡牌基础值保持不变。</p></section>`;
  }
  return '';
}
function comparisonView(comparison){if(!comparison)return '';const metric=METRICS[comparison.metric];return `<div class="comparison">点数 ${comparison.numbers[0]} ＋ ${comparison.numbers[1]} ＝ ${comparison.sum}，模 6 余 ${comparison.metric} → 比较 <b>${metric.name}</b><br>${name(0)}：${comparison.values[0]}${metric.unit}　/　${name(1)}：${comparison.values[1]}${metric.unit}</div>`;}
function sharedTurn(m){
  if(m.phase==='battle-reveal')return `${battleBoard(m)}<section class="panel center"><h3>双方亮牌 · 互不克制</h3><p>独立对局状态已初始化为满血和基础撤退点数。</p>${btn('开始猜拳','advance')}</section>`;
  if(m.phase==='rps-tie')return `${battleBoard(m)}<section class="panel center"><h3>猜拳平手 · 重新出拳</h3><p>双方都出了${rpsNames[m.rps[0]]}，本次均不行动。</p>${btn('重新猜拳','advance')}</section>`;
  if(m.phase==='battle-turn')return `${battleBoard(m)}<section class="panel center"><h3>${name(m.battle.last.player)} 的行动结束</h3><p>${m.battle.last.text}</p>${btn('进入下一轮猜拳','advance')}</section>`;
  if(m.phase==='point-tie')return `${pointBoard(m,0,true)}<section class="panel center"><h3>比拼平手 · 双方卡牌已公开</h3>${comparisonView(m.point.comparisons.at(-1))}<p>使用当前两张卡重新选点，直到分出胜负。</p>${btn('使用原卡重新选点','advance')}</section>`;
  if(m.phase==='round-result'){
    const r=m.rounds.at(-1);
    return `${pointBoard(m,0,true)}<section class="panel center"><div class="eyebrow">第 ${m.round} 小局结束</div><h3>${r.kind==='same'?'同一种异兽 · 直接跳过':`${name(r.winner)} 获胜`}</h3>${comparisonView(r.comparison)}<p>${r.kind==='same'?'双方各自保留卡牌，本局已计入进度。':'胜者保留自己的卡，并获得对方本次出场卡。两张出场卡均不再参与后续小局。'}</p>${btn(m.round===5?'查看整场结果':'前往下一小局','advance')}${track(m)}</section>`;
  }
  const board=m.mode==='battle'&&m.battle?battleBoard(m):m.mode==='point'&&m.phase==='point'?pointBoard(m,0,m.point.revealed):'';
  return `${board}<div class="loading" role="status">群岛 AI 正在思考…${m.controls[0]==='human'?'<small>你的选择已封存，双方完成后同时揭晓。</small>':''}</div>`;
}
function finalView(m){
  const transfers=m.transfers.map(t=>`${name(t.from)} → ${name(t.to)}：${CARD[t.cardId].name}（${t.reason}）`);
  return `<section class="panel center"><div class="eyebrow">ENCOUNTER COMPLETE · 对局已结算</div><div class="result-title ${m.winner===null?'draw':''}">${m.winner===null?'整场平局':`${name(m.winner)} 胜利`}</div><p>${esc(m.reason)}${m.winner!==null?`<br>${name(1-m.winner)} 失败`:''}</p>${m.mode==='point'?`${track(m,0)}<p class="footnote">以上 √ / × 以${name(0)}视角显示；${name(1)}的胜负相反。＝ 代表同卡跳过。</p>`:battleBoard(m)}<div class="transfer-list">${transfers.length?transfers.map(esc).join('<br>'):'本场没有发生卡牌转移，双方保留原卡。'}</div><div class="toolbar" style="justify-content:center">${btn('返回对局大厅','finish-home')}${btn('查看收藏','finish-collection','ghost')}</div></section>`;
}
function matchView(){
  const m=store.match;
  if(!m){route='home';return home();}
  const myTurn=expectedPlayers(m).includes(0)&&m.controls[0]==='human';
  const tools=m.status==='active'?btn(m.controls[0]==='ai'?'恢复自己操作':'暂离 / AI代出','control','ghost small')+(m.mode==='battle'&&m.battle?btn('投降','battle-surrender','danger small'):''):'';
  const content=m.status==='finished'?finalView(m):myTurn?privateTurn(m,0):sharedTurn(m);
  return `<main class="wrap"><div class="match-head"><div><div class="eyebrow">${m.mode==='battle'?'相性决斗 / BATTLE':'衡量试炼 / POINT DUEL'}</div><h2>${m.status==='finished'?'对局结果':m.mode==='battle'?'相性决斗':`衡量试炼 · ${Math.min(m.phase==='round-result'?m.round:m.round+1,5)} / 5`}</h2></div><div class="match-tools">${tools}</div></div>${scoreboard(m)}${content}<details class="log"><summary>查看已公开的对局记录（${m.history.length}）</summary><ol>${m.history.map(t=>`<li>${esc(t)}</li>`).join('')}</ol></details></main>`;
}
function render(){app.innerHTML=`<div class="shell">${header()}${route==='match'?matchView():route==='home'?home():catalog()}${footer()}</div>`;scheduleAI();}
function send(action){try{const beforePhase=store.match.phase;store.match=dispatch(store.match,action);store.players.forEach((p,i)=>p.cards=structuredClone(store.match.inventories[i]));if(beforePhase!==store.match.phase||action.player===0)draft=[];save();render();}catch(error){toast(error.message);}}
function scheduleAI(){
  clearTimeout(timer);
  const m=store.match;
  if(!m||m.status!=='active')return;
  const ai=expectedPlayers(m).find(p=>m.controls[p]==='ai');
  if(ai!==undefined){timer=setTimeout(()=>{const current=store.match;if(current?.status==='active'&&current.controls[ai]==='ai'&&expectedPlayers(current).includes(ai)){const action=aiAction(current,ai);if(action)send(action);}},650);}
  else if(m.controls.every(c=>c==='ai')&&!expectedPlayers(m).length)timer=setTimeout(()=>send({type:'advance'}),850);
}
function start(mode){try{store.match=createLocalMatch(mode,store.players);route='match';draft=[];save();render();window.scrollTo(0,0);}catch(e){toast(e.message);}}
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');if(!target||target.disabled)return;
  const a=target.dataset.action,m=store.match,p=0;
  if(a==='close-dialog'){document.querySelector('#dialog').close();return;}
  if(a==='help'){modal('谱印对决 · 玩法说明','<p><b>玩家对 AI：</b>你与 AI 初始各有全部 15 种异兽，每种一张。你只操作自己一侧，AI 自动选卡、选点和出拳；双方完成选择后同时揭晓。拼点在普通平手前隐藏 AI 的当前卡。</p><p><b>战斗：</b>秘密选一张并同时亮牌。火→草→岩→风→水→火，克制直接判胜；中立时秘密猜拳，胜者进攻或撤退。撤退剩余点数减到 0 判平局。</p><p><b>拼点：</b>各选五张打乱；小局开始只看到自己的卡。秘密选 1～6 或随机，和模 6：0名字、1最大HP、2基础撤退、3最高基础伤害、4身高、5体重。平手亮牌后用原卡重选，同卡跳过。</p><p><b>收藏：</b>胜者拿走败者当前卡。拼点投降按剩余5/4/3/2/1张随机罚3/2/2/1/1张；双方在小局之间秘密决定，一起公布。</p><p><b>技能：</b>回血不超过最大HP；阻退增加对方本局剩余撤退，上限暂为基础值＋2。伤害致胜后立即结算。</p><p>你可以暂离并由 AI 接管自己一侧，随后恢复操作。对手始终由 AI 控制；真实联网掉线与重连留待联网阶段。</p>');return;}
  if(['home','codex','collection'].includes(a)){
    if(m?.status==='active'){if(a==='home'){route='match';render();}else toast('本场对局进行中，结束后可查看图鉴与收藏。');return;}
    route=a;filter='全部';render();window.scrollTo(0,0);return;
  }
  if(a==='start-battle')return start('battle');if(a==='start-point')return start('point');
  if(a==='owner'){owner=Number(target.dataset.player);render();return;}
  if(a==='filter'){filter=target.dataset.value;render();return;}
  if(a==='last-match'){route='match';render();return;}
  if(a==='reset'){
    modal('恢复全部卡牌？','<p>你与 AI 将重新拥有全部 15 种异兽，每种一张。当前收藏与上一场记录将被替换，仅影响本浏览器。</p>','confirm-reset','恢复全部卡牌');return;
  }
  if(a==='confirm-reset'){
    store=fresh();draft=[];route='home';save();document.querySelector('#dialog').close();render();return;
  }
  if(a==='choose-card'){
    const id=target.dataset.instance,count=m.mode==='point'?5:1;
    if(draft.includes(id))draft=draft.filter(i=>i!==id);else if(count===1)draft=[id];else if(draft.length<count)draft.push(id);else return toast('已选满五张，请先取消一张。');
    render();return;
  }
  if(a==='submit-cards')return send({type:'select',player:p,ids:[...draft]});
  if(a==='decision')return send({type:'decision',player:p,value:target.dataset.value});
  if(a==='point'||a==='random-point')return send({type:'point',player:p,value:a==='point'?Number(target.dataset.value):randomInt(6)+1});
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
render();
