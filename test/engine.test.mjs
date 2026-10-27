import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS,CARD,METRICS,STARTERS,inventory} from '../dist/data.js';
import {createMatch,dispatch,expectedPlayers,aiAction,shuffled} from '../dist/engine.js';

const rng=()=>.999;
const turn=(m,type,player,more={})=>dispatch(m,{type,player,...more},rng);
function battle(a='tanling',b='liejing'){
  const inv=[inventory('a',true),inventory('b',true)];
  let m=createMatch('battle',inv);
  m=turn(m,'select',0,{ids:[inv[0].find(c=>c.cardId===a).id]});
  m=turn(m,'select',1,{ids:[inv[1].find(c=>c.cardId===b).id]});
  return m.status==='active'?dispatch(m,{type:'advance'}):m;
}
function winAction(m,p=0){m=turn(m,'rps',0,{value:p===0?'rock':'scissors'});m=turn(m,'rps',1,{value:p===0?'scissors':'rock'});return dispatch(m,{type:'advance'});}
function point(a=STARTERS,b=STARTERS){
  const inv=[a.map((cardId,i)=>({id:`a-${i}`,cardId})),b.map((cardId,i)=>({id:`b-${i}`,cardId}))];
  let m=createMatch('point',inv);
  for(const p of [0,1])m=turn(m,'select',p,{ids:inv[p].map(c=>c.id)});
  for(const p of [0,1])m=turn(m,'lineup-ready',p);
  return m;
}
function proceed(m){for(const p of [0,1])m=turn(m,'decision',p,{value:'continue'});return m;}

