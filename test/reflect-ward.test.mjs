import test from 'node:test';
import assert from 'node:assert/strict';
import {CARD,CARDS,METRICS,skillText} from '../dist/data.js';
import {resolveCombatAction as act,previewSkill,combatStatuses,combatStatusKey,applyRpsLoss} from '../dist/combat.js';
import {createMatch,dispatch,aiAction} from '../dist/engine.js';
import {freshSession,upgradeSession,SAVE_KEY} from '../dist/session.js';
import {appHarness} from './helpers/app-harness.mjs';
const id='huangjitun',instance=(id,cardId)=>({id,cardId});
function battle(a=id,b='panjia'){return {cards:[a,b],hp:[CARD[a].hp,CARD[b].hp],remaining:[CARD[a].retreat,CARD[b].retreat]};}
function arm(b=battle(),p=0){const s=structuredClone(b);s.reflectWard=[false,false];s.reflectRate=[0,0];s.reflectCap=[0,0];s.reflectSource=[null,null];s.reflectWard[p]=true;s.reflectRate[p]=100;s.reflectCap[p]=50;s.reflectSource[p]=id;return s;}
const hit=(b,p=0,skill=0)=>act(b,p,{type:'attack',skill});
function match(a=id,b='panjia'){
  let m=createMatch('battle',[[instance('own',a)],[instance('enemy',b)]]);
  for(const player of [0,1])m=dispatch(m,{type:'select',player,ids:[player?'enemy':'own']});
  if(m.status==='active'){m.phase='battle-action';m.battle.actor=0;}return m;
}
function attack(m,p=0,skill=0){return dispatch({...m,phase:'battle-action',battle:{...m.battle,actor:p}},{type:'attack',player:p,skill});}

