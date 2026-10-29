import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD, METRICS, POINT_NUMBERS, pointMetricIndex } from '../dist/data.js';
import { freshSession, SAVE_KEY } from '../dist/session.js';
import { newTutorial, normalizeTutorial, beginTutorialLesson, tutorialAction, tutorialGuidance } from '../dist/tutorial.js';
import { appHarness } from './helpers/app-harness.mjs';

const act=(s,type,extra={})=>tutorialAction(s,{type,...extra});
function select(s){for(const card of s.match.inventories[0])s=act(s,'choose',{id:card.id});return act(s,'submit');}
function attribute(){return select(beginTutorialLesson(newTutorial()));}
function battle(){return select(act(attribute(),'next'));}
function throughBattle(){
  let s=battle();s=act(s,'next');s=act(s,'rps',{value:'rock'});s=act(s,'next');s=act(s,'attack',{skill:0});
  s=act(s,'next');s=act(s,'rps',{value:'rock'});s=act(s,'next');s=act(s,'next');
  s=act(s,'next');s=act(s,'rps',{value:'rock'});s=act(s,'next');return act(s,'retreat');
}
function pointWin(){
  let s=select(act(throughBattle(),'next'));s=act(s,'ready');s=act(s,'continue');
  s=act(s,'point',{value:0});s=act(s,'next');return act(s,'point',{value:3});
}

