import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS} from '../dist/data.js';
import {freshSession,createLocalMatch,SAVE_KEY} from '../dist/session.js';
import {aiAction,dispatch,expectedPlayers} from '../dist/engine.js';

test('本地首版双方直接持有全部十五种卡，各一个独立实例',()=>{
  const session=freshSession();
  assert.equal(session.version,2);
  assert.notEqual(SAVE_KEY,'hengchao-local-v1');
  for(const player of session.players){
    assert.equal(player.cards.length,15);
    assert.deepEqual(player.cards.map(c=>c.cardId),CARDS.map(c=>c.id));
  }
  assert.equal(new Set(session.players.flatMap(p=>p.cards.map(c=>c.id))).size,30);
  session.players[0].cards.pop();
  assert.equal(freshSession().players[0].cards.length,15);
});

for(const mode of ['battle','point'])test(`${mode} 默认玩家对 AI，AI 独立提交后仍等待玩家`,()=>{
  const session=freshSession();
  let m=createLocalMatch(mode,session.players);
  assert.deepEqual(m.controls,['human','ai']);
  const action=aiAction(m,1,()=>.999);
  m=dispatch(m,action,()=>.999);
  assert.equal(m.phase,'select');
  assert.equal(m.selections[0],null);
  assert.equal(m.selections[1].length,mode==='point'?5:1);
  assert.deepEqual(expectedPlayers(m),[0]);
  assert.equal(m.history.length,0);
  assert.equal(m.battle,null);
  assert.equal(m.point,null);
});

test('玩家对 AI 的五小局流程可完成，赢卡结果仍保留且不修改初始收藏',()=>{
  const session=freshSession();
  let m=createLocalMatch('point',session.players);
  // 固定选择两组不同卡，再由 AI 完成它的所有输入。
  m=dispatch(m,{type:'select',player:0,ids:session.players[0].cards.slice(0,5).map(c=>c.id)},()=>.999);
  m=dispatch(m,{type:'select',player:1,ids:session.players[1].cards.slice(5,10).map(c=>c.id)},()=>.999);
  let steps=0;
  while(m.status==='active'&&steps++<120){
    const expected=expectedPlayers(m);
    if(expected.includes(1))m=dispatch(m,aiAction(m,1,()=>.999),()=>.999);
    else if(expected.includes(0))m=dispatch(m,{type:m.phase==='between'?'decision':'point',player:0,value:m.phase==='between'?'continue':1},()=>.999);
    else m=dispatch(m,{type:'advance'},()=>.999);
  }
  assert.equal(m.status,'finished');
  assert.equal(m.rounds.length,5);
  assert.equal(m.transfers.length,5);
  assert.equal(m.inventories.flat().length,30);
  assert.deepEqual(session.players.map(p=>p.cards.length),[15,15]);
  assert.ok(m.history.every(text=>!text.includes('探索者 A')&&!text.includes('探索者 B')));
});
