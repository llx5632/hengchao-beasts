import test from 'node:test';
import assert from 'node:assert/strict';
import { selectionDraft, normalizePresets, createPreset, resolvePreset, canLeaveSelection } from '../dist/roster.js';
import { freshSession, createLocalMatch } from '../dist/session.js';
import { dispatch } from '../dist/engine.js';

test('未封存选卡可以返回大厅，AI先提交不影响；自己封存后即使仍在选卡阶段也不能绕过对局',()=>{
  for(const mode of ['point','battle']){
    const m=createLocalMatch(mode,freshSession().players),count=mode==='point'?5:1;
    assert.equal(canLeaveSelection(m),true);
    const aiFirst=dispatch(m,{type:'select',player:1,ids:m.inventories[1].slice(0,count).map(i=>i.id)});
    assert.equal(canLeaveSelection(aiFirst),true);
    const humanFirst=dispatch(m,{type:'select',player:0,ids:m.inventories[0].slice(0,count).map(i=>i.id)});
    assert.equal(humanFirst.phase,'select');assert.equal(canLeaveSelection(humanFirst),false);
    assert.equal(canLeaveSelection({...m,controls:['ai','ai']}),false);
    assert.equal(canLeaveSelection({...m,phase:'between'}),false);
    assert.equal(canLeaveSelection({...m,status:'finished'}),false);
  }
  assert.equal(canLeaveSelection(null),false);
});

test('未封存选卡跨序列化恢复，只保留本场合法实例；封存后不再恢复',()=>{
  const session=freshSession(),m=createLocalMatch('point',session.players);
  const ids=m.inventories[0].slice(0,5).map(i=>i.id);
  m.selectionDraft=[ids[0],ids[0],'missing',...ids.slice(1)];
  assert.deepEqual(selectionDraft(JSON.parse(JSON.stringify(m))),ids);
  const aiSelected=dispatch(m,{type:'select',player:1,ids:m.inventories[1].slice(0,5).map(i=>i.id)});
  assert.deepEqual(selectionDraft(aiSelected),ids);
  const sealed=dispatch(aiSelected,{type:'select',player:0,ids});
  assert.deepEqual(selectionDraft(sealed),[]);
  assert.deepEqual(selectionDraft(null),[]);
});

test('单卡草稿有数量限制，旧存档无草稿可正常使用',()=>{
  const m=createLocalMatch('battle',freshSession().players);
  assert.deepEqual(selectionDraft(m),[]);
  m.selectionDraft=m.inventories[0].slice(0,3).map(i=>i.id);
  assert.deepEqual(selectionDraft(m),[m.inventories[0][0].id]);
  m.status='finished';assert.deepEqual(selectionDraft(m),[]);
});

test('常用阵容按种类和张数匹配不同副本，不重复使用同一实例，缺卡时部分载入',()=>{
  const owned=[{id:'a',cardId:'lujia'},{id:'b',cardId:'lujia'},{id:'c',cardId:'liejing'},{id:'d',cardId:'genguan'},{id:'e',cardId:'fuchao'}];
  const before=structuredClone(owned),preset=createPreset('p','  双蟹阵容  ','point',owned,owned.map(i=>i.id));
  assert.equal(preset.name,'双蟹阵容');assert.deepEqual(preset.cardIds,['lujia','lujia','liejing','genguan','fuchao']);
  const replacement=owned.map(i=>({...i,id:i.id+'-new'}));
  assert.deepEqual(resolvePreset(preset,replacement),{ids:replacement.map(i=>i.id),missing:[]});
  assert.deepEqual(resolvePreset(preset,replacement.slice(1,4)),{ids:['b-new','c-new','d-new'],missing:['lujia','fuchao']});
  assert.deepEqual(owned,before);assert.equal(new Set(resolvePreset(preset,replacement).ids).size,5);
});

test('保存阵容检查数量、实例和名称；旧存档兼容并保留两种模式的有效方案',()=>{
  const inventory=freshSession().players[0].cards,ids=inventory.slice(0,5).map(i=>i.id);
  assert.throws(()=>createPreset('p','阵容','point',inventory,[ids[0]]));
  assert.throws(()=>createPreset('p','阵容','point',inventory,[ids[0],ids[0],...ids.slice(2)]));
  assert.throws(()=>createPreset('p','阵容','battle',inventory,['lost']));
  assert.throws(()=>createPreset('p','  ','battle',inventory,[ids[0]]));
  const battle=createPreset('b','战斗','battle',inventory,[ids[0]]),point=createPreset('p','拼点','point',inventory,ids);
  assert.deepEqual(normalizePresets(undefined),[]);
  assert.deepEqual(normalizePresets([battle,null,{...point,cardIds:['unknown']},point,battle]),[battle,point]);
  assert.deepEqual(normalizePresets(JSON.parse(JSON.stringify([point,battle]))),[point,battle]);
});
