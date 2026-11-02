import test from 'node:test';
import assert from 'node:assert/strict';
import {CARD,METRICS,skillText} from '../dist/data.js';
import {resolveCombatAction as act,previewSkill,combatStatuses,combatStatusKey} from '../dist/combat.js';
import {dispatch,aiAction,expectedPlayers} from '../dist/engine.js';
import {freshSession,createLocalMatch,upgradeSession,RULES_REVISION} from '../dist/session.js';
import {appHarness} from './helpers/app-harness.mjs';
const battle=(other='lujia')=>({cards:['panjia',other],hp:[160,CARD[other].hp],remaining:[4,CARD[other].retreat]});
const hit=(b,p,i=0)=>act(b,p,{type:'attack',skill:i});
function match(other='lujia'){
  const players=['panjia',other].map((cardId,p)=>({name:String(p),cards:[{id:String(p),cardId}]}));
  let m=createLocalMatch('battle',players);for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:[String(p)]});
  m.phase='battle-action';m.battle.actor=0;return m;
}
test('磐甲40/60与六项拼点值保留，封伤文案及正式资源映射正确',()=>{
  assert.equal(CARD.panjia.skills[0].effect,'seal');assert.equal(CARD.panjia.skills[0].damage,40);
  assert.deepEqual(METRICS.map(m=>m.read(CARD.panjia)),[2,160,4,60,1.6,520]);
  assert.match(skillText(CARD.panjia.skills[0]),/有待结伤势则取消/);
  assert.match(CARD.panjia.art,/当前卡面\/磐甲-技能更新.png/);
});
test('获得保护、不叠加、不修改输入；奇数35只暂存17，下一次伤害立即结清',()=>{
  const b=battle(),original=structuredClone(b);let r=hit(b,0);assert(r.state.seal[0]);assert.deepEqual(b,original);
  r=hit(r.state,0);assert(r.state.seal[0]);
  r=hit(r.state,1);assert.equal(r.state.hp[0],142);assert.equal(r.state.debt[0],17);assert(!r.state.seal[0]);
  r=hit(r.state,1);assert.equal(r.state.hp[0],90);assert.equal(r.effects.settled[0],17);assert.equal(r.state.debt[0],0);
});
test('封伤按增伤、削弱、护盾后的值计算，暂存最多30；0不消耗、1消耗但无债务',()=>{
  const b=battle('xianbei');b.seal=[true,false];b.charge=[false,true];let r=hit(b,1,1);
  assert.equal(r.effects.deferred[0],30);assert.equal(r.breakdown.damage,35);
  const c=battle();c.seal=[true,false];c.weaken=[0,1];c.shield=[5,0];r=hit(c,1);
  assert.equal(r.effects.deferred[0],10);assert.equal(r.breakdown.damage,11);
  c.shield=[100,0];r=hit(c,1);assert(r.state.seal[0]);assert.equal(r.state.hp[0],160);
  c.shield=[25,0];r=hit(c,1);assert(!r.state.seal[0]);assert.equal(r.state.debt[0],0);assert.equal(r.state.hp[0],159);
});
test('攻击或未成功撤退不自动结旧伤，施放矿甲封伤取消旧伤且当次不获保护',()=>{
  const b=battle();b.debt=[30,0];assert.equal(hit(b,0,1).state.debt[0],30);
  assert.equal(act(b,0,{type:'retreat'}).state.debt[0],30);
  const r=hit(b,0);assert.equal(r.state.hp[0],160);assert.equal(r.effects.cancelled[0],30);
  assert.equal(r.state.debt[0],0);assert(!r.state.seal[0]);
  assert(hit(r.state,0).state.seal[0]);
});
test('零伤害不触发旧伤；烙印触发旧伤、不被封伤保护或护盾抵消',()=>{
  const b=battle();b.debt=[30,0];b.shield=[100,0];let r=hit(b,1);assert.equal(r.state.debt[0],30);
  b.burn=[1,0];r=act(b,0,{type:'retreat'});assert.equal(r.state.hp[0],115);assert.equal(r.effects.settled[0],30);
  const c=battle();c.seal=[true,false];c.burn=[1,0];r=act(c,0,{type:'retreat'});
  assert.equal(r.state.hp[0],145);assert(r.state.seal[0]);assert.equal(r.state.debt[0],0);
});
test('同次直接受击形成的暂存可被随后已有烙印触发；先取消旧伤后烙印只扣15',()=>{
  const b=battle();b.seal=[true,false];b.burn=[1,0];let r=hit(b,1);
  assert.equal(r.state.hp[0],110);assert.equal(r.effects.deferred[0],17);assert.equal(r.effects.settled[0],17);
  b.seal=[false,false];b.debt=[30,0];r=hit(b,0);
  assert.equal(r.state.hp[0],145);assert.equal(r.effects.cancelled[0],30);assert.equal(r.effects.settled[0],0);assert(!r.state.seal[0]);
});
test('暂存不保底存活，新伤加旧伤致命只结算一次胜负；与烙印同末双死为平局',()=>{
  const b=battle();b.hp[0]=10;b.seal=[true,false];assert(hit(b,1).finished);
  b.seal=[false,false];b.hp[0]=40;b.debt=[30,0];let r=hit(b,1);assert(r.finished);assert.equal(r.winner,1);
  assert.deepEqual(r.state.debt,[0,0]);
  const m=match();m.battle.hp[0]=40;m.battle.debt=[30,0];m.battle.actor=1;
  const end=dispatch(m,{type:'attack',player:1,skill:0});assert.equal(end.transfers.length,1);assert.equal(end.winner,1);
  const c=battle();c.hp=[30,15];c.debt=[20,0];c.burn=[1,1];r=act(c,0,{type:'retreat'});
  assert(r.finished);assert.equal(r.winner,null);assert.deepEqual(r.state.hp,[0,0]);
});
test('直接反杀、成功撤退和投降清空状态；新伤致命不再赋予对手附加治疗',()=>{
  const b=battle();b.hp=[20,30];b.debt=[30,0];b.burn=[1,0];let r=hit(b,0,1);
  assert.equal(r.winner,0);assert.deepEqual(r.state.debt,[0,0]);assert.equal(r.state.hp[0],20);
  b.remaining[0]=1;r=act(b,0,{type:'retreat'});assert(r.finished);assert.equal(r.winner,null);assert.equal(r.state.hp[0],20);
  const c=battle();c.hp=[20,40];c.debt=[10,0];r=hit(c,1,1);assert(r.finished);assert.equal(r.effects.healing,0);
  const m=match();m.battle.seal=[true,false];m.battle.debt=[0,10];const end=dispatch(m,{type:'surrender',player:0});
  assert.deepEqual(end.battle.seal,[false,false]);assert.deepEqual(end.battle.debt,[0,0]);
});
test('猜拳与序列化不消耗状态，AI缓存分别区分保护和旧伤，旧规则迁移保留收藏',()=>{
  let m=match();m.phase='rps';m.battle.seal=[true,false];m.battle.debt=[0,17];
  const key=combatStatusKey(m.battle);assert.notEqual(key,combatStatusKey({...m.battle,debt:[0,18]}));
  m=dispatch(m,{type:'rps',player:0,value:'rock'});m=dispatch(m,{type:'rps',player:1,value:'rock'});
  assert.equal(combatStatusKey(m.battle),key);assert.equal(combatStatusKey(JSON.parse(JSON.stringify(m.battle))),key);
  const s=freshSession();s.match=m;s.rulesRevision='2026-10-29-four-rework-both-actions';const own=structuredClone(s.players);
  assert(upgradeSession(s));assert.deepEqual(s.players,own);assert.equal(s.match,null);assert.equal(s.rulesRevision,RULES_REVISION);
});
test('UI与预览显示暂存、旧伤、取消及最终HP，完整卡面与状态说明可访问',()=>{
  const b=battle();b.debt=[30,0];b.burn=[1,0];const before=JSON.stringify(b),r=previewSkill(b,0,0);
  assert.equal(r.cancelled[0],30);assert.equal(r.ownHp,145);assert.equal(JSON.stringify(b),before);
  assert.match(combatStatuses(b,0)[0].label,/待结伤势30/);
  const h=appHarness();h.run("start('battle');store.match.battle={cards:['panjia','lujia'],hp:[160,110],remaining:[4,3],actor:0,debt:[30,0]};store.match.phase='battle-action';render()");
  assert.match(h.app.innerHTML,/取消待结伤势30/);assert.match(h.app.innerHTML,/本次不获得封伤保护/);
  h.run("store.match.battle={cards:['lujia','panjia'],hp:[110,40],remaining:[3,4],actor:0,debt:[0,30]};render()");
  assert.match(h.app.innerHTML,/旧伤另扣5/);assert.match(h.app.innerHTML,/对方最终HP：40 → 0/);
  h.run("store.match.battle.seal=[false,true];store.match.battle.debt=[0,0];render()");
  assert.match(h.app.innerHTML,/－暂存17/);assert.doesNotMatch(h.app.innerHTML,/受剩余HP限制为18/);
});
for(const difficulty of ['easy','hard'])test(`${difficulty} AI考虑清伤保命并能完成磐甲对局`,()=>{
  let m=match('fuchao');m.difficulty=difficulty;m.battle.hp[0]=30;m.battle.debt=[30,0];m.battle.burn=[1,0];
  const choice=aiAction(m,0,()=>.5);assert.equal(choice.type,'attack');assert.equal(choice.skill,0);
  for(const other of ['panjia','duhuolu','mingnang']){
    m=match(other);m.difficulty=difficulty;m.phase='battle-reveal';let seed=17,tick=0;
    const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
    while(m.status==='active'&&tick++<500){const expected=expectedPlayers(m);m=dispatch(m,expected.length?aiAction(m,expected[0],rng):{type:'advance'},rng);}
    assert.equal(m.status,'finished');assert.equal(m.inventories.flat().length,2);
  }
});
