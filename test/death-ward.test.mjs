import test from 'node:test';
import assert from 'node:assert/strict';
import {CARD,METRICS,skillText} from '../dist/data.js';
import {resolveCombatAction as act,previewSkill,combatStatuses,combatStatusKey,applyRpsLoss} from '../dist/combat.js';
import {createMatch,dispatch,aiAction,expectedPlayers} from '../dist/engine.js';
import {freshSession,upgradeSession,SAVE_KEY} from '../dist/session.js';
import {appHarness} from './helpers/app-harness.mjs';
const battle=(other='tanling')=>({cards:['jinnangying',other],hp:[60,CARD[other].hp],remaining:[2,CARD[other].retreat]});
const hit=(b,p=0,skill=1)=>act(b,p,{type:'attack',skill});
function match(other='tanling'){
  let m=createMatch('battle',[[{id:'firefly',cardId:'jinnangying'}],[{id:'enemy',cardId:other}]]);
  for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:[p===0?'firefly':'enemy']});
  if(m.status==='active'){m.phase='battle-action';m.battle.actor=0;}return m;
}
const arm=b=>hit(b).state;
function armed(other='tanling'){const b=arm(battle(other));b.hp=[20,55];return b;}

test('烬囊萤确认字段与拼点25，死亡60不作为基础伤害',()=>{
  assert.deepEqual(METRICS.map(m=>m.read(CARD.jinnangying)),[3,60,2,25,.18,.8]);
  assert.equal(CARD.jinnangying.element,'火');assert.equal(CARD.jinnangying.tier,'低阶');
  assert.deepEqual(CARD.jinnangying.skills.map(s=>s.damage),[25,5]);assert.match(skillText(CARD.jinnangying.skills[1]),/每局仅挂印1次/);
});
test('首次挂印立即生效、窗口不扣次；零伤害也能挂印，输入不变',()=>{
  const b=battle();b.shield=[0,15];const before=structuredClone(b),r=hit(b);
  assert.equal(r.breakdown.damage,0);assert.equal(r.state.deathWard[0],2);assert(r.state.deathUsed[0]);assert.equal(r.state.deathPower[0],60);assert.deepEqual(b,before);
});
test('施放当次已有烙印使自己归零，立即殒爆并保卡',()=>{
  const b=battle();b.hp=[15,60];b.burn=[1,0];const r=hit(b);
  assert(r.finished);assert.equal(r.winner,null);assert.deepEqual(r.state.hp,[0,0]);assert.equal(r.effects.deathDamage[1],55);assert.equal(r.effects.burnDamage[0],15);
});
test('首次施放当次烙印存活时不扣新窗口；以后任一方行动各扣一次',()=>{
  let b=battle();b.burn=[2,0];b=arm(b);assert.equal(b.hp[0],45);assert.equal(b.deathWard[0],2);
  b=act(b,0,{type:'retreat'}).state;assert.equal(b.deathWard[0],1);
  b=hit(b,1,0).state;assert.equal(b.hp[0],0); // 30直接伤害，窗口内死亡
});
test('重复施放不刷新，第二次行动结束后到期且不能重新挂印',()=>{
  let b=arm(battle());b=hit(b).state;assert.equal(b.deathWard[0],1);
  b=hit(b).state;assert.equal(b.deathWard[0],0);assert(b.deathUsed[0]);
  b=hit(b).state;assert.equal(b.deathWard[0],0);assert(b.deathUsed[0]);
});
for(const remaining of [1,2])test(`窗口余${remaining}次时直接致命，先殒爆再判平局，不追加已有烙印`,()=>{
  const b=armed();b.deathWard[0]=remaining;b.burn=[2,2];const r=hit(b,1,0);
  assert(r.finished);assert.equal(r.winner,null);assert.deepEqual(r.state.hp,[0,0]);assert.deepEqual(r.effects.burnDamage,[0,0]);assert(r.effects.burnSkipped);assert(r.effects.deathTriggered[0]);
});
test('窗口用完后死亡不触发殒爆',()=>{
  const b=armed();b.deathWard[0]=0;const r=hit(b,1,0);assert.equal(r.winner,1);assert.equal(r.state.hp[1],55);assert(!r.effects.deathTriggered.some(Boolean));
});
test('殒爆不够击败对手仍然判负，死亡者不能复活或独胜',()=>{
  const b=armed();b.hp[1]=95;const r=hit(b,1,0);assert.equal(r.winner,1);assert.deepEqual(r.state.hp,[0,35]);
});
test('60殒爆先被15护盾减为45，零伤害也消费护盾',()=>{
  for(const [shield,damage,hp] of [[15,45,10],[80,0,55]]){
    const b=armed();b.shield=[0,shield];const r=hit(b,1,0);assert.equal(r.effects.deathDamage[1],damage);assert.equal(r.state.hp[1],hp);assert.equal(r.winner,1);assert.match(r.text,/护盾抵消殒爆/);
  }
});
test('封伤暂存30使对手存活，不在同次殒爆自动结清新伤',()=>{
  const b=armed('panjia');b.seal=[false,true];const r=hit(b,1,1);assert.equal(r.effects.deferred[1],30);assert.equal(r.effects.deathDamage[1],30);assert.equal(r.state.hp[1],25);assert.equal(r.winner,1);assert.equal(r.effects.settled[1],0);
});
test('殒爆实际正数受伤会结清目标已有旧伤，盾挡为0则不结清',()=>{
  for(const shield of [0,80]){const b=armed();b.hp[1]=80;b.debt=[0,25];b.shield=[0,shield];const r=hit(b,1,0);assert.equal(r.winner,shield?1:null);assert.equal(r.effects.settled[1],shield?0:20);}
});
test('自己结清待结伤势归零也触发伏印',()=>{
  const b=armed();b.hp[0]=50;b.debt=[25,0];const r=hit(b,1,0);assert.equal(r.winner,null);assert(r.effects.deathTriggered[0]);assert.equal(r.effects.settled[0],20);
});
test('殒爆不消耗或享受死亡者攻击削弱、风压和预判增益',()=>{
  const b=armed();b.weaken=[2,0];b.wind=[2,-1];b.foresight=[30,0];const r=hit(b,1,0);assert.equal(r.effects.deathDamage[1],55);assert.doesNotMatch(r.text,/烬囊萤释放逆风|烬囊萤消耗预判/);
});
test('致命回血攻击先处理殒爆，不能靠附加回血逃过平局',()=>{
  const b=armed('lujia');b.hp[0]=10;const r=hit(b,1,1);assert.equal(r.winner,null);assert.equal(r.effects.healing,0);assert.deepEqual(r.state.hp,[0,0]);
});
test('两方同次烙印归零直接平局，不额外殒爆',()=>{
  const b=armed();b.hp=[15,15];b.burn=[1,1];b.deathWard=[2,2];b.deathPower=[60,60];const r=act(b,0,{type:'retreat'});
  assert.equal(r.winner,null);assert.deepEqual(r.state.hp,[0,0]);assert.deepEqual(r.effects.burnDamage,[15,15]);assert(!r.effects.deathTriggered.some(Boolean));
});
test('行动末双方烙印先结算完整批次，再由唯一死亡者殒爆',()=>{
  const b=armed();b.hp=[15,70];b.burn=[1,1];const r=act(b,0,{type:'retreat'});assert.equal(r.winner,null);assert.deepEqual(r.effects.burnDamage,[15,15]);assert.equal(r.effects.deathDamage[1],55);
});
test('双伏印不递归引爆，已归零的目标不再受伤',()=>{
  const b=armed('jinnangying');b.hp[0]=10;b.deathWard=[2,2];b.deathPower=[60,60];b.deathUsed=[true,true];const r=hit(b,1,0);
  assert.equal(r.winner,null);assert.deepEqual(r.effects.deathTriggered,[true,false]);assert.equal(r.events.filter(e=>e.includes('伏印触发')).length,1);
});
test('攻击先直接致胜则不挂新印、不受烙印，不从已结束战斗补殒爆',()=>{
  const b=battle();b.hp=[15,5];b.burn=[2,2];const r=hit(b);assert.equal(r.winner,0);assert.deepEqual(r.state.hp,[15,0]);assert(!r.effects.deathTriggered.some(Boolean));assert.deepEqual(r.effects.burnDamage,[0,0]);
});
test('成功撤退平局，伏印及烙印均不能补伤',()=>{
  const b=armed();b.remaining[0]=1;b.burn=[2,2];const r=act(b,0,{type:'retreat'});assert.equal(r.winner,null);assert.deepEqual(r.state.hp,b.hp);assert(!r.effects.deathTriggered.some(Boolean));
});
test('猜拳结果、落败、平手、展示和等待不计窗口，JSON恢复保持资格',()=>{
  let m=match();m=dispatch(m,{type:'attack',player:0,skill:1});const ward=m.battle.deathWard[0];
  m=dispatch(m,{type:'advance'});m=dispatch(m,{type:'rps',player:0,value:'rock'});m=dispatch(m,{type:'rps',player:1,value:'rock'});assert.equal(m.battle.deathWard[0],ward);
  m.battle=applyRpsLoss(m.battle,0);const b=JSON.parse(JSON.stringify(m.battle));assert.equal(combatStatusKey(b),combatStatusKey(m.battle));assert(b.deathUsed[0]);assert.equal(b.deathWard[0],2);
});
test('掷骰待决及重掷不扣窗口，最终确定仅结算一次进攻',()=>{
  let m=match('koujinchan');m.battle=arm(m.battle);m.battle.actor=1;
  m=dispatch(m,{type:'attack',player:1,skill:0},()=>.01);assert.equal(m.phase,'dice-choice');assert.equal(m.battle.deathWard[0],2);
  m=dispatch(m,{type:'dice-reroll',player:1},()=>.01);assert.equal(m.battle.deathWard[0],1);assert.equal(m.battle.hp[0],50);
});
test('双生相转继承伏印及已用资格，不延长窗口',()=>{
  const b=battle('zhoulan');b.twinPairs=[null,{zhoulan:{id:'day',cardId:'zhoulan'},yelan:{id:'night',cardId:'yelan'}}];b.deathWard=[0,2];b.deathPower=[0,60];b.deathUsed=[false,true];
  const r=hit(b,1,1);assert.equal(r.state.cards[1],'yelan');assert.equal(r.state.deathWard[1],1);assert(r.state.deathUsed[1]);
});
test('投降不触发，属性直胜不提供挂印机会',()=>{
  let m=match();m.battle=armed();m=dispatch(m,{type:'surrender',player:0});assert.equal(m.winner,1);assert.equal(m.battle.hp[1],55);assert.equal(m.transfers.length,1);
  for(const [other,winner] of [['woxu',1],['taituan',0]])assert.equal(match(other).winner,winner);
});
test('殒爆平局之前不转移卡，失败只转移一次，结束后不能重入',()=>{
  for(const [hp,winner,transfers] of [[55,null,0],[95,1,1]]){
    let m=match();m.battle=armed();m.battle.hp[1]=hp;m.battle.actor=1;m=dispatch(m,{type:'attack',player:1,skill:0});assert.equal(m.winner,winner);assert.equal(m.transfers.length,transfers);assert.equal(m.inventories.flat().length,2);assert.throws(()=>dispatch(m,{type:'attack',player:1,skill:0}));
    if(winner===null)assert.match(m.reason,/殒爆/);
  }
});
test('状态详情准确区分未用、有效、已到期，不因预览改变',()=>{
  let b=battle();assert.match(combatStatuses(b,0)[0].label,/尚可/);b=arm(b);const before=structuredClone(b);previewSkill(b,0,1);assert.deepEqual(b,before);assert.match(combatStatuses(b,0)[0].label,/余2次/);b.deathWard[0]=0;assert.match(combatStatuses(b,0)[0].label,/已用/);
});
test('直接攻击与施放当次殒爆的实际预览均等于真实结算',()=>{
  for(const scenario of ['arm','counter']){
    const b=scenario==='arm'?battle():armed();if(scenario==='arm'){b.hp=[15,60];b.burn=[1,0];}
    const p=scenario==='arm'?0:1,skill=scenario==='arm'?1:0,before=structuredClone(b),pv=previewSkill(b,p,skill),r=hit(b,p,skill);
    assert.deepEqual(b,before);assert.equal(pv.ownHp,r.state.hp[p]);assert.equal(pv.targetHp,r.state.hp[1-p]);assert(pv.draw);assert.deepEqual(pv.deathDamage,r.effects.deathDamage);
  }
});
for(const difficulty of ['easy','hard'])test(`${difficulty} AI在无法立即退出时会选择挂印争取平局`,()=>{
  const m=match();m.difficulty=difficulty;m.battle.hp=[20,60];const before=structuredClone(m),a=aiAction(m,0,()=>.5);assert.equal(a.type,'attack');assert.equal(a.skill,1);assert.deepEqual(m,before);
});
for(const difficulty of ['easy','hard'])test(`${difficulty} AI面对已挂印的低血对手会优先保卡`,()=>{
  const m=match();m.difficulty=difficulty;m.battle=armed();m.battle.actor=1;const a=aiAction(m,1,()=>.5),r=act(m.battle,1,a);assert(!(r.finished&&r.winner===0));assert(a.type==='retreat'||r.winner===null||!r.finished);
});
test('旧存档补发一次，保留既有对局及伏印，失去后不重发',()=>{
  const s=freshSession();delete s.emberFireflyGranted;s.players.forEach(p=>p.cards=p.cards.filter(c=>c.cardId!=='jinnangying'));s.match=match();s.match.battle=armed();const before=structuredClone(s.match.battle);
  assert(upgradeSession(s));assert.deepEqual(s.match.battle,before);for(const p of s.players)assert.equal(p.cards.filter(c=>c.cardId==='jinnangying').length,1);
  s.players[0].cards=s.players[0].cards.filter(c=>c.cardId!=='jinnangying');const restored=JSON.parse(JSON.stringify(s));assert(!upgradeSession(restored));assert(!restored.players[0].cards.some(c=>c.cardId==='jinnangying'));
});
test('UI显示挂印次数、殒爆平局和实际HP，刷新不重挂或重复扣血',()=>{
  const s=freshSession();s.tutorial={version:1,status:'completed'};s.autoAdvance=false;s.match=match();s.match.battle.hp=[15,60];s.match.battle.burn=[1,0];
  const h=appHarness(s);assert.match(h.app.innerHTML,/殒爆后双方HP归零/);h.click('attack',{skill:'1'});assert.equal(h.run('store.match.status'),'finished');assert.equal(h.run('store.match.transfers.length'),0);
  const restored=appHarness(JSON.parse(h.storage.get(SAVE_KEY)));assert.equal(restored.run('store.match.winner'),null);assert.deepEqual(Array.from(restored.run('store.match.battle.hp')),[0,0]);
});
for(const difficulty of ['easy','hard'])test(`${difficulty} AI双方完整对局结束，实际卡守恒`,()=>{
  let m=match();m.difficulty=difficulty;let seed=31,steps=0;const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  while(m.status==='active'&&steps++<150){const p=expectedPlayers(m)[0];m=dispatch(m,p===undefined?{type:'advance'}:aiAction(m,p,rng),rng);}assert.equal(m.status,'finished');assert.equal(m.inventories.flat().length,2);
});
