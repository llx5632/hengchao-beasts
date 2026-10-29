import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS,CARD,METRICS,skillText } from '../dist/data.js';
import { resolveCombatAction as act,previewSkill,combatStatuses } from '../dist/combat.js';
import { freshSession,upgradeSession,createLocalMatch } from '../dist/session.js';
import { dispatch,aiAction,expectedPlayers } from '../dist/engine.js';
import { appHarness } from './helpers/app-harness.mjs';
const battle=(a,b)=>({cards:[a,b],hp:[CARD[a].hp,CARD[b].hp],remaining:[CARD[a].retreat,CARD[b].retreat]});
const hit=(b,p,skill)=>act(b,p,{type:'attack',skill});

test('四卡字段、卡面映射及拼点基础值保持分离',()=>{
  assert.equal(CARDS.length,19);
  for(const [id,base] of [['xianbei',35],['dielin',40],['jinzong',45],['mingnang',40]]){
    assert.equal(CARD[id].skills.length,2);assert.equal(METRICS[3].read(CARD[id]),base);assert.match(CARD[id].art,/候选设计/);
    assert(!skillText(CARD[id].skills[0]).includes('undefined'));
  }
});
test('蓄势只强化另一招，不叠加，猜拳与非最终撤退不消耗，预览不修改状态',()=>{
  let b=battle('xianbei','jinzong'),r=hit(b,0,0);assert.equal(r.state.charge[0],true);b=r.state;
  b=hit(b,0,0).state;assert.equal(b.hp[1],90);
  const before=structuredClone(b),preview=previewSkill(b,0,1);assert.equal(preview.breakdown.raw,65);assert.deepEqual(b,before);
  b=act(b,0,{type:'retreat'}).state;assert(b.charge[0]);
  r=hit(b,0,1);assert.equal(r.breakdown.raw,65);assert.equal(r.state.charge[0],false);
});
test('护盾一次减伤、余量不留、0实际伤害仍消耗，重复获得不叠加',()=>{
  let b=battle('dielin','mingnang');b=hit(b,0,0).state;b=hit(b,0,0).state;assert.equal(b.shield[0],15);
  let r=hit(b,1,0);assert.equal(r.breakdown.blocked,15);assert.equal(r.breakdown.damage,20);assert.equal(r.state.shield[0],0);
  b.shield[0]=40;r=hit(b,1,0);assert.equal(r.breakdown.damage,0);assert.equal(r.state.shield[0],0);
});
test('绝境阈值60含边界，恢复后即时失效，基础伤害不变',()=>{
  const b=battle('jinzong','dielin');b.hp[0]=61;assert.equal(previewSkill(b,0,1).breakdown.raw,30);
  b.hp[0]=60;assert.equal(previewSkill(b,0,1).breakdown.raw,60);assert(combatStatuses(b,0)[0].active);
  b.hp[0]=80;assert.equal(previewSkill(b,0,1).breakdown.raw,30);assert(!combatStatuses(b,0)[0].active);assert.equal(CARD.jinzong.skills[1].damage,30);
});
test('回响记录实际扣血，正数覆盖、0不覆盖、向下取整封顶，仅该招清除',()=>{
  let b=battle('mingnang','lujia');b=hit(b,1,0).state;assert.equal(b.echo[0],35);
  assert.equal(previewSkill(b,0,0).breakdown.raw,42);
  b=hit(b,0,1).state;assert.equal(b.echo[0],35);
  b=hit(b,1,1).state;assert.equal(b.echo[0],15);assert.equal(previewSkill(b,0,0).breakdown.raw,32);
  b.shield[0]=100;b=hit(b,1,0).state;assert.equal(b.echo[0],15);
  b.echo[0]=99;assert.equal(previewSkill(b,0,0).breakdown.raw,55);
  b=hit(b,0,0).state;assert.equal(b.echo[0],0);
});
test('先算增伤再减护盾再限制实际扣血，击败、撤退、投降都清空状态',()=>{
  let b=battle('xianbei','jinzong');b.charge=[true,false];b.shield=[0,15];
  let r=hit(b,0,1);assert.equal(r.breakdown.raw,65);assert.equal(r.breakdown.damage,50);
  b.hp[1]=10;r=hit(b,0,1);assert.equal(r.breakdown.damage,10);assert.equal(r.finished,true);assert.deepEqual(r.state.charge,[false,false]);
  b=battle('dielin','jinzong');b.hp[1]=1;r=hit(b,0,0);assert.equal(r.state.shield[0],0);
  b=battle('xianbei','jinzong');b.charge=[true,false];b.remaining[0]=1;r=act(b,0,{type:'retreat'});assert.equal(r.finished,true);assert.deepEqual(r.state.charge,[false,false]);
});
test('老存档一次性补发，保留既有卡牌及对局队列，刷新不重发也不恢复已失去的新卡',()=>{
  const s=freshSession();delete s.specialCardsGranted;s.players.forEach(p=>p.cards=p.cards.slice(0,15));
  s.players[0].cards.splice(0,1);s.match=createLocalMatch('point',s.players);
  const before=structuredClone(s);assert(upgradeSession(s));assert.equal(s.players[0].cards.length,18);assert.equal(s.players[1].cards.length,19);
  assert.deepEqual(s.players[0].cards.slice(0,14),before.players[0].cards);assert.deepEqual(s.match.selections,before.match.selections);
  assert.equal(s.match.inventories[0].length,18);s.players[0].cards.pop();
  assert.equal(upgradeSession(JSON.parse(JSON.stringify(s))),false);assert.equal(s.players[0].cards.length,17);
});
test('两档AI使用实际强化伤害斩杀；高难度考虑蓄势与护盾而非只记HP',()=>{
  for(const difficulty of ['easy','hard']){
    const b=battle('xianbei','jinzong');b.hp=[100,60];b.charge=[true,false];
    const m={difficulty,phase:'battle-action',battle:b};const before=structuredClone(m),action=aiAction(m,0,()=>.5);
    assert.equal(action.skill,1);assert(hit(b,0,action.skill).finished);assert.deepEqual(m,before);
  }
});
test('四种新卡均可完成实际对战，临时状态不带到下场且实例守恒',()=>{
  for(const [own,other] of [['xianbei','jinzong'],['dielin','jinzong'],['jinzong','dielin'],['mingnang','dielin']]){
    const players=[own,other].map((cardId,p)=>({name:String(p),cards:[{id:String(p),cardId}]}));
    let m=createLocalMatch('battle',players,'hard');m.controls=['ai','ai'];let tick=0;
    let seed=91;const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
    while(m.status==='active'&&tick++<300){const expected=expectedPlayers(m);m=dispatch(m,expected.length?aiAction(m,expected[0],rng):{type:'advance'},rng);}
    assert.equal(m.status,'finished');assert.equal(m.inventories.flat().length,2);assert.deepEqual(m.battle.charge,[false,false]);assert.deepEqual(m.battle.shield,[0,0]);assert.deepEqual(m.battle.echo,[0,0]);
  }
});
test('首页无异兽具体数量，战斗状态独立显示且技能按钮计算实际效果',()=>{
  const h=appHarness();assert.doesNotMatch(h.app.innerHTML,/十五|19\s*张|19\s*种|收藏\s*\d+\s*张/);
  h.run("start('battle');store.match.battle={cards:['xianbei','jinzong'],hp:[100,120],remaining:[2,3],charge:[true,false]};store.match.phase='battle-action';store.match.battle.actor=0;render()");
  assert.match(h.app.innerHTML,/蓄势：裂风突袭＋30/);assert.match(h.app.innerHTML,/实际伤害 65/);assert.match(h.app.innerHTML,/基础35＋强化30/);
  h.click('battle-status',{player:'0',kind:'charge'});assert(h.dialog.open);
});

test('主动投降清空双方技能状态，保留既有HP和正常失卡结果',()=>{
  const players=['xianbei','jinzong'].map((cardId,p)=>({name:String(p),cards:[{id:String(p),cardId}]}));
  let m=createLocalMatch('battle',players);
  for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:[String(p)]});
  m.battle.charge=[true,false];m.battle.shield=[0,15];m.battle.echo=[25,0];m.battle.hp=[70,80];
  m=dispatch(m,{type:'surrender',player:0});
  assert.equal(m.winner,1);assert.deepEqual(m.battle.hp,[70,80]);
  assert.deepEqual(m.battle.charge,[false,false]);assert.deepEqual(m.battle.shield,[0,0]);assert.deepEqual(m.battle.echo,[0,0]);
  assert.equal(m.inventories[0].length,0);assert.equal(m.inventories[1].length,2);assert.equal(m.battle.last,null);
});
