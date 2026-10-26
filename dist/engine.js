import { CARD, BEATS, METRICS } from './data.js';

const check = (condition, message) => { if (!condition) throw new Error(message); };
export const randomInt = (max, rng = Math.random) => Math.min(max - 1, Math.floor(rng() * max));
export function shuffled(items, rng = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = randomInt(i + 1,rng); [result[i],result[j]] = [result[j],result[i]]; }
  return result;
}
export function createMatch(mode, inventories) {
  check(['battle','point'].includes(mode),'未知模式');
  check(inventories.length === 2,'需要两位玩家');
  const minimum = mode === 'point' ? 5 : 1;
  for (const cards of inventories) {
    check(cards.length >= minimum,`每位玩家至少需要 ${minimum} 张卡牌`);
    check(cards.every(c => CARD[c.cardId]),'存在未知卡牌');
  }
  const ids = inventories.flat().map(c => c.id);
  check(new Set(ids).size === ids.length,'卡牌实例不能重复');
  return { mode, phase:'select', status:'active', inventories:structuredClone(inventories), selections:[null,null], hands:null, battle:null, point:null, round:0, rounds:[], scores:[0,0], decisions:[null,null], picks:[null,null], rps:[null,null], controls:['human','human'], winner:null, reason:null, history:[], transfers:[] };
}
export function expectedPlayers(m) {
  if (m.status !== 'active') return [];
  const key = {select:'selections',between:'decisions',point:'picks',rps:'rps'}[m.phase];
  if (key) return [0,1].filter(p => m[key][p] === null);
  return m.phase === 'battle-action' ? [m.battle.actor] : [];
}
const log = (m,text) => m.history.push(text);
const playerName = (m,p) => m.playerNames?.[p] ?? `探索者 ${p === 0 ? 'A' : 'B'}`;
function finish(m,winner,reason) { m.status='finished'; m.phase='finished'; m.winner=winner; m.reason=reason; log(m,reason); }
function transfer(m,from,id,reason) {
  const index = m.inventories[from].findIndex(c => c.id === id);
  check(index >= 0,'这张卡牌已经结算，不能重复转移');
  const [instance] = m.inventories[from].splice(index,1);
  m.inventories[1-from].push(instance);
  m.transfers.push({from,to:1-from,id,cardId:instance.cardId,reason});
}
function startBattle(m) {
  m.hands=m.selections.map(ids => ids.map(id => m.inventories.flat().find(c => c.id === id)));
  const cards=m.hands.map(h => CARD[h[0].cardId]);
  m.battle={cards:cards.map(c => c.id),hp:cards.map(c => c.hp),remaining:cards.map(c => c.retreat),actor:null,last:null};
  for (const p of [0,1]) if (BEATS[cards[p].element] === cards[1-p].element) {
    transfer(m,1-p,m.hands[1-p][0].id,'属性克制');
    finish(m,p,`${cards[p].element}克制${cards[1-p].element}，直接获胜`); return;
  }
  m.phase='battle-reveal'; log(m,'双方同时亮牌，属性互不克制，准备猜拳。');
}
function startPointRound(m) {
  const cards=m.hands.map(h => h[m.round]);
  m.point={index:m.round,cards:structuredClone(cards),revealed:false,comparisons:[]};
  m.picks=[null,null];
  if (cards[0].cardId === cards[1].cardId) {
    m.rounds.push({index:m.round,kind:'same',winner:null,cards:structuredClone(cards)});
    m.round++; m.phase='round-result';
    log(m,`第 ${m.round} 小局：双方同为${CARD[cards[0].cardId].name}，各自保留，跳过。`);
  } else m.phase='point';
}
function resolveDecisions(m,rng) {
  const surrender=m.decisions.map(d => d === 'surrender');
  if (surrender.every(Boolean)) { finish(m,null,'双方同时投降，整场平局，保留已赢卡牌且双方免罚'); return; }
  const loser=surrender.findIndex(Boolean);
  if (loser >= 0) {
    const remaining=m.hands[loser].slice(m.round);
    const penalty=Math.ceil(remaining.length/2);
    for (const instance of shuffled(remaining,rng).slice(0,penalty)) transfer(m,loser,instance.id,'投降罚卡');
    finish(m,1-loser,`${playerName(m,loser)} 投降，从 ${remaining.length} 张未出场卡中随机失去 ${penalty} 张`); return;
  }
  startPointRound(m);
}
function resolvePoint(m) {
  const sum=m.picks[0]+m.picks[1], metric=sum%6;
  const values=m.point.cards.map(c => METRICS[metric].read(CARD[c.cardId]));
  const comparison={numbers:[...m.picks],sum,metric,values};
  m.point.comparisons.push(comparison);
  if (values[0] === values[1]) { m.point.revealed=true; m.phase='point-tie'; log(m,`第 ${m.round+1} 小局：${METRICS[metric].name}相同，公开当前双方卡牌后重新选点。`); return; }
  const winner=values[0] > values[1] ? 0 : 1;
  transfer(m,1-winner,m.point.cards[1-winner].id,'拼点获胜');
  m.rounds.push({index:m.round,kind:'win',winner,cards:structuredClone(m.point.cards),comparison,attempts:m.point.comparisons.length});
  m.scores[winner]++; m.round++; m.phase='round-result';
  log(m,`第 ${m.round} 小局：比${METRICS[metric].name}，${playerName(m,winner)} 获胜并获得对方当前卡。`);
}
function battleAction(m,action) {
  const b=m.battle,p=action.player,other=1-p;
  check(m.phase === 'battle-action' && b.actor === p,'只有猜拳胜者可以行动');
  if (action.type === 'retreat') {
    b.remaining[p]--;
    b.last={player:p,text:`选择撤退，剩余撤退点数 ${b.remaining[p]}`}; log(m,b.last.text);
    if (b.remaining[p] === 0) finish(m,null,'撤退成功，平局，双方保留卡牌'); else m.phase='battle-turn';
    return;
  }
  check(Number.isInteger(action.skill) && action.skill >= 0 && action.skill < 2,'请选择一个技能');
  const skill=CARD[b.cards[p]].skills[action.skill];
  b.hp[other]=Math.max(0,b.hp[other]-skill.damage);
  let detail=`${skill.name}造成 ${skill.damage} 伤害`;
  if (b.hp[other] === 0) {
    b.last={player:p,text:detail}; log(m,detail);
    transfer(m,other,m.hands[other][0].id,'战斗获胜'); finish(m,p,'对方剩余 HP 为 0，战斗获胜'); return;
  }
  if (skill.effect === 'heal') {
    const before=b.hp[p]; b.hp[p]=Math.min(CARD[b.cards[p]].hp,b.hp[p]+skill.amount);
    detail+=`，自己恢复 ${b.hp[p]-before} HP`;
  }
  if (skill.effect === 'delay') {
    const before=b.remaining[other]; b.remaining[other]=Math.min(CARD[b.cards[other]].retreat+2,b.remaining[other]+skill.amount);
    detail+=`，对方剩余撤退 +${b.remaining[other]-before}`;
  }
  b.last={player:p,text:detail}; log(m,detail); m.phase='battle-turn';
}
export function dispatch(match,action,rng=Math.random) {
  check(match.status === 'active','本场对局已经结束');
  const m=structuredClone(match);
  if (action.type === 'control') { check([0,1].includes(action.player),'未知玩家'); check(['ai','human'].includes(action.control),'未知控制方式'); m.controls[action.player]=action.control; return m; }
  if (action.type === 'advance') {
    if (['battle-reveal','battle-turn','rps-tie'].includes(m.phase)) { m.rps=[null,null]; m.phase='rps'; }
    else if (m.phase === 'point-tie') { m.picks=[null,null]; m.phase='point'; }
    else if (m.phase === 'round-result') {
      if (m.round === 5) finish(m,m.scores[0] === m.scores[1] ? null : m.scores[0] > m.scores[1] ? 0 : 1,'五小局完成，保留所有小局赢卡结果');
      else { m.decisions=[null,null]; m.phase='between'; }
    } else throw new Error('当前阶段不能继续');
    return m;
  }
  const p=action.player;
  check([0,1].includes(p),'未知玩家');
  if (action.type === 'surrender') {
    check(m.mode === 'battle' && m.battle,'战斗亮牌后方可主动投降');
    transfer(m,p,m.hands[p][0].id,'战斗投降'); finish(m,1-p,`${playerName(m,p)} 主动投降，失去当前出战卡`); return m;
  }
  check(expectedPlayers(m).includes(p),'这位玩家当前不能提交或已经提交');
  if (action.type === 'select') {
    check(m.phase === 'select','当前不是选卡阶段');
    const count=m.mode === 'point' ? 5 : 1;
    check(Array.isArray(action.ids) && action.ids.length === count && new Set(action.ids).size === count,`请选择 ${count} 张不同的实际卡牌`);
    check(action.ids.every(id => m.inventories[p].some(c => c.id === id)),'只能使用自己实际持有的卡牌');
    m.selections[p]=[...action.ids];
    if (m.selections.every(Boolean)) {
      if (m.mode === 'battle') startBattle(m);
      else { m.hands=m.selections.map((ids,owner) => shuffled(ids.map(id => m.inventories[owner].find(c => c.id === id)),rng)); m.phase='between'; }
    }
  } else if (action.type === 'decision') {
    check(m.phase === 'between' && ['continue','surrender'].includes(action.value),'请选择继续或投降');
    m.decisions[p]=action.value;
    if (m.decisions.every(Boolean)) resolveDecisions(m,rng);
  } else if (action.type === 'point') {
    check(m.phase === 'point' && Number.isInteger(action.value) && action.value >= 1 && action.value <= 6,'点数必须为 1～6');
    m.picks[p]=action.value; if (m.picks.every(v => v !== null)) resolvePoint(m);
  } else if (action.type === 'rps') {
    check(m.phase === 'rps' && ['rock','paper','scissors'].includes(action.value),'请选择石头、剪刀或布');
    m.rps[p]=action.value;
    if (m.rps.every(Boolean)) {
      if (m.rps[0] === m.rps[1]) { m.phase='rps-tie'; log(m,'猜拳平手，双方均不行动，重新猜拳。'); }
      else { const beats={rock:'scissors',scissors:'paper',paper:'rock'}; m.battle.actor=beats[m.rps[0]] === m.rps[1] ? 0 : 1; m.phase='battle-action'; }
    }
  } else if (['attack','retreat'].includes(action.type)) battleAction(m,action);
  else throw new Error('未知操作');
  return m;
}
export function aiAction(m,p,rng=Math.random) {
  if (m.phase === 'select') return {type:'select',player:p,ids:shuffled(m.inventories[p],rng).slice(0,m.mode === 'point' ? 5 : 1).map(c => c.id)};
  if (m.phase === 'between') return {type:'decision',player:p,value:'continue'};
  if (m.phase === 'point') return {type:'point',player:p,value:randomInt(6,rng)+1};
  if (m.phase === 'rps') return {type:'rps',player:p,value:['rock','paper','scissors'][randomInt(3,rng)]};
  if (m.phase === 'battle-action') {
    const own=CARD[m.battle.cards[p]], other=CARD[m.battle.cards[1-p]], b=m.battle;
    const lethal=own.skills.findIndex(s => s.damage >= b.hp[1-p]);
    if (lethal >= 0) return {type:'attack',player:p,skill:lethal};
    if (b.hp[p] <= Math.max(...other.skills.map(s => s.damage)) && b.remaining[p] <= 2) return {type:'retreat',player:p};
    let skill=0,best=-Infinity;
    own.skills.forEach((s,i) => { const score=s.damage+(s.effect === 'heal' ? Math.min(s.amount,own.hp-b.hp[p]) : s.effect === 'delay' && b.remaining[1-p] <= 2 ? 16 : 0); if (score > best) {best=score; skill=i;} });
    return {type:'attack',player:p,skill};
  }
  return null;
}
