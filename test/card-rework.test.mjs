import test from 'node:test';
import assert from 'node:assert/strict';
import {CARD,METRICS} from '../dist/data.js';
import {resolveCombatAction as act,previewSkill,combatStatusKey} from '../dist/combat.js';
import {dispatch,aiAction,expectedPlayers} from '../dist/engine.js';
import {freshSession,upgradeSession,createLocalMatch,RULES_REVISION} from '../dist/session.js';
import {appHarness} from './helpers/app-harness.mjs';
const battle=(a='duhuolu',b='panjia')=>({cards:[a,b],hp:[CARD[a].hp,CARD[b].hp],remaining:[CARD[a].retreat,CARD[b].retreat]});
const hit=(b,p,i)=>act(b,p,{type:'attack',skill:i});
const retreat=(b,p)=>act(b,p,{type:'retreat'});
function match(a='duhuolu',b='panjia'){
  const players=[a,b].map((cardId,p)=>({name:String(p),cards:[{id:String(p),cardId}]}));
  let m=createLocalMatch('battle',players);for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:[String(p)]});
  m.phase='battle-action';m.battle.actor=0;return m;
}
test('四卡改造准确登记基础值，拼点不计特殊收益',()=>{
  for(const [id,base] of [['duhuolu',50],['liejing',40],['xunbei',20],['genguan',45]])assert.equal(METRICS[3].read(CARD[id]),base);
  assert.equal(CARD.duhuolu.skills[0].damage,30);assert.equal(CARD.xunbei.skills[0].name,'抑力孢雾');assert.equal(CARD.genguan.skills[1].name,'扎根蓄能');
});
test('首次烙印不立即跳伤，此后施加者和持有者的实际行动均触发',()=>{
  let r=hit(battle(),0,0);assert.equal(r.state.hp[1],130);assert.equal(r.state.burn[1],2);
  r=hit(r.state,0,1);assert.equal(r.state.hp[1],65);assert.equal(r.state.burn[1],1);
  r=retreat(r.state,1);assert.equal(r.state.hp[1],50);assert.equal(r.state.burn[1],0);
});
test('已有烙印刷新为2后正常触发，不叠加，不靠连续刷新免除跳伤',()=>{
  let b=hit(battle(),0,0).state;b=hit(b,0,0).state;
  assert.equal(b.hp[1],85);assert.equal(b.burn[1],1);assert.equal(hit(b,0,0).state.burn[1],1);
});
test('猜拳双方提交、平手和展示均不推进持续伤害',()=>{
  let m=match();m.phase='rps';m.battle.burn=[2,2];const hp=[...m.battle.hp];
  m=dispatch(m,{type:'rps',player:0,value:'rock'});m=dispatch(m,{type:'rps',player:1,value:'rock'});
  assert.equal(m.phase,'rps-tie');m=dispatch(m,{type:'advance'});assert.deepEqual(m.battle.hp,hp);assert.deepEqual(m.battle.burn,[2,2]);
});
test('先回血再烙印，预览分别报告治疗与持续伤害，输入不变',()=>{
  const b=battle('xunbei');b.hp[0]=10;b.burn=[2,0];const before=structuredClone(b),r=previewSkill(b,0,1);
  assert.equal(r.healing,15);assert.equal(r.burnDamage[0],15);assert.equal(r.ownHp,10);assert(!r.selfDefeat);assert.deepEqual(b,before);
});
test('持续伤害不被削弱或护盾影响、不消耗盾、不污染回响记录',()=>{
  const b=battle('duhuolu','mingnang');b.burn=[0,2];b.shield=[0,15];b.weaken=[2,0];b.echo=[0,35];
  const r=retreat(b,0);assert.equal(r.state.hp[1],115);assert.equal(r.state.shield[1],15);assert.equal(r.state.echo[1],35);assert.equal(r.state.weaken[0],2);
});
test('直接击败及撤退成功优先结束，双方的后续烙印均不结算',()=>{
  let b=battle();b.hp=[10,40];b.burn=[2,2];let r=hit(b,0,1);assert(r.finished);assert.equal(r.winner,0);assert.equal(r.state.hp[0],10);
  b=battle();b.hp=[10,10];b.burn=[2,2];b.remaining[0]=1;r=retreat(b,0);assert.equal(r.winner,null);assert.deepEqual(r.state.hp,[10,10]);assert.deepEqual(r.state.burn,[0,0]);
});
test('双方同次持续伤害归零按平局处理，不交换卡牌',()=>{
  let m=match();m.battle.hp=[15,15];m.battle.burn=[2,2];m.battle.remaining[0]=2;
  m=dispatch(m,{type:'retreat',player:0});assert.equal(m.status,'finished');assert.equal(m.winner,null);assert.equal(m.transfers.length,0);assert.deepEqual(m.battle.hp,[0,0]);
});
test('持续伤害可使行动者判负，赢卡归真正赢家而非行动者',()=>{
  let m=match();m.battle.hp[0]=10;m.battle.burn=[2,0];
  m=dispatch(m,{type:'attack',player:0,skill:0});assert.equal(m.winner,1);assert.equal(m.transfers[0].from,0);assert.equal(m.inventories[1].length,2);assert.equal(m.battle.last.after.hp[0],0);
});
test('晶痕保留来源0，强化猛咬先增伤再削弱取整再减盾',()=>{
  const b=battle('liejing');b.mark=[null,0];b.weaken=[2,0];b.shield=[0,15];
  const r=hit(b,0,1);assert.equal(r.breakdown.raw,65);assert.equal(r.breakdown.afterReduction,48);assert.equal(r.breakdown.blocked,15);assert.equal(r.breakdown.damage,33);assert.equal(r.state.mark[1],null);assert.equal(r.state.weaken[0],1);
});
test('晶痕不叠加、未成功撤退保留、被盾全部挡住也消耗',()=>{
  let b=hit(battle('liejing'),0,0).state;b=hit(b,0,0).state;assert.equal(b.mark[1],0);
  b=retreat(b,0).state;assert.equal(b.mark[1],0);b.shield[1]=100;const r=hit(b,0,1);assert.equal(r.breakdown.damage,0);assert.equal(r.state.mark[1],null);
});
test('双方同种裂晶蜥标记分别记录，不消耗对方放在自己身上的晶痕',()=>{
  let b=hit(battle('liejing','liejing'),0,0).state;b=hit(b,1,0).state;assert.deepEqual(b.mark,[1,0]);b.hp[1]=90;
  b=hit(b,0,1).state;assert.deepEqual(b.mark,[1,null]);
});
test('削弱仅按对方进攻计数，刷新不叠加，回血和其他效果保持强度',()=>{
  let b=hit(battle('xunbei','lujia'),0,0).state;b=hit(b,0,0).state;assert.equal(b.weaken[1],2);
  b=retreat(b,1).state;assert.equal(b.weaken[1],2);b.hp[1]=80;b.shield[0]=100;
  const r=hit(b,1,1);assert.equal(r.breakdown.raw,15);assert.equal(r.breakdown.afterReduction,11);assert.equal(r.breakdown.damage,0);assert.equal(r.effects.healing,10);assert.equal(r.state.weaken[1],1);
});
test('双方互相削弱时，先消耗攻击者原次数，再赋予目标新次数',()=>{
  let b=hit(battle('xunbei','xunbei'),0,0).state;b=hit(b,1,0).state;
  assert.deepEqual(b.weaken,[2,1]);assert.equal(b.hp[0],90);
});
test('根劲只强化两次撞击，不刷新、不重复付代价，用完不返还撤退',()=>{
  let b=hit(battle('genguan'),0,1).state;assert.equal(b.remaining[0],4);assert.equal(b.root[0],2);
  b=hit(b,0,1).state;assert.equal(b.remaining[0],4);assert.equal(b.root[0],2);
  let r=hit(b,0,0);assert.equal(r.breakdown.raw,65);assert.equal(r.state.root[0],1);
  // Use a fresh opponent HP to observe the second use without ending this test battle.
  b=r.state;b.hp[1]=160;r=hit(b,0,0);assert.equal(r.breakdown.raw,65);assert.equal(r.state.root[0],0);assert.equal(r.state.remaining[0],4);
});
test('根劲上限5时无免费蓄能；先撤退腾空间可以再次支付，已有根劲不会补足',()=>{
  for(const remaining of [1,3,4,5]){
    const b=battle('genguan');b.remaining[0]=remaining;const r=hit(b,0,1);
    assert.equal(r.state.root[0],remaining<5?2:0);assert.equal(r.state.remaining[0],Math.min(5,remaining+1));
  }
  let b=battle('genguan');b.remaining[0]=5;b=retreat(b,0).state;b=hit(b,0,1).state;assert.equal(b.remaining[0],5);assert.equal(b.root[0],2);
  b.root[0]=1;b=hit(b,0,1).state;assert.equal(b.root[0],1);assert.equal(b.remaining[0],5);
});
test('所有新状态进入AI缓存键并在投降和正常结束清空',()=>{
  const m=match();m.battle.burn=[1,1];m.battle.root=[2,0];m.battle.mark=[1,0];m.battle.weaken=[2,1];
  assert.notEqual(combatStatusKey(m.battle),combatStatusKey(battle()));const end=dispatch(m,{type:'surrender',player:0});
  for(const key of ['burn','root','weaken'])assert.deepEqual(end.battle[key],[0,0]);assert.deepEqual(end.battle.mark,[null,null]);
});
test('规则升级仅清理旧对局，保留收藏转移、难度及常用阵容，不重复清理新局',()=>{
  const s=freshSession();delete s.rulesRevision;s.match=createLocalMatch('point',s.players);s.selectionDrafts={battle:['old']};s.difficulty='hard';s.lineupPresets=[{name:'保留'}];
  const lost=s.players[0].cards.shift();s.players[1].cards.push(lost);const ownership=structuredClone(s.players);
  assert(upgradeSession(s));assert.equal(s.match,null);assert.deepEqual(s.players,ownership);assert.equal(s.difficulty,'hard');assert.equal(s.lineupPresets[0].name,'保留');assert.equal(s.rulesRevision,RULES_REVISION);
  s.match=createLocalMatch('battle',s.players);assert.equal(upgradeSession(s),false);assert(s.match);
});
test('新UI分开呈现治疗、持续伤害和最终HP，撤退能预告失卡风险',()=>{
  const h=appHarness();h.run("start('battle');store.match.battle={cards:['xunbei','panjia'],hp:[10,160],remaining:[3,4],actor:0,burn:[2,0]};store.match.phase='battle-action';render()");
  assert.match(h.app.innerHTML,/实际回血 15/);assert.match(h.app.innerHTML,/烙印伤害 15/);assert.match(h.app.innerHTML,/自己最终HP：10 → 10/);assert.match(h.app.innerHTML,/警告：行动后持续伤害/);
});
for(const difficulty of ['easy','hard'])test(`${difficulty} AI能完成四张改造卡中立战斗且实例守恒`,()=>{
  for(const [a,b] of [['duhuolu','panjia'],['liejing','lujia'],['xunbei','genguan'],['genguan','xuanjiao']]){
    let m=match(a,b);m.phase='battle-reveal';m.difficulty=difficulty;m.controls=['ai','ai'];let seed=91,tick=0;
    const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
    while(m.status==='active'&&tick++<500){const expected=expectedPlayers(m);m=dispatch(m,expected.length?aiAction(m,expected[0],rng):{type:'advance'},rng);}
    assert.equal(m.status,'finished',`${a}/${b}`);assert.equal(m.inventories.flat().length,2);
  }
});