test('簧棘鲀完整静态值、两招与拼点40准确，反刺50不作基础值',()=>{
  assert.deepEqual(METRICS.map(m=>m.read(CARD[id])),[3,110,3,40,.55,18]);
  assert.equal(CARD[id].tier,'中阶');assert.equal(CARD[id].element,'水');assert.deepEqual(CARD[id].skills.map(s=>s.damage),[40,15]);
  assert.equal(CARD[id].skills[1].amount,50);assert.match(skillText(CARD[id].skills[1]),/实际扣血100%反伤/);
});
test('15攻击后准备一次反刺，原对象不变；40纯攻击不自动获得状态',()=>{
  const b=battle(),before=structuredClone(b),r=hit(b,0,1);assert.deepEqual(b,before);assert.equal(r.state.hp[1],145);assert(r.state.reflectWard[0]);assert.equal(r.state.reflectRate[0],100);assert.equal(r.state.reflectCap[0],50);assert.equal(r.state.reflectSource[0],id);assert(!hit(b).state.reflectWard[0]);
});
for(const [skill,received,reflected]of [[0,40,40],[1,60,50]])test(`实际受伤${received}，反伤${reflected}，原伤不减免`,()=>{
  const b=arm(),r=hit(b,1,skill);assert.equal(r.state.hp[0],110-received);assert.equal(r.state.hp[1],160-reflected);assert.equal(r.effects.reflectBasis[0],received);assert.equal(r.effects.reflectRaw[1],reflected);assert.equal(r.effects.reflectDamage[1],reflected);assert(!r.state.reflectWard[0]);assert.equal(r.state.reflectCap[0],0);assert.equal(r.state.reflectSource[0],null);
});
test('护盾后的实际直接扣血为基准；0扣血保留，附加效果正常发生',()=>{
  let b=arm();b.shield=[15,0];let r=hit(b,1,0);assert.equal(r.breakdown.damage,25);assert.equal(r.effects.reflectRaw[1],25);
  b=arm(battle(id,'xunbei'));b.shield=[30,0];r=hit(b,1,0);assert.equal(r.breakdown.damage,0);assert(r.state.reflectWard[0]);assert.equal(r.state.weaken[0],2);assert(!r.effects.reflectTriggered.some(Boolean));
});
test('原攻击削弱与取整只通过实际扣血影响反刺',()=>{
  const b=arm();b.weaken=[0,1];const r=hit(b,1,1);assert.equal(r.breakdown.afterReduction,45);assert.equal(r.effects.reflectRaw[1],45);assert.equal(r.state.weaken[1],0);
});
test('封伤暂存与旧伤结清均不计反刺基准',()=>{
  let b=arm();b.seal=[true,false];let r=hit(b,1,1);assert.equal(r.breakdown.damage,30);assert.equal(r.state.debt[0],30);assert.equal(r.effects.reflectRaw[1],30);
  b=arm();b.debt=[70,0];r=hit(b,1,0);assert.equal(r.breakdown.damage,40);assert.equal(r.effects.settled[0],70);assert.equal(r.effects.reflectRaw[1],40);assert.equal(r.winner,1);
});
test('反伤受攻击者现有盾及封伤影响，被全挡仍消费',()=>{
  let b=arm();b.shield=[0,50];let r=hit(b,1,1);assert.equal(r.effects.reflectRaw[1],50);assert.equal(r.effects.reflectBlocked[1],50);assert.equal(r.effects.reflectDamage[1],0);assert(!r.state.reflectWard[0]);assert.equal(r.state.shield[1],0);
  b=arm();b.seal=[false,true];r=hit(b,1,1);assert.equal(r.effects.reflectDamage[1],25);assert.equal(r.state.debt[1],25);
});
test('反伤会结清攻击者旧伤，预览分别记录直接反伤与旧伤',()=>{
  const b=arm();b.debt=[0,30];const r=hit(b,1,1);assert.equal(r.effects.reflectDamage[1],50);assert.equal(r.effects.settled[1],30);assert.equal(r.state.hp[1],80);
});
test('反伤不受反刺者削弱或增益影响，不消费其进攻次数',()=>{
  const b=arm();b.weaken=[2,0];b.wind=[2,-1];b.foresight=[30,0];b.root=[2,0];const r=hit(b,1,1);
  assert.equal(r.effects.reflectRaw[1],50);assert.equal(r.state.weaken[0],2);assert.equal(r.state.wind[0],2);assert.equal(r.state.foresight[0],30);assert.equal(r.state.root[0],2);
});
for(const incoming of [0,1])test(`致命技能${incoming}先反刺再判平局，不按溢出伤害计算`,()=>{
  const b=arm();b.hp=[30,30];b.burn=[2,2];const r=hit(b,1,incoming);assert.equal(r.breakdown.damage,30);assert.equal(r.effects.reflectRaw[1],30);assert.deepEqual(r.state.hp,[0,0]);assert(r.finished);assert.equal(r.winner,null);assert.deepEqual(r.effects.burnDamage,[0,0]);
});
test('反刺不足时自己仍战败，HP1只能反1而非50',()=>{
  const b=arm();b.hp=[1,40];const r=hit(b,1,1);assert.equal(r.effects.reflectRaw[1],1);assert.equal(r.state.hp[1],39);assert.equal(r.winner,1);
});
test('未准备则致命直接结束；双方反刺不会互相递归',()=>{
  const b=battle();b.hp[0]=30;assert.equal(hit(b,1,1).winner,1);
  const s=arm(battle(id,id));s.reflectWard[1]=true;s.reflectRate[1]=100;s.reflectCap[1]=50;s.reflectSource[1]=id;const r=hit(s);assert.deepEqual(r.state.hp,[70,70]);assert.deepEqual(r.effects.reflectTriggered,[false,true]);assert(r.state.reflectWard[0]);assert(!r.state.reflectWard[1]);
});
test('持有旧反刺重施不叠加，触发后可重新花进攻准备',()=>{
  let b=arm();b=hit(b,0,1).state;assert.equal(b.reflectCap[0],50);b=hit(b,1,0).state;assert(!b.reflectWard[0]);b=hit(b,0,1).state;assert(b.reflectWard[0]);assert.equal(b.hp[1],97);assert.equal(b.debt[1],7);
});
test('猜拳、等待、自己的进攻及未成功撤退均不消耗，无行动倒计时',()=>{
  let b=arm();b=applyRpsLoss(b,0);for(let i=0;i<3;i++)b=hit(b).state;assert(b.reflectWard[0]);b=act(b,0,{type:'retreat'}).state;assert(b.reflectWard[0]);assert.equal(b.remaining[0],2);
});
test('持续伤害不反刺，挂印当次行动末可受伤；双归零仍平局',()=>{
  let b=battle();b.burn=[1,0];let r=hit(b,0,1);assert.equal(r.state.hp[0],95);assert(r.state.reflectWard[0]);assert(!r.effects.reflectTriggered.some(Boolean));
  b=arm();b.hp=[15,15];b.burn=[1,1];r=act(b,0,{type:'retreat'});assert.equal(r.winner,null);assert(!r.effects.reflectTriggered.some(Boolean));assert.deepEqual(r.state.hp,[0,0]);
});
test('反刺终结攻击者时，不新挂护盾或治疗，不追加持续伤害',()=>{
  let b=arm(battle(id,'dielin'));b.hp[1]=20;b.burn=[2,2];let r=hit(b,1,0);assert.equal(r.winner,0);assert.equal(r.state.hp[0],90);assert.equal(r.state.shield[1],0);assert.deepEqual(r.effects.burnDamage,[0,0]);
  b=arm(battle(id,'woxu'));b.hp[1]=15;r=hit(b,1,1);assert.equal(r.winner,0);assert.equal(r.effects.healing,0);assert(previewSkill(b,1,1).effectSkipped);
});
test('未最终结束时原攻击照常治疗和挂状态，只结一次行动末',()=>{
  const b=arm(battle(id,'woxu'));b.hp[1]=25;b.burn=[1,0];const r=hit(b,1,1);assert.deepEqual(r.state.hp,[80,20]);assert.equal(r.effects.healing,10);assert.deepEqual(r.effects.burnDamage,[15,0]);
});
test('新准备须在原反刺后存活；致胜或自身归零时不取得状态',()=>{
  let b=arm(battle(id,id),1);b.hp[0]=15;let r=hit(b,0,1);assert.equal(r.winner,1);assert(!r.state.reflectWard[0]);assert(r.effects.reflectTriggered[1]);
  b=battle();b.hp[1]=15;r=hit(b,0,1);assert.equal(r.winner,0);assert(!r.state.reflectWard[0]);
});
test('反刺击败攻击者可触发其有效回生，之后继续原行动治疗',()=>{
  const b=arm(battle(id,'woxu'));b.hp[1]=15;b.reviveWard=[false,true];const r=hit(b,1,1);assert(!r.finished);assert(r.effects.reviveTriggered[1]);assert.equal(r.state.hp[1],55);assert.equal(r.effects.healing,10);assert(!r.state.reflectWard[0]);
});
test('致命受击先消费反刺，再有效回生；回生不返还反刺或重放伤害',()=>{
  const b=arm();b.hp[0]=30;b.reviveWard=[true,false];const r=hit(b,1,1);assert(!r.finished);assert.equal(r.state.hp[0],55);assert.equal(r.state.hp[1],130);assert.equal(r.effects.reflectRaw[1],30);assert(!r.state.reflectWard[0]);
});
test('原攻击与反刺双归零时，不再回生或殒爆',()=>{
  const b=arm();b.hp=[30,30];b.reviveWard=[true,true];b.deathWard=[2,2];b.deathPower=[60,60];const r=hit(b,1,1);assert.equal(r.winner,null);assert(!r.effects.reviveTriggered.some(Boolean));assert(!r.effects.deathTriggered.some(Boolean));
});
test('反刺击败有效爆印攻击者后殒爆，殒爆不触发另一份反刺',()=>{
  const b=arm(battle(id,'jinnangying'));b.hp=[30,20];b.deathWard=[0,2];b.deathPower=[0,60];b.reflectWard[1]=true;b.reflectRate[1]=100;b.reflectCap[1]=50;b.reflectSource[1]=id;
  const r=hit(b,1,0);assert.equal(r.winner,null);assert(r.effects.deathTriggered[1]);assert.deepEqual(r.effects.reflectTriggered,[true,false]);assert.deepEqual(r.state.hp,[0,0]);
});
test('殒爆及其持续伤害来源不反刺，反伤不生成海豹回响',()=>{
  const b=arm(battle(id,'jinnangying'));b.hp=[110,20];b.deathWard=[0,2];b.deathPower=[0,60];const r=hit(b);assert.equal(r.winner,0);assert.equal(r.state.hp[0],50);assert(!r.effects.reflectTriggered.some(Boolean));
  const s=arm(battle(id,'mingnang')),n=hit(s,1,1);assert.equal(n.state.echo[1],0);assert.equal(n.effects.reflectDamage[1],40);
});
test('成功撤退、投降清除，属性直胜不取得或触发反刺',()=>{
  const b=arm();b.remaining[0]=1;const r=act(b,0,{type:'retreat'});assert(r.finished);assert.equal(r.winner,null);assert(!r.state.reflectWard[0]);
  let m=match();m.battle=arm(m.battle);m=dispatch(m,{type:'surrender',player:0});assert.equal(m.winner,1);assert(!m.battle.reflectWard[0]);assert.equal(m.transfers.length,1);
  assert.equal(match(id,'tanling').winner,0);assert.equal(match(id,'zhiyi').winner,1);
});
test('致命反刺平局保两卡，存活反杀仅转攻击者实际实例',()=>{
  let m=match();m.battle=arm(m.battle);m.battle.hp=[30,30];m=attack(m,1,1);assert.equal(m.status,'finished');assert.equal(m.winner,null);assert.equal(m.transfers.length,0);assert.equal(m.inventories.flat().length,2);
  m=match();m.battle=arm(m.battle);m.battle.hp=[110,40];m=attack(m,1,1);assert.equal(m.winner,0);assert.equal(m.transfers.length,1);assert.equal(m.transfers[0].id,'enemy');assert.equal(m.inventories.flat().length,2);
});
test('存档与状态缓存区分反刺，预览无副作用且与实战完整一致',()=>{
  const b=arm(),before=structuredClone(b),pv=previewSkill(b,1,1),r=hit(b,1,1);assert.deepEqual(b,before);assert.deepEqual(pv.reflectDamage,r.effects.reflectDamage);assert.deepEqual(pv.reflectRaw,r.effects.reflectRaw);assert.equal(pv.ownHp,r.state.hp[1]);assert.equal(pv.targetHp,r.state.hp[0]);assert.notEqual(combatStatusKey(b),combatStatusKey(battle()));assert.equal(combatStatusKey(JSON.parse(JSON.stringify(b))),combatStatusKey(b));assert.match(combatStatuses(b,0)[0].label,/100%.*50.*致命/);
});
test('旧存档一次补发双方各一张，保留在途对局，失去后不重发',()=>{
  const s=freshSession();delete s.springPufferGranted;s.players.forEach(p=>p.cards=p.cards.filter(c=>c.cardId!==id));s.match=match('lujia','liejing');const before=structuredClone(s.match.battle);assert(upgradeSession(s));assert.deepEqual(s.match.battle,before);for(const p of s.players)assert.equal(p.cards.length,CARDS.length);s.players[0].cards=s.players[0].cards.filter(c=>c.cardId!==id);assert(!upgradeSession(JSON.parse(JSON.stringify(s))));
});
test('确认收益：准备承接40后再40共95，高于直接两次80；弱攻消耗仅70',()=>{
  let b=battle(id,'mingnang'),prep=hit(b,0,1),counter=hit(prep.state,1,1),paid=hit(counter.state);assert.equal(prep.breakdown.damage+counter.effects.reflectDamage[1]+paid.breakdown.damage,95);assert.equal(counter.state.hp[0],70);
  b=battle(id,'woxu');prep=hit(b,0,1);counter=hit(prep.state,1,1);paid=hit(counter.state);assert.equal(prep.breakdown.damage+counter.effects.reflectDamage[1]+paid.breakdown.damage,70);
});
for(const difficulty of ['easy','hard'])test(`${difficulty} AI识别准备、弱攻消耗与致命互换，不把反刺视为无害`,()=>{
  let m=match();m.difficulty=difficulty;m.battle.hp=[30,45];assert.equal(aiAction(m,0,()=>.5).skill,1);
  m=match('woxu',id);m.difficulty=difficulty;m.battle=arm(m.battle,1);m.battle.hp=[25,80];m.battle.remaining[0]=3;const action=aiAction(m,0,()=>.5);assert.equal(action.type,'attack');assert.equal(action.skill,1);assert(!attack(m,0,1).battle.reflectWard[1]);
});
test('真实UI预览正确标识反刺平局、最终HP及跳过附加效果，刷新不补状态',()=>{
  const s=freshSession();s.tutorial={version:1,status:'completed'};s.autoAdvance=false;s.match=match('panjia',id);s.match.battle=arm(s.match.battle,1);s.match.battle.hp=[30,30];const h=appHarness(s);assert.match(h.app.innerHTML,/反刺及死亡反应后双方HP归零/);assert.match(h.app.innerHTML,/自己最终HP：30 → 0/);h.click('attack',{skill:'1'});assert.equal(h.run('store.match.winner'),null);assert.equal(h.run('store.match.transfers.length'),0);const saved=JSON.parse(h.storage.get(SAVE_KEY));assert(!saved.match.battle.reflectWard.some(Boolean));
});
test('掷骰预览各骰点展示反刺与最终HP，保留最终骰点只结算一次反刺',()=>{
  let m=match('koujinchan',id);m.battle=arm(m.battle,1);m.battle.hp[0]=25;const s=freshSession();s.tutorial={version:1,status:'completed'};s.autoAdvance=false;s.match=m;const h=appHarness(s);assert.match(h.app.innerHTML,/骰点1：实际直接伤害10/);assert.match(h.app.innerHTML,/骰点6：实际直接伤害60/);assert.match(h.app.innerHTML,/部分骰点会因反刺/);
  m=dispatch(m,{type:'attack',player:0,skill:0},()=>.999);assert.equal(m.phase,'dice-choice');assert(m.battle.reflectWard[1]);m=dispatch(m,{type:'dice-keep',player:0});assert.equal(m.winner,1);assert.equal(m.battle.hp[0],0);assert.match(m.battle.last.text,/实际受到反刺25伤害/);assert.equal(m.transfers.length,1);
});
