import { CARD, METRICS } from './data.js';
import { createMatch, dispatch } from './engine.js';

export const TUTORIAL_VERSION = 1;
export const TUTORIAL_POINT_CARDS = Object.freeze([
  ['tanling','woxu','xianbei','xuanjiao','zhiyi'],
  ['fuchao','genguan','jinzong','lujia','panjia'],
]);
const statuses=['welcome','available','active','paused','completed','skipped'];
export function newTutorial(status='welcome') {
  return {version:TUTORIAL_VERSION,status,lesson:'attribute',match:null,draft:[],turn:0,pointExercise:false,practiceDone:false,summary:false};
}
export function normalizeTutorial(value,firstVisit=false) {
  if(value?.version===TUTORIAL_VERSION&&statuses.includes(value.status)){
    if(['active','paused'].includes(value.status)&&(!['attribute','battle','point'].includes(value.lesson)||!value.match?.inventories||!Array.isArray(value.draft)))return newTutorial();
    return value;
  }
  return newTutorial(firstVisit?'welcome':'available');
}
function lessonMatch(lesson) {
  const cards=lesson==='attribute'?[['tanling'],['genguan']]:lesson==='battle'?[['taituan'],['fuchao']]:TUTORIAL_POINT_CARDS;
  const inventories=cards.map((ids,p)=>ids.map((cardId,i)=>({id:`tutorial-${lesson}-${p}-${i}`,cardId})));
  let match=createMatch(lesson==='point'?'point':'battle',inventories);
  match.controls=['human','ai'];match.playerNames=['你','教学 AI'];
  return dispatch(match,{type:'select',player:1,ids:inventories[1].map(c=>c.id)});
}
export function beginTutorialLesson(state,lesson='attribute') {
  return {...newTutorial('active'),lesson,match:lessonMatch(lesson)};
}
export function tutorialRps(state) {
  return {human:'rock',ai:state.turn===1?'paper':'scissors'};
}
export function tutorialPointTarget(state) {
  if(state.pointExercise)return null;
  if(state.match.round!==0)return null;
  return state.match.point.revealed?3:0;
}
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const stableShuffle=()=>.999999;
function practiceMatch(){
  let m=lessonMatch('point');
  const apply=a=>{m=dispatch(m,a,stableShuffle);};
  apply({type:'select',player:0,ids:m.inventories[0].map(c=>c.id)});
  for(const player of [0,1])apply({type:'lineup-ready',player});
  for(const player of [0,1])apply({type:'decision',player,value:'continue'});
  // Recreate the already revealed teaching pair through ordinary rule actions.
  for(const player of [0,1])apply({type:'point',player,value:0});
  apply({type:'advance'});
  return m;
}
export function tutorialAction(state,action) {
  check(state.status==='active','请先开始或继续新手教程。');
  const next=structuredClone(state),m=next.match;
  if(next.summary){
    check(action.type==='explore','教学已结束，请选择开始自由探索。');
    return {...next,status:'completed'};
  }
  const apply=a=>{next.match=dispatch(next.match,a,stableShuffle);};
  if(action.type==='choose'){
    check(m.phase==='select'&&m.inventories[0].some(c=>c.id===action.id),'请按引导选择本次练习卡。');
    next.draft=next.draft.includes(action.id)?next.draft.filter(id=>id!==action.id):m.mode==='battle'?[action.id]:[...next.draft,action.id];
  }else if(action.type==='submit'){
    check(m.phase==='select','当前不在选卡阶段。');
    check(next.draft.length===(m.mode==='point'?5:1),'请先选齐本次练习的出战卡。');
    apply({type:'select',player:0,ids:next.draft});
  }else if(action.type==='rps'){
    check(m.phase==='rps'&&action.value===tutorialRps(next).human,'这次练习请出石头，观察行动权如何变化。');
    apply({type:'rps',player:1,value:tutorialRps(next).ai});
    apply({type:'rps',player:0,value:action.value});
  }else if(action.type==='attack'){
    check(next.lesson==='battle'&&next.turn===0&&m.phase==='battle-action'&&m.battle.actor===0&&action.skill===0,'这一步请使用绒爪拍击。');
    apply({type:'attack',player:0,skill:0});next.turn++;
  }else if(action.type==='retreat'){
    check(next.lesson==='battle'&&next.turn===2&&m.phase==='battle-action'&&m.battle.actor===0,'先完成进攻与受击教学，再尝试撤退。');
    apply({type:'retreat',player:0});next.turn++;
  }else if(action.type==='point'){
    check(m.phase==='point','当前不在出点阶段。');
    const target=tutorialPointTarget(next);
    check(target===null||action.value===target,target===0?'先选0，体验双零亮牌重比。':'这次请选3，与教学AI的1相加，比较最高基础伤害。');
    apply({type:'point',player:1,value:target===0?0:1});
    apply({type:'point',player:0,value:action.value});
    if(next.pointExercise&&['round-result','point-tie'].includes(next.match.phase))next.practiceDone=true;
  }else if(action.type==='practice'){
    check(next.lesson==='point'&&(m.phase==='round-result'||m.phase==='point-tie'&&next.pointExercise||m.status==='finished'),'请先完成拼点示范。');
    next.match=practiceMatch();next.pointExercise=true;next.practiceDone=false;next.draft=[];
  }else if(action.type==='ready'){
    check(m.phase==='lineup-reveal','当前不在阵容确认阶段。');
    apply({type:'lineup-ready',player:0});apply({type:'lineup-ready',player:1});
  }else if(action.type==='continue'){
    check(m.phase==='between','当前不在小局间阶段。');
    apply({type:'decision',player:0,value:'continue'});apply({type:'decision',player:1,value:'continue'});
  }else if(action.type==='next'){
    if(m.status==='finished'){
      if(next.lesson==='attribute')return beginTutorialLesson(next,'battle');
      if(next.lesson==='battle')return beginTutorialLesson(next,'point');
      check(next.practiceDone,'请先完成一次自主判断练习。');
      return {...next,summary:true};
    }
    if(m.phase==='battle-action'&&m.battle.actor===1){
      check(next.turn===1,'教学行动顺序不匹配。');
      apply({type:'attack',player:1,skill:0});next.turn++;
    }else{
      check(!(next.lesson==='point'&&m.phase==='round-result'&&!next.pointExercise),'请先完成一次自主判断练习。');
      apply({type:'advance'});
    }
  }else if(action.type==='complete'){
    check(next.lesson==='point'&&(m.phase==='round-result'&&m.round>0||m.status==='finished'),'请先完成拼点的强弱项练习。');
    check(next.practiceDone,'请先完成一次自主判断练习。');
    next.summary=true;
  }else throw new Error('未知教学操作。');
  return next;
}

