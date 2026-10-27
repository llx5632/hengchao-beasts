import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../dist/data.js';
import { previewSkill, resolveCombatAction } from '../dist/combat.js';
import { createMatch, dispatch } from '../dist/engine.js';

test('回血预览显示实际恢复量，满血为零，受伤后重新计算，不修改状态或基础定义',()=>{
  const b={cards:['lujia','liejing'],hp:[110,90],remaining:[3,2]},before=JSON.stringify(b),defs=JSON.stringify(CARDS);
  assert.equal(previewSkill(b,0,1).healing,0);
  assert.equal(JSON.stringify(b),before);assert.equal(JSON.stringify(CARDS),defs);
  b.hp[0]=105;const partial=previewSkill(b,0,1);
  assert.equal(partial.healing,5);assert.equal(partial.ownHp,110);assert.equal(partial.damage,15);assert.equal(partial.targetHp,75);
  b.hp[0]=70;assert.equal(previewSkill(b,0,1).healing,10);
});
test('阻退预览按基础加二封顶，达到上限时为零',()=>{
  const b={cards:['fuchao','genguan'],hp:[140,130],remaining:[3,4]};
  assert.equal(previewSkill(b,0,1).delay,1);assert.equal(previewSkill(b,0,1).targetRetreat,5);
  b.remaining[1]=5;assert.equal(previewSkill(b,0,1).delay,0);assert.equal(previewSkill(b,0,1).targetRetreat,5);
});
test('伤害致胜时显示扣除的实际 HP，回血和阻退均不触发',()=>{
  for(const [cards,hp] of [[['lujia','liejing'],[50,10]],[['fuchao','genguan'],[80,10]]]){
    const b={cards,hp,remaining:[3,1]},before=structuredClone(b),actual=previewSkill(b,0,1);
    assert.equal(actual.damage,10);assert.equal(actual.lethal,true);assert.equal(actual.effectSkipped,true);
    assert.equal(actual.healing,0);assert.equal(actual.delay,0);assert.deepEqual(b,before);
  }
});
test('玩家点击技能后实际结算与预览一致，预览不会提前执行或转移卡牌',()=>{
  const inv=[[{id:'a',cardId:'lujia'}],[{id:'b',cardId:'liejing'}]];
  let m=createMatch('battle',inv);
  for(const player of [0,1])m=dispatch(m,{type:'select',player,ids:[inv[player][0].id]});
  m=dispatch(m,{type:'advance'});m=dispatch(m,{type:'rps',player:0,value:'rock'});m=dispatch(m,{type:'rps',player:1,value:'scissors'});m=dispatch(m,{type:'advance'});
  m.battle.hp=[105,12];const before=JSON.stringify(m),preview=previewSkill(m.battle,0,1);
  assert.equal(JSON.stringify(m),before);assert.equal(m.transfers.length,0);
  const after=dispatch(m,{type:'attack',player:0,skill:1});
  assert.equal(after.battle.hp[1],preview.targetHp);assert.equal(after.battle.hp[0],preview.ownHp);
  assert.equal(after.status,'finished');assert.equal(after.transfers.length,1);
  assert.deepEqual(resolveCombatAction(m.battle,0,{type:'attack',skill:1}).state.hp,after.battle.hp);
});
