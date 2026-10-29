import test from 'node:test';
import assert from 'node:assert/strict';
import {CARD,CARDS,pointMetricIndex} from '../dist/data.js';
import {DIFFICULTIES,normalizeDifficulty,hardPointAction} from '../dist/ai.js';
import {resolveCombatAction} from '../dist/combat.js';
import {aiAction,createMatch,dispatch,expectedPlayers} from '../dist/engine.js';
import {freshSession,createLocalMatch} from '../dist/session.js';

function combat(a,b,hp,remaining,difficulty='hard') {
  return {difficulty,phase:'battle-action',battle:{cards:[a,b],hp,remaining,actor:0,last:null}};
}
function point(own='mingjing',other='panjia') {
  const inventories=[[{id:'a-current',cardId:other}],[{id:'b-current',cardId:own}]];
  const m=createMatch('battle',inventories);
  Object.assign(m,{difficulty:'hard',mode:'point',phase:'point',point:{cards:inventories.map(a=>a[0]),revealed:false,comparisons:[]},pointHistory:[]});
  return m;
}
const repeatOnes=()=>Array.from({length:12},()=>[1,2]);

test('难度默认简单，旧值兼容，新对局和序列化保留高难度',()=>{
  const session=freshSession();
  assert.equal(session.difficulty,'easy');
  assert.equal(normalizeDifficulty(undefined),'easy');
  assert.equal(normalizeDifficulty('unknown'),'easy');
  assert.deepEqual(Object.keys(DIFFICULTIES),['easy','hard']);
  const m=createLocalMatch('point',session.players,'hard');
  assert.equal(m.difficulty,'hard');
  assert.equal(JSON.parse(JSON.stringify(m)).difficulty,'hard');
  assert.deepEqual(m.controls,['human','ai']);
  assert.deepEqual(session.players.map(p=>p.cards.length),[CARDS.length,CARDS.length]);
});

test('简单模式保持随机选点猜拳及原有基础战斗判断',()=>{
  const m=point();m.difficulty='easy';
  for(const [rng,value] of [[0,0],[.5,3],[.999,6]])assert.equal(aiAction(m,1,()=>rng).value,value);
  assert.deepEqual(Array.from({length:7},(_,i)=>aiAction(m,1,()=>(i+.5)/7).value),[0,1,2,3,4,5,6]);
  m.phase='rps';
  for(const [rng,value] of [[0,'rock'],[.5,'paper'],[.999,'scissors']])assert.equal(aiAction(m,1,()=>rng).value,value);
  assert.deepEqual(aiAction(combat('xunbei','woxu',[20,90],[3,2],'easy'),0,()=>.5),{type:'attack',player:0,skill:0});
  assert.equal(aiAction(combat('woxu','panjia',[10,160],[1,4],'easy'),0).type,'retreat');
});

test('高难度根据已公开出点争取优势项，而非读当前秘密点数',()=>{
  const m=point();m.pointHistory=repeatOnes();
  const action=aiAction(m,1,()=>.5);
  assert.ok([0,6].includes(action.value)); // Predict opponent 1: sum 1 or 7 selects item 1.
  assert.equal(pointMetricIndex(action.value+1),0);
  assert.ok([...CARD.mingjing.name].length>[...CARD.panjia.name].length);
  const result=structuredClone(m);result.picks=[6,null];
  assert.deepEqual(aiAction(result,1,()=>.5),action);
  result.picks=[2,null];
  assert.deepEqual(aiAction(result,1,()=>.5),action);
});

test('高难度不接触对手暗牌、选卡、未揭晓数字或未来队列',()=>{
  const m=point();m.pointHistory=repeatOnes();
  const denied=()=>{throw new Error('访问了秘密信息');};
  Object.defineProperty(m.point.cards,0,{get:denied});
  Object.defineProperty(m.picks,0,{get:denied});
  Object.defineProperty(m.selections,0,{get:denied});
  Object.defineProperty(m,'hands',{get:denied});
  assert.ok([0,6].includes(aiAction(m,1,()=>.5).value));
});

test('亮牌后可以读取对方真实卡，未知时只用公开收藏估计',()=>{
  const m=point();m.point.revealed=true;
  let reads=0;
  Object.defineProperty(m.point.cards,0,{get:()=>{reads++;return {id:'shown',cardId:'panjia'};}});
  m.pointHistory=repeatOnes();
  assert.ok([0,6].includes(aiAction(m,1,()=>.5).value));
  assert.equal(reads,1);
  m.point.revealed=false;reads=0;
  aiAction(m,1,()=>.5);
  assert.equal(reads,0);
});

test('高难度探索覆盖 0～6，零点历史参与预测且不读本轮秘密点数',()=>{
  const m=point();
  const seen=new Set();
  for(let i=0;i<7;i++){let call=0;seen.add(hardPointAction(m,1,()=>call++===0?0:(i+.5)/7).value);}
  assert.deepEqual([...seen].sort(),[0,1,2,3,4,5,6]);
  m.pointHistory=repeatOnes();
  for(let i=0;i<60;i++)assert.ok(hardPointAction(m,1,()=>i/60).value>=0&&hardPointAction(m,1,()=>i/60).value<=6);
  m.pointHistory=Array.from({length:18},()=>[0,2]);
  const action=hardPointAction(m,1,()=>.5);
  assert.equal(action.value,1);
  m.picks=[6,null];assert.deepEqual(hardPointAction(m,1,()=>.5),action);
});

