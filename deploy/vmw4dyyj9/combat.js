import { CARD, TWIN_PARTNERS } from './data.js';
export function battleEndedBySurrender(m){return Boolean(m.mode==='battle'&&m.status==='finished'&&m.transfers?.some(t=>t.reason==='战斗投降'));}
const empty=()=>({charge:[false,false],shield:[0,0],echo:[0,0],burn:[0,0],mark:[null,null],weaken:[0,0],root:[0,0],seal:[false,false],debt:[0,0],wind:[-1,-1],prediction:[null,null],foresight:[0,0],deathWard:[0,0],deathUsed:[false,false],deathPower:[0,0],reviveWard:[false,false],reviveUsed:[false,false]});
// One invocation per resolved, non-tied RPS. Preview/AI use the same transition.
export function applyRpsLoss(battle,loser){
  const wind=[...(battle.wind??[-1,-1])];
  if(wind[loser]>=0)wind[loser]=Math.min(2,wind[loser]+1);
  return {...battle,wind};
}
// Keep the existence of an opponent's sealed prediction, never its private choice.
export function battleForViewer(battle,viewer){
  const prediction=[...(battle.prediction??[null,null])];
  if(prediction[1-viewer])prediction[1-viewer]='hidden';
  return {...battle,prediction};
}
export function canTwinShift(battle,player){
  const partner=TWIN_PARTNERS[battle.cards[player]], pair=battle.twinPairs?.[player];
  return Boolean(partner&&pair?.[partner]?.cardId===partner&&pair?.[battle.cards[player]]?.cardId===battle.cards[player]);
}
export function skillUnavailableReason(battle,player,index){
  const card=CARD[battle.cards[player]],skill=card.skills[index];
  if(!skill)return '请选择有效技能';
  if(skill.effect==='twin-shift'&&!canTwinShift(battle,player))return `缺少已绑定的双生伙伴，无法使用${skill.name}`;
  if(skill.effect==='revive-ward'){
    if(battle.reviveUsed?.[player]||battle.reviveWard?.[player])return '本场回生伏印已施放，不能重复使用';
    if(battle.hp[player]<=0||battle.hp[player]*2>=card.hp)return '当前HP须严格低于半血（1～59），才能施放回生伏印';
  }
  return '';
}
export function skillAvailable(battle,player,skill){return !skillUnavailableReason(battle,player,skill);}
export function twinDamageMultiplier(skill,element){
  if(skill.effect==='twin-day')return element==='草'?2:element==='火'?.5:1;
  if(skill.effect==='twin-night')return element==='火'?2:element==='草'?.5:1;
  return 1;
}
// Snapshot the opponent's public HP at the start of this attack; no stored buff.
export function twinBloodBonus(battle,player,skill){
  const other=1-player,healthy=battle.hp[other]*2>CARD[battle.cards[other]].hp;
  return (skill.effect==='twin-healthy'&&healthy||skill.effect==='twin-wounded'&&!healthy)?skill.amount:0;
}
// A current public-value condition, never a stored buff or a retreat reaction.
export function pursuitBonus(battle,player,skill){return skill.effect==='pursuit'&&battle.remaining[1-player]===1?skill.amount:0;}
export function battleActions(battle,player){
  return CARD[battle.cards[player]].skills.flatMap((s,skill)=>!skillAvailable(battle,player,skill)?[]:s.effect==='predict'&&!battle.prediction?.[player]?[{type:'attack',skill,prediction:'attack'},{type:'attack',skill,prediction:'retreat'}]:[{type:'attack',skill}]).concat({type:'retreat'});
}
export function clearCombatStatuses(s){Object.assign(s,empty());}
export function combatStatusKey(s){return JSON.stringify([s.cards,s.twinPairs??null,...Object.entries(empty()).map(([k,v])=>s[k]??v)]);}
export function combatStatusValue(s,p){
  const ward=i=>{const target=1-i,raw=Math.max(0,(s.deathPower?.[i]??0)-(s.shield?.[target]??0)),deferred=s.seal?.[target]?Math.min(30,Math.floor(raw/2)):0;return s.deathWard?.[i]&&s.hp[target]<=raw-deferred+(raw-deferred>0?(s.debt?.[target]??0):0)?15*s.deathWard[i]:0;};
  const v=i=>ward(i)+(s.reviveWard?.[i]?Math.floor(CARD[s.cards[i]].hp/2)*.8:0)+(s.charge?.[i]?20:0)+(s.shield?.[i]??0)*.7+Math.min(30,Math.floor((s.echo?.[i]??0)/2))*.6+(s.root?.[i]??0)*14+(s.seal?.[i]?15:0)-(s.debt?.[i]??0)-(s.burn?.[i]??0)*10-(s.weaken?.[i]??0)*6-(s.mark?.[i]===1-i?18:0)+((s.wind?.[i]??-1)<0?0:[18.75,37.5,50][s.wind[i]])+(s.prediction?.[i]?23:0)+(s.foresight?.[i]??0);
  return v(p)-v(1-p);
}
export function combatStatuses(s,p,viewer=0){
  const c=CARD[s.cards[p]],out=[],other=1-p,add=(id,label,active,detail)=>out.push({id,label,active,detail});
  if(c.id==='cangquanyuan'||s.reviveWard?.[p])add('revive-ward',s.reviveWard?.[p]?'回生伏印：待触发':s.reviveUsed?.[p]?'回生伏印：本场已用':s.hp[p]*2<c.hp?'回生伏印：可施放':'回生伏印：未到半血以下',!!s.reviveWard?.[p],'来源：回生伏印。HP严格低于半血时每战仅可施放一次；先造成15基础伤害，战斗继续则挂印，覆盖当次行动末，持续到触发或战斗结束。有效印使致命伤归零（含恰好归零）后、最终胜负前，HP直接恢复至最大HP的50%，无论溢出多少均不再扣除该次溢出。保留其他状态，不补行动；同批持续伤害双方归零仍平局，不回生。投降、属性直胜和成功撤退不触发。');
  if(c.id==='jinnangying'||s.deathWard?.[p])add('death-ward',s.deathWard?.[p]?`伏印 · 余${s.deathWard[p]}次双方行动 · 殒爆${s.deathPower[p]}`:s.deathUsed?.[p]?'伏印：本局挂印已用':'伏印：本局尚可挂印1次',!!s.deathWard?.[p],'来源：殒爆伏印。本局仅取得一次，不刷新、不返还。施放即生效并覆盖当次行动末，当次不扣次数；随后2次任一方进攻或未成功撤退内HP归零，先殒爆60再判胜负。末次先检查死亡后到期；猜拳、展示与等待不计时。殒爆可被护盾／封伤抵挡，不受攻击增减影响。双方归零平局保卡，对方存活自己仍败。投降、属性直胜、成功撤退不触发。');
  if(TWIN_PARTNERS[c.id]){const partner=CARD[TWIN_PARTNERS[c.id]],ready=canTwinShift(s,p),shift=c.skills.find(skill=>skill.effect==='twin-shift');add('twin',ready?`双生：可转为${partner.name}`:`双生：缺少${partner.name}`,ready,`伙伴：${partner.name}。${ready?`已绑定实际伙伴谱印；使用${shift.name}先造成${shift.damage}基础伤害，战斗继续则转换，占一次进攻。`:`未绑定伙伴，${shift.name}不可用。`}转换保留HP、伤势、剩余撤退、全部状态及来源计数；战败或投降只失去当前形态对应的实际卡牌。双方同次持续伤害归零仍平局保卡。`);}
  if(['twin-healthy','twin-wounded'].includes(c.skills[0].effect)){const high=s.hp[other]*2>CARD[s.cards[other]].hp,active=twinBloodBonus(s,p,c.skills[0])>0;add('twin-blood',`${high?'扬锋':'伏锋'}优势 · ${c.skills[0].name}${active?'＋35':'未强化'}`,active,`来源：${c.skills[0].name}。只按本次进攻开始时对方当前HP判断；扬锋对应严格高于半血，伏锋对应半血及以下，满足时基础25＋35至60。只强化第一技能，不积层；本次过半不重算，对方治疗或回生后下次重新判断。转换15也会改变血线，须考虑完整行动结果。`);}
  if(c.id==='xuanjiao')add('wind',(s.wind?.[p]??-1)<0?'逆风：未蓄势':s.wind[p]===0?'逆风蓄势0层':`风压${s.wind[p]}层 · 下次进攻＋${s.wind[p]*25}`,(s.wind?.[p]??-1)>=0,'来源：逆风蓄势。进入0层后每次猜拳落败积1层，每层＋25，最多2层。平手不积层；下一次任一技能进攻消耗整个蓄势，包括0层。再次使用逆风蓄势先释放旧层，再重新进入0层。未成功撤退保留，结束清空。');
  if(c.id==='chaojing'){
    const pending=s.prediction?.[p],choice=p===viewer&&pending&&pending!=='hidden'?(pending==='attack'?'进攻':'撤退'):null;
    add('prediction',pending?(choice?`预判${choice} · 等待对方行动`:'已封存预判 · 行动后揭晓'):s.foresight?.[p]?'预判成功 · 下次进攻＋30':'预判：未布置',!!(pending||s.foresight?.[p]),`来源：伏路预判。${choice?`自己已秘密选择${choice}。`:''}对方下一次实际行动全部结束后揭晓，猜中且战斗继续则下次任一技能进攻＋30；不叠加。等待时再次施放保留原选择，不可改选。未成功撤退保留增益；成功撤退或战斗结束不追加攻击。`);
  }
  if(c.id==='panjia'||s.seal?.[p]||s.debt?.[p])add('seal',s.debt?.[p]?`待结伤势${s.debt[p]} · 再次受伤结清`:s.seal?.[p]?'封伤保护 · 暂存50%，最多30':'封伤：未生效',!!(s.seal?.[p]||s.debt?.[p]),'来源：矿甲封伤。下次对方正数直接伤害暂存一半、向下取整、最多30；再次实际受伤（含烙印）时结清，0伤害不触发。有待结伤势时使用本技能取消全部旧伤，本次不获保护；已有保护不叠加、不刷新。猜拳和行动结束不自动结清。战斗结束清空。');
  if(c.id==='xianbei')add('charge',s.charge?.[p]?'蓄势：裂风突袭＋30':'蓄势：未蓄势',!!s.charge?.[p],'来源：蓄势扑击。仅下次裂风突袭消耗，不叠加；猜拳、受伤及未成功撤退保留，结束清空。');
  if(c.id==='dielin'||s.shield?.[p])add('shield',s.shield?.[p]?`护盾${s.shield[p]} · 下次受击消耗`:'护盾：未生效',!!s.shield?.[p],'来源：迎击护壳。抵消下次技能进攻至多15直接伤害，0伤害也消耗，余量不留、不叠加。不抵消持续伤害，不取消存活时的附加效果。');
  if(c.id==='jinzong')add('desperate',s.hp[p]<=60?'绝境生效 · 反扑60':'绝境：未生效（HP＞60）',s.hp[p]<=60,'来源：绝境反扑。使用时HP≤60总伤害60，否则30；回血高于60即失效，不自动反击。');
  if(c.id==='jiejing')add('pursuit',s.remaining[other]===1?'追击就绪 · 封路追击＋40':'追击：未满足（对方剩余撤退＞1）',s.remaining[other]===1,'来源：封路追击。使用时对方当前剩余撤退为1，本次伤害＋40；基础撤退1开局即可触发，每次独立判断、不积层。对方剩余撤退提高至2或以上即不满足。只在自己正常进攻时生效；对方成功撤退立即结束，不自动补打或阻止撤退。');
  if(c.id==='mingnang')add('echo',s.echo?.[p]?`回响记录${s.echo[p]} · 可追加${Math.min(30,Math.floor(s.echo[p]/2))}`:'回响：无受伤记录',!!s.echo?.[p],'来源：最近一次对方技能的实际直接HP损失，正数覆盖、0不覆盖，持续伤害不记录。仅借势回响消耗，一半向下取整、最多30。');
  if(s.burn?.[p])add('burn',`余烬15 · 余${s.burn[p]}次双方行动`,true,`来源：${CARD[s.cards[other]].name}的烬羽横扫。任一方进攻或撤退后，战斗仍继续则扣15；首次施加从下次行动起，猜拳不触发。先回血后持续伤害，直接击败或撤退成功立即结束。刷新至2次、不叠加；旧烙印即使本次刷新也正常触发。`);
  if(s.mark?.[p]===other)add('mark','晶痕 · 对方猛咬＋25',true,`来源：${CARD[s.cards[other]].name}的碎晶飞掷。只被施加者的裂晶猛咬消耗，不叠加；盾抵消仍消耗，猜拳及其他行动保留。`);
  if(s.weaken?.[p])add('weaken',`攻击－25% · 余${s.weaken[p]}次进攻`,true,`来源：${CARD[s.cards[other]].name}的抑力孢雾。强化后的直接伤害乘75%向下取整，再减护盾；不减回血、阻退、状态或持续伤害。0实际伤害仍消耗，撤退/猜拳不消耗，刷新为2次、不叠加。`);
  if(c.id==='genguan')add('root',s.root?.[p]?`根劲＋20 · 余${s.root[p]}次撞击`:'根劲：未蓄能',!!s.root?.[p],'来源：扎根蓄能。无根劲且自己剩余撤退＜5时，实际＋1才获得2次根劲；只强化根角冲撞各＋20。已有根劲不刷新、不重复付代价，上限时无法蓄能；用完不返还撤退点数。');
  return out;
}
// Preview, real play and AI share an immutable resolver.
export function resolveCombatAction(battle,player,action){
  const state={...battle,dicePending:null,cards:[...battle.cards],hp:[...battle.hp],remaining:[...battle.remaining],...(battle.instances?{instances:[...battle.instances]}:{})};
  if(action.type==='attack'&&!skillAvailable(battle,player,action.skill))throw new Error(skillUnavailableReason(battle,player,action.skill));
  for(const [k,v] of Object.entries(empty()))state[k]=[...(battle[k]??v)];
  const other=1-player,startWard=[...state.deathWard],startBurn=[...state.burn],startSeal=state.seal[player],startDebt=state.debt[player],waiting=state.prediction[other],events=[],effects={healing:0,delay:0,ownRetreatAdded:0,burnDamage:[0,0],burnSkipped:false,deferred:[0,0],settled:[0,0],cancelled:[0,0],deathDamage:[0,0],deathTriggered:[false,false],reviveTriggered:[false,false],reviveHealing:[0,0],directEnded:false};
  const label=p=>CARD[state.cards[p]].name;let text='',breakdown=null;
  // Each positive damage event consumes existing debt; newly deferred damage waits
  // for another event, including a later burn event in this same action.
  function receiveDamage(p,amount,direct=false){
    if(amount<=0)return 0;
    const oldDebt=state.debt[p];let deferred=0;
    if(direct&&state.seal[p]){
      deferred=Math.min(30,Math.floor(amount/2));state.seal[p]=false;state.debt[p]=deferred;
      effects.deferred[p]+=deferred;
      events.push(`${label(p)}消耗封伤保护，暂存${deferred}伤害，再次受伤时结清`);
    }
    const damage=Math.min(state.hp[p],amount-deferred);state.hp[p]-=damage;
    if(oldDebt&&damage>0){
      const paid=Math.min(state.hp[p],oldDebt);state.hp[p]-=paid;state.debt[p]=0;effects.settled[p]+=paid;
      events.push(`${label(p)}再次受伤，结清待结伤势${oldDebt}（实际追加扣血${paid}）`);
    }
    return damage;
  }
  function outcome(finished=false,winner=null){
    if(finished){effects.burnSkipped=startBurn.some(Boolean)&&!effects.burnDamage.some(Boolean);clearCombatStatuses(state);}
    else for(const p of [0,1])if(CARD[state.cards[p]].id==='jinzong'){
      if(battle.hp[p]>60&&state.hp[p]<=60)events.push(`${label(p)}剩余HP降至${state.hp[p]}，绝境效果生效`);
      if(battle.hp[p]<=60&&state.hp[p]>60)events.push(`${label(p)}回血高于60，绝境效果解除`);
    }
    return {state,finished,winner,text:text+(events.length?'；'+events.join('；'):''),events,effects,breakdown};
  }
  function revive(p){
    if(state.hp[p]!==0||!state.reviveWard[p])return false;
    state.reviveWard[p]=false;state.reviveUsed[p]=true;
    state.hp[p]=Math.floor(CARD[state.cards[p]].hp/2);
    effects.reviveTriggered[p]=true;effects.reviveHealing[p]=state.hp[p];
    events.push(`${label(p)}回生伏印触发，HP恢复至最大HP的50%（${state.hp[p]}），致命伤溢出不再扣除`);
    return true;
  }
  // DoT is checked only after the complete simultaneous batch; double zero stays a draw.
  // A successful revival resumes the original action, never replays its damage.
  function deathOutcome(){
    const dead=state.hp.map(h=>h===0);
    if(!dead.some(Boolean))return null;
    if(dead.every(Boolean))return outcome(true,null);
    const fallen=dead[0]?0:1,target=1-fallen;
    if(revive(fallen))return null;
    if(state.deathWard[fallen]>0){
      const power=state.deathPower[fallen],blocked=Math.min(power,state.shield[target]);
      state.deathWard[fallen]=0;effects.deathTriggered[fallen]=true;
      if(state.shield[target]){state.shield[target]=0;events.push(`${label(target)}的护盾抵消殒爆${blocked}伤害，已消耗`);}
      effects.deathDamage[target]=receiveDamage(target,Math.max(0,power-blocked),true);
      events.push(`${label(fallen)}伏印触发，殒爆${power}，${label(target)}实际直接受伤${effects.deathDamage[target]}`);
      revive(target);
    }
    return outcome(true,state.hp[target]===0?null:target);
  }
  function actionEnd(){
    // Snapshot eligibility: newly applied damage waits; existing refreshed damage still ticks.
    for(const p of [0,1])if(startBurn[p]){
      effects.burnDamage[p]=receiveDamage(p,15);state.burn[p]--;
      events.push(`${label(p)}受到${effects.burnDamage[p]}烙印伤害，${state.burn[p]?`剩余${state.burn[p]}次双方行动`:'烙印已结束'}`);
    }
    const death=deathOutcome();if(death)return death;
    for(const p of [0,1])if(startWard[p]>0&&state.deathWard[p]>0){
      state.deathWard[p]--;events.push(state.deathWard[p]?`${label(p)}伏印剩余${state.deathWard[p]}次双方行动`:`${label(p)}伏印到期，本局不能重新挂印`);
    }
    if(waiting){
      state.prediction[other]=null;
      if(waiting!=='hidden'){
        const correct=waiting===action.type;
        if(correct)state.foresight[other]=30;
        events.push(`${label(other)}揭晓预判${waiting==='attack'?'进攻':'撤退'}，对方实际${action.type==='attack'?'进攻':'撤退'}，${correct?'猜中：下次进攻＋30':'未猜中'}`);
      }
    }
    return outcome();
  }
  if(action.type==='retreat'){
    state.remaining[player]--;text=`选择撤退，剩余撤退点数 ${state.remaining[player]}`;
    return state.remaining[player]===0?outcome(true,null):actionEnd();
  }
  const skill=CARD[state.cards[player]].skills[action.skill];let bonus=0;
  const blood=twinBloodBonus(state,player,skill);
  if(blood){bonus+=blood;events.push(`${skill.effect==='twin-healthy'?'对方HP高于半血，扬锋':'对方HP不高于半血，伏锋'}优势生效，伤害＋${blood}`);}
  if(skill.effect==='revive-ward')state.reviveUsed[player]=true;
  const pursuit=pursuitBonus(state,player,skill);
  if(pursuit){bonus+=pursuit;events.push(`${label(other)}剩余撤退为1，封路追击伤害＋${pursuit}`);}
  if(state.wind[player]>=0){bonus+=state.wind[player]*25;events.push(`${label(player)}释放逆风蓄势${state.wind[player]}层，伤害＋${state.wind[player]*25}，旧蓄势结束`);state.wind[player]=-1;}
  if(state.foresight[player]){bonus+=state.foresight[player];events.push(`${label(player)}消耗预判成功增益，伤害＋${state.foresight[player]}`);state.foresight[player]=0;}
  if(skill.effect==='burst'&&state.charge[player]){bonus=skill.amount;state.charge[player]=false;events.push(`${label(player)}的蓄势已消耗，伤害＋${bonus}`);}
  if(skill.effect==='desperate'&&state.hp[player]<=60){bonus=skill.amount-skill.damage;events.push(`${label(player)}的绝境反扑生效，伤害改为${skill.amount}`);}
  if(skill.effect==='echo'){
    bonus=Math.min(skill.amount,Math.floor(state.echo[player]/2));
    if(state.echo[player])events.push(`${label(player)}的回响记录${state.echo[player]}已消耗，伤害＋${bonus}`);
    state.echo[player]=0;
  }
  if(skill.effect==='bite'&&state.mark[other]===player){bonus=skill.amount;state.mark[other]=null;events.push(`${label(other)}的晶痕已消耗，猛咬伤害＋${bonus}`);}
  if(skill.effect==='root-strike'&&state.root[player]){bonus=skill.amount;state.root[player]--;events.push(`${label(player)}消耗1次根劲，伤害＋${bonus}，剩余${state.root[player]}次`);}
  const die=skill.effect==='dice'?action.die:1;
  if(!Number.isInteger(die)||die<1||die>6)throw new Error('掷骰伤害需要有效的最终骰点');
  const raw=skill.damage*die+bonus,elementMultiplier=twinDamageMultiplier(skill,CARD[state.cards[other]].element),multiplier=state.weaken[player]?0.75:1,afterReduction=Math.floor(raw*elementMultiplier*multiplier);
  if(elementMultiplier!==1)events.push(`双生属性倍率×${elementMultiplier}`);
  if(state.weaken[player]){state.weaken[player]--;events.push(`${label(player)}进攻被削弱25%，${raw}→${afterReduction}，剩余${state.weaken[player]}次`);}
  const blocked=Math.min(afterReduction,state.shield[other]);
  if(state.shield[other]){state.shield[other]=0;events.push(`${label(other)}的护盾抵消${blocked}伤害，已消耗`);}
  const damage=receiveDamage(other,Math.max(0,afterReduction-blocked),true);
  const directDeferred=effects.deferred[other],directSettled=effects.settled[other];
  breakdown={base:skill.damage,die,bonus,raw,elementMultiplier,multiplier,afterReduction,blocked,damage,directDeferred,directSettled,directLethal:state.hp[other]===0};text=`${skill.name}造成 ${damage} 伤害（直接）`;
  if(state.hp[other]===0){const death=deathOutcome();if(death){effects.directEnded=true;return death;}}
  if(CARD[state.cards[other]].id==='mingnang'&&damage>0){const old=state.echo[other];state.echo[other]=damage;events.push(`${label(other)}回响记录${old?'由'+old+'更新为':'为'}${damage}`);}
  if(skill.effect==='twin-shift'){
    const old=CARD[state.cards[player]].name,partner=TWIN_PARTNERS[state.cards[player]];
    state.cards[player]=partner;
    state.instances=[...(state.instances??[null,null])];state.instances[player]=state.twinPairs[player][partner];
    effects.transformed={player,from:battle.cards[player],to:partner,instanceId:state.instances[player].id};
    events.push(`${old}转换为${CARD[partner].name}，继承全部战斗状态；战败将失去${CARD[partner].name}`);
  }
  if(skill.effect==='heal'){effects.healing=Math.min(skill.amount,CARD[state.cards[player]].hp-state.hp[player]);state.hp[player]+=effects.healing;text+=`，自己恢复 ${effects.healing} HP`;}
  if(skill.effect==='delay'){effects.delay=Math.max(0,Math.min(skill.amount,CARD[state.cards[other]].retreat+2-state.remaining[other]));state.remaining[other]+=effects.delay;text+=`，对方剩余撤退 +${effects.delay}`;}
  if(skill.effect==='charge'){events.push(state.charge[player]?`${label(player)}已蓄势，不叠加`:`${label(player)}获得蓄势：裂风突袭＋${skill.amount}`);state.charge[player]=true;}
  if(skill.effect==='shield'){events.push(`${label(player)}${state.shield[player]?'保持':'获得'}护盾${skill.amount}，不叠加`);state.shield[player]=skill.amount;}
  if(skill.effect==='burn'){events.push(`${label(other)}${state.burn[other]?'刷新':'获得'}余烬烙印：之后2次任一方行动末各受15伤害，不叠加`);state.burn[other]=2;}
  if(skill.effect==='mark'){events.push(state.mark[other]===player?`${label(other)}已有晶痕，不叠加`:`${label(other)}获得来自${label(player)}的晶痕`);state.mark[other]=player;}
  if(skill.effect==='weaken'){events.push(`${label(other)}${state.weaken[other]?'刷新':'获得'}攻击削弱25%：之后2次进攻，不叠加`);state.weaken[other]=2;}
  if(skill.effect==='root'){
    if(state.root[player])events.push(`${label(player)}已有${state.root[player]}次根劲，不刷新、不再增加撤退`);
    else if(state.remaining[player]>=CARD[state.cards[player]].retreat+2)events.push(`${label(player)}剩余撤退已达5，无法蓄能`);
    else{state.remaining[player]++;effects.ownRetreatAdded=1;state.root[player]=2;events.push(`${label(player)}剩余撤退＋1至${state.remaining[player]}，获得2次根劲`);}
  }
  if(skill.effect==='seal'){
    if(startDebt){state.debt[player]=0;effects.cancelled[player]=startDebt;events.push(`${label(player)}取消待结伤势${startDebt}，本次不获得封伤保护`);}
    else if(startSeal)events.push(`${label(player)}已有封伤保护，不叠加、不刷新`);
    else{state.seal[player]=true;events.push(`${label(player)}获得封伤保护：下次直接伤害暂存50%，最多30`);}
  }
  if(skill.effect==='wind'){state.wind[player]=0;events.push(`${label(player)}进入逆风蓄势0层`);}
  if(skill.effect==='predict'){
    if(state.prediction[player])events.push(`${label(player)}保留原秘密预判，不改选、不叠加`);
    else{state.prediction[player]=action.prediction??'attack';events.push(`${label(player)}封存秘密预判，等待对方下一次行动后揭晓`);}
  }
  if(skill.effect==='death-ward'){
    if(state.deathUsed[player])events.push(`${label(player)}本局挂印资格已用，只造成基础伤害，不刷新伏印`);
    else{state.deathUsed[player]=true;state.deathWard[player]=2;state.deathPower[player]=skill.amount;events.push(`${label(player)}获得伏印：当次行动末立即有效，随后2次双方行动，殒爆${skill.amount}；本局挂印资格已用`);}
  }
  if(skill.effect==='revive-ward'){state.reviveWard[player]=true;events.push(`${label(player)}获得回生伏印：待触发，立即生效；本场施放资格已用`);}
  return actionEnd();
}
export function previewSkill(battle,player,skillIndex,die=null){
  if(CARD[battle.cards[player]].skills[skillIndex].effect==='dice'&&die===null){
    const outcomes=[1,2,3,4,5,6].map(n=>previewSkill(battle,player,skillIndex,n));
    return {random:true,outcomes,minDamage:Math.min(...outcomes.map(r=>r.damage)),maxDamage:Math.max(...outcomes.map(r=>r.damage))};
  }
  const other=1-player,skill=CARD[battle.cards[player]].skills[skillIndex],r=resolveCombatAction(battleForViewer(battle,player),player,{type:'attack',skill:skillIndex,...(die===null?{}:{die})});
  const directLethal=r.breakdown.directLethal;
  return {reviveTriggered:r.effects.reviveTriggered,reviveHealing:r.effects.reviveHealing,transformed:r.effects.transformed??null,deferred:r.effects.deferred,settled:r.effects.settled,cancelled:r.effects.cancelled,deathDamage:r.effects.deathDamage,deathTriggered:r.effects.deathTriggered,damage:r.breakdown.damage,healing:r.effects.healing,delay:r.effects.delay,targetHp:r.state.hp[other],ownHp:r.state.hp[player],targetRetreat:r.state.remaining[other],ownRetreat:r.state.remaining[player],ownRetreatAdded:r.effects.ownRetreatAdded,burnDamage:r.effects.burnDamage,burnSkipped:r.effects.burnSkipped,selfDefeat:r.finished&&r.winner===other,draw:r.finished&&r.winner===null,lethal:r.finished&&r.winner===player,effectSkipped:r.effects.directEnded&&['revive-ward','heal','delay','charge','shield','burn','mark','weaken','root','seal','wind','predict','twin-shift','death-ward'].includes(skill.effect),events:r.events,breakdown:r.breakdown};
}

