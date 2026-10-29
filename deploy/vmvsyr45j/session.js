import { CARDS } from './data.js';
import { createMatch } from './engine.js';
import { normalizeDifficulty } from './ai.js';

// Keep the earlier hotseat save separate from the local player-versus-AI edition.
export const RULES_REVISION = '2026-10-29-four-rework-both-actions';
export const SAVE_KEY = 'hengchao-local-pve-v2';
export function freshSession() {
  return {
    version: 2,
    rulesRevision: RULES_REVISION,
    specialCardsGranted: true,
    difficulty: 'easy',
    autoAdvance: true,
    battleCompact: true,
    lineupPresets: [],
    selectionDrafts: {},
    players: ['探索者', '群岛 AI'].map((name, player) => ({
      name,
      cards: CARDS.map(card => ({id:`local-${player}-${card.id}`, cardId:card.id})),
    })),
    match: null,
  };
}
export function upgradeSession(session) {
  let changed=false;
  if(!session.specialCardsGranted){
    const ids=['xianbei','dielin','jinzong','mingnang'];
    const existing=new Set(session.players.flatMap(p=>p.cards.map(c=>c.id)));
    session.players.forEach((p,player)=>{
      for(const cardId of ids){const id=`release-special-${player}-${cardId}`;if(existing.has(id))continue;
        const card={id,cardId};p.cards.push(card);existing.add(id);
        if(session.match?.status==='active')session.match.inventories[player].push({...card});
      }
    });
    session.specialCardsGranted=true;changed=true;
  }
  if(session.rulesRevision!==RULES_REVISION){
    if(session.match){session.match=null;session.releaseNotice='技能规则已更新，旧对局已清理；收藏及已结算的赢失卡结果保留。';}
    session.selectionLobby=false;session.selectionDrafts={};session.rulesRevision=RULES_REVISION;changed=true;
  }
  return changed;
}
export function createLocalMatch(mode, players, difficulty='easy') {
  const match = createMatch(mode, players.map(player => player.cards));
  match.difficulty = normalizeDifficulty(difficulty);
  match.controls = ['human', 'ai'];
  match.playerNames = players.map(player => player.name);
  return match;
}
