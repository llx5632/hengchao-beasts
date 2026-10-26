import { CARDS } from './data.js';
import { createMatch } from './engine.js';

// Keep the earlier hotseat save separate from the local player-versus-AI edition.
export const SAVE_KEY = 'hengchao-local-pve-v2';
export function freshSession() {
  return {
    version: 2,
    players: ['探索者', '群岛 AI'].map((name, player) => ({
      name,
      cards: CARDS.map(card => ({id:`local-${player}-${card.id}`, cardId:card.id})),
    })),
    match: null,
  };
}
export function createLocalMatch(mode, players) {
  const match = createMatch(mode, players.map(player => player.cards));
  match.controls = ['human', 'ai'];
  match.playerNames = players.map(player => player.name);
  return match;
}
