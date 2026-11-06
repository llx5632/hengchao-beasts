import test from 'node:test';
import assert from 'node:assert/strict';
import {CARD,CARDS,TWIN_PARTNERS,METRICS,skillText} from '../dist/data.js';
import {resolveCombatAction as act,previewSkill,combatStatuses,combatStatusKey,battleActions,skillAvailable} from '../dist/combat.js';
import {createMatch,dispatch,aiAction,expectedPlayers} from '../dist/engine.js';
import {freshSession,upgradeSession,SAVE_KEY} from '../dist/session.js';
import {appHarness} from './helpers/app-harness.mjs';
const names=['yangfengtang','fufengtang'];
const instance=(id,cardId)=>({id,cardId});
function battle(a=names[0],other='panjia'){
  const partner=TWIN_PARTNERS[a],own=instance('own',a),pair=instance('partner',partner);
  return {cards:[a,other],hp:[110,CARD[other].hp],remaining:[2,CARD[other].retreat],instances:[own,instance('enemy',other)],twinPairs:[{[a]:own,[partner]:pair},null]};
}
const hit=(b,p=0,skill=0)=>act(b,p,{type:'attack',skill});
function match(a=names[0],other='panjia',pair=true){
  let m=createMatch('battle',[[instance('own',a),...(pair?[instance('partner',TWIN_PARTNERS[a])]:[])],[instance('enemy',other)]]);
  for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:[p?'enemy':'own']});
  if(m.status==='active'){m.phase='battle-action';m.battle.actor=0;}return m;
}
const attack=(m,p,skill)=>dispatch({...m,phase:'battle-action',battle:{...m.battle,actor:p}},{type:'attack',player:p,skill});
test('确认字段与对应战斗数值一致、体型互补，拼点只读25',()=>{
  for(const [id,height,weight] of [[names[0],.9,12],[names[1],.75,15]]){
    assert.deepEqual(METRICS.map(m=>m.read(CARD[id])),[3,110,2,25,height,weight]);assert.equal(CARD[id].element,'岩');assert.equal(CARD[id].tier,'中阶');assert.deepEqual(CARD[id].skills.map(s=>s.damage),[25,15]);assert.equal(CARD[id].skills[0].amount,35);assert.match(skillText(CARD[id].skills[0]),/伤害＋35/);
  }
});
for(const hp of [160,81,80,79,1])test(`对方${hp}/160时两形态条件互补，恰好半血归伏锋`,()=>{
  for(const id of names){const b=battle(id);b.hp[1]=hp;const r=hit(b);assert.equal(r.breakdown.raw,((id===names[0])===(hp>80))?60:25);assert.equal(r.breakdown.elementMultiplier,1);}
});
for(const hp of [53,52])test(`奇数最大HP105、当前${hp}时精确比较，无半点取整`,()=>{
  for(const id of names){const b=battle(id,'duhuolu');b.hp[1]=hp;assert.equal(hit(b).breakdown.raw,((id===names[0])===(hp*2>105))?60:25);}
});
test('只读目标血线，不用自己HP，第一击跨半血不重算',()=>{
  const b=battle();b.hp=[1,100];const before=structuredClone(b),r=hit(b);assert.equal(r.breakdown.raw,60);assert.equal(r.state.hp[1],40);assert.deepEqual(b,before);assert.equal(hit(r.state).breakdown.raw,25);
});
test('固定强化后削弱、护盾、封伤，条件不由防护或未来旧伤改变',()=>{
  const b=battle();b.hp[1]=81;b.foresight=[30,0];b.weaken=[1,0];b.shield=[0,15];b.seal=[false,true];b.debt=[0,10];const r=hit(b);
  assert.equal(r.breakdown.raw,90);assert.equal(r.breakdown.afterReduction,67);assert.equal(r.breakdown.blocked,15);assert.equal(r.effects.deferred[1],26);assert.equal(r.breakdown.damage,26);assert.equal(r.effects.settled[1],10);
});
test('治疗、行动末伤害及回生后的下一次血线重新判断',()=>{
  let b=battle(names[0],'woxu');b.hp[1]=45;assert.equal(hit(b).breakdown.raw,25);b=hit(b,1,1).state;assert.equal(b.hp[1],55);assert.equal(hit(b).breakdown.raw,60);
  b=battle();b.hp[1]=90;b.burn=[0,1];b=act(b,0,{type:'retreat'}).state;assert.equal(b.hp[1],75);assert.equal(hit(b).breakdown.raw,25);
  b=battle(names[1],'cangquanyuan');b.hp[1]=20;b.reviveWard=[false,true];b.reviveUsed=[false,true];const r=hit(b);assert(!r.finished);assert.equal(r.state.hp[1],60);assert.equal(r.breakdown.raw,60);assert.equal(hit(r.state).breakdown.raw,60);
});
test('错锋相替基础15不享受35或S28属性倍率，转换后再判断',()=>{
  for(const id of names){const b=battle(id);b.hp[1]=95;const r=hit(b,0,1);assert.equal(r.breakdown.raw,15);assert.equal(r.state.hp[1],80);assert.equal(r.state.cards[0],TWIN_PARTNERS[id]);assert.equal(hit(r.state).breakdown.raw,id===names[0]?60:25);}
});
test('确认收益例：75/160时转换再截击实际75，对照两次直接50',()=>{
  const b=battle();b.hp[1]=75;const shifted=hit(b,0,1),paid=hit(shifted.state);assert.equal(shifted.breakdown.damage+paid.breakdown.damage,75);assert.equal(paid.winner,0);
  const first=hit(b),second=hit(first.state);assert.equal(first.breakdown.damage+second.breakdown.damage,50);assert.equal(second.state.hp[1],25);
});
test('血线陷阱：95/160时留伏锋25+60=85，盲目换扬锋仅15+25=40',()=>{
  const b=battle(names[1]);b.hp[1]=95;const direct=hit(b),follow=hit(direct.state),shift=hit(b,0,1),bad=hit(shift.state);assert.equal(direct.breakdown.damage+follow.breakdown.damage,85);assert.equal(shift.breakdown.damage+bad.breakdown.damage,40);
});
test('0伤仍转换，全部状态及一次资格保留，本次合法消耗照常执行',()=>{
  const b=battle();b.hp[0]=80;b.remaining[0]=1;b.shield=[15,30];b.mark=[1,null];b.weaken=[2,0];b.charge=[true,false];b.echo=[18,0];b.root=[2,0];b.seal=[true,false];b.debt=[20,0];b.reviveWard=[true,false];b.reviveUsed=[true,false];b.deathWard=[2,0];b.deathPower=[60,0];b.deathUsed=[true,false];
  const before=structuredClone(b),r=hit(b,0,1);assert.equal(r.breakdown.damage,0);assert.equal(r.state.cards[0],names[1]);assert.equal(r.state.instances[0].id,'partner');assert.deepEqual(b,before);
  for(const k of ['hp','remaining','mark','charge','echo','root','seal','debt','reviveWard','reviveUsed','deathPower','deathUsed'])assert.equal(r.state[k][0],b[k][0],k);assert.equal(r.state.weaken[0],1);assert.equal(r.state.deathWard[0],1);
});
test('转换消耗攻击增益、烙印只结算一次，秘密预判将其视为进攻',()=>{
  const b=battle();b.burn=[2,0];b.wind=[1,-1];b.foresight=[30,0];b.prediction=[null,'attack'];const r=hit(b,0,1);assert.equal(r.breakdown.raw,70);assert.equal(r.state.cards[0],names[1]);assert.equal(r.state.hp[0],95);assert.equal(r.state.burn[0],1);assert.equal(r.state.wind[0],-1);assert.equal(r.state.foresight[0],0);assert.equal(r.state.foresight[1],30);
});
test('目标回生后战斗继续可转换，旧血线不重放；直接结束不转换',()=>{
  const b=battle(names[0],'cangquanyuan');b.hp[1]=15;b.reviveWard=[false,true];const r=hit(b,0,1);assert(!r.finished);assert.equal(r.state.hp[1],60);assert.equal(r.state.cards[0],names[1]);
  const lethal=battle();lethal.hp=[15,15];lethal.burn=[2,2];const end=hit(lethal,0,1);assert.equal(end.winner,0);assert.equal(end.state.cards[0],names[0]);assert.equal(end.state.instances[0].id,'own');assert.deepEqual(end.effects.burnDamage,[0,0]);
});
test('缺伙伴禁用转换但第一招正常；可持有其他双生组不构成伙伴',()=>{
  const m=match(names[0],'panjia',false);assert(!skillAvailable(m.battle,0,1));assert(!battleActions(m.battle,0).some(a=>a.skill===1));assert.throws(()=>attack(m,0,1),/错锋相替/);assert.equal(hit(m.battle).breakdown.raw,60);
});
test('绑定实际副本稳定锁定，多副本不临时换卡',()=>{
  let m=createMatch('battle',[[instance('own',names[0]),instance('z',names[1]),instance('a',names[1])],[instance('enemy','panjia')]]);for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:[p?'enemy':'own']});assert.equal(m.battle.twinPairs[0][names[1]].id,'a');m.inventories[0]=m.inventories[0].filter(i=>i.id!=='a');assert.throws(()=>attack(m,0,1),/绑定的双生卡牌不在/);
});
for(const kind of ['damage','surrender','dot'])test(`转换后${kind}只失去当前伙伴，卡牌守恒`,()=>{
  let m=attack(match(),0,1);if(kind==='surrender')m=dispatch(m,{type:'surrender',player:0});else if(kind==='dot'){m.battle.hp[0]=15;m.battle.burn=[1,0];m=attack(m,0,0);}else{m.battle.hp[0]=20;m=attack(m,1,1);}
  assert.equal(m.winner,1);assert.equal(m.transfers.length,1);assert.equal(m.transfers[0].id,'partner');assert.equal(m.transfers[0].cardId,names[1]);assert(m.inventories[0].some(c=>c.id==='own'));assert.equal(m.inventories.flat().length,3);
});
test('转换当次烙印致败失去转换后的卡；换回后失原卡',()=>{
  let m=match();m.battle.hp[0]=15;m.battle.burn=[1,0];m=attack(m,0,1);assert.equal(m.transfers[0].id,'partner');
  m=attack(match(),0,1);m=attack(m,0,1);m=dispatch(m,{type:'surrender',player:0});assert.equal(m.transfers[0].id,'own');
});
test('双方同批持续伤害归零及成功撤退均保留两张，不发生转移',()=>{
  for(const kind of ['draw','retreat']){let m=attack(match(),0,1);if(kind==='draw'){m.battle.hp=[15,30];m.battle.burn=[1,1];m=attack(m,0,1);}else{m.battle.remaining[0]=1;m.phase='battle-action';m.battle.actor=0;m=dispatch(m,{type:'retreat',player:0});}assert.equal(m.status,'finished');assert.equal(m.winner,null);assert.equal(m.transfers.length,0);assert.equal(m.inventories[0].length,2);}
});
test('属性胜负先行，双方本组镜像转换使用各自副本',()=>{
  assert.equal(match(names[0],'zhiyi').winner,0);assert.equal(match(names[0],'taituan').winner,1);
  let m=createMatch('battle',names.map((id,p)=>[instance('s'+p,id),instance('p'+p,TWIN_PARTNERS[id])]));for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:['s'+p]});m=attack(m,0,1);m=attack(m,1,1);assert.deepEqual(m.battle.cards,[names[1],names[0]]);assert.deepEqual(m.battle.instances.map(c=>c.id),['p0','p1']);
});
test('拼点四项正常重比，身高扬锋胜、体重伏锋胜，不转换',()=>{
  for(const [numbers,winner] of [[[2,3],0],[[3,3],1]]){const inv=names.map((id,p)=>Array.from({length:5},(_,i)=>instance(`${p}-${i}`,id)));let m=createMatch('point',inv);for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:inv[p].map(c=>c.id)});for(const p of [0,1])m=dispatch(m,{type:'lineup-ready',player:p},()=>.5);for(const p of [0,1])m=dispatch(m,{type:'decision',player:p,value:'continue'});for(const p of [0,1])m=dispatch(m,{type:'point',player:p,value:1});assert.equal(m.phase,'point-tie');assert.equal(m.transfers.length,0);m=dispatch(m,{type:'advance'});for(const p of [0,1])m=dispatch(m,{type:'point',player:p,value:numbers[p]});assert.equal(m.rounds[0].winner,winner);}
});
test('状态详情15伤害及正式技能名准确，预览与真实结算一致且不修改状态',()=>{
  const b=battle();b.hp[1]=75;const before=structuredClone(b),s=combatStatuses(b,0);assert.match(s.find(v=>v.id==='twin').detail,/错锋相替先造成15/);assert.match(s.find(v=>v.id==='twin-blood').label,/伏锋优势/);
  const pv=previewSkill(b,0,1),r=hit(b,0,1);assert.deepEqual(b,before);assert.equal(pv.targetHp,r.state.hp[1]);assert.equal(pv.transformed.to,names[1]);const restored=JSON.parse(JSON.stringify(r.state));assert.equal(combatStatusKey(restored),combatStatusKey(r.state));assert.equal(previewSkill(restored,0,0).damage,60);
});
test('旧存档补发两张一次，保留在途绑定；失去后不重发',()=>{
  const s=freshSession();delete s.mantisTwinsGranted;s.players.forEach(p=>p.cards=p.cards.filter(c=>!names.includes(c.cardId)));s.match=match();const before=structuredClone(s.match.battle);assert(upgradeSession(s));assert.deepEqual(s.match.battle,before);for(const p of s.players)assert.equal(p.cards.length,CARDS.length);s.players[0].cards=s.players[0].cards.filter(c=>c.cardId!==names[1]);assert(!upgradeSession(JSON.parse(JSON.stringify(s))));
});
test('真实UI显示血线与转换后的条件、缺伙伴禁用，刷新形态不重置',()=>{
  const s=freshSession();s.tutorial={version:1,status:'completed'};s.autoAdvance=false;s.match=match();s.match.battle.hp[1]=75;const h=appHarness(s);assert.match(h.app.innerHTML,/伏锋优势/);assert.match(h.app.innerHTML,/错锋相替基础15/);h.click('attack',{skill:'1'});assert.equal(h.run('store.match.battle.cards[0]'),names[1]);const loaded=appHarness(JSON.parse(h.storage.get(SAVE_KEY)));assert.equal(loaded.run('store.match.battle.instances[0].id'),'partner');s.match=match(names[0],'panjia',false);assert.match(appHarness(s).app.innerHTML,/错锋相替不可用/);
});
for(const difficulty of ['easy','hard'])test(`${difficulty} AI会换形兑现，不盲目换过半血，不读秘密`,()=>{
  let m=match();m.difficulty=difficulty;m.battle.hp[1]=75;const before=structuredClone(m);assert.equal(aiAction(m,0,()=>.5).skill,1);assert.deepEqual(m,before);
  m=match(names[1]);m.difficulty=difficulty;m.battle.hp[1]=95;assert.equal(aiAction(m,0,()=>.5).skill,0);
  m.battle.prediction=[null,'attack'];const a=aiAction(m,0,()=>.5);m.battle.prediction[1]='retreat';assert.deepEqual(aiAction(m,0,()=>.5),a);
});
for(const difficulty of ['easy','hard'])test(`${difficulty} AI完整双生对局终结、实际副本守恒`,()=>{
  let m=match();m.difficulty=difficulty;let seed=93,steps=0;const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);while(m.status==='active'&&steps++<180){const p=expectedPlayers(m)[0];m=dispatch(m,p===undefined?{type:'advance'}:aiAction(m,p,rng),rng);}assert.equal(m.status,'finished');assert.equal(m.inventories.flat().length,3);assert.equal(new Set(m.inventories.flat().map(c=>c.id)).size,3);
});