test('首场炭铃凭火克草击败高阶根冠鹿，真实引擎结算一次',()=>{
  const s=attribute();assert.equal(s.match.winner,0);assert.equal(s.match.status,'finished');
  assert.deepEqual(s.match.battle.cards,['tanling','genguan']);assert.equal(s.match.transfers.length,1);
  assert.equal(s.match.transfers[0].reason,'属性克制');assert.match(tutorialGuidance(s).text,/低阶|小型/);
});
test('苔团对负潮巨鳖互不克制，玩家攻击→AI攻击→玩家撤退保卡',()=>{
  let s=battle();assert.equal(s.match.phase,'battle-reveal');assert.deepEqual(s.match.battle.hp,[65,140]);
  s=act(s,'next');s=act(s,'rps',{value:'rock'});assert.equal(s.match.battle.actor,0);
  s=act(s,'next');s=act(s,'attack',{skill:0});assert.deepEqual(s.match.battle.hp,[65,120]);
  s=act(s,'next');s=act(s,'rps',{value:'rock'});assert.equal(s.match.battle.actor,1);
  s=act(s,'next');s=act(s,'next');assert.deepEqual(s.match.battle.hp,[30,120]);
  s=act(s,'next');s=act(s,'rps',{value:'rock'});assert.equal(s.match.battle.actor,0);
  s=act(s,'next');assert.match(tutorialGuidance(s).text,/HP归零或主动投降/);
  s=act(s,'retreat');assert.equal(s.match.status,'finished');assert.equal(s.match.winner,null);
  assert.equal(s.match.battle.remaining[0],0);assert.deepEqual(s.match.transfers,[]);
});
test('引导约束拒绝跳过攻击、错误出拳或抢先结束，输入与卡牌定义不变',()=>{
  const cards=JSON.stringify(CARD),s=act(battle(),'next'),snapshot=JSON.stringify(s);
  assert.throws(()=>act(s,'rps',{value:'paper'}),/石头/);
  assert.throws(()=>act(s,'retreat'),/进攻与受击/);
  assert.throws(()=>act(s,'complete'),/先完成拼点/);
  assert.equal(JSON.stringify(s),snapshot);assert.equal(JSON.stringify(CARD),cards);
});
test('拼点先五卡封存确认洗牌，再双零亮牌并用炭铃45对35的伤害强项获胜',()=>{
  const s=pointWin(),r=s.match.rounds[0];assert.equal(s.match.lineups[0].length,5);
  assert.deepEqual(r.cards.map(c=>c.cardId),['tanling','fuchao']);assert.equal(r.attempts,2);
  assert.equal(r.comparison.metric,3);assert.deepEqual(r.comparison.values,[45,35]);assert.equal(r.winner,0);
  assert.equal(s.match.point.comparisons[0].kind,'double-zero');assert.equal(s.match.round,1);
  assert.match(tutorialGuidance(s).text,/自己的强项/);assert.equal(act(s,'complete').status,'completed');
});
test('可选择继续练完五小局，教学仍走真实胜负与收藏实例守恒',()=>{
  let s=pointWin();const ids=s.match.inventories.flat().map(c=>c.id).sort();let guard=0;
  while(s.match.status==='active'&&guard++<60){
    const m=s.match;
    if(m.phase==='between')s=act(s,'continue');
    else if(m.phase==='point'){
      const cards=m.point.cards.map(c=>CARD[c.cardId]);
      const value=POINT_NUMBERS.find(n=>{const i=pointMetricIndex(n+1);return i!==null&&METRICS[i].read(cards[0])!==METRICS[i].read(cards[1]);});
      s=act(s,'point',{value});
    }else s=act(s,'next');
  }
  assert.equal(s.match.status,'finished');assert.equal(s.match.round,5);
  assert.deepEqual(s.match.inventories.flat().map(c=>c.id).sort(),ids);assert.equal(act(s,'complete').status,'completed');
});
test('首次无存档显示欢迎，跳过后刷新不再自动弹出；已有玩家不被打断',()=>{
  const first=appHarness();assert.equal(first.dialog.open,true);assert.match(first.dialog.innerHTML,/欢迎来到衡潮群岛/);
  first.click('tutorial-skip');const saved=JSON.parse(first.storage.get(SAVE_KEY));assert.equal(saved.tutorial.status,'skipped');
  const reload=appHarness(saved);assert.equal(reload.dialog.open,false);assert.match(reload.app.innerHTML,/新手教程/);
  const existing=appHarness(freshSession());assert.equal(existing.dialog.open,false);assert.equal(existing.run('store.tutorial.status'),'available');
});
test('教程刷新续进度、暂停后可继续；练习赢失卡不改变正式收藏、对局、草稿或偏好',()=>{
  const saved=freshSession();saved.difficulty='hard';saved.selectionDrafts={battle:['keep-draft']};
  saved.lineupPresets=[{id:'kept',name:'保留阵容',mode:'battle',cardIds:['tanling']}];
  const before=JSON.stringify(saved.players),h=appHarness(saved);
  h.click('tutorial-open');h.click('tutorial-begin');
  const id=h.run('store.tutorial.match.inventories[0][0].id');h.click('tutorial-choose',{instance:id});h.click('tutorial-submit');
  assert.equal(h.run('store.tutorial.match.winner'),0);assert.equal(h.run('JSON.stringify(store.players)'),before);
  assert.equal(h.run('store.match'),null);assert.equal(h.run('store.difficulty'),'hard');
  const reloaded=appHarness(JSON.parse(h.storage.get(SAVE_KEY)));assert.equal(reloaded.run('route'),'tutorial');
  reloaded.click('tutorial-pause');assert.equal(reloaded.run('store.tutorial.status'),'paused');assert.equal(reloaded.run('route'),'home');
  const paused=appHarness(JSON.parse(reloaded.storage.get(SAVE_KEY)));assert.equal(paused.run('route'),'home');
  paused.click('tutorial-open');assert.equal(paused.run('route'),'tutorial');assert.equal(paused.run('store.tutorial.match.winner'),0);
  assert.equal(paused.run('JSON.stringify(store.players)'),before);assert.equal(paused.run('store.selectionDrafts.battle[0]'),'keep-draft');
  assert.equal(paused.run('store.lineupPresets[0].name'),'保留阵容');assert.deepEqual(paused.delays,[]);
});
test('UI完整教学可完成，恢复全部卡牌也保留教程完成标记',()=>{
  const h=appHarness(),players=h.run('JSON.stringify(store.players)');h.click('tutorial-begin');
  const choose=()=>{for(const id of h.run('store.tutorial.match.inventories[0].map(c=>c.id)'))h.click('tutorial-choose',{instance:id});h.click('tutorial-submit');};
  const next=()=>h.click('tutorial-next');choose();next();choose();next();h.click('tutorial-rps',{value:'rock'});next();h.click('tutorial-attack',{skill:'0'});
  next();h.click('tutorial-rps',{value:'rock'});next();next();next();h.click('tutorial-rps',{value:'rock'});next();h.click('tutorial-retreat');
  assert.match(h.app.innerHTML,/撤退成功/);next();choose();h.click('tutorial-ready');h.click('tutorial-continue');
  h.click('tutorial-point',{value:'0'});assert.match(h.app.innerHTML,/亮牌后用原卡重比/);next();
  assert.match(h.app.innerHTML,/45＞35/);h.click('tutorial-point',{value:'3'});h.click('tutorial-complete');
  assert.equal(h.run('route'),'home');assert.equal(h.run('store.tutorial.status'),'completed');assert.equal(h.run('JSON.stringify(store.players)'),players);
  h.click('confirm-reset');assert.equal(h.run('store.tutorial.status'),'completed');
});
test('教学保存失败保留警告与内存进度，重试后可从实际步骤恢复',()=>{
  const h=appHarness(freshSession());h.click('tutorial-open');h.blockStorage();h.click('tutorial-begin');
  assert.match(h.app.innerHTML,/存档未能写入/);assert.equal(h.run('store.tutorial.status'),'active');
  h.blockStorage(false);h.click('retry-save');const saved=JSON.parse(h.storage.get(SAVE_KEY));
  assert.equal(saved.tutorial.status,'active');assert.equal(appHarness(saved).run('route'),'tutorial');
});
test('无教学数据的老存档可用，未知教学版本安全回到欢迎',()=>{
  assert.equal(normalizeTutorial(null,false).status,'available');assert.equal(normalizeTutorial(null,true).status,'welcome');
  assert.equal(normalizeTutorial({version:999,status:'active'},true).status,'welcome');
  assert.equal(normalizeTutorial({version:1,status:'active',lesson:'battle',draft:[]}).status,'welcome');
});
