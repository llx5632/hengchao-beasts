import test from 'node:test';
import assert from 'node:assert/strict';
import { appHarness } from './helpers/app-harness.mjs';
import { freshSession, createLocalMatch, SAVE_KEY } from '../dist/session.js';
import { dispatch } from '../dist/engine.js';

function battleAction(winner=0){
  const s=freshSession();let m=createLocalMatch('battle',s.players);
  for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:[s.players[p].cards.find(c=>c.cardId===['lujia','liejing'][p]).id]});
  m=dispatch(m,{type:'advance'});
  for(const p of [0,1])m=dispatch(m,{type:'rps',player:p,value:p===winner?'rock':'scissors'});
  return dispatch(m,{type:'advance'});
}
function page(match){const s=freshSession();s.match=match;return appHarness(s);}

test('存储写入失败不误报保存成功，不关闭命名框；恢复后重试只保存一套阵容',()=>{
  const h=appHarness();h.click('start-battle');h.run('draft=[store.match.inventories[0][0].id]');
  h.click('save-preset');h.input.value='保留的名称';h.blockStorage();
  h.click('confirm-save-preset');
  assert.match(h.toast.textContent,/存档未能写入/);assert.equal(h.dialog.open,true);
  assert.equal(h.input.value,'保留的名称');assert.equal(h.run('store.lineupPresets.length'),0);
  assert.match(h.app.innerHTML,/role="alert"/);assert.match(h.app.innerHTML,/当前选择尚未写入存档/);
  assert.equal(JSON.parse(h.storage.get(SAVE_KEY)).lineupPresets.length,0);
  h.blockStorage(false);h.click('confirm-save-preset');
  assert.equal(h.dialog.open,false);assert.equal(h.toast.textContent,'已保存常用阵容。');
  assert.equal(JSON.parse(h.storage.get(SAVE_KEY)).lineupPresets.length,1);
  assert.equal(h.run('store.lineupPresets[0].name'),'保留的名称');
  assert.doesNotMatch(h.app.innerHTML,/class="save-warning"/);
});

test('草稿和删除方案保存失败显示错误，重试成功后才移除存档警告',()=>{
  const h=appHarness();h.click('start-battle');h.run('draft=[store.match.inventories[0][0].id]');
  h.click('save-preset');h.click('confirm-save-preset');
  const id=h.run('store.lineupPresets[0].id');h.blockStorage();
  h.click('delete-preset',{preset:id});assert.match(h.toast.textContent,/存档未能写入/);
  assert.equal(JSON.parse(h.storage.get(SAVE_KEY)).lineupPresets.length,1);
  assert.match(h.app.innerHTML,/class="save-warning"/);
  h.blockStorage(false);h.click('retry-save');
  assert.equal(JSON.parse(h.storage.get(SAVE_KEY)).lineupPresets.length,0);
  assert.match(h.toast.textContent,/已成功写入/);assert.doesNotMatch(h.app.innerHTML,/class="save-warning"/);
});

for(const kind of ['ai','advance'])test(`阅读记录切后台保留原 DOM，返回及重绘不恢复 ${kind} 计时，关闭后重新计时`,()=>{
  let m=battleAction(1);
  if(kind==='advance')m=dispatch(m,{type:'attack',player:1,skill:0});
  const delay=kind==='ai'?650:3000,h=page(m);
  assert(h.delays.includes(delay));const node=h.toggle('.log',true),renders=h.renders;
  assert(!h.delays.includes(delay));h.visibility(true);h.visibility(false);
  assert.equal(h.renders,renders);assert.equal(h.document.querySelector('.log'),node);assert.equal(node.open,true);
  assert(!h.delays.includes(delay));assert.match(h.status.textContent,/查看内容.*暂停/);
  h.click('battle-layout');assert.equal(h.document.querySelector('.log').open,true);assert(!h.delays.includes(delay));
  h.toggle('.log',false);assert(h.delays.includes(delay));
});

test('公开阵容和记录可同时保持展开，关闭其中一个不恢复自动处理',()=>{
  const s=freshSession();let m=createLocalMatch('point',s.players);
  for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:s.players[p].cards.slice(0,5).map(c=>c.id)});
  for(const p of [0,1])m=dispatch(m,{type:'lineup-ready',player:p});
  const h=page(m);h.toggle('.lineup-reference',true);h.toggle('.log',true);
  h.visibility(true);h.visibility(false);h.run('render()');
  assert.equal(h.document.querySelector('.lineup-reference').open,true);assert.equal(h.document.querySelector('.log').open,true);
  h.toggle('.lineup-reference',false);assert(!h.delays.includes(650));
  h.toggle('.log',false);assert(h.delays.includes(650));
});

test('投降清除临时反馈但保留血量、历史与失卡；旧投降存档也不显示旧攻击，正常击败保留反馈',()=>{
  const attacked=dispatch(battleAction(),{type:'attack',player:0,skill:0});
  for(const source of [attacked,dispatch(attacked,{type:'advance'})]){
    const ended=dispatch(source,{type:'surrender',player:0}),h=page(ended);
    assert.deepEqual(ended.battle.hp,source.battle.hp);assert.deepEqual(ended.battle.remaining,source.battle.remaining);
    assert.equal(ended.battle.last,null);assert.deepEqual(ended.rps,[null,null]);assert.equal(ended.battle.actor,null);
    assert.equal(ended.winner,1);assert.equal(ended.transfers.length,1);assert(ended.history.some(t=>t.includes('造成 35 伤害')));
    assert.doesNotMatch(h.run('finalView(store.match)'),/action-feedback|state-delta|rps-inline|rps-reveal/);
    const legacy=structuredClone(ended);legacy.battle.last=attacked.battle.last;legacy.battle.actor=0;legacy.rps=['rock','scissors'];
    assert.doesNotMatch(page(legacy).run('finalView(store.match)'),/action-feedback|state-delta|rps-inline|rps-reveal/);
  }
  const action=battleAction();action.battle.hp[1]=10;
  const killed=dispatch(action,{type:'attack',player:0,skill:0}),h=page(killed);
  assert.match(h.run('finalView(store.match)'),/action-feedback/);assert.match(h.run('finalView(store.match)'),/state-delta cost/);
});
