import { CARD } from './data.js';

// Also recognizes older saved surrender results that still contain stale feedback.
export function battleEndedBySurrender(match) {
  return Boolean(match.mode==='battle'&&match.status==='finished'&&match.transfers?.some(t=>t.reason==='战斗投降'));
}

// Shared by actual combat and AI lookahead, so effects and terminal results agree.
export function resolveCombatAction(battle, player, action) {
  const state={...battle,hp:[...battle.hp],remaining:[...battle.remaining]}, other=1-player;
  if(action.type==='retreat') {
    state.remaining[player]--;
    return {state,finished:state.remaining[player]===0,winner:null,text:`选择撤退，剩余撤退点数 ${state.remaining[player]}`};
  }
  const skill=CARD[state.cards[player]].skills[action.skill];
  state.hp[other]=Math.max(0,state.hp[other]-skill.damage);
  let text=`${skill.name}造成 ${battle.hp[other]-state.hp[other]} 伤害`;
  if(state.hp[other]===0)return {state,finished:true,winner:player,text};
  if(skill.effect==='heal') {
    const before=state.hp[player];
    state.hp[player]=Math.min(CARD[state.cards[player]].hp,before+skill.amount);
    text+=`，自己恢复 ${state.hp[player]-before} HP`;
  }
  if(skill.effect==='delay') {
    const before=state.remaining[other];
    state.remaining[other]=Math.min(CARD[state.cards[other]].retreat+2,before+skill.amount);
    text+=`，对方剩余撤退 +${state.remaining[other]-before}`;
  }
  return {state,finished:false,winner:null,text};
}

// Read-only preview uses exactly the same caps and terminal ordering as execution.
export function previewSkill(battle,player,skillIndex) {
  const other=1-player,skill=CARD[battle.cards[player]].skills[skillIndex];
  const result=resolveCombatAction(battle,player,{type:'attack',skill:skillIndex});
  const lethal=result.finished&&result.winner===player;
  return {
    damage:battle.hp[other]-result.state.hp[other],
    healing:result.state.hp[player]-battle.hp[player],
    delay:result.state.remaining[other]-battle.remaining[other],
    targetHp:result.state.hp[other],ownHp:result.state.hp[player],targetRetreat:result.state.remaining[other],
    lethal,effectSkipped:lethal&&!!skill.effect,
  };
}
