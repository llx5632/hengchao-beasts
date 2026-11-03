import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD, METRICS, CARDS } from '../dist/data.js';
import { resolveCombatAction as act, previewSkill, combatStatusKey, battleActions } from '../dist/combat.js';
import { createMatch, dispatch, aiAction, expectedPlayers } from '../dist/engine.js';
import { freshSession, upgradeSession, createLocalMatch, SAVE_KEY } from '../dist/session.js';
import { appHarness } from './helpers/app-harness.mjs';

function match(a='zhoulan', b='tanling', pair=true) {
  const own=[{id:'own-start',cardId:a}];
  if(pair)own.push({id:'own-partner',cardId:a==='zhoulan'?'yelan':'zhoulan'});
  let m=createMatch('battle',[own,[{id:'enemy',cardId:b}]]);
  for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:[m.inventories[p][0].id]});
  if(m.status==='active'){m.phase='battle-action';m.battle.actor=0;}
  return m;
}
const attack=(m,p,skill)=>dispatch({...m,phase:'battle-action',battle:{...m.battle,actor:p}},{type:'attack',player:p,skill});

test('双生战斗值一致、体型互补，拼点不使用条件伤害',()=>{
  const a=CARD.zhoulan,b=CARD.yelan;
  assert.deepEqual([a.hp,a.retreat,...a.skills.map(s=>s.damage)],[b.hp,b.retreat,...b.skills.map(s=>s.damage)]);
  assert(a.height>b.height);assert(a.weight<b.weight);
  assert.deepEqual(METRICS.slice(0,4).map(m=>m.read(a)),[3,100,2,30]);
  assert.deepEqual(METRICS.slice(0,4).map(m=>m.read(a)),METRICS.slice(0,4).map(m=>m.read(b)));
});
test('双生第一技能对火草互补、同属性正常，第二技能无属性倍率',()=>{
  for(const [a,b,damage] of [['zhoulan','tanling',15],['zhoulan','taituan',60],['yelan','tanling',60],['yelan','taituan',15],['zhoulan','xianbei',30]]){
    const m=match(a,b);assert.equal(previewSkill(m.battle,0,0).damage,damage);
    assert.equal(previewSkill(m.battle,0,1).damage,10);
  }
});
test('倍率与增伤、削弱、护盾、封伤顺序明确且只取整一次',()=>{
  const b=match('zhoulan','genguan').battle;b.foresight=[1,0];b.weaken=[1,0];b.shield=[0,5];b.seal=[false,true];
  const r=act(b,0,{type:'attack',skill:0});
  assert.equal(r.breakdown.raw,31);assert.equal(r.breakdown.afterReduction,46);
  assert.equal(r.effects.deferred[1],20);assert.equal(r.breakdown.damage,21);
  assert.equal(r.state.weaken[0],0);assert.equal(r.state.foresight[0],0);
});
test('相转保留伤势、撤退、标记、来源与计数；本次进攻正常消耗削弱',()=>{
  const b=match().battle;b.hp[0]=55;b.remaining[0]=1;b.mark=[1,null];b.shield=[15,0];b.weaken=[2,0];b.charge=[true,false];b.echo=[18,0];b.root=[2,0];b.seal=[true,false];b.debt=[20,0];
  const before=structuredClone(b),r=act(b,0,{type:'attack',skill:1});
  assert.deepEqual(b,before);assert.equal(r.state.cards[0],'yelan');assert.equal(r.state.instances[0].id,'own-partner');
  for(const k of ['hp','remaining','mark','shield','charge','echo','root','seal','debt'])assert.equal(r.state[k][0],b[k][0],k);
  assert.equal(r.state.weaken[0],1);assert.equal(r.state.hp[1],68);
});
test('相转消耗任意进攻增益，已有烙印本行动结算；预判将其视为进攻',()=>{
  const b=match().battle;b.hp[0]=55;b.burn=[2,0];b.wind=[1,-1];b.foresight=[30,0];b.prediction=[null,'attack'];
  const r=act(b,0,{type:'attack',skill:1});
  assert.equal(r.state.cards[0],'yelan');assert.equal(r.state.hp[0],40);assert.equal(r.state.burn[0],1);
  assert.equal(r.state.wind[0],-1);assert.equal(r.state.foresight[0],0);assert.equal(r.state.foresight[1],30);
});
test('护盾完全抵消相转伤害仍转换；直接致胜不转换也不追加持续伤害',()=>{
  const b=match().battle;b.shield=[0,15];
  let r=act(b,0,{type:'attack',skill:1});assert.equal(r.breakdown.damage,0);assert.equal(r.state.cards[0],'yelan');
  b.shield=[0,0];b.hp=[1,10];b.burn=[1,0];r=act(b,0,{type:'attack',skill:1});
  assert.equal(r.finished,true);assert.equal(r.winner,0);assert.equal(r.state.cards[0],'zhoulan');assert.equal(r.state.hp[0],1);
});
test('无伙伴禁止施放，预览/AI不修改状态、不伪造另一张卡',()=>{
  const m=match('zhoulan','tanling',false),before=structuredClone(m);
  assert.throws(()=>attack(m,0,1),/缺少/);assert.deepEqual(m,before);
  assert.equal(battleActions(m.battle,0).filter(a=>a.type==='attack').length,1);
  for(const difficulty of ['easy','hard'])assert.notEqual(aiAction({...m,difficulty},0,()=>.5).skill,1);
});
test('伙伴封存即绑定，重复副本稳定选择，绑定副本不在库存时拒绝转换',()=>{
  const inv=[[{id:'s',cardId:'zhoulan'},{id:'z',cardId:'yelan'},{id:'a',cardId:'yelan'}],[{id:'e',cardId:'tanling'}]];
  let m=createMatch('battle',inv);m=dispatch(m,{type:'select',player:0,ids:['s']});
  assert.equal(m.twinBindings[0].yelan.id,'a');
  m=dispatch(m,{type:'select',player:1,ids:['e']});m.phase='battle-action';m.battle.actor=0;
  assert.equal(attack(m,0,1).battle.instances[0].id,'a');
  m.inventories[0]=m.inventories[0].filter(i=>i.id!=='a');assert.throws(()=>attack(m,0,1),/收藏/);
});
for(const reason of ['damage','surrender','dot'])test(`转换后${reason}只失去当前伙伴实际卡牌，实例守恒`,()=>{
  let m=attack(match(),0,1);
  if(reason==='surrender')m=dispatch(m,{type:'surrender',player:0});
  else if(reason==='damage'){m.battle.hp[0]=1;m=attack(m,1,0);}
  else {m.battle.hp[0]=10;m.battle.burn=[1,0];m.battle.shield=[100,0];m=attack(m,1,0);}
  assert.equal(m.status,'finished');assert.equal(m.winner,1);
  assert.equal(m.transfers.length,1);assert.equal(m.transfers[0].id,'own-partner');assert.equal(m.transfers[0].cardId,'yelan');
  assert(m.inventories[0].some(c=>c.id==='own-start'));assert.equal(new Set(m.inventories.flat().map(c=>c.id)).size,3);
});
test('转换本行动末烙印致败，失去转换后的卡；换回后失去原卡',()=>{
  let m=match();m.battle.hp[0]=10;m.battle.burn=[1,0];m=attack(m,0,1);
  assert.equal(m.transfers[0].cardId,'yelan');
  m=attack(attack(match(),0,1),0,1);m=dispatch(m,{type:'surrender',player:0});assert.equal(m.transfers[0].id,'own-start');
});
test('转换后撤退成功或同时持续伤害归零均保留两张卡',()=>{
  let m=attack(match(),0,1);m.battle.remaining[0]=1;
  m=dispatch({...m,phase:'battle-action',battle:{...m.battle,actor:0}},{type:'retreat',player:0});assert.equal(m.winner,null);assert.equal(m.transfers.length,0);
  m=match();m.battle.hp=[10,20];m.battle.burn=[1,1];m=attack(m,0,1);
  assert.equal(m.status,'finished');assert.equal(m.winner,null);assert.equal(m.transfers.length,0);
});
test('双生对水岩仍按现有属性直接结算，不使用转换伙伴替代出战卡',()=>{
  assert.equal(match('zhoulan','woxu').winner,0);
  const m=match('zhoulan','liejing');assert.equal(m.winner,1);assert.equal(m.transfers[0].id,'own-start');
});
test('预览和JSON续局保留形态、锁定副本、状态及缓存差异',()=>{
  let m=match();const before=structuredClone(m);const p=previewSkill(m.battle,0,1);
  assert.equal(p.transformed.to,'yelan');assert.deepEqual(m,before);
  m=attack(m,0,1);const copy=JSON.parse(JSON.stringify(m));
  assert.notEqual(combatStatusKey(m.battle),combatStatusKey(before.battle));
  assert.equal(dispatch(copy,{type:'surrender',player:0}).transfers[0].id,'own-partner');
});
test('双方均为双生卡时独立转换，反方失卡同样对应当前实际副本',()=>{
  const inv=[0,1].map(p=>['zhoulan','yelan'].map(cardId=>({id:`${p}-${cardId}`,cardId})));
  let m=createMatch('battle',inv);
  for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:[inv[p][0].id]});
  m=attack(m,0,1);m=attack(m,1,1);
  assert.deepEqual(m.battle.cards,['yelan','yelan']);
  m=dispatch(m,{type:'surrender',player:1});
  assert.equal(m.transfers[0].id,'1-yelan');assert(m.inventories[1].some(i=>i.id==='1-zhoulan'));
});
test('双生拼点四项平手后正常重比，身高和体重各自获胜，不转换或平局交换',()=>{
  for(const [numbers,winner] of [[[2,3],0],[[3,3],1]]){
    const inv=['zhoulan','yelan'].map((cardId,p)=>Array.from({length:5},(_,i)=>({id:`${p}-${i}`,cardId})));
    let m=createMatch('point',inv);
    for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:inv[p].map(c=>c.id)});
    for(const p of [0,1])m=dispatch(m,{type:'lineup-ready',player:p},()=>.5);
    for(const p of [0,1])m=dispatch(m,{type:'decision',player:p,value:'continue'});
    for(const p of [0,1])m=dispatch(m,{type:'point',player:p,value:1});
    assert.equal(m.phase,'point-tie');assert.equal(m.transfers.length,0);assert.equal(m.round,0);
    m=dispatch(m,{type:'advance'});
    for(const p of [0,1])m=dispatch(m,{type:'point',player:p,value:numbers[p]});
    assert.equal(m.rounds[0].winner,winner);assert.equal(m.transfers.length,1);
  }
});
test('老存档仅补发两张新卡一次，保留在途旧对局；丢失或转移后不重发',()=>{
  const s=freshSession();delete s.twinCardsGranted;
  s.players.forEach(p=>p.cards=p.cards.filter(c=>!['zhoulan','yelan'].includes(c.cardId)));
  s.match=createLocalMatch('battle',s.players);const before=structuredClone(s.match);
  assert(upgradeSession(s));assert.deepEqual(s.match.selections,before.selections);assert.equal(s.players[0].cards.length,CARDS.length);
  const granted=s.players[0].cards.pop();s.players[1].cards.push(granted);
  const loaded=JSON.parse(JSON.stringify(s));assert(!upgradeSession(loaded));assert.deepEqual(loaded.players,s.players);
});
for(const difficulty of ['easy','hard'])test(`${difficulty} AI能转换弥补不利属性、兑现斩杀及完成双生对局`,()=>{
  let m=match();m.difficulty=difficulty;m.battle.hp[1]=60;
  assert.equal(aiAction(m,0,()=>.5).skill,1);
  m=attack(m,0,1);m.battle.hp[1]=60;assert.equal(aiAction({...m,phase:'battle-action',battle:{...m.battle,actor:0}},0,()=>.5).skill,0);
  m=match();m.difficulty=difficulty;let seed=17,tick=0;const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  while(m.status==='active'&&tick++<180){const ps=expectedPlayers(m);m=dispatch(m,ps.length?aiAction(m,ps[0],rng):{type:'advance'});}
  assert.equal(m.status,'finished');assert.equal(m.inventories.flat().length,3);
});
test('UI显示倍率、转换预览、缺少伙伴禁用与刷新后当前形态',()=>{
  const s=freshSession();s.tutorial={version:1,status:'completed'};s.match=match();
  let h=appHarness(s);assert.match(h.app.innerHTML,/属性倍率0.5/);assert.match(h.app.innerHTML,/伤害后转为夜岚狐/);
  h.click('attack',{skill:'1'});assert.equal(h.run('store.match.battle.cards[0]'),'yelan');
  h=appHarness(JSON.parse(h.storage.get(SAVE_KEY)));assert.equal(h.run('store.match.battle.instances[0].id'),'own-partner');
  s.match=match('zhoulan','tanling',false);h=appHarness(s);assert.match(h.app.innerHTML,/disabled aria-label="双生相转不可用/);
});
