import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSession, createLocalMatch } from '../dist/session.js';
import { dispatch, expectedPlayers } from '../dist/engine.js';
import { scheduledStep } from '../dist/flow.js';

function battle(){
  const session=freshSession();let m=createLocalMatch('battle',session.players);
  for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:[session.players[p].cards.find(c=>c.cardId===['lujia','liejing'][p]).id]});
  return dispatch(m,{type:'advance'});
}
function won(m,p){
  m=dispatch(m,{type:'rps',player:0,value:p===0?'rock':'scissors'});
  return dispatch(m,{type:'rps',player:1,value:p===0?'scissors':'rock'});
}
test('双方完整揭晓后保留展示阶段，AI 胜出也不能跳过揭晓直接行动',()=>{
  for(const winner of [0,1]){
    const original=battle();let m=won(original,winner);
    assert.equal(m.phase,'rps-result');assert.equal(m.battle.actor,winner);
    assert.deepEqual(expectedPlayers(m),[]);assert.deepEqual(m.battle.hp,original.battle.hp);
    assert.deepEqual(scheduledStep(m),{kind:'advance',delay:2200});
    assert.throws(()=>dispatch(m,{type:'attack',player:winner,skill:0}),/不能提交/);
    m=dispatch(m,{type:'advance'});assert.deepEqual(expectedPlayers(m),[winner]);
    assert.throws(()=>dispatch(m,{type:'retreat',player:1-winner}),/不能提交/);
    assert.ok(m.history.some(t=>t.includes('石头')&&t.includes('剪刀')&&t.includes('行动权')));
  }
});
test('手动模式只取消公共阶段推进，AI 仍可正常响应，暂停/弹窗/后台则均停止',()=>{
  const m=won(battle(),1);
  assert.equal(scheduledStep(m,{autoAdvance:false}),null);
  const action=dispatch(m,{type:'advance'});
  assert.deepEqual(scheduledStep(action,{autoAdvance:false}),{kind:'ai',player:1,delay:650});
  for(const flag of ['paused','dialogOpen','hidden']){
    assert.equal(scheduledStep(m,{[flag]:true}),null);
    assert.equal(scheduledStep(action,{[flag]:true}),null);
  }
});
test('自动处理不代替玩家秘密决定，也不会在结算后继续；双方代出仍能完成公共阶段',()=>{
  for(const phase of ['select','between','point','rps']){
    const m={...battle(),phase,selections:[null,[]],decisions:[null,'continue'],picks:[null,1],rps:[null,'rock']};
    assert.equal(scheduledStep(m),null,phase);
  }
  const m=won(battle(),0);
  assert.equal(scheduledStep(dispatch(m,{type:'advance'})),null);
  assert.equal(scheduledStep({...m,status:'finished'}),null);
  assert.equal(scheduledStep({...m,phase:'unknown'}),null);
  assert.equal(scheduledStep({...m,controls:['ai','ai']},{autoAdvance:false}).kind,'advance');
});
test('动作反馈存储实际前后值，回血封顶、撤退、阻退封顶和致胜顺序一致',()=>{
  let m=dispatch(won(battle(),0),{type:'advance'});m.battle.hp[0]=105;
  const before=structuredClone(m);
  m=dispatch(m,{type:'attack',player:0,skill:1});
  assert.deepEqual(m.battle.last.before.hp,[105,90]);assert.deepEqual(m.battle.last.after.hp,[110,75]);
  assert.deepEqual(before.battle.hp,[105,90]);
  m=dispatch(m,{type:'advance'});m=dispatch(won(m,0),{type:'advance'});
  m=dispatch(m,{type:'retreat',player:0});
  assert.deepEqual(m.battle.last.before.remaining,[3,2]);assert.deepEqual(m.battle.last.after.remaining,[2,2]);
  m=dispatch(m,{type:'advance'});m=dispatch(won(m,0),{type:'advance'});m.battle.hp=[30,10];
  m=dispatch(m,{type:'attack',player:0,skill:1});
  assert.equal(m.status,'finished');assert.deepEqual(m.battle.last.after.hp,[30,0]);
  assert.match(m.battle.last.text,/造成 10 伤害/);
  let delay=dispatch(won(battle(),0),{type:'advance'});
  delay.battle.cards=['fuchao','genguan'];delay.battle.hp=[140,130];delay.battle.remaining=[3,4];
  delay=dispatch(delay,{type:'attack',player:0,skill:1});
  assert.deepEqual(delay.battle.last.before.remaining,[3,4]);assert.deepEqual(delay.battle.last.after.remaining,[3,5]);
  delay=dispatch(delay,{type:'advance'});delay=dispatch(won(delay,0),{type:'advance'});
  delay=dispatch(delay,{type:'attack',player:0,skill:1});
  assert.deepEqual(delay.battle.last.after.remaining,[3,5]);assert.match(delay.battle.last.text,/撤退 \+0/);
});
