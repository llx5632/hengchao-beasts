import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSession, saveSession } from '../dist/storage.js';
import { freshSession, createLocalMatch, SAVE_KEY, upgradeSession } from '../dist/session.js';
import { CARD_GRANTS } from '../dist/session-migrations.js';

test('独立存档模块保存并恢复活动对局、收藏、偏好和草稿',()=>{
  const session=freshSession();
  session.match=createLocalMatch('battle',session.players,'hard');
  session.autoAdvance=false;
  session.selectionDrafts={battle:[session.players[0].cards[0].id]};
  const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  assert.equal(saveSession(storage,session),true);
  const loaded=loadSession(storage);
  assert.equal(loaded.hadSavedSession,true);
  assert.equal(loaded.sessionUpdated,false);
  assert.deepEqual(loaded.store.match,session.match);
  assert.deepEqual(loaded.store.players,session.players);
  assert.deepEqual(loaded.store.selectionDrafts,session.selectionDrafts);
  assert.equal(loaded.store.autoAdvance,false);
  assert(data.has(SAVE_KEY));
});

test('独立存档模块返回写入失败，读取失败沿用新存档回退且不写入',()=>{
  const storage={getItem(){throw new Error('SecurityError');},setItem(){throw new Error('QuotaExceededError');}};
  assert.equal(saveSession(storage,freshSession()),false);
  const denied=()=>{throw new Error('SecurityError accessing localStorage');};
  assert.equal(saveSession(denied,freshSession()),false);
  assert.equal(loadSession(denied).hadSavedSession,false);
  const result=loadSession(storage);
  assert.equal(result.hadSavedSession,false);
  assert.deepEqual(result.store.players,freshSession().players);
});

test('统一补发迁移识别已转移实例，同版活动局不重排、不重复补发已失卡',()=>{
  const session=freshSession();
  for(const {flag} of CARD_GRANTS)delete session[flag];
  // A historical grant instance already belongs to the other player.
  const transferred={id:'release-special-0-xianbei',cardId:'xianbei'};
  session.players[1].cards.push(transferred);
  session.match=createLocalMatch('point',session.players);
  const selections=structuredClone(session.match.selections);
  assert.equal(upgradeSession(session),true);
  assert.equal(session.players.flatMap(p=>p.cards).filter(c=>c.id===transferred.id).length,1);
  assert.deepEqual(session.match.selections,selections);
  assert.deepEqual(session.match.inventories,session.players.map(p=>p.cards));
  session.players[0].cards=session.players[0].cards.filter(c=>c.id!=='release-mantis-twins-0-yangfengtang');
  const before=structuredClone(session);
  assert.equal(upgradeSession(session),false);
  assert.deepEqual(session,before);
});
