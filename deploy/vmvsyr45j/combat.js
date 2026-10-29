import { CARD } from './data.js';
export function battleEndedBySurrender(m){return Boolean(m.mode==='battle'&&m.status==='finished'&&m.transfers?.some(t=>t.reason==='战斗投降'));}
const empty=()=>({charge:[false,false],shield:[0,0],echo:[0,0],burn:[0,0],mark:[null,null],weaken:[0,0],root:[0,0]});
export function clearCombatStatuses(s){Object.assign(s,empty());}
export function combatStatusKey(s){return JSON.stringify(Object.entries(empty()).map(([k,v])=>s[k]??v));}
export function combatStatusValue(s,p){
  const v=i=>(s.charge?.[i]?20:0)+(s.shield?.[i]??0)*.7+Math.min(30,Math.floor((s.echo?.[i]??0)/2))*.6+(s.root?.[i]??0)*14-(s.burn?.[i]??0)*10-(s.weaken?.[i]??0)*6-(s.mark?.[i]===1-i?18:0);
  return v(p)-v(1-p);
}
export function combatStatuses(s,p){
  const c=CARD[s.cards[p]],out=[],other=1-p,add=(id,label,active,detail)=>out.push({id,label,active,detail});
  if(c.id==='xianbei')add('charge',s.charge?.[p]?'蓄势：裂风突袭＋30':'蓄势：未蓄势',!!s.charge?.[p],'来源：蓄势扑击。仅下次裂风突袭消耗，不叠加；猜拳、受伤及未成功撤退保留，结束清空。');
  if(c.id==='dielin'||s.shield?.[p])add('shield',s.shield?.[p]?`护盾${s.shield[p]} · 下次受击消耗`:'护盾：未生效',!!s.shield?.[p],'来源：迎击护壳。抵消下次技能进攻至多15直接伤害，0伤害也消耗，余量不留、不叠加。不抵消持续伤害，不取消存活时的附加效果。');
  if(c.id==='jinzong')add('desperate',s.hp[p]<=60?'绝境生效 · 反扑60':'绝境：未生效（HP＞60）',s.hp[p]<=60,'来源：绝境反扑。使用时HP≤60总伤害60，否则30；回血高于60即失效，不自动反击。');
  if(c.id==='mingnang')add('echo',s.echo?.[p]?`回响记录${s.echo[p]} · 可追加${Math.min(30,Math.floor(s.echo[p]/2))}`:'回响：无受伤记录',!!s.echo?.[p],'来源：最近一次对方技能的实际直接HP损失，正数覆盖、0不覆盖，持续伤害不记录。仅借势回响消耗，一半向下取整、最多30。');
  if(s.burn?.[p])add('burn',`余烬15 · 余${s.burn[p]}次双方行动`,true,`来源：${CARD[s.cards[other]].name}的烬羽横扫。任一方进攻或撤退后，战斗仍继续则扣15；首次施加从下次行动起，猜拳不触发。先回血后持续伤害，直接击败或撤退成功立即结束。刷新至2次、不叠加；旧烙印即使本次刷新也正常触发。`);
  if(s.mark?.[p]===other)add('mark','晶痕 · 对方猛咬＋25',true,`来源：${CARD[s.cards[other]].name}的碎晶飞掷。只被施加者的裂晶猛咬消耗，不叠加；盾抵消仍消耗，猜拳及其他行动保留。`);
  if(s.weaken?.[p])add('weaken',`攻击－25% · 余${s.weaken[p]}次进攻`,true,`来源：${CARD[s.cards[other]].name}的抑力孢雾。强化后的直接伤害乘75%向下取整，再减护盾；不减回血、阻退、状态或持续伤害。0实际伤害仍消耗，撤退/猜拳不消耗，刷新为2次、不叠加。`);
  if(c.id==='genguan')add('root',s.root?.[p]?`根劲＋20 · 余${s.root[p]}次撞击`:'根劲：未蓄能',!!s.root?.[p],'来源：扎根蓄能。无根劲且自己剩余撤退＜5时，实际＋1才获得2次根劲；只强化根角冲撞各＋20。已有根劲不刷新、不重复付代价，上限时无法蓄能；用完不返还撤退点数。');
  return out;
}
// Preview, real play and AI share an immutable resolver.
export function resolveCombatAction(battle,player,action){
  const state={...battle,hp:[...battle.hp],remaining:[...battle.remaining]};
  for(const [k,v] of Object.entries(empty()))state[k]=[...(battle[k]??v)];
  const other=1-player,startBurn=[...state.burn],events=[],effects={healing:0,delay:0,ownRetreatAdded:0,burnDamage:[0,0],burnSkipped:false};
  const label=p=>CARD[state.cards[p]].name;let text='',breakdown=null;
  function outcome(finished=false,winner=null){
    if(finished){effects.burnSkipped=startBurn.some(Boolean)&&!effects.burnDamage.some(Boolean);clearCombatStatuses(state);}
    else for(const p of [0,1])if(CARD[state.cards[p]].id==='jinzong'){
      if(battle.hp[p]>60&&state.hp[p]<=60)events.push(`${label(p)}剩余HP降至${state.hp[p]}，绝境效果生效`);
      if(battle.hp[p]<=60&&state.hp[p]>60)events.push(`${label(p)}回血高于60，绝境效果解除`);
    }
    return {state,finished,winner,text:text+(events.length?'；'+events.join('；'):''),events,effects,breakdown};
  }
  function actionEnd(){
    // Snapshot eligibility: newly applied damage waits; existing refreshed damage still ticks.
    for(const p of [0,1])if(startBurn[p]){
      effects.burnDamage[p]=Math.min(15,state.hp[p]);state.hp[p]-=effects.burnDamage[p];state.burn[p]--;
      events.push(`${label(p)}受到${effects.burnDamage[p]}烙印伤害，${state.burn[p]?`剩余${state.burn[p]}次双方行动`:'烙印已结束'}`);
    }
    const dead=state.hp.map(h=>h===0);
    if(dead.some(Boolean))return outcome(true,dead.every(Boolean)?null:dead[0]?1:0);
    return outcome();
  }
  if(action.type==='retreat'){
    state.remaining[player]--;text=`选择撤退，剩余撤退点数 ${state.remaining[player]}`;
    return state.remaining[player]===0?outcome(true,null):actionEnd();
  }
  const skill=CARD[state.cards[player]].skills[action.skill];let bonus=0;
  if(skill.effect==='burst'&&state.charge[player]){bonus=skill.amount;state.charge[player]=false;events.push(`${label(player)}的蓄势已消耗，伤害＋${bonus}`);}
  if(skill.effect==='desperate'&&state.hp[player]<=60){bonus=skill.amount-skill.damage;events.push(`${label(player)}的绝境反扑生效，伤害改为${skill.amount}`);}
  if(skill.effect==='echo'){
    bonus=Math.min(skill.amount,Math.floor(state.echo[player]/2));
    if(state.echo[player])events.push(`${label(player)}的回响记录${state.echo[player]}已消耗，伤害＋${bonus}`);
    state.echo[player]=0;
  }
  if(skill.effect==='bite'&&state.mark[other]===player){bonus=skill.amount;state.mark[other]=null;events.push(`${label(other)}的晶痕已消耗，猛咬伤害＋${bonus}`);}
  if(skill.effect==='root-strike'&&state.root[player]){bonus=skill.amount;state.root[player]--;events.push(`${label(player)}消耗1次根劲，伤害＋${bonus}，剩余${state.root[player]}次`);}
  const raw=skill.damage+bonus,multiplier=state.weaken[player]?0.75:1,afterReduction=Math.floor(raw*multiplier);
  if(state.weaken[player]){state.weaken[player]--;events.push(`${label(player)}进攻被削弱25%，${raw}→${afterReduction}，剩余${state.weaken[player]}次`);}
  const blocked=Math.min(afterReduction,state.shield[other]);
  if(state.shield[other]){state.shield[other]=0;events.push(`${label(other)}的护盾抵消${blocked}伤害，已消耗`);}
  const damage=Math.min(state.hp[other],Math.max(0,afterReduction-blocked));state.hp[other]-=damage;
  breakdown={base:skill.damage,bonus,raw,multiplier,afterReduction,blocked,damage};text=`${skill.name}造成 ${damage} 伤害（直接）`;
  if(state.hp[other]===0)return outcome(true,player);
  if(CARD[state.cards[other]].id==='mingnang'&&damage>0){const old=state.echo[other];state.echo[other]=damage;events.push(`${label(other)}回响记录${old?'由'+old+'更新为':'为'}${damage}`);}
  if(skill.effect==='heal'){effects.healing=Math.min(skill.amount,CARD[state.cards[player]].hp-state.hp[player]);state.hp[player]+=effects.healing;text+=`，自己恢复 ${effects.healing} HP`;}
  if(skill.effect==='delay'){effects.delay=Math.max(0,Math.min(skill.amount,CARD[state.cards[other]].retreat+2-state.remaining[other]));state.remaining[other]+=effects.delay;text+=`，对方剩余撤退 +${effects.delay}`;}
  if(skill.effect==='charge'){events.push(state.charge[player]?`${label(player)}已蓄势，不叠加`:`${label(player)}获得蓄势：裂风突袭＋${skill.amount}`);state.charge[player]=true;}
  if(skill.effect==='shield'){events.push(`${label(player)}${state.shield[player]?'保持':'获得'}护盾${skill.amount}，不叠加`);state.shield[player]=skill.amount;}
  if(skill.effect==='burn'){events.push(`${label(other)}${state.burn[other]?'刷新':'获得'}余烬烙印：之后2次任一方行动末各受15伤害，不叠加`);state.burn[other]=2;}
  if(skill.effect==='mark'){events.push(state.mark[other]===player?`${label(other)}已有晶痕，不叠加`:`${label(other)}获得来自${label(player)}的晶痕`);state.mark[other]=player;}
  if(skill.effect==='weaken'){events.push(`${label(other)}${state.weaken[other]?'刷新':'获得'}攻击削弱25%：之后2次进攻，不叠加`);state.weaken[other]=2;}
  if(skill.effect==='root'){
    if(state.root[player])events.push(`${label(player)}已有${state.root[player]}次根劲，不刷新、不再增加撤退`);
    else if(state.remaining[player]>=CARD[state.cards[player]].retreat+2)events.push(`${label(player)}剩余撤退已达5，无法蓄能`);
    else{state.remaining[player]++;effects.ownRetreatAdded=1;state.root[player]=2;events.push(`${label(player)}剩余撤退＋1至${state.remaining[player]}，获得2次根劲`);}
  }
  return actionEnd();
}
export function previewSkill(battle,player,skillIndex){
  const other=1-player,skill=CARD[battle.cards[player]].skills[skillIndex],r=resolveCombatAction(battle,player,{type:'attack',skill:skillIndex});
  const directLethal=r.breakdown.damage===battle.hp[other];
  return {damage:r.breakdown.damage,healing:r.effects.healing,delay:r.effects.delay,targetHp:r.state.hp[other],ownHp:r.state.hp[player],targetRetreat:r.state.remaining[other],ownRetreat:r.state.remaining[player],ownRetreatAdded:r.effects.ownRetreatAdded,burnDamage:r.effects.burnDamage,burnSkipped:r.effects.burnSkipped,selfDefeat:r.finished&&r.winner===other,draw:r.finished&&r.winner===null,lethal:r.finished&&r.winner===player,effectSkipped:directLethal&&['heal','delay','charge','shield','burn','mark','weaken','root'].includes(skill.effect),events:r.events,breakdown:r.breakdown};
}
