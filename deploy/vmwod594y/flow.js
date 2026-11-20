import { expectedPlayers } from './engine.js';

// Only public presentation stages may advance without a player's decision.
const PUBLIC_DELAYS = Object.freeze({
  'battle-reveal': 2600,
  'rps-result': 2200,
  'rps-tie': 2200,
  'battle-turn': 3000,
  'point-tie': 4000,
  'round-result': 4000,
});
export function scheduledStep(match, {autoAdvance=true, paused=false, dialogOpen=false, hidden=false}={}) {
  if (!match || match.status!=='active' || paused || dialogOpen || hidden) return null;
  const expected=expectedPlayers(match);
  const player=expected.find(p=>match.controls[p]==='ai');
  if(player!==undefined)return {kind:'ai',player,delay:650};
  if(!expected.length && (autoAdvance || match.controls.every(c=>c==='ai')) && PUBLIC_DELAYS[match.phase])
    return {kind:'advance',delay:PUBLIC_DELAYS[match.phase]};
  return null;
}
