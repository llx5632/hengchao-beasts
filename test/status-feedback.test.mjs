import test from 'node:test';
import assert from 'node:assert/strict';
import {CARD} from '../dist/data.js';
import {resolveCombatAction} from '../dist/combat.js';
import {statusFeedback} from '../dist/status-feedback.js';

const battle=(a='panjia',b='fuchao')=>({cards:[a,b],hp:[CARD[a].hp,CARD[b].hp],remaining:[CARD[a].retreat,CARD[b].retreat]});
const statuses=result=>result.feedback.filter(cue=>cue.kind==='status').flatMap(cue=>cue.changes);

test('封伤获得、暂存和取消伤势均来自真实结算',()=>{
  const ready=resolveCombatAction(battle(),0,{type:'attack',skill:0});
  assert(statuses(ready).some(change=>change.key==='seal'&&change.mode==='gain'));
  const hit=resolveCombatAction(ready.state,1,{type:'attack',skill:0});
  assert(statuses(hit).some(change=>change.key==='seal'&&change.mode==='consume'));
  assert(statuses(hit).some(change=>change.key==='debt'&&change.mode==='gain'));
  const healed=resolveCombatAction(hit.state,0,{type:'attack',skill:0});
  assert(statuses(healed).some(change=>change.key==='debt'&&change.mode==='clear'));
});

test('致命结算不把战斗结束清空状态误报为消耗',()=>{
  const before=battle();before.hp[1]=1;before.charge=[false,true];
  const result=resolveCombatAction(before,0,{type:'attack',skill:0});
  assert(result.finished);
  assert(!statuses(result).some(change=>change.key==='charge'));
});

test('烙印刷新且本行动结算后次数相同仍显示实际触发',()=>{
  const before=battle('duhuolu','fuchao');before.burn=[0,1];
  const skill=CARD.duhuolu.skills.findIndex(skill=>skill.effect==='burn');
  const result=resolveCombatAction(before,0,{type:'attack',skill});
  assert.equal(result.state.burn[1],1);
  assert(statuses(result).some(change=>change.key==='burn'&&change.mode==='trigger'));
});

test('获得和揭晓预判的反馈不包含秘密选择',()=>{
  const before=battle();
  const after={...before,prediction:[null,'retreat']};
  const cues=statusFeedback(before,after);
  assert.equal(cues[0].p,1);
  assert(!JSON.stringify(cues).includes('retreat'));
});

test('相同状态不重复提示，每方同一行动使用一组反馈',()=>{
  const before={...battle(),shield:[15,0],seal:[true,false]};
  assert.deepEqual(statusFeedback(before,structuredClone(before)),[]);
  const cues=statusFeedback(before,{...before,shield:[0,0],seal:[false,false],debt:[10,0]});
  assert.equal(cues.length,1);
  assert.equal(cues[0].changes.length,3);
});

test('绝境条件变化复用现有状态判定，兼容未补齐字段的旧战斗',()=>{
  const before=battle('jinzong','panjia');before.hp[0]=70;
  const result=resolveCombatAction(before,1,{type:'attack',skill:0});
  assert(result.state.hp[0]<=60);
  assert(statuses(result).some(change=>change.key==='desperate'&&change.mode==='gain'));
});

test('致命伤后的回响记录不会显示为可继续使用的新状态',()=>{
  const before=battle('panjia','mingnang');before.hp[1]=1;
  const result=resolveCombatAction(before,0,{type:'attack',skill:1});
  assert(result.finished);
  assert(!statuses(result).some(change=>change.key==='echo'));
});

test('伏印计时结束与回响较低值更新不会误报为技能触发',()=>{
  const before={...battle(),deathWard:[2,0],echo:[0,40]};
  const cues=statusFeedback(before,{...before,deathWard:[1,0],echo:[0,20]});
  assert.equal(cues[0].changes[0].mode,'update');
  assert.equal(cues[1].changes[0].mode,'refresh');
});
