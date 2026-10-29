import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSession, createLocalMatch, SAVE_KEY } from '../dist/session.js';
import { dispatch } from '../dist/engine.js';
import { EASTER_EGG_MESSAGES, FIREWORKS_DURATION, earnedEasterEgg, nextEasterEgg } from '../dist/easter-egg.js';
import { appHarness } from './helpers/app-harness.mjs';

function lastBattle(){
  const s=freshSession();s.players[1].cards=[{id:'last-ai',cardId:'genguan'}];
  s.match=createLocalMatch('battle',s.players);s.match=dispatch(s.match,{type:'select',player:1,ids:['last-ai']});
  s.match.selectionDraft=[s.players[0].cards.find(c=>c.cardId==='tanling').id];return s;
}
const win=()=>{const h=appHarness(lastBattle());h.click('submit-cards');return h;};
function advance(h){h.elapse(300);h.click('egg-next',{step:String(h.run('store.easterEgg.step'))});}

test('赢走AI最后一张卡触发发现弹窗，不影响真实赢卡结果',()=>{
  const h=win();assert.equal(h.eggDialog.open,true);assert.match(h.eggDialog.innerHTML,/恭喜你发现了彩蛋/);
  assert.equal(h.run('store.players[1].cards.length'),0);assert.equal(h.run('store.players[0].cards.length'),20);
  assert.equal(h.run('store.match.transfers.length'),1);assert.equal(h.run('store.easterEgg.step'),0);
});
test('依次展示三个相同悬念，再显示完整原文感谢语，点击后才开始烟花',()=>{
  const h=win();for(let step=1;step<=3;step++){advance(h);assert.equal(h.run('store.easterEgg.step'),step);assert.match(h.eggDialog.innerHTML,/彩蛋的内容是\.\.\.\.\.\./);}
  advance(h);assert.equal(h.run('store.easterEgg.step'),4);assert.ok(h.eggDialog.innerHTML.includes(EASTER_EGG_MESSAGES[4]));
  assert.ok(!h.delays.includes(FIREWORKS_DURATION));advance(h);
  assert.equal(h.run('store.easterEgg.status'),'fireworks');assert.match(h.eggDialog.innerHTML,/egg-sky/);
  assert.ok(h.delays.includes(FIREWORKS_DURATION));
});
test('快速连点和过期按钮事件不会跳过文案',()=>{
  const h=win();h.click('egg-next',{step:'0'});assert.equal(h.run('store.easterEgg.step'),0);
  advance(h);h.click('egg-next',{step:'1'});assert.equal(h.run('store.easterEgg.step'),1);
  h.elapse(300);h.click('egg-next',{step:'0'});assert.equal(h.run('store.easterEgg.step'),1);
  const state={version:1,status:'active',step:1};assert.equal(nextEasterEgg(state,0),state);
});
test('刷新恢复当前文案，稍后继续不自动打断，可从大厅恢复',()=>{
  const h=win();advance(h);advance(h);const resumed=appHarness(JSON.parse(h.storage.get(SAVE_KEY)));
  assert.equal(resumed.run('store.easterEgg.step'),2);assert.equal(resumed.eggDialog.open,true);
  resumed.click('egg-pause');const paused=appHarness(JSON.parse(resumed.storage.get(SAVE_KEY)));
  assert.equal(paused.eggDialog.open,false);paused.click('home');assert.match(paused.app.innerHTML,/继续彩蛋/);
  paused.click('egg-resume');assert.equal(paused.eggDialog.open,true);assert.equal(paused.run('store.easterEgg.step'),2);
});
test('烟花切后台暂停结束计时，返回重给展示时间，完成后刷新不重复弹出',()=>{
  const h=win();for(let i=0;i<5;i++)advance(h);
  h.visibility(true);assert.ok(!h.delays.includes(FIREWORKS_DURATION));h.visibility(false);assert.ok(h.delays.includes(FIREWORKS_DURATION));
  h.fireTimer(FIREWORKS_DURATION);assert.equal(h.eggDialog.open,false);assert.equal(h.run('store.easterEgg.status'),'completed');
  const saved=JSON.parse(h.storage.get(SAVE_KEY));assert.equal(appHarness(saved).eggDialog.open,false);
  h.click('confirm-reset');assert.equal(h.run('store.easterEgg'),null);assert.equal(h.run('store.players[1].cards.length'),19);
});
test('拼点第五小局赢光AI时触发，公共自动推进被彩蛋弹窗暂停',()=>{
  const s=freshSession();const own=['fuchao','fuyun','genguan','jinzong','panjia'],other=['mingjing','taituan','tanling','woxu','zhiyi'];
  s.players[0].cards=s.players[0].cards.filter(c=>own.includes(c.cardId));s.players[1].cards=s.players[1].cards.filter(c=>other.includes(c.cardId));
  let m=createLocalMatch('point',s.players);const apply=a=>m=dispatch(m,a,()=>.999999);
  for(const p of [0,1])apply({type:'select',player:p,ids:s.players[p].cards.map(c=>c.id)});
  for(const p of [0,1])apply({type:'lineup-ready',player:p});
  for(let i=0;i<5;i++){
    for(const p of [0,1])apply({type:'decision',player:p,value:'continue'});
    apply({type:'point',player:1,value:3});if(i===4)break;
    apply({type:'point',player:0,value:3});apply({type:'advance'});
  }
  s.match=m;s.players.forEach((p,i)=>p.cards=structuredClone(m.inventories[i]));
  const h=appHarness(s);assert.equal(h.eggDialog.open,false);h.click('point',{value:'3'});
  assert.equal(h.run('store.players[1].cards.length'),0);assert.equal(h.eggDialog.open,true);
  assert.ok(!h.delays.includes(4000));
});
test('AI尚有卡、无正式赢卡证据或仅教学赢卡均不误触发',()=>{
  assert.equal(earnedEasterEgg(freshSession()),false);
  const zero=freshSession();zero.players[1].cards=[];assert.equal(earnedEasterEgg(zero),false);assert.equal(appHarness(zero).eggDialog.open,false);
  const h=appHarness(freshSession());h.click('tutorial-open');h.click('tutorial-begin');
  h.click('tutorial-choose',{instance:h.run('store.tutorial.match.inventories[0][0].id')});h.click('tutorial-submit');
  assert.equal(h.run('store.tutorial.match.winner'),0);assert.equal(h.eggDialog.open,false);assert.equal(h.run('store.easterEgg'),null);
});
test('存储失败保留当前彩蛋与错误提示，重试后恢复同一步且不重复转移卡牌',()=>{
  const h=appHarness(lastBattle());h.blockStorage();h.click('submit-cards');assert.match(h.eggDialog.innerHTML,/未能写入浏览器/);
  advance(h);assert.equal(h.run('store.easterEgg.step'),1);h.blockStorage(false);h.click('retry-save');
  const saved=JSON.parse(h.storage.get(SAVE_KEY));assert.equal(saved.easterEgg.step,1);assert.equal(saved.match.transfers.length,1);
  assert.equal(appHarness(saved).run('store.easterEgg.step'),1);
});
