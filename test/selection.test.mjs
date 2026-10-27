import test from 'node:test';
import assert from 'node:assert/strict';
import { selectionCards, selectionSummary } from '../dist/selection.js';

const inventory=['taituan','panjia','mingjing','woxu','fuyun','panjia'].map((cardId,i)=>({id:`copy-${i}`,cardId}));
const ids=cards=>cards.map(c=>c.id);
test('六项排序读取卡牌静态值，降序与升序正确，同分副本保留收藏顺序',()=>{
  const expected=[['copy-2','copy-4','copy-3','copy-0','copy-1','copy-5'],['copy-1','copy-5','copy-4','copy-3','copy-2','copy-0'],['copy-1','copy-5','copy-4','copy-3','copy-0','copy-2'],['copy-1','copy-5','copy-4','copy-2','copy-3','copy-0'],['copy-4','copy-1','copy-5','copy-3','copy-2','copy-0'],['copy-1','copy-5','copy-4','copy-3','copy-2','copy-0']];
  for(let metric=0;metric<6;metric++)assert.deepEqual(ids(selectionCards(inventory,{sort:String(metric)})),expected[metric]);
  assert.deepEqual(ids(selectionCards(inventory,{sort:'1',ascending:true})),['copy-0','copy-2','copy-3','copy-4','copy-1','copy-5']);
  assert.deepEqual(ids(selectionCards(inventory)),ids(inventory));
});
test('属性筛选和只看已选可组合，隐藏已选卡不修改阵容或实际副本',()=>{
  const selected=['copy-1','copy-5','copy-3'],before=structuredClone(inventory);
  assert.deepEqual(ids(selectionCards(inventory,{element:'岩',selectedOnly:true,selectedIds:selected})),['copy-1','copy-5']);
  assert.deepEqual(selectionSummary(inventory,selected).elements,[{element:'水',count:1},{element:'岩',count:2}]);
  assert.deepEqual(ids(selectionCards(inventory,{element:'火',selectedIds:selected})),[]);
  assert.deepEqual(ids(selectionSummary(inventory,selected).cards),selected);
  assert.deepEqual(inventory,before);assert.deepEqual(selected,['copy-1','copy-5','copy-3']);
});
test('阵容概览按实际实例显示，去掉失效或重复 ID，支持单张和空阵容',()=>{
  assert.deepEqual(ids(selectionSummary(inventory,['copy-5','missing','copy-1','copy-5']).cards),['copy-5','copy-1']);
  assert.deepEqual(selectionSummary(inventory,[]),{cards:[],elements:[]});
  assert.equal(selectionSummary(inventory,['copy-3']).cards[0].cardId,'woxu');
  assert.deepEqual(selectionCards(inventory,{selectedOnly:true,selectedIds:[]}),[]);
});
