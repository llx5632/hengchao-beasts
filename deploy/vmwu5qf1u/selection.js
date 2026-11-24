import { CARD, ELEMENTS, METRICS } from './data.js';

export const SELECTION_SORTS=Object.freeze([{id:'default',label:'收藏顺序'},...METRICS.map((metric,i)=>({id:String(i),label:metric.name}))]);

export function selectionCards(inventory,{element='全部',sort='default',ascending=false,selectedOnly=false,selectedIds=[]}={}) {
  const selected=new Set(selectedIds);
  const cards=inventory.filter(i=>(element==='全部'||CARD[i.cardId].element===element)&&(!selectedOnly||selected.has(i.id)));
  const option=SELECTION_SORTS.find(o=>o.id===sort);
  if(option&&sort!=='default') {
    const metric=METRICS[Number(sort)];
    cards.sort((a,b)=>(metric.read(CARD[a.cardId])-metric.read(CARD[b.cardId]))*(ascending?1:-1));
  }
  return cards;
}

export function selectionSummary(inventory,selectedIds) {
  const byId=new Map(inventory.map(i=>[i.id,i])),seen=new Set();
  const cards=selectedIds.flatMap(id=>{if(!byId.has(id)||seen.has(id))return [];seen.add(id);return [byId.get(id)];});
  const elements=ELEMENTS.map(element=>({element,count:cards.filter(i=>CARD[i.cardId].element===element).length})).filter(e=>e.count);
  return {cards,elements};
}
