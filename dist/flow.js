import { expectedPlayers } from './engine.js';

export const NEXT_POINT_ROUND_DELAY = 10000;
export function pointRoundPending(match){
  return match?.mode==='point'&&match.round>0&&match.round<5&&['round-result','between'].includes(match.phase);
}
// Only public presentation stages may advance without a player's decision.
const PUBLIC_DELAYS = Object.freeze({
  'battle-reveal': 2600,
  'rps-result': 3200,
  'rps-tie': 3200,
  'battle-turn': 3000,
  'point-tie': 4600,
  'round-result': 4600,
});
export function scheduledStep(match, {autoAdvance=true, paused=false, dialogOpen=false, hidden=false}={}) {
  if (!match || match.status!=='active' || paused || dialogOpen || hidden) return null;
  const expected=expectedPlayers(match);
  const player=expected.find(p=>match.controls[p]==='ai');
  if(player!==undefined)return {kind:'ai',player,delay:650};
  if(autoAdvance&&pointRoundPending(match))return {kind:'next-round',delay:NEXT_POINT_ROUND_DELAY};
  if(!expected.length && (autoAdvance || match.controls.every(c=>c==='ai')) && PUBLIC_DELAYS[match.phase])
    return {kind:'advance',delay:PUBLIC_DELAYS[match.phase]};
  return null;
}
