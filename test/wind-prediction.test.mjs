import test from 'node:test';
import assert from 'node:assert/strict';
import {CARD,METRICS} from '../dist/data.js';
import {resolveCombatAction as act,applyRpsLoss,previewSkill,combatStatuses,combatStatusKey,clearCombatStatuses} from '../dist/combat.js';
import {dispatch,aiAction,expectedPlayers} from '../dist/engine.js';
import {freshSession,createLocalMatch,upgradeSession,RULES_REVISION} from '../dist/session.js';
import {appHarness} from './helpers/app-harness.mjs';
const b=(a='xuanjiao',c='lujia')=>({cards:[a,c],hp:[CARD[a].hp,CARD[c].hp],remaining:[CARD[a].retreat,CARD[c].retreat]});
const hit=(s,p=0,skill=0,prediction)=>act(s,p,{type:'attack',skill,prediction});
function match(a='xuanjiao',c=a==='chaojing'?'panjia':'lujia'){
  const s=freshSession();s.match=createLocalMatch('battle',s.players);
  for(const [p,id] of [a,c].entries())s.match=dispatch(s.match,{type:'select',player:p,ids:[s.players[p].cards.find(i=>i.cardId===id).id]});
  s.match.phase='battle-action';s.match.battle.actor=0;s.autoAdvance=false;
  return s;
}
test('静态基础值与拼点不变，延迟收益成功兑现后超过两次纯伤害',()=>{
  assert.deepEqual(METRICS.map(m=>m.read(CARD.xuanjiao)),[3,88,2,40,1.6,42]);
  assert.deepEqual(METRICS.map(m=>m.read(CARD.chaojing)),[3,90,2,40,3,18]);
  assert.equal(CARD.xuanjiao.skills[1].effect,'wind');assert.equal(CARD.chaojing.skills[1].effect,'predict');
  let first=hit(b(),0,1),second=hit(applyRpsLoss(first.state,0));
  assert.equal(first.breakdown.damage+second.breakdown.damage,90);
  first=hit(b('chaojing','panjia'),0,1,'retreat');
  const triggered=act(first.state,1,{type:'retreat'});second=hit(triggered.state);
  assert.equal(first.breakdown.damage+second.breakdown.damage,90);
});
test('蓄势从0开始，下一次进攻即使0层也消耗；未准备的落败不积层',()=>{
  const original=b(),saved=structuredClone(original);let r=hit(original,0,1);
  assert.deepEqual(original,saved);assert.equal(r.state.wind[0],0);
  r=hit(r.state);assert.equal(r.breakdown.raw,40);assert.equal(r.state.wind[0],-1);
  assert.equal(applyRpsLoss(r.state,0).wind[0],-1);
});
test('真实猜拳落败逐次积层且封顶；平手、单方提交与advance不重复积层',()=>{
  let m=match().match;m.battle.wind=[0,-1];
  for(const [n,hand] of [[0,'rock'],[1,'paper'],[2,'paper'],[2,'paper']]){
    const before=m.battle.wind[0];
    m.phase='rps';m.rps=[null,null];m=dispatch(m,{type:'rps',player:0,value:'rock'});
    assert.equal(m.battle.wind[0],before);
    m=dispatch(m,{type:'rps',player:1,value:hand});assert.equal(m.battle.wind[0],n);
    const key=combatStatusKey(m.battle);m=dispatch(m,{type:'advance'});assert.equal(combatStatusKey(m.battle),key);
  }
});
test('一层65、两层90；任一招释放；再次准备先消耗旧层后重新0层',()=>{
  let s=b('xuanjiao','panjia');s.wind=[1,-1];let r=hit(s);assert.equal(r.breakdown.raw,65);assert.equal(r.state.wind[0],-1);
  s.wind[0]=2;r=hit(s);assert.equal(r.breakdown.raw,90);
  r=hit(s,0,1);assert.equal(r.breakdown.raw,75);assert.equal(r.state.wind[0],0);
  assert.equal(applyRpsLoss(r.state,0).wind[0],1);
});
test('未成功撤退保留两种增益；成功撤退、投降和直接致胜均清理',()=>{
  for(const card of ['xuanjiao','chaojing']){
    let s=b(card);s.wind=[2,-1];s.foresight=[30,0];s.prediction=[null,'attack'];
    let r=act(s,0,{type:'retreat'});assert.equal(r.state.wind[0],2);assert.equal(r.state.foresight[0],30);
    r=act(r.state,0,{type:'retreat'});assert(r.finished);assert.deepEqual(r.state.wind,[-1,-1]);assert.deepEqual(r.state.foresight,[0,0]);
    const m=match(card).match;m.battle={...m.battle,...s};const end=dispatch(m,{type:'surrender',player:0});assert.equal(end.battle.prediction[1],null);
  }
  const s=b('xuanjiao');s.hp[1]=1;s.wind=[2,-1];const r=hit(s,0,1);assert(r.finished);assert.equal(r.state.wind[0],-1);
});
test('增伤先于削弱、护盾和封伤，零实际伤害仍消耗，烙印不吃增伤',()=>{
  const s=b('xuanjiao','panjia');s.wind=[1,-1];s.weaken=[1,0];s.shield=[0,10];s.seal=[false,true];
  let r=hit(s);assert.equal(r.breakdown.afterReduction,48);assert.equal(r.breakdown.blocked,10);assert.equal(r.effects.deferred[1],19);assert.equal(r.breakdown.damage,19);
  s.shield[1]=100;r=hit(s);assert.equal(r.breakdown.damage,0);assert.equal(r.state.wind[0],-1);
  const c=b('chaojing','panjia');c.foresight=[30,0];c.burn=[1,0];r=hit(c);assert.equal(r.breakdown.raw,70);assert.equal(r.effects.burnDamage[0],15);
});
test('预判提交必须带合法秘密选项；日志只记封存，不能提前公开选择',()=>{
  let m=match('chaojing','panjia').match;
  assert.throws(()=>dispatch(m,{type:'attack',player:0,skill:1}),/秘密预判/);
  assert.throws(()=>dispatch(m,{type:'attack',player:0,skill:1,prediction:'cheat'}),/秘密预判/);
  m=dispatch(m,{type:'attack',player:0,skill:1,prediction:'retreat'});
  assert.equal(m.battle.prediction[0],'retreat');assert.match(m.history.at(-1),/封存秘密预判/);assert.doesNotMatch(m.history.at(-1),/预判撤退/);
});
test('等待中自己的行动不揭晓，再次施放不可改选；对手行动后仅揭晓一次',()=>{
  let r=hit(b('chaojing','panjia'),0,1,'retreat');r=hit(r.state,0,1,'attack');assert.equal(r.state.prediction[0],'retreat');
  r=act(r.state,1,{type:'retreat'});assert.equal(r.state.prediction[0],null);assert.equal(r.state.foresight[0],30);assert.match(r.text,/预判撤退.*猜中/);
  r=hit(r.state,0);assert.equal(r.breakdown.raw,70);assert.equal(r.state.foresight[0],0);
  r=act(r.state,1,{type:'retreat'});assert.equal(r.state.foresight[0],0);assert.doesNotMatch(r.text,/揭晓/);
});
test('猜错无奖励，零伤害仍属进攻；带奖励再次准备为50且封存新选择',()=>{
  let s=b('chaojing','panjia');s.prediction=['retreat',null];let r=hit(s,1);assert.equal(r.state.foresight[0],0);assert.equal(r.state.prediction[0],null);
  s.prediction[0]='attack';s.shield=[100,0];r=hit(s,1);assert.equal(r.breakdown.damage,0);assert.equal(r.state.foresight[0],30);
  r=hit(r.state,0,1,'retreat');assert.equal(r.breakdown.raw,50);assert.equal(r.state.foresight[0],0);assert.equal(r.state.prediction[0],'retreat');
});
test('预判在烙印与旧伤后判定存活，成功撤退或致命结束不发奖、不补攻击',()=>{
  const s=b('chaojing','panjia');s.prediction=['attack',null];s.hp[0]=10;let r=hit(s,1);assert(r.finished);assert.deepEqual(r.state.foresight,[0,0]);assert.doesNotMatch(r.text,/猜中/);
  s.hp[0]=55;s.burn=[1,0];s.debt=[5,0];r=hit(s,1);assert(r.finished);assert.deepEqual(r.state.foresight,[0,0]);
  const c=b('chaojing','panjia');c.prediction=['retreat',null];c.remaining[1]=1;r=act(c,1,{type:'retreat'});assert(r.finished);assert.equal(r.winner,null);assert.doesNotMatch(r.text,/猜中/);
});
test('镜像双方秘密各自等待、各自揭晓；不能把自己的行动当作自己的预判对象',()=>{
  let r=hit(b('chaojing','chaojing'),0,1,'attack');r=hit(r.state,1,1,'retreat');assert.equal(r.state.foresight[0],30);assert.equal(r.state.prediction[1],'retreat');
  r=act(r.state,0,{type:'retreat'});assert.equal(r.state.foresight[1],30);assert.equal(r.state.prediction[1],null);
});
test('实际预览、攻击/撤退UI与状态详情对对手秘密值完全一致；本人可查看选择',()=>{
  const s=b('panjia','chaojing');s.prediction=[null,'attack'];const a=previewSkill(s,0,0);s.prediction[1]='retreat';assert.deepEqual(previewSkill(s,0,0),a);
  const hidden=combatStatuses(s,1,0);assert.doesNotMatch(JSON.stringify(hidden),/自己已秘密选择/);
  assert.match(JSON.stringify(combatStatuses(s,1,1)),/自己已秘密选择撤退/);
  const save=match('panjia','chaojing');save.match.battle.prediction=[null,'attack'];save.tutorial={version:1,status:'completed'};
  const h=appHarness(save);const html=h.app.innerHTML;h.run("store.match.battle.prediction[1]='retreat';render()");assert.equal(h.app.innerHTML,html);
});
test('UI选择与施放一次提交，等待期间无需再次选；本人秘密刷新可续',()=>{
  const s=match('chaojing','panjia');s.tutorial={version:1,status:'completed'};const h=appHarness(s);
  h.click('attack',{skill:'1'});assert(h.dialog.open);assert.equal(h.run('store.match.phase'),'battle-action');
  h.click('prediction-retreat',{skill:'1'});assert.equal(h.run('store.match.battle.prediction[0]'),'retreat');assert.equal(h.run('store.match.battle.hp[1]'),140);
  h.run("store.match.phase='battle-action';store.match.battle.actor=0;render()");h.click('attack',{skill:'1'});assert.equal(h.run('store.match.battle.prediction[0]'),'retreat');
  const saved=JSON.parse(h.storage.get('hengchao-local-pve-v2'));const loaded=appHarness(saved);assert.match(loaded.app.innerHTML,/预判撤退/);
});
for(const difficulty of ['easy','hard'])test(`${difficulty} AI不探测真实秘密，能提交自己的预测并完成两张新版对局`,()=>{
  let m=match('panjia','chaojing').match;m.difficulty=difficulty;m.battle.prediction=[null,'attack'];const first=aiAction(m,0,()=>.5);m.battle.prediction[1]='retreat';assert.deepEqual(aiAction(m,0,()=>.5),first);
  m=match('chaojing','panjia').match;m.difficulty=difficulty;m.battle.hp[1]=15;const lethal=aiAction(m,0,()=>.5);assert.equal(lethal.type,'attack');m=dispatch(m,lethal);assert.equal(m.status,'finished');
  for(const cards of [['xuanjiao','lujia'],['chaojing','panjia'],['chaojing','chaojing']]){
    m=match(...cards).match;m.difficulty=difficulty;m.phase='battle-reveal';let seed=31,tick=0;const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
    while(m.status==='active'&&tick++<150){const expected=expectedPlayers(m);m=dispatch(m,expected.length?aiAction(m,expected[0],rng):{type:'advance'},rng);}
    assert.equal(m.status,'finished');assert.equal(m.inventories.flat().length,38);
  }
});
test('新状态缓存、JSON续局与旧规则迁移；收藏及偏好不重置',()=>{
  const s=match('chaojing','panjia');s.match.battle.prediction=['retreat',null];s.match.battle.wind=[1,-1];
  const copy=JSON.parse(JSON.stringify(s));assert.equal(combatStatusKey(copy.match.battle),combatStatusKey(s.match.battle));assert(!upgradeSession(copy));
  copy.rulesRevision='2026-11-02-panjia-seal';const players=structuredClone(copy.players);assert(upgradeSession(copy));assert.equal(copy.match,null);assert.deepEqual(copy.players,players);assert.equal(copy.rulesRevision,RULES_REVISION);
  clearCombatStatuses(s.match.battle);assert.deepEqual(s.match.battle.prediction,[null,null]);assert.deepEqual(s.match.battle.wind,[-1,-1]);
});
