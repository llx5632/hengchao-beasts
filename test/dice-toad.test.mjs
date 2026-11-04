import test from 'node:test';
import assert from 'node:assert/strict';
import {CARD,METRICS} from '../dist/data.js';
import {createMatch,dispatch,expectedPlayers,aiAction} from '../dist/engine.js';
import {previewSkill,resolveCombatAction as resolve,expectedCombatScore} from '../dist/combat.js';
import {scheduledStep} from '../dist/flow.js';
import {freshSession,upgradeSession,SAVE_KEY} from '../dist/session.js';
import {appHarness} from './helpers/app-harness.mjs';
function match(other='lujia'){
  let m=createMatch('battle',[[{id:'toad',cardId:'koujinchan'}],[{id:'enemy',cardId:other}]]);
  for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:[p===0?'toad':'enemy']});
  if(m.status==='active'){m.phase='battle-action';m.battle.actor=0;}
  return m;
}
const roll=(m,n)=>dispatch(m,{type:'attack',player:0,skill:0},()=>((n-.5)/6));
const keep=m=>dispatch(m,{type:'dice-keep',player:0},()=>{throw Error('保留不应抽样');});
const reroll=(m,n)=>dispatch(m,{type:'dice-reroll',player:0},()=>((n-.5)/6));
test('叩金蟾静态字段、最高基础伤害40与骰伤60分离',()=>{
 assert.deepEqual(METRICS.map(m=>m.read(CARD.koujinchan)),[3,110,3,40,.55,32]);
 assert.deepEqual(CARD.koujinchan.skills.map(s=>s.damage),[10,40]);
});
test('首掷锁定进攻，血量和所有状态保持，猜拳与等待不触发烙印',()=>{
 const m=match();m.battle.burn=[2,0];m.battle.shield=[0,15];m.battle.weaken=[2,0];m.battle.foresight=[30,0];
 const before=structuredClone(m),n=roll(m,2);assert.equal(n.phase,'dice-choice');assert.deepEqual(expectedPlayers(n),[0]);
 for(const k of ['hp','remaining','burn','shield','weaken','foresight'])assert.deepEqual(n.battle[k],before.battle[k],k);
 assert.deepEqual(m,before);assert.equal(scheduledStep(n),null);
 for(const action of [{type:'attack',skill:1},{type:'retreat'},{type:'advance'},{type:'rps',value:'rock'}])assert.throws(()=>dispatch(n,{...action,player:0}));
 assert.throws(()=>dispatch(n,{type:'dice-keep',player:1}));
});
test('保留仅结算一次，重复点击与重复提交被拒绝',()=>{
 const n=keep(roll(match(),3));assert.equal(n.battle.hp[1],80);assert.equal(n.phase,'battle-turn');
 assert.equal(n.battle.lastDice.final,3);assert.equal(n.battle.lastDice.second,null);assert(n.battle.lastDice.settled);
 assert.throws(()=>keep(n));assert.throws(()=>reroll(n,6));
});
test('36种首掷与重掷组合均独立接受第二结果，包括更低和相同值',()=>{
 for(let a=1;a<=6;a++)for(let b=1;b<=6;b++){
  const n=reroll(roll(match(),a),b);assert.equal(n.battle.hp[1],110-b*10);
  assert.deepEqual([n.battle.lastDice.first,n.battle.lastDice.second,n.battle.lastDice.final],[a,b,b]);
 }
});
test('首掷和重掷各只调用随机源一次，玩家提供die字段不能指定结果',()=>{
 let calls=0;let m=dispatch(match(),{type:'attack',player:0,skill:0,die:6},()=>{calls++;return 0;});
 assert.equal(calls,1);assert.equal(m.battle.dicePending.first,1);
 m=dispatch(m,{type:'dice-reroll',player:0,die:6},()=>{calls++;return .2;});assert.equal(calls,2);assert.equal(m.battle.lastDice.final,2);
});
test('非法技能编号不能进入待骰阶段或消耗随机源',()=>{
 assert.throws(()=>dispatch(match(),{type:'attack',player:0,skill:'0'},()=>{throw Error('不应抽样');}),/请选择一个技能/);
});
test('固定增伤不乘骰点，削弱护盾封伤和实际扣血顺序正确',()=>{
 const m=match('panjia');m.battle.foresight=[30,0];m.battle.weaken=[2,0];m.battle.shield=[0,15];m.battle.seal=[false,true];
 const b=resolve(m.battle,0,{type:'attack',skill:0,die:4});
 assert.equal(b.breakdown.raw,70);assert.equal(b.breakdown.afterReduction,52);assert.equal(b.effects.deferred[1],18);assert.equal(b.breakdown.damage,19);
 assert.equal(b.state.weaken[0],1);assert.equal(b.state.foresight[0],0);assert.equal(b.state.shield[1],0);
});
test('零直接伤害仍消费一次护盾和削弱；烙印在最终结果后结算一次',()=>{
 let m=match();m.battle.hp[0]=55;m.battle.burn=[2,0];m.battle.shield=[0,100];m.battle.weaken=[2,0];
 m=reroll(roll(m,6),1);assert.equal(m.battle.hp[1],110);assert.equal(m.battle.hp[0],40);
 assert.equal(m.battle.burn[0],1);assert.equal(m.battle.weaken[0],1);assert.equal(m.battle.shield[1],0);
});
test('最终伤害直接致胜不追加烙印；首掷潜在致胜尚不能转移卡',()=>{
 let m=match();m.battle.hp=[1,60];m.battle.burn=[1,0];m=roll(m,6);
 assert.equal(m.status,'active');assert.equal(m.transfers.length,0);assert.equal(m.battle.hp[0],1);
 m=keep(m);assert.equal(m.winner,0);assert.equal(m.battle.hp[0],1);assert.equal(m.transfers.length,1);
});
test('非致胜后持续伤害可使己方失败或双方平局',()=>{
 let m=match();m.battle.hp=[10,100];m.battle.burn=[1,0];m=keep(roll(m,1));assert.equal(m.winner,1);assert.equal(m.transfers[0].id,'toad');
 m=match();m.battle.hp=[10,25];m.battle.burn=[1,1];m=keep(roll(m,1));assert.equal(m.status,'finished');assert.equal(m.winner,null);assert.equal(m.transfers.length,0);
});
test('待骰期间允许正常投降，取消未完成攻击与行动末伤害',()=>{
 let m=match();m.battle.burn=[2,0];m=roll(m,6);m=dispatch(m,{type:'surrender',player:0});
 assert.equal(m.winner,1);assert.deepEqual(m.battle.hp,[110,110]);assert.equal(m.battle.dicePending,null);assert.equal(m.transfers[0].id,'toad');
});
test('对手预判只在整次进攻结束后揭晓，回响只记录一次最终正数受伤',()=>{
 let m=match('chaojing');m.battle.prediction=[null,'attack'];m=roll(m,1);assert.equal(m.battle.prediction[1],'attack');
 m=reroll(m,4);assert.equal(m.battle.prediction[1],null);assert.equal(m.battle.foresight[1],30);
 m=reroll(roll(match('mingnang'),6),2);assert.equal(m.battle.echo[1],20);
});
test('预览与概率搜索不真实掷骰、不修改状态，平均最优伤害为42.5',()=>{
 const b=match().battle,before=structuredClone(b),preview=previewSkill(b,0,0);
 assert.equal(preview.minDamage,10);assert.equal(preview.maxDamage,60);assert.deepEqual(preview.outcomes.map(r=>r.damage),[10,20,30,40,50,60]);
 assert.equal(expectedCombatScore(b,0,{type:'attack',skill:0},r=>r.breakdown.damage),42.5);assert.deepEqual(b,before);
 assert.throws(()=>resolve(b,0,{type:'attack',skill:0}),/有效的最终骰点/);
});
test('JSON续局恢复原首掷，无新抽样；结算后刷新不会重复伤害或转移',()=>{
 let m=JSON.parse(JSON.stringify(roll(match(),5)));assert.equal(m.battle.dicePending.first,5);m=keep(m);
 const loaded=JSON.parse(JSON.stringify(m));assert.equal(loaded.battle.hp[1],60);assert.throws(()=>keep(loaded));
});
test('固定技能稳定伤害40，岩克风和草克岩仍直接结束',()=>{
 assert.equal(dispatch(match(),{type:'attack',player:0,skill:1}).battle.hp[1],70);
 assert.equal(match('zhiyi').winner,0);assert.equal(match('taituan').winner,1);
});
for(const difficulty of ['easy','hard'])test(`${difficulty} AI保留已致胜结果，不读取重掷结果，低点可重掷`,()=>{
 let m=match();m.difficulty=difficulty;m.battle.hp[1]=30;
 assert.equal(aiAction(m,0,()=>.5).skill,1);
 m=roll(m,3);const before=structuredClone(m);assert.equal(aiAction(m,0,()=>.5).type,'dice-keep');assert.deepEqual(m,before);
 m=roll({...match(),difficulty},1);assert.equal(aiAction(m,0,()=>.5).type,'dice-reroll');
});
for(const difficulty of ['easy','hard'])test(`${difficulty} AI对战可处理待骰阶段并完成，卡牌实例守恒`,()=>{
 let m=match('koujinchan');m.difficulty=difficulty;let seed=19,tick=0;const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 while(m.status==='active'&&tick++<200){const ps=expectedPlayers(m);m=dispatch(m,ps.length?aiAction(m,ps[0],rng):{type:'advance'},rng);}
 assert.equal(m.status,'finished');assert.equal(m.inventories.flat().length,2);
});
test('旧存档补发一次，保留对局与已有收藏，失去后不重发',()=>{
 const s=freshSession();delete s.goldToadGranted;s.players.forEach(p=>p.cards=p.cards.filter(c=>c.cardId!=='koujinchan'));s.match=match();
 const before=structuredClone(s.match);assert(upgradeSession(s));assert.deepEqual(s.match.battle,before.battle);
 s.players[0].cards.pop();const n=s.players[0].cards.length;assert(!upgradeSession(s));assert.equal(s.players[0].cards.length,n);
});
test('玩家选择不自动推进，暂离AI可代选，暂停和后台保持待骰',()=>{
 const m=roll(match(),2);m.controls=['human','ai'];assert.equal(scheduledStep(m),null);
 m.controls[0]='ai';assert.equal(scheduledStep(m).kind,'ai');assert.equal(scheduledStep(m,{paused:true}),null);assert.equal(scheduledStep(m,{hidden:true}),null);
});
function saved(){const s=freshSession();s.tutorial={version:1,status:'completed'};s.match=match();return s;}
test('UI显示范围与待骰选择，刷新恢复原首掷，保留后仅扣血一次',()=>{
 const h=appHarness(saved());assert.match(h.app.innerHTML,/可能实际伤害10至60/);h.click('attack',{skill:'0'});
 assert.equal(h.run('store.match.phase'),'dice-choice');const first=h.run('store.match.battle.dicePending.first');
 const loaded=appHarness(JSON.parse(h.storage.get(SAVE_KEY)));assert.equal(loaded.run('store.match.battle.dicePending.first'),first);
 loaded.click('dice-keep');assert.equal(loaded.run('store.match.battle.hp[1]'),110-first*10);
 loaded.click('dice-keep');assert.equal(loaded.run('store.match.battle.hp[1]'),110-first*10);
});
test('骰点保存失败时先遮蔽结果并停止操作，重试保存后显示同一结果',()=>{
 const h=appHarness(saved());h.blockStorage();h.click('attack',{skill:'0'});
 const first=h.run('store.match.battle.dicePending.first');assert.match(h.app.innerHTML,/骰点正在等待存档写入/);assert.doesNotMatch(h.app.innerHTML,/保留将造成/);
 h.click('dice-reroll');assert.equal(h.run('store.match.phase'),'dice-choice');
 h.blockStorage(false);h.click('retry-save');assert.match(h.app.innerHTML,/保留将造成/);assert.equal(h.run('store.match.battle.dicePending.first'),first);
});
test('最终重掷结算写入失败同样遮蔽，重试不重掷、不重复扣血',()=>{
 const h=appHarness(saved());h.click('attack',{skill:'0'});h.blockStorage();h.click('dice-reroll');
 const hp=h.run('store.match.battle.hp[1]'),die=h.run('store.match.battle.lastDice.final');
 assert.match(h.app.innerHTML,/骰点正在等待存档写入/);h.click('dice-reroll');assert.equal(h.run('store.match.battle.hp[1]'),hp);
 h.blockStorage(false);h.click('retry-save');const loaded=appHarness(JSON.parse(h.storage.get(SAVE_KEY)));
 assert.equal(loaded.run('store.match.battle.lastDice.final'),die);assert.equal(loaded.run('store.match.battle.hp[1]'),hp);
});