test('15 张卡各两技能，拼点读取静态值，初始收藏覆盖五属性',()=>{
  assert.equal(CARDS.length,15);assert.equal(new Set(STARTERS.map(id=>CARD[id].element)).size,5);
  for(const c of CARDS){assert.equal(c.skills.length,2);assert.ok(c.retreat>=1);assert.ok([...c.name].length>=2&&[...c.name].length<=5);assert.equal(METRICS[3].read(c),Math.max(...c.skills.map(s=>s.damage)));}
});
test('不足五张不能拼点，同一种的不同副本可以选择，同一实例不能重复',()=>{
  assert.throws(()=>createMatch('point',[inventory('a').slice(0,4),inventory('b')]),/至少需要/);
  const m=point(Array(5).fill('tanling'),Array(5).fill('zhiyi'));assert.equal(m.phase,'between');
  const initial=createMatch('point',[inventory('a'),inventory('b')]);assert.throws(()=>turn(initial,'select',0,{ids:Array(5).fill('a-start-0')}),/实际卡牌/);
});
test('秘密提交不可覆盖，双方提交后才判断克制并仅转移一次',()=>{
  const inv=[inventory('a'),inventory('b')];let m=createMatch('battle',inv);
  m=turn(m,'select',0,{ids:[inv[0][0].id]});assert.equal(m.battle,null);assert.equal(m.transfers.length,0);
  assert.throws(()=>turn(m,'select',0,{ids:[inv[0][1].id]}),/已经提交/);
  m=turn(m,'select',1,{ids:[inv[1][2].id]});assert.equal(m.winner,0);assert.equal(m.transfers.length,1);assert.deepEqual(m.inventories.map(i=>i.length),[6,4]);
  assert.throws(()=>dispatch(m,{type:'advance'}),/已经结束/);
});
test('猜拳平手不改变独立状态，败者无行动权',()=>{
  let m=battle();const before=structuredClone(m.battle);
  m=turn(m,'rps',0,{value:'rock'});m=turn(m,'rps',1,{value:'rock'});
  assert.equal(m.phase,'rps-tie');assert.deepEqual(m.battle,before);
  m=dispatch(m,{type:'advance'});m=winAction(m);assert.deepEqual(expectedPlayers(m),[0]);
  assert.throws(()=>turn(m,'attack',1,{skill:1}),/不能提交/);
});
test('攻击与撤退不改变卡牌定义，撤退到零平局不交换',()=>{
  const definitions=JSON.stringify(CARDS);let m=winAction(battle());m=turn(m,'attack',0,{skill:0});
  assert.equal(m.battle.hp[1],60);assert.equal(m.phase,'battle-turn');
  m=dispatch(m,{type:'advance'});m=winAction(m);m=turn(m,'retreat',0);
  assert.equal(m.status,'finished');assert.equal(m.winner,null);assert.equal(m.transfers.length,0);assert.equal(JSON.stringify(CARDS),definitions);
});
test('每次行动重新猜拳；撤退进度在进攻和受伤之间保留',()=>{
  let m=winAction(battle('liejing','woxu'));m=turn(m,'retreat',0);assert.equal(m.battle.remaining[0],1);
  m=dispatch(m,{type:'advance'});assert.equal(m.phase,'rps');m=winAction(m,1);m=turn(m,'attack',1,{skill:0});assert.equal(m.battle.remaining[0],1);
  m=dispatch(m,{type:'advance'});m=winAction(m);m=turn(m,'retreat',0);assert.equal(m.winner,null);assert.equal(m.battle.remaining[0],0);
});
test('回血上限与击败判定顺序',()=>{
  let m=winAction(battle('lujia','liejing'));m.battle.hp[0]=105;m=turn(m,'attack',0,{skill:1});assert.equal(m.battle.hp[0],110);assert.equal(m.battle.hp[1],75);
  m=winAction(battle('lujia','liejing'));m.battle.hp[0]=30;m.battle.hp[1]=10;m=turn(m,'attack',0,{skill:1});
  assert.equal(m.winner,0);assert.equal(m.battle.hp[0],30);assert.equal(m.battle.hp[1],0);
});
test('阻退只增加对方剩余值，上限基础值加二，拼点仍读基础值',()=>{
  let m=winAction(battle('fuchao','genguan'));m.battle.remaining[1]=4;m=turn(m,'attack',0,{skill:1});assert.equal(m.battle.remaining[1],5);assert.equal(CARD.genguan.retreat,3);
  m=dispatch(m,{type:'advance'});m=winAction(m);m=turn(m,'attack',0,{skill:1});assert.equal(m.battle.remaining[1],5);assert.equal(METRICS[2].read(CARD.genguan),3);
});
test('不同卡牌同分时公开、重选，仍属于同一小局且不先转移卡',()=>{
  let m=proceed(point(Array(5).fill('tanling'),Array(5).fill('zhiyi')));
  m=turn(m,'point',0,{value:0});assert.equal(m.phase,'point');assert.equal(m.point.revealed,false);
  m=turn(m,'point',1,{value:3});assert.equal(m.phase,'point-tie');assert.equal(m.point.revealed,true);assert.equal(m.round,0);assert.equal(m.transfers.length,0);
  m=dispatch(m,{type:'advance'});m=turn(m,'point',0,{value:2});m=turn(m,'point',1,{value:3});
  assert.equal(m.round,1);assert.equal(m.rounds[0].attempts,2);assert.equal(m.scores[0],1);assert.equal(m.transfers.length,1);assert.equal(m.hands[0].length,5);
});
test('49 种组合中双零单独平手，其余 48 种按六项各八种分配',()=>{
  const seen=new Set(),bySum=[null,0,1,2,3,4,5,0,1,2,3,4,5],frequencies=Array(6).fill(0);let draws=0;
  for(let a=0;a<=6;a++)for(let b=0;b<=6;b++){
    let m=proceed(point(Array(5).fill('tanling'),Array(5).fill('panjia')));m=turn(m,'point',0,{value:a});m=turn(m,'point',1,{value:b});
    const comparison=m.point.comparisons[0];assert.equal(comparison.metric,bySum[a+b]);
    if(comparison.metric===null){draws++;assert.equal(comparison.kind,'double-zero');assert.equal(comparison.values,null);}
    else {seen.add(comparison.metric);frequencies[comparison.metric]++;}
  }
  assert.equal(draws,1);assert.deepEqual(frequencies,[8,8,8,8,8,8]);
  assert.equal(seen.size,6);let m=proceed(point(Array(5).fill('tanling'),Array(5).fill('panjia')));
  for(const value of [-1,7,.5,'0',NaN])assert.throws(()=>turn(m,'point',0,{value}),/0～6/);
});
test('五小局同卡全部跳过，最终平局，卡牌不重复使用',()=>{
  let m=point();
  for(let i=0;i<5;i++){m=proceed(m);assert.equal(m.phase,'round-result');assert.equal(m.round,i+1);m=dispatch(m,{type:'advance'});}
  assert.equal(m.winner,null);assert.equal(m.status,'finished');assert.equal(m.rounds.length,5);assert.deepEqual(m.scores,[0,0]);assert.equal(m.transfers.length,0);
});
for(let completed=0;completed<=4;completed++)test(`第 ${completed} 小局后投降，罚剩余卡的一半向上取整`,()=>{
  let m=point();m.round=completed;
  m=turn(m,'decision',0,{value:'surrender'});assert.equal(m.status,'active');assert.equal(m.transfers.length,0);
  m=turn(m,'decision',1,{value:'continue'});const expected=[3,2,2,1,1][completed];assert.equal(m.winner,1);assert.equal(m.transfers.length,expected);
  const eligible=new Set(m.hands[0].slice(completed).map(i=>i.id));assert.ok(m.transfers.every(t=>eligible.has(t.id)));assert.deepEqual(m.scores,[0,0]);
});
test('同时秘密投降保持此前转移，双方免罚，整场平局',()=>{
  let m=proceed(point(Array(5).fill('tanling'),Array(5).fill('zhiyi')));m=turn(m,'point',0,{value:2});m=turn(m,'point',1,{value:3});m=dispatch(m,{type:'advance'});
  const inv=structuredClone(m.inventories);assert.equal(m.transfers.length,1);
  m=turn(m,'decision',0,{value:'surrender'});m=turn(m,'decision',1,{value:'surrender'});assert.equal(m.winner,null);assert.deepEqual(m.inventories,inv);assert.equal(m.transfers.length,1);
});
test('战斗主动投降失去当前卡，AI接管保留状态与原队列',()=>{
  let m=battle();const before=structuredClone(m.battle);m=turn(m,'control',1,{control:'ai'});assert.deepEqual(m.battle,before);assert.equal(aiAction(m,1,rng).type,'rps');
  m=turn(m,'surrender',0);assert.equal(m.winner,1);assert.equal(m.transfers.length,1);
});
test('拼点完成保留五次赢卡，战利品不加入出战序列，所有实例总数守恒',()=>{
  let m=point(Array(5).fill('tanling'),Array(5).fill('zhiyi'));
  for(let i=0;i<5;i++){m=proceed(m);m=turn(m,'point',0,{value:2});m=turn(m,'point',1,{value:3});m=dispatch(m,{type:'advance'});}
  assert.equal(m.status,'finished');assert.equal(m.winner,0);assert.deepEqual(m.scores,[5,0]);assert.equal(m.inventories.flat().length,10);assert.equal(new Set(m.inventories.flat().map(c=>c.id)).size,10);assert.equal(m.hands[0].length,5);
});
test('洗牌不修改原数组；随机选点始终在范围内且不依赖对手暗牌',()=>{
  const input=[1,2,3,4,5],copy=[...input];shuffled(input,()=>0);assert.deepEqual(input,copy);
  const m=proceed(point(Array(5).fill('tanling'),Array(5).fill('zhiyi')));
  assert.equal(aiAction(m,0,()=>0).value,0);assert.equal(aiAction(m,0,()=>.999999).value,6);
});

