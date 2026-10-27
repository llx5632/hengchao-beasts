import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD } from '../dist/data.js';
import { createMatch, dispatch, expectedPlayers, aiAction } from '../dist/engine.js';
import { publicPointOpponents, hardPointAction } from '../dist/ai.js';
import { scheduledStep } from '../dist/flow.js';

function selected(){
  const inventories=[['panjia','tanling','tanling','woxu','mingjing'],['fuyun','genguan','zhiyi','liejing','xunbei']].map((cards,p)=>cards.map((cardId,i)=>({id:`${p}-${i}`,cardId})));
  let m=createMatch('point',inventories);
  for(const player of [0,1])m=dispatch(m,{type:'select',player,ids:inventories[player].map(i=>i.id)},()=>{throw Error('不能在展示前洗牌');});
  return m;
}
function confirmed(){let m=selected();for(const player of [0,1])m=dispatch(m,{type:'lineup-ready',player},()=>0);return m;}

test('双方封存后才公开五张阵容，不可换牌，重复异兽的实际副本均保留',()=>{
  const inventory=CARDS.map((c,i)=>({id:`a-${i}`,cardId:c.id}));
  let secret=createMatch('point',[inventory,inventory.map(i=>({...i,id:`b-${i.id}`}))]);
  secret=dispatch(secret,{type:'select',player:0,ids:inventory.slice(0,5).map(c=>c.id)});
  assert.equal(secret.lineups,null);assert.equal(secret.hands,null);
  assert.equal(secret.history.length,0);assert.deepEqual(expectedPlayers(secret),[1]);
  const m=selected();assert.equal(m.phase,'lineup-reveal');assert.equal(m.hands,null);assert.equal(m.point,null);
  assert.deepEqual(expectedPlayers(m),[0,1]);
  assert.deepEqual(m.lineups.map(a=>a.length),[5,5]);
  assert.equal(m.lineups[0].filter(i=>i.cardId==='tanling').length,2);
  assert.deepEqual(new Set(m.lineups[0].map(i=>i.id)),new Set(m.selections[0]));
  assert.notDeepEqual(m.lineups[0].map(i=>i.id),m.selections[0]);
  assert.throws(()=>dispatch(m,{type:'select',player:0,ids:m.selections[0]}),/不是选卡/);
  assert.throws(()=>dispatch(m,{type:'advance'}),/不能继续/);
  assert.throws(()=>dispatch(m,{type:'decision',player:0,value:'continue'}),/继续或投降/);
});
test('双方确认后才各自洗牌，公开顺序与队列分开保存，不消耗小局也不转卡',()=>{
  let m=selected();const rosters=structuredClone(m.lineups);
  m=dispatch(m,{type:'lineup-ready',player:1});assert.equal(m.hands,null);assert.equal(m.phase,'lineup-reveal');
  m=JSON.parse(JSON.stringify(m));assert.deepEqual(expectedPlayers(m),[0]);
  assert.throws(()=>dispatch(m,{type:'lineup-ready',player:1}),/已经提交/);
  m=dispatch(m,{type:'lineup-ready',player:0},()=>0);
  assert.equal(m.phase,'between');assert.equal(m.round,0);assert.equal(m.transfers.length,0);
  assert.deepEqual(m.lineups,rosters);
  for(const p of [0,1]){
    assert.deepEqual(new Set(m.hands[p].map(i=>i.id)),new Set(rosters[p].map(i=>i.id)));
    assert.notDeepEqual(m.hands[p],rosters[p]);
  }
  const queues=structuredClone(m.hands);
  m=dispatch(m,{type:'control',player:0,control:'ai'});
  assert.deepEqual(m.hands,queues);assert.deepEqual(m.lineups,rosters);
  assert.throws(()=>dispatch(m,{type:'lineup-ready',player:0}),/不是阵容展示/);
});
test('自动推进不替玩家确认阵容，AI 代出和原有投降罚卡仍可衔接',()=>{
  let m=selected();m.controls=['human','ai'];
  assert.deepEqual(aiAction(m,1),{type:'lineup-ready',player:1});
  m=dispatch(m,aiAction(m,1));assert.equal(scheduledStep(m,{autoAdvance:true}),null);
  assert.equal(m.hands,null);
  m=dispatch(m,{type:'control',player:0,control:'ai'});
  assert.deepEqual(scheduledStep(m),{kind:'ai',player:0,delay:650});
  m=dispatch(m,aiAction(m,0),()=>0);const rosters=structuredClone(m.lineups);
  m=dispatch(m,{type:'decision',player:0,value:'surrender'});
  m=dispatch(m,{type:'decision',player:1,value:'continue'},()=>0);
  assert.equal(m.status,'finished');assert.equal(m.transfers.length,3);assert.equal(m.winner,1);
  assert.deepEqual(m.lineups,rosters);assert.equal(m.inventories.flat().length,10);
});
test('公开候选排除已出场实例，保留未出场的同种副本，不混入战利品或收藏外卡',()=>{
  const m=confirmed();
  const first=m.lineups[0].find(i=>i.cardId==='tanling');
  m.rounds=[{kind:'win',cards:[first,m.lineups[1][0]],winner:1}];
  m.inventories[0].push({id:'trophy',cardId:'fuchao'});
  m.point={revealed:false,cards:[{id:'secret',cardId:'tanling'},m.lineups[1][1]]};
  const candidates=publicPointOpponents(m,1);
  assert.equal(candidates.length,4);assert.equal(candidates.filter(c=>c.id==='tanling').length,1);
  assert.ok(!candidates.some(c=>c.id==='fuchao'));
  m.rounds=m.lineups[0].slice(0,4).map((c,i)=>({kind:'same',cards:[c,m.lineups[1][i]]}));
  assert.deepEqual(publicPointOpponents(m,1).map(c=>c.id),[m.lineups[0][4].cardId]);
});
test('高难度使用已公开五张阵容，仍不读对手当前卡、队列、秘密输入或未选收藏',()=>{
  const m=confirmed();m.phase='point';m.difficulty='hard';m.pointHistory=Array.from({length:12},()=>[1,2]);
  m.point={revealed:false,cards:[null,{id:'own',cardId:'mingjing'}]};
  const deny=()=>{throw Error('读取了不应使用的信息');};
  Object.defineProperty(m.point.cards,0,{get:deny,configurable:true});
  for(const field of ['hands','selections','picks','inventories'])Object.defineProperty(m,field,{get:deny});
  assert.equal(publicPointOpponents(m,1).length,5);
  assert.ok(Number.isInteger(hardPointAction(m,1,()=>.5).value));
  m.point.revealed=true;
  Object.defineProperty(m.point.cards,0,{get:()=>({id:'revealed',cardId:'woxu'}),configurable:true});
  assert.deepEqual(publicPointOpponents(m,1),[CARD.woxu]);
});
test('缺少公开阵容的旧对局保留原队列与公开收藏估计',()=>{
  let m=confirmed();delete m.lineups;delete m.lineupReady;const queues=structuredClone(m.hands);
  m=JSON.parse(JSON.stringify(m));
  for(const player of [0,1])m=dispatch(m,{type:'decision',player,value:'continue'});
  assert.deepEqual(m.hands,queues);
  const own=0,other=1;
  assert.equal(publicPointOpponents(m,own).length,m.inventories[other].length);
  m.point.revealed=true;
  assert.deepEqual(publicPointOpponents(m,own),[CARD[m.point.cards[other].cardId]]);
});
