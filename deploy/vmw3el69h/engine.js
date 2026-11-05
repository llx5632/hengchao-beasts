import { CARD, TWIN_PARTNERS, BEATS, METRICS, POINT_NUMBERS, pointMetricIndex } from './data.js';
import { hardPointAction, hardBattleAction } from './ai.js';
import { resolveCombatAction, clearCombatStatuses, combatStatusValue, applyRpsLoss, battleForViewer, skillAvailable, skillUnavailableReason, battleActions, twinDamageMultiplier, combatOutcomes, expectedCombatScore, immediateCombatScore, simpleDiceChoice } from './combat.js';

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
  return { mode, phase:'select', status:'active', difficulty:'easy', inventories:structuredClone(inventories), selections:[null,null], lineups:null, lineupReady:[false,false], hands:null, battle:null, point:null, round:0, rounds:[], scores:[0,0], decisions:[null,null], picks:[null,null], rps:[null,null], controls:['human','human'], winner:null, reason:null, history:[], transfers:[] };
}
export function expectedPlayers(m) {
  if (m.status !== 'active') return [];
  if (m.phase === 'lineup-reveal') return [0,1].filter(p => !m.lineupReady[p]);
  const key = {select:'selections',between:'decisions',point:'picks',rps:'rps'}[m.phase];
  if (key) return [0,1].filter(p => m[key][p] === null);
  return m.phase === 'dice-choice' ? [m.battle.dicePending.player] : m.phase === 'battle-action' ? [m.battle.actor] : [];
}
const log = (m,text) => m.history.push(text);
const playerName = (m,p) => m.playerNames?.[p] ?? `探索者 ${p === 0 ? 'A' : 'B'}`;
function finish(m,winner,reason) { m.status='finished'; m.phase='finished'; m.winner=winner; m.reason=reason; if(m.battle)clearCombatStatuses(m.battle); log(m,reason); }
function transfer(m,from,id,reason) {
  const index = m.inventories[from].findIndex(c => c.id === id);
  check(index >= 0,'这张卡牌已经结算，不能重复转移');
  const [instance] = m.inventories[from].splice(index,1);
  m.inventories[1-from].push(instance);
  m.transfers.push({from,to:1-from,id,cardId:instance.cardId,reason});
}
function activeBattleInstance(m,p){return m.battle.instances?.[p]??m.hands[p][0];}
function startBattle(m) {
  m.hands=m.selections.map(ids => ids.map(id => m.inventories.flat().find(c => c.id === id)));
  const cards=m.hands.map(h => CARD[h[0].cardId]);
  m.battle={instances:m.hands.map(h=>({...h[0]})),twinPairs:structuredClone(m.twinBindings??[null,null]),cards:cards.map(c => c.id),hp:cards.map(c => c.hp),remaining:cards.map(c => c.retreat),actor:null,last:null,charge:[false,false],shield:[0,0],echo:[0,0]};
  clearCombatStatuses(m.battle);
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
  const sum=m.picks[0]+m.picks[1], metric=pointMetricIndex(sum);
  const values=metric===null ? null : m.point.cards.map(c => METRICS[metric].read(CARD[c.cardId]));
  const comparison={kind:metric===null?'double-zero':'metric',numbers:[...m.picks],sum,metric,values};
  m.point.comparisons.push(comparison);
  if(!m.pointHistory)m.pointHistory=m.rounds.flatMap(r=>r.comparison?[[...r.comparison.numbers]]:[]).concat(m.point.comparisons.slice(0,-1).map(c=>[...c.numbers]));
  m.pointHistory.push([...m.picks]);
  if(metric===null) { m.point.revealed=true;m.phase='point-tie';log(m,`第 ${m.round+1} 小局：双方均出 0，本次直接平手，公开当前双方卡牌后用原卡重新选点。`);return; }
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
  if(action.type==='attack')check(Number.isInteger(action.skill) && action.skill >= 0 && action.skill < 2,'请选择一个技能');
  if(action.type==='attack'&&CARD[b.cards[p]].skills[action.skill].effect==='predict'&&!b.prediction?.[p])check(['attack','retreat'].includes(action.prediction),'请先秘密预判进攻或撤退');
  if(action.type==='attack'){
    check(skillAvailable(b,p,action.skill),skillUnavailableReason(b,p,action.skill));
    if(CARD[b.cards[p]].skills[action.skill].effect==='twin-shift')for(const instance of Object.values(b.twinPairs[p]))check(m.inventories[p].some(c=>c.id===instance.id&&c.cardId===instance.cardId),'绑定的双生卡牌不在自己的收藏中');
  }
  const result=resolveCombatAction(b,p,action);
  m.battle=result.state;
  m.battle.last={player:p,text:result.text,before:{hp:[...b.hp],remaining:[...b.remaining]},after:{hp:[...result.state.hp],remaining:[...result.state.remaining]}};log(m,result.text);
  if(!result.finished)m.phase='battle-turn';
  else if(result.winner===null)finish(m,null,action.type==='retreat'&&result.state.remaining[p]===0?'撤退成功，平局，双方保留卡牌':result.effects.deathTriggered.some(Boolean)?'殒爆后双方HP归零，平局，双方保留卡牌':'双方持续伤害同时归零，平局，双方保留卡牌');
  else {const winner=result.winner,loser=1-winner;transfer(m,loser,activeBattleInstance(m,loser).id,'战斗获胜');finish(m,winner,result.effects.burnDamage.some(Boolean)?'持续伤害结算后HP归零，战斗结束':'对方剩余 HP 为 0，战斗获胜');}
}

