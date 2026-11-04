import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CARD,METRICS,BEATS,skillText} from '../dist/data.js';
import {resolveCombatAction as resolve,previewSkill,combatStatuses} from '../dist/combat.js';
import {createMatch,dispatch,aiAction,expectedPlayers} from '../dist/engine.js';
import {freshSession,upgradeSession,SAVE_KEY} from '../dist/session.js';
import {appHarness} from './helpers/app-harness.mjs';

const battle=(other='mingnang')=>({cards:['jiejing',other],hp:[145,CARD[other].hp],remaining:[3,CARD[other].retreat]});
const attack=(b,skill=1)=>resolve(b,0,{type:'attack',skill});
function match(other='mingnang'){
  let m=createMatch('battle',[[{id:'tiger',cardId:'jiejing'}],[{id:'enemy',cardId:other}]]);
  for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:[p===0?'tiger':'enemy']});
  if(m.status==='active'){m.phase='battle-action';m.battle.actor=0;}
  return m;
}
function saved(remaining=1){const s=freshSession();s.tutorial={version:1,status:'completed'};s.match=match();s.match.battle.remaining[1]=remaining;return s;}

test('截径棘虎按确认方案登记，拼点取50而不是追击80',()=>{
  assert.deepEqual(METRICS.map(m=>m.read(CARD.jiejing)),[4,145,3,50,1.65,230]);
  assert.equal(CARD.jiejing.tier,'高阶');assert.equal(CARD.jiejing.element,'草');assert.equal(BEATS.草,'岩');
  assert.deepEqual(CARD.jiejing.skills.map(s=>[s.name,s.damage]),[['棘爪横扫',50],['封路追击',40]]);
  assert.match(skillText(CARD.jiejing.skills[1]),/剩余撤退点数为1时，伤害＋40/);
});
test('剩余撤退2与1边界；条件按目标而非自己或基础撤退读取',()=>{
  const b=battle();b.remaining=[1,2];assert.equal(attack(b).breakdown.raw,40);
  b.remaining=[3,1];assert.equal(attack(b).breakdown.raw,80);assert.equal(attack(b,0).breakdown.raw,50);
  assert.deepEqual(attack(b).state.remaining,[3,1]);
});
test('基础撤退1的对手开局即可触发，无撤退历史要求',()=>{
  const b=battle('taituan'),r=attack(b);assert.equal(r.breakdown.raw,80);assert.equal(r.breakdown.damage,65);assert(r.finished);
});
test('对手非最终撤退不自动受伤，下一次正常攻击才获得加伤',()=>{
  const b=battle();b.remaining[1]=2;const retreat=resolve(b,1,{type:'retreat'});
  assert.deepEqual(retreat.state.hp,b.hp);assert.equal(retreat.state.remaining[1],1);assert(!retreat.finished);
  assert.equal(attack(retreat.state).breakdown.raw,80);
});
test('重复使用独立触发，不积层、不消耗条件、不修改输入',()=>{
  const b=battle();b.hp[1]=300;b.remaining[1]=1;const before=structuredClone(b);
  const first=attack(b),second=attack(first.state);assert.equal(first.breakdown.raw,80);assert.equal(second.breakdown.raw,80);
  assert.equal(second.state.hp[1],140);assert.equal(second.state.remaining[1],1);assert.deepEqual(b,before);
});
test('根冠鹿增退后解除条件，重新撤退到1可再次触发',()=>{
  let b=battle('genguan');b.remaining[1]=1;assert.equal(attack(b).breakdown.raw,80);
  b=resolve(b,1,{type:'attack',skill:1}).state;assert.equal(b.remaining[1],2);assert.equal(attack(b).breakdown.raw,40);
  b=resolve(b,1,{type:'retreat'}).state;assert.equal(attack(b).breakdown.raw,80);
});
test('追击加伤先合并其他固定增伤，再削弱与护盾，相关状态各消耗一次',()=>{
  const b=battle();b.remaining[1]=1;b.foresight=[30,0];b.weaken=[2,0];b.shield=[0,15];
  const r=attack(b);assert.equal(r.breakdown.raw,110);assert.equal(r.breakdown.afterReduction,82);assert.equal(r.breakdown.damage,67);
  assert.equal(r.state.foresight[0],0);assert.equal(r.state.weaken[0],1);assert.equal(r.state.shield[1],0);assert.equal(r.state.echo[1],67);
});
test('80追击受25%削弱再减15护盾为45',()=>{
  const b=battle();b.remaining[1]=1;b.weaken=[2,0];b.shield=[0,15];assert.equal(attack(b).breakdown.damage,45);
});
test('追击是一段直接受击，封伤只暂存一次，下一次受伤结清一次',()=>{
  const b=battle('panjia');b.remaining[1]=1;b.seal=[false,true];
  const r=attack(b);assert.equal(r.effects.deferred[1],30);assert.equal(r.breakdown.damage,50);assert.equal(r.state.debt[1],30);assert(!r.state.seal[1]);
  const n=attack(r.state,0);assert.equal(n.effects.settled[1],30);assert.equal(n.state.hp[1],30);
});
test('完全挡住伤害仍消费护盾和进攻削弱，不产生回响或额外追击事件',()=>{
  const b=battle();b.remaining[1]=1;b.shield=[0,100];b.weaken=[1,0];b.echo=[0,17];
  const r=attack(b);assert.equal(r.breakdown.damage,0);assert.equal(r.state.shield[1],0);assert.equal(r.state.weaken[0],0);assert.equal(r.state.echo[1],17);
});
test('未致命追击正常结算双方已有烙印，各仅扣一次持续次数',()=>{
  const b=battle();b.remaining[1]=1;b.burn=[2,2];const r=attack(b);
  assert.deepEqual(r.effects.burnDamage,[15,15]);assert.deepEqual(r.state.burn,[1,1]);assert.deepEqual(r.state.hp,[130,35]);
});
test('直接击败立即结束，不结算额外烙印或额外攻击',()=>{
  const b=battle();b.hp=[15,80];b.remaining[1]=1;b.burn=[2,2];const r=attack(b);
  assert(r.finished);assert.equal(r.winner,0);assert.deepEqual(r.state.hp,[15,0]);assert.deepEqual(r.effects.burnDamage,[0,0]);assert(r.effects.burnSkipped);
});
test('成功撤退立即平局，双方HP不变，已有烙印与追击均不补打',()=>{
  let m=match();m.battle.actor=1;m.battle.remaining[1]=1;m.battle.burn=[2,2];const hp=[...m.battle.hp];
  m=dispatch(m,{type:'retreat',player:1});assert.equal(m.status,'finished');assert.equal(m.winner,null);
  assert.deepEqual(m.battle.hp,hp);assert.equal(m.transfers.length,0);assert.doesNotMatch(m.history.join(' '),/封路追击造成/);
});
test('双方同次烙印归零仍平局保卡',()=>{
  const b=battle();b.hp=[15,55];b.burn=[1,1];const r=attack(b);
  assert(r.finished);assert.equal(r.winner,null);assert.deepEqual(r.state.hp,[0,0]);
});
test('双生相转保留剩余撤退1，追击仍按当前公开值判断',()=>{
  const b=battle('zhoulan');b.remaining[1]=1;b.twinPairs=[null,{zhoulan:{id:'day',cardId:'zhoulan'},yelan:{id:'night',cardId:'yelan'}}];
  const r=resolve(b,1,{type:'attack',skill:1});assert.equal(r.state.cards[1],'yelan');assert.equal(r.state.remaining[1],1);assert.equal(attack(r.state).breakdown.raw,80);
});
test('预览无副作用且与真实攻击的扣血、事件和行动末结果一致',()=>{
  const b=battle();b.remaining[1]=1;b.weaken=[2,0];b.shield=[0,15];b.burn=[2,2];const before=structuredClone(b);
  const p=previewSkill(b,0,1),r=attack(b);assert.deepEqual(b,before);assert.equal(p.damage,r.breakdown.damage);
  assert.equal(p.targetHp,r.state.hp[1]);assert.equal(p.ownHp,r.state.hp[0]);assert.deepEqual(p.events,r.events);
});
test('独立状态仅反映条件，不储存增益；增退后即时显示未满足',()=>{
  const b=battle();b.remaining[1]=1;assert(combatStatuses(b,0).find(s=>s.id==='pursuit').active);
  b.remaining[1]=2;assert(!combatStatuses(b,0).find(s=>s.id==='pursuit').active);assert(!('pursuit' in b));
});
for(const difficulty of ['easy','hard'])test(`${difficulty} AI按当前条件选择50稳定招或80追击，保持输入不变`,()=>{
  for(const [remaining,hp,skill] of [[2,45,0],[1,75,1]]){
    const m=match();m.difficulty=difficulty;m.battle.remaining[1]=remaining;m.battle.hp[1]=hp;const before=structuredClone(m);
    const action=aiAction(m,0,()=>.5);assert.equal(action.type,'attack');assert.equal(action.skill,skill);assert.deepEqual(m,before);
    assert.equal(dispatch(m,action).winner,0);
  }
});
test('火克草、草克岩仍先判属性胜负，不进入追击',()=>{
  for(const [other,winner] of [['tanling',1],['panjia',0]]){const m=match(other);assert.equal(m.status,'finished');assert.equal(m.winner,winner);assert.equal(m.transfers.length,1);}
});
test('旧存档一次性补发双方新卡，保留活动对局及选卡，不恢复已经失去的新卡',()=>{
  const s=freshSession();delete s.thornTigerGranted;s.players.forEach(p=>p.cards=p.cards.filter(c=>c.cardId!=='jiejing'));s.match=match('genguan');
  const before=structuredClone(s.match);assert(upgradeSession(s));assert.deepEqual(s.match.battle,before.battle);assert.deepEqual(s.match.selections,before.selections);
  for(const p of [0,1]){assert.equal(s.players[p].cards.filter(c=>c.cardId==='jiejing').length,1);assert.equal(s.match.inventories[p].filter(c=>c.id===`release-thorn-tiger-${p}`).length,1);}
  s.players[0].cards=s.players[0].cards.filter(c=>c.cardId!=='jiejing');const restored=JSON.parse(JSON.stringify(s));assert(!upgradeSession(restored));assert(!restored.players[0].cards.some(c=>c.cardId==='jiejing'));
});
test('UI预览40与80随条件更新，攻击后保存，刷新不重复扣血',()=>{
  for(const [remaining,damage] of [[2,40],[1,80]]){
    const h=appHarness(saved(remaining));assert.match(h.app.innerHTML,new RegExp(`封路追击：实际伤害 ${damage}`));
    assert.match(h.app.innerHTML,remaining===1?/本次追击伤害＋40/:/未满足追击条件/);
    h.click('attack',{skill:'1'});assert.equal(h.run('store.match.battle.hp[1]'),130-damage);
    const restored=appHarness(JSON.parse(h.storage.get(SAVE_KEY)));assert.equal(restored.run('store.match.battle.hp[1]'),130-damage);
  }
});
for(const difficulty of ['easy','hard'])test(`${difficulty} AI双方完整中性对战可结束，实际卡守恒`,()=>{
  let m=match('fuyun');m.difficulty=difficulty;let seed=17,steps=0;const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  while(m.status==='active'&&steps++<150){const p=expectedPlayers(m)[0];m=dispatch(m,p===undefined?{type:'advance'}:aiAction(m,p,rng),rng);}
  assert.equal(m.status,'finished');assert.equal(m.inventories.flat().length,2);
});
test('本地卡面文件及网页图鉴包含截径棘虎，PNG尺寸为1024×1536',async()=>{
  const png=await readFile(new URL(`../../卡牌/${CARD.jiejing.art}`,import.meta.url));assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),1024);assert.equal(png.readUInt32BE(20),1536);
  const catalog=await readFile(new URL('../dist/cards.html',import.meta.url),'utf8');assert.match(catalog,/截径棘虎完整卡面/);
});
