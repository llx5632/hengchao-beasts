import { CARD } from './data.js';

// Also recognizes older saved surrender results that still contain stale feedback.
export function battleEndedBySurrender(match) {
  return Boolean(match.mode==='battle'&&match.status==='finished'&&match.transfers?.some(t=>t.reason==='战斗投降'));
}

export function clearCombatStatuses(state) {
  state.charge=[false,false];state.shield=[0,0];state.echo=[0,0];
}

export function combatStatuses(state,p) {
  const card=CARD[state.cards[p]],out=[];
  if(card.id==='xianbei')out.push({id:'charge',label:state.charge?.[p]?'蓄势：裂风突袭＋30':'蓄势：未蓄势',active:!!state.charge?.[p],detail:'蓄势扑击赋予一次强化，不叠加；仅使用裂风突袭时消耗。猜拳、受伤和未成功的撤退不消耗，战斗结束清空。'});
  if(card.id==='dielin'||state.shield?.[p])out.push({id:'shield',label:state.shield?.[p]?`护盾${state.shield[p]} · 下次受击消耗`:'护盾：未生效',active:!!state.shield?.[p],detail:'来源：迎击护壳。抵消对方下次技能进攻至多15直接伤害，进攻伤害为0也消耗；余量不保留，不叠加，不取消战斗继续时的附加效果。'});
  if(card.id==='jinzong')out.push({id:'desperate',label:state.hp[p]<=60?'绝境生效 · 反扑60':'绝境：未生效（HP＞60）',active:state.hp[p]<=60,detail:'来源：绝境反扑。使用技能时按当前HP判断，60及以下总伤害60，61及以上30；回血超过60即失效，不在受伤或猜拳落败时自动攻击。'});
  if(card.id==='mingnang')out.push({id:'echo',label:state.echo?.[p]?`回响记录${state.echo[p]} · 可追加${Math.min(30,Math.floor(state.echo[p]/2))}`:'回响：无受伤记录',active:!!state.echo?.[p],detail:'来源：最近一次对方技能造成的实际HP损失，后一次正数覆盖前一次，0伤害不覆盖。仅借势回响使用后清除，另一技能、回血及猜拳不消耗。追加一半向下取整，最多30，不减免原受伤。'});
  return out;
}

// Preview, actual play and AI all use the same resolver. Input remains untouched.
export function resolveCombatAction(battle,player,action) {
  const state={...battle,hp:[...battle.hp],remaining:[...battle.remaining],charge:[...(battle.charge??[false,false])],shield:[...(battle.shield??[0,0])],echo:[...(battle.echo??[0,0])]},other=1-player;
  const events=[],label=p=>CARD[state.cards[p]].name;
  if(action.type==='retreat'){
    state.remaining[player]--;
    const finished=state.remaining[player]===0;if(finished)clearCombatStatuses(state);
    return {state,finished,winner:null,text:`选择撤退，剩余撤退点数 ${state.remaining[player]}`,events};
  }
  const skill=CARD[state.cards[player]].skills[action.skill];
  let bonus=0;
  if(skill.effect==='burst'&&state.charge[player]){bonus=skill.amount;state.charge[player]=false;events.push(`${label(player)}的蓄势已消耗，伤害＋${bonus}`);}
  if(skill.effect==='desperate'&&state.hp[player]<=60){bonus=skill.amount-skill.damage;events.push(`${label(player)}的绝境反扑生效，伤害改为${skill.amount}`);}
  if(skill.effect==='echo'){
    bonus=Math.min(skill.amount,Math.floor(state.echo[player]/2));
    if(state.echo[player])events.push(`${label(player)}的回响记录${state.echo[player]}已消耗，伤害＋${bonus}`);
    state.echo[player]=0;
  }
  const raw=skill.damage+bonus,blocked=Math.min(raw,state.shield[other]);
  if(state.shield[other]){state.shield[other]=0;events.push(`${label(other)}的护盾抵消${blocked}伤害，已消耗`);}
  const damage=Math.min(state.hp[other],Math.max(0,raw-blocked));state.hp[other]-=damage;
  const breakdown={base:skill.damage,bonus,raw,blocked,damage};
  let text=`${skill.name}造成 ${damage} 伤害`;
  if(state.hp[other]===0){clearCombatStatuses(state);return {state,finished:true,winner:player,text:text+(events.length?'；'+events.join('；'):''),events,breakdown};}
  if(CARD[state.cards[other]].id==='mingnang'&&damage>0){const old=state.echo[other];state.echo[other]=damage;events.push(`${label(other)}回响记录${old?'由'+old+'更新为':'为'}${damage}`);}
  if(CARD[state.cards[other]].id==='jinzong'&&battle.hp[other]>60&&state.hp[other]<=60)events.push(`${label(other)}剩余HP降至${state.hp[other]}，绝境效果生效`);
  if(skill.effect==='heal'){
    const before=state.hp[player];state.hp[player]=Math.min(CARD[state.cards[player]].hp,before+skill.amount);
    text+=`，自己恢复 ${state.hp[player]-before} HP`;
    if(CARD[state.cards[player]].id==='jinzong'&&before<=60&&state.hp[player]>60)events.push('回血高于60，绝境效果解除');
  }
  if(skill.effect==='delay'){
    const before=state.remaining[other];state.remaining[other]=Math.min(CARD[state.cards[other]].retreat+2,before+skill.amount);
    text+=`，对方剩余撤退 +${state.remaining[other]-before}`;
  }
  if(skill.effect==='charge'){events.push(state.charge[player]?`${label(player)}已蓄势，不叠加`:`${label(player)}获得蓄势：裂风突袭＋${skill.amount}`);state.charge[player]=true;}
  if(skill.effect==='shield'){events.push(state.shield[player]?`${label(player)}护盾保持${skill.amount}，不叠加`:`${label(player)}获得护盾${skill.amount}`);state.shield[player]=skill.amount;}
  return {state,finished:false,winner:null,text:text+(events.length?'；'+events.join('；'):''),events,breakdown};
}

export function previewSkill(battle,player,skillIndex) {
  const other=1-player,skill=CARD[battle.cards[player]].skills[skillIndex];
  const result=resolveCombatAction(battle,player,{type:'attack',skill:skillIndex});
  const lethal=result.finished&&result.winner===player;
  return {damage:battle.hp[other]-result.state.hp[other],healing:result.state.hp[player]-battle.hp[player],delay:result.state.remaining[other]-battle.remaining[other],targetHp:result.state.hp[other],ownHp:result.state.hp[player],targetRetreat:result.state.remaining[other],lethal,effectSkipped:lethal&&['heal','delay','charge','shield'].includes(skill.effect),events:result.events,breakdown:result.breakdown};
}
