import { CARD, METRICS, POINT_NUMBERS, pointMetricIndex } from './data.js';
import { resolveCombatAction } from './combat.js';

export const DIFFICULTIES=Object.freeze({
  easy:{label:'简单',description:'随机选卡、选点和猜拳，使用基础行动判断。'},
  hard:{label:'高难度',description:'预判出点争取优势，结合局势运用技能与撤退。'},
});
export const normalizeDifficulty=value=>value==='hard'?'hard':'easy';
const randomItem=(items,rng)=>items[Math.min(items.length-1,Math.floor(rng()*items.length))];

function publicPointHistory(match) {
  if(match.pointHistory)return match.pointHistory;
  return [...match.rounds.flatMap(r=>r.comparison?[r.comparison.numbers]:[]),...(match.point?.comparisons??[]).map(c=>c.numbers)];
}

export function publicPointOpponents(match,player) {
  const other=1-player;
  if(match.point.revealed)return [CARD[match.point.cards[other].cardId]];
  const played=new Set(match.rounds.flatMap(r=>r.cards.map(c=>c.id)));
  // Older matches without a roster retain their original public-collection estimate.
  const publicCards=match.lineups?.[other]??match.inventories[other];
  return publicCards.filter(c=>!played.has(c.id)).map(c=>CARD[c.cardId]);
}
export function hardPointAction(match,player,rng=Math.random) {
  const own=CARD[match.point.cards[player].cardId], other=1-player;
  let candidates=publicPointOpponents(match,player);
  if(!candidates.length)candidates=[own];
  const advantages=METRICS.map(metric=>candidates.reduce((sum,c)=>sum+Math.sign(metric.read(own)-metric.read(c)),0)/candidates.length);
  const counts=Array(POINT_NUMBERS.length).fill(1);
  for(const numbers of publicPointHistory(match).slice(-18))counts[numbers[other]]++;
  const total=counts.reduce((sum,n)=>sum+n,0);
  const values=POINT_NUMBERS.map(value=>counts.reduce((sum,n,j)=>{
    const metric=pointMetricIndex(value+POINT_NUMBERS[j]);
    return sum+n/total*(metric===null?0:advantages[metric]);
  },0));
  const best=Math.max(...values);
  const bestNumbers=values.flatMap((value,i)=>Math.abs(value-best)<1e-9?[POINT_NUMBERS[i]]:[]);
  const choices=rng()<.12?POINT_NUMBERS:bestNumbers;
  return {type:'point',player,value:randomItem(choices,rng)};
}

export function hardBattleAction(match,player,rng=Math.random) {
  const other=1-player, memo=new Map();
  const actions=[{type:'attack',skill:0},{type:'attack',skill:1},{type:'retreat'}];
  const damage=match.battle.cards.map(id=>Math.max(...CARD[id].skills.map(s=>s.damage)));
  const heuristic=state=>1/(1+Math.exp(-.8*(state.hp[player]/damage[other]-state.hp[other]/damage[player])));
  function afterAction(state,actor,action,depth) {
    const result=resolveCombatAction(state,actor,action);
    if(result.finished)return result.winner===null ? 0.5 : result.winner===player ? 1 : 0;
    return depth===0?heuristic(result.state):nextTurn(result.state,depth-1);
  }
  function nextTurn(state,depth) {
    const key=`${depth}:${state.hp.join(',')}:${state.remaining.join(',')}:${JSON.stringify([state.charge,state.shield,state.echo])}`;
    if(memo.has(key))return memo.get(key);
    const mine=Math.max(...actions.map(a=>afterAction(state,player,a,depth)));
    const theirs=Math.min(...actions.map(a=>afterAction(state,other,a,depth)));
    // Ties replay: either side has equal chance of the next action.
    const value=(mine+theirs)/2;
    memo.set(key,value);
    return value;
  }
  const values=actions.map(a=>afterAction(match.battle,player,a,4));
  const best=Math.max(...values);
  const candidates=actions.filter((_,i)=>Math.abs(values[i]-best)<1e-9);
  const gain=action=>{
    if(action.type==='retreat')return .1;
    const next=resolveCombatAction(match.battle,player,action).state;
    return match.battle.hp[other]-next.hp[other]+next.hp[player]-match.battle.hp[player]+5*(next.remaining[other]-match.battle.remaining[other])+(next.charge[player]&&!match.battle.charge?.[player]?20:0)+(next.shield[player]-(match.battle.shield?.[player]??0));
  };
  const bestGain=Math.max(...candidates.map(gain));
  return {...randomItem(candidates.filter(a=>Math.abs(gain(a)-bestGain)<1e-9),rng),player};
}
