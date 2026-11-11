import { SAVE_KEY, freshSession, upgradeSession } from './session.js';
import { normalizeDifficulty } from './ai.js';
import { normalizePresets } from './roster.js';
import { normalizeTutorial } from './tutorial.js';
import { normalizeEasterEgg } from './easter-egg.js';

const resolveStorage=storage=>typeof storage==='function'?storage():storage;

// Storage is injected so browser persistence can be checked without a DOM.
export function loadSession(storage){
  let store,hadSavedSession=false;
  try { const saved=JSON.parse(resolveStorage(storage).getItem(SAVE_KEY)); hadSavedSession=saved?.version === 2 && saved.players?.length === 2;store=hadSavedSession?saved:freshSession(); } catch { store=freshSession(); }
  const sessionUpdated=upgradeSession(store);
  store.difficulty=normalizeDifficulty(store.difficulty);
  store.autoAdvance=store.autoAdvance!==false;
  store.battleCompact=store.battleCompact!==false;
  store.lineupPresets=normalizePresets(store.lineupPresets);
  store.selectionDrafts=store.selectionDrafts&&typeof store.selectionDrafts==='object'&&!Array.isArray(store.selectionDrafts)?store.selectionDrafts:{};
  store.tutorial=normalizeTutorial(store.tutorial,!hadSavedSession);
  store.easterEgg=normalizeEasterEgg(store.easterEgg);
  if(store.match)store.match.difficulty=normalizeDifficulty(store.match.difficulty);
  return {store,hadSavedSession,sessionUpdated};
}

export function saveSession(storage,store){
  try{resolveStorage(storage).setItem(SAVE_KEY,JSON.stringify(store));return true;}catch{return false;}
}