export function dispatch(match,action,rng=Math.random) {
  check(match.status === 'active','本场对局已经结束');
  const m=structuredClone(match);
  if (action.type === 'control') { check([0,1].includes(action.player),'未知玩家'); check(['ai','human'].includes(action.control),'未知控制方式'); m.controls[action.player]=action.control; return m; }
  if (action.type === 'advance') {
    if (m.phase === 'rps-result') m.phase='battle-action';
    else if (['battle-reveal','battle-turn','rps-tie'].includes(m.phase)) { m.rps=[null,null]; m.phase='rps'; }
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
    m.battle.last=null;m.battle.dicePending=null;m.battle.actor=null;m.rps=[null,null];
    transfer(m,p,activeBattleInstance(m,p).id,'战斗投降'); finish(m,1-p,`${playerName(m,p)} 主动投降，失去当前出战卡`); return m;
  }
  check(expectedPlayers(m).includes(p),'这位玩家当前不能提交或已经提交');
  if (action.type === 'select') {
    check(m.phase === 'select','当前不是选卡阶段');
    const count=m.mode === 'point' ? 5 : 1;
    check(Array.isArray(action.ids) && action.ids.length === count && new Set(action.ids).size === count,`请选择 ${count} 张不同的实际卡牌`);
    check(action.ids.every(id => m.inventories[p].some(c => c.id === id)),'只能使用自己实际持有的卡牌');
    m.selections[p]=[...action.ids];
    if(m.mode==='battle'){
      const selected=m.inventories[p].find(c=>c.id===action.ids[0]),partnerId=TWIN_PARTNERS[selected.cardId];
      const partner=partnerId?m.inventories[p].filter(c=>c.cardId===partnerId).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)[0]:null;
      m.twinBindings??=[null,null];
      m.twinBindings[p]=partner?{[selected.cardId]:{...selected},[partnerId]:{...partner}}:null;
    }
    if (m.selections.every(Boolean)) {
      if (m.mode === 'battle') startBattle(m);
      else {
        // Public roster order is independent of both selection order and the future queue.
        m.lineups=m.selections.map((ids,owner) => ids.map(id => structuredClone(m.inventories[owner].find(c => c.id === id))).sort((a,b)=>a.cardId.localeCompare(b.cardId)||a.id.localeCompare(b.id)));
        m.lineupReady=[false,false];m.phase='lineup-reveal';
        log(m,'双方出战卡已封存，同时公开各自五张阵容；确认后分别打乱，出场顺序保密。');
      }
    }
  } else if (action.type === 'lineup-ready') {
    check(m.phase === 'lineup-reveal','当前不是阵容展示阶段');
    m.lineupReady[p]=true;
    if(m.lineupReady.every(Boolean)) {
      m.hands=m.lineups.map(cards=>shuffled(structuredClone(cards),rng));
      m.decisions=[null,null];m.phase='between';
      log(m,'双方已确认公开阵容，出场顺序分别打乱，准备第一小局前的继续或投降决定。');
    }
  } else if (action.type === 'decision') {
    check(m.phase === 'between' && ['continue','surrender'].includes(action.value),'请选择继续或投降');
    m.decisions[p]=action.value;
    if (m.decisions.every(Boolean)) resolveDecisions(m,rng);
  } else if (action.type === 'point') {
    check(m.phase === 'point' && POINT_NUMBERS.includes(action.value),'点数必须为 0～6 的整数');
    m.picks[p]=action.value; if (m.picks.every(v => v !== null)) resolvePoint(m);
  } else if (action.type === 'rps') {
    check(m.phase === 'rps' && ['rock','paper','scissors'].includes(action.value),'请选择石头、剪刀或布');
    m.rps[p]=action.value;
    if (m.rps.every(Boolean)) {
      if (m.rps[0] === m.rps[1]) { m.phase='rps-tie'; log(m,'猜拳平手，双方均不行动，重新猜拳。'); }
      else { const beats={rock:'scissors',scissors:'paper',paper:'rock'}; m.battle.actor=beats[m.rps[0]] === m.rps[1] ? 0 : 1; m.phase='rps-result'; const hands={rock:'石头',paper:'布',scissors:'剪刀'}; log(m,`${playerName(m,0)}出${hands[m.rps[0]]}，${playerName(m,1)}出${hands[m.rps[1]]}；${playerName(m,m.battle.actor)}获得一次行动权。`);
        const loser=1-m.battle.actor,before=m.battle.wind?.[loser]??-1;m.battle=applyRpsLoss(m.battle,loser);
        if(m.battle.wind[loser]>before)log(m,`${CARD[m.battle.cards[loser]].name}猜拳落败，风压积至${m.battle.wind[loser]}层，下次进攻＋${m.battle.wind[loser]*25}`);
      }
    }
  } else if(['dice-keep','dice-reroll'].includes(action.type)){
    check(m.phase==='dice-choice'&&m.battle.dicePending?.player===p,'当前没有待决定的骰点');
    const pending=m.battle.dicePending,rerolled=action.type==='dice-reroll',die=rerolled?randomInt(6,rng)+1:pending.first;
    m.battle.lastDice={player:p,skill:pending.skill,first:pending.first,second:rerolled?die:null,final:die,rerolled,settled:true};
    m.battle.dicePending=null;m.phase='battle-action';
    battleAction(m,{type:'attack',player:p,skill:pending.skill,die});
    const prefix=rerolled?`首掷${pending.first}，重掷${die}并接受新结果；`:`保留骰点${die}；`;
    m.battle.last.text=prefix+m.battle.last.text;log(m,prefix);
  } else if (['attack','retreat'].includes(action.type)){
    if(action.type==='attack'&&m.phase==='battle-action'&&CARD[m.battle.cards[p]].skills[action.skill]?.effect==='dice'){
      check(Number.isInteger(action.skill)&&action.skill>=0&&action.skill<2,'请选择一个技能');
      m.battle.dicePending={player:p,skill:action.skill,first:randomInt(6,rng)+1,rerollsLeft:1};
      m.battle.last=null;m.phase='dice-choice';log(m,`${playerName(m,p)}使用掷金碰运，首掷${m.battle.dicePending.first}，等待保留或重掷一次。`);
    }else battleAction(m,action);
  }
  else throw new Error('未知操作');
  return m;
}
export function aiAction(m,p,rng=Math.random) {
  if (m.phase === 'select') return {type:'select',player:p,ids:shuffled(m.inventories[p],rng).slice(0,m.mode === 'point' ? 5 : 1).map(c => c.id)};
  if (m.phase === 'lineup-reveal') return {type:'lineup-ready',player:p};
  if (m.phase === 'between') return {type:'decision',player:p,value:'continue'};
  if (m.phase === 'point') return m.difficulty==='hard'?hardPointAction(m,p,rng):{type:'point',player:p,value:POINT_NUMBERS[randomInt(POINT_NUMBERS.length,rng)]};
  if (m.phase === 'rps') return {type:'rps',player:p,value:['rock','paper','scissors'][randomInt(3,rng)]};
  if(m.phase==='dice-choice')return m.difficulty==='hard'?hardBattleAction(m,p,rng):{type:simpleDiceChoice(m.battle,p),player:p};
  if (m.phase === 'battle-action') {
    if(m.difficulty==='hard')return hardBattleAction(m,p,rng);
    const own=CARD[m.battle.cards[p]], other=CARD[m.battle.cards[1-p]], b=battleForViewer(m.battle,p);
    const prediction=b.remaining[1-p]<=1&&b.hp[1-p]<=Math.max(...own.skills.map(s=>s.damage))?'retreat':'attack';
    const attack=skill=>({type:'attack',player:p,skill,...(own.skills[skill].effect==='predict'&&!b.prediction?.[p]?{prediction}:{})});
    const options=own.skills.map((s,skill)=>skillAvailable(b,p,skill)?combatOutcomes(b,p,attack(skill)):[]);
    const projected=options.map(rs=>rs[0]??null);
    const lethal=options.findIndex(rs=>rs.length&&rs.every(r=>r.finished&&r.winner===p));
    if (lethal >= 0) return attack(lethal);
    const retreat=resolveCombatAction(b,p,{type:'retreat'});
    const ward=own.skills.findIndex(s=>s.effect==='death-ward');
    if(ward>=0&&!b.deathUsed?.[p]&&!(retreat.finished&&retreat.winner===null)){
      const r=projected[ward];
      if(r?.finished&&r.winner===null)return attack(ward);
      if(r&&!r.finished&&battleActions(r.state,1-p).filter(a=>a.type==='attack').some(a=>combatOutcomes(r.state,1-p,a).every(n=>n.finished&&n.winner===null&&n.effects.deathTriggered[p])))return attack(ward);
    }
    if ((!retreat.finished||retreat.winner!==1-p)&&b.hp[p] <= Math.max(...battleActions(b,1-p).filter(a=>a.type==='attack').flatMap(a=>combatOutcomes(b,1-p,a).map(r=>b.hp[p]-r.state.hp[p]))) && b.remaining[p] <= 2) return {type:'retreat',player:p};
    const survives=options.some(rs=>rs.some(r=>!r.finished||r.winner===p));
    if(!survives&&(!retreat.finished||retreat.winner===null))return {type:'retreat',player:p};
    let skill=0,best=-Infinity;
    own.skills.forEach((s,i)=>{const r=projected[i];if(!r)return;const next=r.state;
      const score=s.effect==='dice'?expectedCombatScore(b,p,attack(i),r=>immediateCombatScore(b,p,r)):r.finished&&r.winner===1-p?-10000:b.hp[1-p]-next.hp[1-p]+next.hp[p]-b.hp[p]+combatStatusValue(next,p)-combatStatusValue(b,p)+(s.effect==='twin-shift'?(twinDamageMultiplier(CARD[next.cards[p]].skills[0],other.element)-twinDamageMultiplier(own.skills[0],other.element))*own.skills[0].damage:0)+(s.effect==='delay'&&b.remaining[1-p]<=2?16:0)-(next.remaining[p]-b.remaining[p])*2;
      if(score>best){best=score;skill=i;}
    });
    return attack(skill);
  }
  return null;
}
