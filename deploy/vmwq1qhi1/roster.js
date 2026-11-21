import { CARD } from './data.js';

export function canLeaveSelection(match) {
  return match?.status==='active'&&match.phase==='select'&&match.selections?.[0]===null&&match.controls?.[0]==='human';
}

// Drafts belong to one unfinished selection; presets describe species counts,
// so another owned copy can replace a card that has since been lost.
export function selectionDraft(match) {
  if(match?.status!=='active'||match.phase!=='select'||match.selections?.[0]!==null)return [];
  const owned=new Set(match.inventories[0].map(card=>card.id));
  return [...new Set(Array.isArray(match.selectionDraft)?match.selectionDraft:[])].filter(id=>owned.has(id)).slice(0,match.mode==='point'?5:1);
}

export function normalizePresets(presets) {
  if(!Array.isArray(presets))return [];
  const seen=new Set();
  return presets.filter(p=>{
    if(!p||typeof p.id!=='string'||seen.has(p.id)||!['battle','point'].includes(p.mode)||typeof p.name!=='string'||!p.name.trim())return false;
    if(!Array.isArray(p.cardIds)||p.cardIds.length!==(p.mode==='point'?5:1)||!p.cardIds.every(id=>CARD[id]))return false;
    seen.add(p.id);return true;
  }).map(p=>({id:p.id,name:p.name.trim().slice(0,20),mode:p.mode,cardIds:[...p.cardIds]}));
}

export function createPreset(id,name,mode,inventory,selectedIds) {
  const count=mode==='point'?5:mode==='battle'?1:0;
  const byId=new Map(inventory.map(card=>[card.id,card]));
  if(!count||selectedIds.length!==count||new Set(selectedIds).size!==count||!selectedIds.every(id=>byId.has(id)))throw new Error('请先选齐出战卡，再保存常用阵容。');
  const title=name.trim().slice(0,20);
  if(!title)throw new Error('请填写阵容名称。');
  return {id,name:title,mode,cardIds:selectedIds.map(id=>byId.get(id).cardId)};
}

export function resolvePreset(preset,inventory) {
  const available=[...inventory],ids=[],missing=[];
  for(const cardId of preset.cardIds){
    const index=available.findIndex(card=>card.cardId===cardId);
    if(index<0)missing.push(cardId);
    else ids.push(available.splice(index,1)[0].id);
  }
  return {ids,missing};
}