export function combatOutcomes(battle,player,action){
  const dice=action.type==='attack'&&CARD[battle.cards[player]].skills[action.skill].effect==='dice'&&action.die===undefined;
  return dice?[1,2,3,4,5,6].map(die=>resolveCombatAction(battle,player,{...action,die})):[resolveCombatAction(battle,player,action)];
}
export function expectedCombatScore(battle,player,action,score){
  const results=combatOutcomes(battle,player,action),values=results.map(score),mean=values.reduce((a,b)=>a+b,0)/values.length;
  return values.length===1?mean:values.reduce((sum,v)=>sum+Math.max(v,mean),0)/6;
}
export function immediateCombatScore(battle,player,result){
  if(result.finished)return result.winner===player?100000:result.winner===null?0:-100000;
  return battle.hp[1-player]-result.state.hp[1-player]+result.state.hp[player]-battle.hp[player]+combatStatusValue(result.state,player)-combatStatusValue(battle,player);
}
export function simpleDiceChoice(battle,player){
  const pending=battle.dicePending,action={type:'attack',skill:pending.skill};
  const keep=resolveCombatAction(battleForViewer(battle,player),player,{...action,die:pending.first});
  const score=r=>immediateCombatScore(battle,player,r);
  const reroll=combatOutcomes(battleForViewer(battle,player),player,action).reduce((sum,r)=>sum+score(r),0)/6;
  return score(keep)>=reroll?'dice-keep':'dice-reroll';
}
