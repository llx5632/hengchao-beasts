import test from 'node:test';
import assert from 'node:assert/strict';
import {CARD,METRICS} from '../dist/data.js';
import {createMatch,dispatch,aiAction} from '../dist/engine.js';
import {previewSkill,combatStatuses} from '../dist/combat.js';
import {freshSession,upgradeSession} from '../dist/session.js';

const id='mingzhiyuan';
const send=(m,type,fields={})=>dispatch(m,{type,...fields});
const attack=(m,skill,declaredHand)=>send(m,'attack',{player:0,skill,declaredHand});
function ready(other='caiyeqiaojia'){
  const picks=[[{id:'own',cardId:id}],[{id:'foe',cardId:other}]];
  let m=createMatch('battle',picks);
  for(const player of [0,1])m=send(m,'select',{player,ids:[picks[player][0].id]});
  if(m.status==='finished')return m;
  return send(throwHands(send(m,'advance'),'rock','scissors'),'advance');
}
function throwHands(m,own,foe){
  return send(send(m,'rps',{player:0,value:own}),'rps',{player:1,value:foe});
}
const declared=(choice='rock')=>send(attack(ready(),1,choice),'advance');

test('034静态数据、属性直胜及拼点基础65',()=>{
  assert.equal(CARD[id].tier,'高阶');
  assert.deepEqual(METRICS.map(m=>m.read(CARD[id])),[3,210,3,65,1.65,38]);
  assert.equal(ready('huangjitun').winner,0);
  assert.equal(ready('panjia').winner,1);
});
test('宣告需有效选择，完成50伤害后才公开，单方出拳不消宣告或获得强化',()=>{
  const m=ready();
  assert.throws(()=>attack(m,1),/选择公开宣告/);
  assert.throws(()=>attack(m,1,'toString'),/选择公开宣告/);
  const pending=declared('paper');
  assert.equal(pending.battle.hp[1],130);
  assert.equal(combatStatuses(pending.battle,0,1).find(s=>s.id==='declaredHand').label,'已宣告布');
  const first=send(pending,'rps',{player:0,value:'rock'});
  assert.equal(first.battle.declaredHand[0],'paper');
  assert.equal(first.battle.declaredStrike[0],false);
});
for(const [own,foe,outcome] of [['rock','rock','tie'],['rock','scissors','boost'],['scissors','paper','bluff'],['rock','paper','loss']])test(`宣告石头，${own}/${foe} 正确处理 ${outcome}`,()=>{
  const start=declared();start.battle.burn[0]=2;
  const result=throwHands(start,own,foe);
  assert.equal(result.battle.burn[0],2);
  assert.equal(result.battle.declaredHand[0],outcome==='tie'?'rock':null);
  assert.equal(result.battle.declaredStrike[0],outcome==='boost');
  if(outcome==='tie'){
    const replay=throwHands(send(result,'advance'),'rock','scissors');
    assert.equal(replay.battle.declaredStrike[0],true);
  }
  if(['boost','bluff'].includes(outcome))assert.equal(previewSkill(result.battle,0,0).damage,outcome==='boost'?120:65);
});
test('双方宣告同批处理，只强化用对拳的获胜者',()=>{
  const m=declared();m.battle.declaredHand[1]='scissors';
  const result=throwHands(m,'rock','scissors');
  assert.deepEqual(result.battle.declaredHand,[null,null]);
  assert.deepEqual(result.battle.declaredStrike,[true,false]);
});
test('刷新后的强化只兑现一次，120进入同一笔削弱、护盾、封伤及烙印流程',()=>{
  let m=JSON.parse(JSON.stringify(throwHands(declared(),'rock','scissors')));
  m=send(m,'advance');m.battle.weaken[0]=1;m.battle.shield[1]=15;m.battle.seal[1]=true;m.battle.burn[0]=2;
  const p=previewSkill(m.battle,0,0);
  assert.equal(p.breakdown.raw,120);assert.equal(p.damage,45);assert.equal(p.ownHp,195);
  const result=attack(m,0);
  assert.equal(result.battle.hp[1],85);assert.equal(result.battle.debt[1],30);
  assert.equal(result.battle.declaredStrike[0],false);assert.equal(result.battle.burn[0],1);
  assert.equal(previewSkill(result.battle,0,0).breakdown.raw,65);
});
test('撤退或重施鸣哨放弃旧强化，只有重施留下新公开拳型',()=>{
  const m=send(throwHands(declared(),'rock','scissors'),'advance');
  const retreat=send(m,'retreat',{player:0});
  assert.equal(retreat.battle.remaining[0],2);assert.equal(retreat.battle.declaredStrike[0],false);
  const next=attack(m,1,'paper');
  assert.equal(next.battle.hp[1],80);assert.equal(next.battle.declaredHand[0],'paper');
  assert.equal(next.battle.declaredStrike[0],false);
});
test('直接终结和行动末死亡都不留下宣告，原终局规则照常',()=>{
  const m=ready();m.battle.hp[1]=40;m.battle.burn[0]=2;
  let result=attack(m,1,'rock');assert.equal(result.winner,0);assert.equal(result.battle.hp[0],210);
  assert.deepEqual(result.battle.declaredHand,[null,null]);
  m.battle.hp=[10,130];result=attack(m,1,'rock');assert.equal(result.winner,1);
  assert.deepEqual(result.battle.declaredHand,[null,null]);
});
test('AI能合法宣告并兑现，旧存档双方补发一次且保留对局',()=>{
  for(const difficulty of ['easy','hard']){
    const m=send(throwHands(declared(),'rock','scissors'),'advance');m.difficulty=difficulty;
    m.battle.hp[1]=100;
    assert.equal(aiAction(m,0,()=>.5).skill,0);
    m.battle.hp[1]=175;m.battle.declaredStrike[0]=false;
    const action=aiAction(m,0,()=>.5);
    if(action.skill===1)assert(['rock','paper','scissors'].includes(action.declaredHand));
    assert.doesNotThrow(()=>dispatch(m,action));
  }
  const session=freshSession();delete session.crestKiteGranted;
  session.players.forEach(p=>p.cards=p.cards.filter(c=>c.cardId!==id));
  session.match=ready();const battle=structuredClone(session.match.battle);
  assert(upgradeSession(session));assert.deepEqual(session.match.battle,battle);
  assert(session.players.every(p=>p.cards.filter(c=>c.cardId===id).length===1));
  assert(!upgradeSession(session));
});