test('零点同样保密并记录；双零亮牌重比，其余整六和仍比体重',()=>{
  for(const numbers of [[0,0],[0,6],[6,0],[6,6]]){
    let m=proceed(point(Array(5).fill('tanling'),Array(5).fill('panjia')));
    m=turn(m,'point',0,{value:numbers[0]});
    assert.equal(m.phase,'point');assert.equal(m.point.revealed,false);assert.equal(m.pointHistory,undefined);
    assert.deepEqual(expectedPlayers(m),[1]);
    assert.throws(()=>turn(m,'point',0,{value:1}),/已经提交/);
    m=turn(m,'point',1,{value:numbers[1]});
    if(numbers.every(n=>n===0)){
      assert.equal(m.phase,'point-tie');assert.equal(m.point.revealed,true);assert.equal(m.point.comparisons[0].metric,null);
      assert.equal(m.round,0);assert.equal(m.transfers.length,0);assert.deepEqual(m.scores,[0,0]);
    }else {assert.equal(m.phase,'round-result');assert.equal(m.point.comparisons[0].metric,5);assert.equal(m.rounds[0].winner,1);}
    assert.deepEqual(m.point.comparisons[0].numbers,numbers);assert.deepEqual(m.pointHistory,[numbers]);
  }
});

test('连续双零使用原卡和原队列，刷新兼容，正常比较后只结算一次',()=>{
  let m=proceed(point(Array(5).fill('tanling'),Array(5).fill('panjia')));
  const cards=structuredClone(m.point.cards),hands=structuredClone(m.hands),inventories=structuredClone(m.inventories);
  for(let i=0;i<2;i++){
    m=turn(m,'point',0,{value:0});m=turn(m,'point',1,{value:0});
    assert.equal(m.phase,'point-tie');assert.equal(m.point.revealed,true);assert.equal(m.round,0);assert.equal(m.transfers.length,0);
    assert.deepEqual(m.point.cards,cards);assert.deepEqual(m.hands,hands);assert.deepEqual(m.inventories,inventories);
    m=JSON.parse(JSON.stringify(m));m=dispatch(m,{type:'advance'});
    assert.equal(m.phase,'point');assert.equal(m.point.revealed,true);assert.deepEqual(m.picks,[null,null]);
  }
  m=turn(m,'point',0,{value:1});m=turn(m,'point',1,{value:1});
  assert.equal(m.phase,'round-result');assert.equal(m.round,1);assert.equal(m.rounds[0].winner,1);
  assert.equal(m.rounds[0].attempts,3);assert.equal(m.transfers.length,1);assert.deepEqual(m.scores,[0,1]);
  assert.deepEqual(m.pointHistory,[[0,0],[0,0],[1,1]]);
});