export function tutorialGuidance(state) {
  const m=state.match;
  if(state.summary)return {title:'教学结束，现在可以自由探索了',text:'你已学会观察属性、争取行动权、进攻与撤退，也尝试过用自己的强项参与拼点。接下来，自由探索衡潮群岛，认识更多异兽，用自己的判断开启第一场正式对局吧。'};
  if(!m)return {title:'欢迎来到衡潮群岛',text:'从一次属性克制的交锋开始，认识你的第一张谱印。'};
  if(state.lesson==='attribute')return m.phase==='select'?{
    title:'第一场 · 选择炭铃',text:'先点击炭铃，再封存出战。这只低阶火属性异兽，将迎战高阶草属性的根冠鹿。观察它们的属性，而不只看HP与阶位。',
  }:{title:'火克草，低阶也能战胜高阶',text:'炭铃的火属性克制根冠鹿的草属性，因此直接获胜，不需要猜拳或攻击。相性优先于阶位：选对属性，小型异兽也能赢。正式对局的胜者会获得败方出战谱印。'};
  if(state.lesson==='battle'){
    if(m.phase==='select')return {title:'第二场 · 选择苔团',text:'草属性的苔团与水属性的负潮巨鳖互不克制。选择苔团并封存，接下来通过猜拳争夺行动权。'};
    if(m.phase==='battle-reveal')return {title:'互不克制，进入真正的交锋',text:'苔团HP65，负潮巨鳖HP140。这次不会因属性直接分出胜负，双方从满血和基础撤退点数开始，猜拳胜者才能行动。'};
    if(m.phase==='rps')return {title:state.turn===0?'先赢一次，取得进攻机会':state.turn===1?'再看一次，失去行动权会怎样':'再争得行动权，准备撤退',text:state.turn===1?'这轮请出石头；教学AI会出布，让你观察猜拳落败后的攻击。正式对局出拳保密，不预告胜负。':'这轮请出石头；教学AI会出剪刀。教程固定出拳只用于演示，正式对局双方秘密出拳。'};
    if(m.phase==='rps-result')return {title:m.battle.actor===0?'你赢得本次行动权':'教学AI赢得本次行动权',text:m.battle.actor===0?(state.turn===2?'这次选择撤退，学习在不利局势下保留谱印。':'猜拳胜者只获得一次行动，可以选一个技能进攻，或撤退一步。'):'败者本次不能进攻，也不能撤退。先观察对手的一次行动，然后重新猜拳。'};
    if(m.phase==='battle-action')return m.battle.actor===1?{title:'观察对手进攻',text:'负潮巨鳖将使用潮壳冲撞，造成35伤害。点击下方按钮观察HP变化。'}:state.turn===0?{title:'使用绒爪拍击',text:'选择绒爪拍击，造成20伤害。每次进攻只使用一个技能，行动结束后重新猜拳；基础数值不会因为扣血而改变。'}:{title:'打不过时，可以争取撤退',text:'苔团只剩30HP，再承受一次潮壳冲撞就会失败。每次赢得行动权后，可让剩余撤退减1，降到0才撤退成功。本次从1减到0，立即平局，双方保留谱印；其他卡可能需要多次撤退。如果HP归零或主动投降，当前出战谱印会输给对方。'};
    if(m.phase==='battle-turn')return {title:state.turn===1?'你的进攻结束了':'苔团受伤了，下一步该如何选择',text:state.turn===1?'负潮巨鳖HP从140降为120。一次行动结束后，双方重新猜拳；攻击并不保证下一轮仍有行动权。':'苔团HP从65降为30。实力悬殊时，不必硬拼；先争得下一次行动权，再选择撤退。正式对局失败会失去当前出战谱印。'};
    return {title:'撤退成功，保住谱印',text:'剩余撤退点数从1降到0，本场平局，双方保留卡牌。注意撤退与投降不同：投降会判负并失去出战谱印。战斗教学完成，接下来进入拼点教学。'};
  }
  if(m.phase==='select')return {title:'拼点 · 先选齐五张谱印',text:'拼点比较六项静态数值，不发动战斗技能，也不按属性克制直接判胜。请选择这五张练习谱印；挑阵容时，想一想每张卡有哪些强项。'};
  if(m.phase==='lineup-reveal')return {title:'观察双方阵容，寻找强项与弱项',text:'双方先公开各自五张阵容，确认后再洗牌。用自己的强项对抗对方的弱项：例如炭铃HP和体型偏低，但45的最高基础伤害可能胜过大型异兽。本教程固定练习出场结果；正式对局分别随机洗牌，公开阵容的排列不代表出场顺序。'};
  if(m.phase==='between')return {title:m.round?'继续练习，观察不同的比较项目':'开始第一小局',text:'每场有五小局。这次练习选择继续，先认识点数如何决定比较项目；其他规则可以展开下方的可选说明阅读。'};
  if(m.phase==='point-tie'){
    const comparison=m.point.comparisons.at(-1);
    return comparison.metric===null?{title:'双方均出0，亮牌后用原卡重比',text:'双零不比较属性，不推进小局，也不转移卡牌。现在双方当前卡已公开，可以针对真实强弱项重新选点。'}:{title:'比较数值相同，亮牌后用原卡重比',text:`本次比较${METRICS[comparison.metric].name}，双方数值相同，不推进小局，也不转移卡牌。观察已公开的数值，重新寻找自己的强项。`};
  }
  if(m.phase==='point'){
    if(state.pointExercise&&m.round===0)return {title:'这次由你判断：该出哪个点数？',text:'再看这组已经公开的谱印：教学AI这次固定出1。观察双方六项数值，找出自己的强项，再决定出0～6中的哪个点数。这里不再给出答案，选错也会按真实规则结算，并说明原因；练习不影响正式收藏。'};
    if(tutorialPointTarget(state)===0)return {title:'先认识双零亮牌重比',text:'每人秘密选择0～6，双方点数之和决定比较项目：1～6依次对应六项，7重新对应第1项，直到12对应第6项。第一步请选0，教学AI也会选0，体验一次双零亮牌；这不会消耗当前卡。'};
    if(tutorialPointTarget(state)===3)return {title:'以己之长，攻彼之短',text:'炭铃HP75＜负潮巨鳖140，体重7kg＜260kg，但最高基础伤害45＞35。这次教学AI固定出1，请选3：总和4，比第4项“最高基础伤害”，发挥炭铃的强项。正式对局对方秘密出点，无法保证每次都触发优势项。'};
    const own=CARD[m.point.cards[0].cardId];
    return {title:'自己试一试：从公开信息判断优势',text:`当前是${own.name}。观察自己的六项数值与已公开阵容，选择0～6，尝试发挥强项。对方当前卡在亮牌前仍保密；有些卡在某组配对中也可能没有数值优势，出点不能保证获胜。`};
  }
  if(m.phase==='round-result'){
    const r=m.rounds.at(-1),metric=r.comparison?METRICS[r.comparison.metric].name:null;
    if(state.pointExercise){
      const c=r.comparison;
      return {title:r.winner===0?'你自己找到了优势':'这次没有发挥优势，看看原因',text:c?`你出${c.numbers[0]}，AI出${c.numbers[1]}，相加为${c.sum}，对应${metric}；你的数值${c.values[0]}，对方${c.values[1]}。${r.winner===0?'你用强项赢下了这次练习。':'这次比较的项目对方更强，所以本小局失利；回看双方数值，找找哪一项自己更大。'}正式对局中对方秘密出点，策略只能提高机会，不能保证比较到优势项。你可以重试，也可以选择教学结束；想多练习还可以继续剩余小局。`:'同种卡直接跳过，双方保留；本次仍计入五小局进度。'};
    }
    return {title:m.round===1?'比较强项，赢下一张谱印':'本小局已经结算',text:m.round===1?'这次比较最高基础伤害：炭铃45，对方35，你获胜。用自己的强项对抗对方弱项，而不只挑HP或体型大的一张。正式对局胜者拿走败方当前卡；接下来再用这组公开谱印自己判断一次，不再提示该出几。':r.kind==='same'?'同种卡直接跳过，双方保留；本次仍计入五小局进度。':`本次比较${metric}，数值更大者获胜。接下来进入一次自主判断练习。`};
  }
  return {title:'新手教程完成',text:'你已经学会属性克制、猜拳行动权、进攻与撤退，以及用强项参与拼点。正式对局失败会失去谱印；观察对手、把握优势，也为自己保留退路。'};
}
