import test from 'node:test';
import assert from 'node:assert/strict';
import {CARD,METRICS,skillText} from '../dist/data.js';
import {resolveCombatAction as act,previewSkill,skillAvailable,battleActions,combatStatuses,combatStatusKey,applyRpsLoss} from '../dist/combat.js';
import {createMatch,dispatch,aiAction,expectedPlayers} from '../dist/engine.js';
import {freshSession,upgradeSession,SAVE_KEY} from '../dist/session.js';
import {appHarness} from './helpers/app-harness.mjs';
const battle=(other='panjia')=>({cards:['cangquanyuan',other],hp:[59,CARD[other].hp],remaining:[3,CARD[other].retreat]});
const hit=(b,p=0,skill=1)=>act(b,p,{type:'attack',skill});
const arm=(b=battle())=>hit(b).state;
function match(other='panjia'){
  let m=createMatch('battle',[[{id:'spring',cardId:'cangquanyuan'}],[{id:'enemy',cardId:other}]]);
  for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:[p?'enemy':'spring']});
  if(m.status==='active'){m.phase='battle-action';m.battle.actor=0;}return m;
}
test('藏泉螈静态及拼点不计回生',()=>{
  assert.deepEqual(METRICS.map(m=>m.read(CARD.cangquanyuan)),[3,120,3,45,.6,64]);assert.equal(CARD.cangquanyuan.element,'水');assert.equal(CARD.cangquanyuan.tier,'高阶');assert.deepEqual(CARD.cangquanyuan.skills.map(s=>s.damage),[45,15]);assert.match(skillText(CARD.cangquanyuan.skills[1]),/每战1次/);
});
for(const hp of [0,60,61,120])test(`HP${hp}禁止挂印及AI非法选择`,()=>{
  const b=battle();b.hp[0]=hp;assert(!skillAvailable(b,0,1));assert(!battleActions(b,0).some(a=>a.skill===1));assert.throws(()=>hit(b),/严格低于半血/);
});
for(const hp of [1,59])test(`HP${hp}可挂印，输入不变，每战仅可施放一次`,()=>{
  const b=battle();b.hp[0]=hp;const before=structuredClone(b),r=hit(b);assert(!r.finished);assert(r.state.reviveWard[0]);assert(r.state.reviveUsed[0]);assert.deepEqual(b,before);assert.throws(()=>hit(r.state),/不能重复/);
});
test('零伤仍挂印，直接致胜不补印及持续伤害',()=>{
  let b=battle();b.shield=[0,30];assert(arm(b).reviveWard[0]);b=battle();b.hp=[15,15];b.burn=[1,1];const r=hit(b);assert.equal(r.winner,0);assert(!r.effects.reviveTriggered.some(Boolean));assert.deepEqual(r.effects.burnDamage,[0,0]);
});
test('施放当次烙印归零立即回生，该批只结算一次',()=>{
  const b=battle();b.hp[0]=15;b.burn=[2,0];const r=hit(b);assert(!r.finished);assert.equal(r.state.hp[0],60);assert.equal(r.state.burn[0],1);assert(r.effects.reviveTriggered[0]);assert(!r.state.reviveWard[0]);assert(r.state.reviveUsed[0]);assert.equal(r.effects.burnDamage[0],15);
});
test('施放当次双方同批归零仍平局，不回生',()=>{
  const b=battle();b.hp=[15,30];b.burn=[1,1];const r=hit(b);assert(r.finished);assert.equal(r.winner,null);assert.deepEqual(r.state.hp,[0,0]);assert(!r.effects.reviveTriggered.some(Boolean));
});
for(const hp of [1,20,60])test(`HP${hp}受到60伤害均恢复至60，含恰好归零`,()=>{
  const b=arm();b.hp[0]=hp;const r=hit(b,1,1);assert(!r.finished);assert.equal(r.state.hp[0],60);assert(r.effects.reviveTriggered[0]);
});
test('1000点致命伤也恢复至60，不续扣溢出',()=>{
  const b=arm();b.hp[0]=20;b.foresight=[0,940];const r=hit(b,1,1);assert.equal(r.breakdown.afterReduction,1000);assert.equal(r.state.hp[0],60);assert.equal(r.effects.reviveHealing[0],60);assert(!r.finished);
});
test('未挂印没有被动回生',()=>{const b=battle();b.hp[0]=20;const r=hit(b,1,1);assert.equal(r.winner,1);assert(!r.effects.reviveTriggered[0]);});
test('护盾封伤先结算，未归零保留伏印',()=>{
  const b=arm();b.hp[0]=45;b.shield=[15,0];b.seal=[true,false];const r=hit(b,1,1);assert.equal(r.state.hp[0],22);assert.equal(r.state.debt[0],22);assert(r.state.reviveWard[0]);assert(!r.effects.reviveTriggered[0]);
});
test('旧伤致命后回生，旧伤不重扣且其他状态不重置',()=>{
  const b=arm();b.hp[0]=50;b.debt=[25,0];b.weaken=[2,0];b.mark=[1,null];b.remaining[0]=2;const r=hit(b,1,0);assert.equal(r.state.hp[0],60);assert.equal(r.state.debt[0],0);assert.equal(r.effects.settled[0],10);assert.equal(r.state.weaken[0],2);assert.equal(r.state.mark[0],1);assert.equal(r.state.remaining[0],2);
});
test('直接回生后继续原行动已有烙印，不免疫也不重放',()=>{
  const b=arm();b.hp[0]=20;b.burn=[2,0];const r=hit(b,1,1);assert.equal(r.state.hp[0],45);assert.equal(r.state.burn[0],1);assert.equal(r.effects.burnDamage[0],15);assert(r.effects.reviveTriggered[0]);
});
test('回生阻止致胜后，攻击者伤害后回血正常一次',()=>{
  const b=arm(battle('fuyun'));b.hp=[10,100];const r=hit(b,1,1);assert(!r.finished);assert.deepEqual(r.state.hp,[60,115]);assert.equal(r.effects.healing,15);assert(!previewSkill(b,1,1).effectSkipped);
});
test('回生后新烙印仍从下次行动起算',()=>{
  const b=arm(battle('duhuolu'));b.hp[0]=20;const r=hit(b,1,0);assert.equal(r.state.hp[0],60);assert.equal(r.state.burn[0],2);assert.equal(r.effects.burnDamage[0],0);
});
test('回生消耗后再次致命照常结束且不补烙印',()=>{
  let b=arm();b.hp[0]=20;b=hit(b,1,1).state;b.burn=[2,2];const r=hit(b,1,1);assert.equal(r.winner,1);assert.equal(r.state.hp[0],0);assert(!r.effects.reviveTriggered[0]);assert.deepEqual(r.effects.burnDamage,[0,0]);
});
test('未成功撤退行动末可回生，撤退点数保留',()=>{
  const b=arm();b.hp[0]=15;b.burn=[1,0];const r=act(b,0,{type:'retreat'});assert(!r.finished);assert.equal(r.state.hp[0],60);assert.equal(r.state.remaining[0],2);
});
test('成功撤退平局，不回生和补持续伤害',()=>{
  const b=arm();b.hp[0]=15;b.burn=[1,0];b.remaining[0]=1;const r=act(b,0,{type:'retreat'});assert.equal(r.winner,null);assert(r.finished);assert.equal(r.state.hp[0],15);assert(!r.effects.reviveTriggered[0]);assert.deepEqual(r.effects.burnDamage,[0,0]);
});
for(const targetHp of [15,30])test(`双方持续伤害完整批次，目标HP${targetHp}时才判回生或平局`,()=>{
  const b=arm();b.hp=[15,targetHp];b.burn=[1,1];const r=act(b,0,{type:'retreat'});assert.deepEqual(r.effects.burnDamage,[15,15]);assert.equal(r.finished,targetHp===15);assert.equal(r.effects.reviveTriggered[0],targetHp!==15);
});
test('无倒计时、回血过半保留、猜拳与JSON续局不返还次数',()=>{
  let b=arm();b.hp[0]=100;b=applyRpsLoss(b,0);const key=combatStatusKey(b);b=JSON.parse(JSON.stringify(b));assert.equal(combatStatusKey(b),key);b=hit(b,0,0).state;assert(b.reviveWard[0]);assert(b.reviveUsed[0]);assert(!skillAvailable(b,0,1));
});
test('殒爆致命可回生获胜，死亡链不补持续伤害',()=>{
  const b=arm(battle('jinnangying'));b.hp=[20,20];b.deathWard=[0,2];b.deathUsed=[false,true];b.deathPower=[0,60];b.burn=[2,2];const r=hit(b,0,0);assert.equal(r.winner,0);assert.deepEqual(r.state.hp,[60,0]);assert(r.effects.reviveTriggered[0]);assert(r.effects.deathTriggered[1]);assert.deepEqual(r.effects.burnDamage,[0,0]);
});
test('属性直胜先于挂印，投降清印且只转移一次',()=>{
  assert.equal(match('tanling').winner,0);assert.equal(match('zhiyi').winner,1);let m=match();m.battle=arm({...m.battle,hp:[20,160]});m=dispatch(m,{type:'surrender',player:0});assert.equal(m.winner,1);assert.equal(m.transfers.length,1);assert(!m.battle.reviveWard[0]);
});
test('真实对局先回生不转卡，再次致命才转卡一次',()=>{
  let m=match();m.battle.hp[0]=20;m=dispatch(m,{type:'attack',player:0,skill:1});m.phase='battle-action';m.battle.actor=1;m=dispatch(m,{type:'attack',player:1,skill:1});assert.equal(m.status,'active');assert.equal(m.battle.hp[0],60);assert.equal(m.transfers.length,0);m.phase='battle-action';m.battle.actor=1;m=dispatch(m,{type:'attack',player:1,skill:1});assert.equal(m.status,'finished');assert.equal(m.transfers.length,1);assert.equal(m.inventories.flat().length,2);
});
test('预览真实一致且不误报致胜或跳过效果，输入不变',()=>{
  const b=arm(battle('fuyun'));b.hp[0]=10;const before=structuredClone(b),pv=previewSkill(b,1,1),r=hit(b,1,1);assert.deepEqual(b,before);assert.equal(pv.targetHp,r.state.hp[0]);assert.equal(pv.ownHp,r.state.hp[1]);assert(pv.reviveTriggered[0]);assert(!pv.lethal);assert(!pv.effectSkipped);
});
test('状态及缓存区分施放条件、待触发和已用',()=>{
  const b=battle();b.hp[0]=60;assert.match(combatStatuses(b,0)[0].label,/未到/);b.hp[0]=59;assert.match(combatStatuses(b,0)[0].label,/可施放/);const a=arm(b);assert.match(combatStatuses(a,0)[0].label,/待触发/);assert.notEqual(combatStatusKey(a),combatStatusKey(b));a.reviveWard[0]=false;assert.match(combatStatuses(a,0)[0].label,/已用/);
});
test('旧存档仅补发一次，不清除对局或已有伏印',()=>{
  const s=freshSession();delete s.springSalamanderGranted;s.players.forEach(p=>p.cards=p.cards.filter(c=>c.cardId!=='cangquanyuan'));s.match=match();s.match.battle=arm({...s.match.battle,hp:[20,160]});const before=structuredClone(s.match.battle);assert(upgradeSession(s));assert.deepEqual(s.match.battle,before);for(const p of s.players)assert.equal(p.cards.filter(c=>c.cardId==='cangquanyuan').length,1);s.players[0].cards=s.players[0].cards.filter(c=>c.cardId!=='cangquanyuan');assert(!upgradeSession(JSON.parse(JSON.stringify(s))));
});
test('真实UI禁用条件、展示回生预览、刷新保留已用资格',()=>{
  const s=freshSession();s.tutorial={version:1,status:'completed'};s.autoAdvance=false;s.match=match();const h=appHarness(s);assert.match(h.app.innerHTML,/当前HP须严格低于半血/);h.run('store.match.battle.hp[0]=15;store.match.battle.burn=[1,0];render()');assert.match(h.app.innerHTML,/回生伏印触发/);h.click('attack',{skill:'1'});assert.equal(h.run('store.match.battle.hp[0]'),60);assert.equal(h.run('store.match.transfers.length'),0);const restored=appHarness(JSON.parse(h.storage.get(SAVE_KEY)));assert(restored.run('store.match.battle.reviveUsed[0]'));assert.equal(restored.run('store.match.battle.hp[0]'),60);restored.run("store.match.phase='battle-action';store.match.battle.actor=0;render()");assert.match(restored.app.innerHTML,/本场回生伏印已施放/);
});
for(const difficulty of ['easy','hard'])test(`${difficulty} AI识别回生收益及半血限制，不修改状态`,()=>{
  let m=match();m.difficulty=difficulty;m.battle.hp=[20,160];const before=structuredClone(m),a=aiAction(m,0,()=>.5);assert.equal(a.type,'attack');assert.equal(a.skill,1);assert.deepEqual(m,before);m.battle.hp[0]=60;assert.notEqual(aiAction(m,0,()=>.5).skill,1);
});
for(const difficulty of ['easy','hard'])test(`${difficulty} AI完整回生对局结束，实际卡守恒`,()=>{
  let m=match();m.difficulty=difficulty;let seed=57,steps=0;const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);while(m.status==='active'&&steps++<180){const p=expectedPlayers(m)[0];m=dispatch(m,p===undefined?{type:'advance'}:aiAction(m,p,rng),rng);}assert.equal(m.status,'finished');assert.equal(m.inventories.flat().length,2);assert.equal(new Set(m.inventories.flat().map(c=>c.id)).size,2);
});