test('高难度将双零视为中性平手，不再当作有利的体重比较',()=>{
  const m=point('panjia','woxu');m.pointHistory=Array.from({length:18},()=>[0,2]);m.point.revealed=true;
  // 磐甲体重明显占优；面对频繁出 0 的对手，自己出 0 已不能拿到该优势。
  assert.ok(CARD.panjia.weight>CARD.woxu.weight);
  const action=hardPointAction(m,1,()=>.13);
  assert.notEqual(action.value,0);assert.ok([2,3,4,5,6].includes(action.value));
  m.picks=[0,null];assert.deepEqual(hardPointAction(m,1,()=>.13),action);
});

test('只有双方同时揭晓后才记入公开出点历史，平手重比也记录',()=>{
  const session=freshSession();let m=createLocalMatch('point',session.players,'hard');
  for(const player of [0,1])m=dispatch(m,{type:'select',player,ids:session.players[player].cards.slice(player?5:0,player?10:5).map(c=>c.id)},()=>.999);
  for(const player of [0,1])m=dispatch(m,{type:'lineup-ready',player},()=>.999);
  for(const player of [0,1])m=dispatch(m,{type:'decision',player,value:'continue'});
  m=dispatch(m,{type:'point',player:0,value:3});
  assert.equal(m.pointHistory,undefined);
  m=dispatch(m,{type:'point',player:1,value:4});
  assert.deepEqual(m.pointHistory,[[3,4]]);
  assert.equal(m.difficulty,'hard');
});

test('高难度濒危时回血，避免治疗溢出，能击败时优先进攻',()=>{
  assert.deepEqual(aiAction(combat('xunbei','woxu',[20,90],[3,2]),0,()=>.5),{type:'attack',skill:1,player:0});
  assert.deepEqual(aiAction(combat('lujia','panjia',[55,140],[3,4]),0,()=>.5),{type:'attack',skill:1,player:0});
  const lethal=aiAction(combat('panjia','liejing',[20,35],[4,2]),0,()=>.5);
  assert.equal(lethal.type,'attack');
  assert.ok(CARD.panjia.skills[lethal.skill].damage>=35);
  const full=aiAction(combat('xunbei','woxu',[105,90],[3,2]),0,()=>.5);
  assert.equal(full.type,'attack');assert.equal(full.skill,0);
});

test('高难度阻止对手即将撤退，危险且能立即撤退时保卡',()=>{
  assert.deepEqual(aiAction(combat('fuchao','zhiyi',[140,55],[3,1]),0,()=>.5),{type:'attack',skill:1,player:0});
  assert.deepEqual(aiAction(combat('woxu','panjia',[10,160],[1,4]),0,()=>.5),{type:'retreat',player:0});
  const saturated=aiAction(combat('fuchao','zhiyi',[140,55],[3,3]),0,()=>.5);
  assert.equal(saturated.type,'attack');assert.equal(saturated.skill,0);
});

test('高难度猜拳仍独立随机，决策不修改实际状态或卡牌基础值',()=>{
  const m=combat('lujia','panjia',[55,140],[3,4]),before=JSON.stringify(m),defs=JSON.stringify(CARDS);
  aiAction(m,0,()=>.5);
  assert.equal(JSON.stringify(m),before);assert.equal(JSON.stringify(CARDS),defs);
  const rps={...m,phase:'rps'};
  Object.defineProperty(rps,'rps',{get:()=>{throw Error('偷看出拳');}});
  assert.equal(aiAction(rps,0,()=>0).value,'rock');
  assert.equal(aiAction(rps,0,()=>.999).value,'scissors');
});

test('前瞻结算遵守击败立即结束、回血和阻退上限',()=>{
  const b={cards:['lujia','mingjing'],hp:[105,10],remaining:[3,1]};
  const result=resolveCombatAction(b,0,{type:'attack',skill:1});
  assert.equal(result.finished,true);assert.equal(result.winner,0);assert.equal(result.state.hp[0],105);
  assert.deepEqual(b.hp,[105,10]);
  const heal=resolveCombatAction({...b,hp:[105,70]},0,{type:'attack',skill:1});
  assert.equal(heal.state.hp[0],110);
  const capped=resolveCombatAction({cards:['fuchao','zhiyi'],hp:[140,55],remaining:[3,3]},0,{type:'attack',skill:1});
  assert.equal(capped.state.remaining[1],3);
});

for(const mode of ['point','battle'])test(`高难度 ${mode} 可完整结算，所有卡牌实例守恒`,()=>{
  let seed=521;
  const rng=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let run=0;run<12;run++){
    const session=freshSession();let m=createLocalMatch(mode,session.players,'hard'),steps=0;
    while(m.status==='active'&&steps++<500){
      const actors=expectedPlayers(m);
      m=dispatch(m,actors.length?aiAction(m,actors[0],rng):{type:'advance'},rng);
    }
    assert.equal(m.status,'finished',`run ${run} 未结束`);
    assert.equal(m.difficulty,'hard');
    assert.equal(m.inventories.flat().length,CARDS.length*2);
    assert.equal(new Set(m.inventories.flat().map(c=>c.id)).size,CARDS.length*2);
    if(mode==='point')assert.equal(m.rounds.length,5);
  }
});
