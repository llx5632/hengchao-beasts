import { CARD, BEATS, METRICS, POINT_NUMBERS, pointMetricIndex } from './data.js';
import { tutorialGuidance, tutorialPointTarget } from './tutorial.js';

const button=(label,type,attrs='',secondary=false)=>`<button class="btn ${secondary?'ghost':''}" data-action="tutorial-${type}" ${attrs}>${label}</button>`;
const hands={rock:'石头',paper:'布',scissors:'剪刀'};
function pointExplanation(comparison,preview=false) {
  if(!comparison)return '';
  const {numbers,sum,metric,values}=comparison;
  const relation=values?values[0]===values[1]?'＝':values[0]>values[1]?'＞':'＜':null;
  return `<div class="tutorial-point-formula" role="status"><small>${preview?'教学预演 · AI出点固定':'本次出点已揭晓'} · 你出${numbers[0]}，AI出${numbers[1]}</small><strong>${numbers[0]}＋${numbers[1]}＝${sum}<span aria-hidden="true"> → </span>${metric===null?'双零亮牌，用原卡重比':`第${metric+1}项 · ${METRICS[metric].name}`}</strong>${sum>METRICS.length?`<span>总和${sum}超过6，从第1项重新数，对应第${metric+1}项。</span>`:''}${values?`<span>你 ${values[0]}${METRICS[metric].unit} ${relation} AI ${values[1]}${METRICS[metric].unit}${preview?'':values[0]===values[1]?' · 数值相同，亮牌重比':values[0]>values[1]?' · 你赢下本小局':' · AI赢下本小局'}</span>`:''}${metric===null?'<span>总和0不对应比较项目，不消耗当前卡，也不转移谱印。</span>':''}</div>`;
}
export function renderTutorial(state,face) {
  const m=state.match,guide=tutorialGuidance(state),lesson=['attribute','battle','point'].indexOf(state.lesson);
  const result=['point-tie','round-result'].includes(m.phase)?m.point?.comparisons.at(-1):null;
  const target=m.phase==='point'?tutorialPointTarget(state):null;
  const preview=target===null?null:{numbers:[target,target===0?0:1],sum:target===0?0:target+1,metric:pointMetricIndex(target===0?0:target+1)};
  if(preview&&preview.metric!==null&&m.point.revealed)preview.values=m.point.cards.map(c=>METRICS[preview.metric].read(CARD[c.cardId]));
  const focusMetric=(preview??result)?.metric??null;
  const figure=(c,detail='')=>`<figure class="tutorial-beast">${face(c)}<figcaption><strong>${c.name}</strong><span><b class="tutorial-element">${c.element}属性</b> · ${c.tier} · HP ${c.hp}</span>${detail}</figcaption></figure>`;
  const battleBoard=()=>`<div class="tutorial-board">${m.battle.cards.map((id,p)=>{const c=CARD[id],last=m.battle.last,showChange=last&&(m.phase==='battle-turn'||m.status==='finished');
    const vital=(label,key,max='')=>{const before=showChange?last.before[key][p]:m.battle[key][p],after=m.battle[key][p],changed=before!==after;return `<span class="${changed?'tutorial-vital-changed':''}">${label}<b>${changed?`<span class="tutorial-before">${before}</span> → `:''}${after}${max}</b></span>`;};
    return `<section class="tutorial-side"><h3>${p===0?'你':'教学 AI'}</h3>${figure(c)}<div class="tutorial-vitals">${vital('剩余 HP','hp',` / ${c.hp}`)}${vital('剩余撤退','remaining')}</div></section>`;}).join('')}</div>`;
  const pointBoard=()=>`<div class="tutorial-board">${m.point.cards.map((i,p)=>`<section class="tutorial-side"><h3>${p===0?'你的当前卡':'AI的当前卡'}</h3>${p===0||m.point.revealed||['round-result','finished'].includes(m.phase)?figure(CARD[i.cardId]):'<div class="hidden-card tutorial-hidden"><span class="crest">✦</span><p>尚未亮牌</p><small>先根据公开阵容判断</small></div>'}</section>`).join('')}</div>`;
  const metrics=()=>`<section class="tutorial-point-map" aria-label="点数总和与比较项目"><p>双方各出0～6，<strong>相加后决定比较项目</strong>。总和1～6依次对应六项，超过6就从第1项重新数。</p><div class="tutorial-metrics">${METRICS.map((metric,i)=>`<div class="${i===focusMetric?'tutorial-metric-focus':''}" ${i===focusMetric?'aria-current="true"':''}><small>总和 ${i+1} / ${i+1+METRICS.length}</small><b>第${i+1}项</b><span>${metric.name}</span></div>`).join('')}</div><p class="tutorial-zero-note">特别情况：0＋0＝0 → 双零亮牌，用原卡重新选点。</p></section>`;
  let content='',actions='';
  if(m.phase==='select'){
    content=`<div class="tutorial-selection ${m.mode==='point'?'tutorial-five':''}">${m.inventories[0].map(i=>`<div class="tutorial-pick ${state.draft.includes(i.id)?'is-selected':''}">${figure(CARD[i.cardId])}${button(state.draft.includes(i.id)?`✓ 已选择${CARD[i.cardId].name}`:`选择${CARD[i.cardId].name}`,'choose',`data-instance="${i.id}" aria-pressed="${state.draft.includes(i.id)}"`)}</div>`).join('')}</div>`;
    actions=`<span>已选 ${state.draft.length} / ${m.mode==='point'?5:1} 张</span>${button('封存出战卡','submit',state.draft.length===(m.mode==='point'?5:1)?'':'disabled')}`;
  }else if(m.phase==='lineup-reveal'){
    content=m.lineups.map((cards,p)=>`<section class="tutorial-roster"><h3>${p===0?'你':'教学 AI'}的公开阵容</h3><div class="tutorial-five">${cards.map(i=>figure(CARD[i.cardId])).join('')}</div></section>`).join('');
    actions=button('已观察阵容，确认并洗牌','ready');
  }else if(m.mode==='battle'){
    content=battleBoard();
    const [own,opponent]=m.battle.cards.map(id=>CARD[id]),hasAdvantage=BEATS[own.element]===opponent.element;
    content+=`<div class="tutorial-near-note"><strong>${hasAdvantage?`${own.element}克${opponent.element} → 直接获胜`:`${own.element}与${opponent.element}互不克制 → 猜拳争取行动权`}</strong><span>${hasAdvantage?'属性克制优先判胜，不比较HP或阶位。':'猜拳胜者本次可进攻一次，或让自己的剩余撤退减1。'}</span></div>`;
    if(m.phase==='rps')content+=`<div class="tutorial-rps"><p>这次练习请出石头</p><div class="options">${Object.entries(hands).map(([value,label])=>button(label,'rps',`data-value="${value}" ${value==='rock'?'':'disabled'}`)).join('')}</div></div>`;
    else if(m.phase==='rps-result'){
      content+=`<div class="tutorial-outcome" role="status">你出${hands[m.rps[0]]} · AI出${hands[m.rps[1]]}<strong>${m.battle.actor===0?'你赢得':'AI赢得'}一次行动权</strong></div>`;
      actions=button('查看本次行动','next');
    }else if(m.phase==='battle-action'){
      if(m.battle.actor===1)actions=`<div class="tutorial-action-hint"><strong>潮壳冲撞 · 35伤害</strong><span>你的HP：${m.battle.hp[0]} → ${m.battle.hp[0]-35}。观察自己卡牌下方的变化。</span></div>`+button('观察AI使用潮壳冲撞','next');
      else if(state.turn===0)actions=`<div class="tutorial-action-hint"><strong>绒爪拍击 · 20伤害</strong><span>AI的HP：${m.battle.hp[1]} → ${m.battle.hp[1]-20}。攻击后需要重新猜拳。</span></div>`+button('使用绒爪拍击 · 20伤害','attack','data-skill="0"');
      else actions=`<div class="tutorial-action-hint"><strong>本次撤退：剩余1 → 0，平局保留谱印</strong><span>每次先赢得行动权，才能撤退一步（剩余撤退减1）；降到0才成功。例如剩余3时，本次只能3 → 2，还要再争取行动权继续撤退。</span><span>撤退与投降不同：投降会判负，失去当前出战谱印。</span></div>`+button('选择撤退 · 剩余1 → 0','retreat');
    }else if(m.phase==='battle-turn'){
      const last=m.battle.last;
      content+=`<div class="tutorial-outcome" role="status"><strong>${last.text}</strong><span>本次HP变化已标在受击卡牌下方；接下来重新猜拳。</span></div>`;
      actions=button('进入下一轮猜拳','next');
    }else if(m.status==='finished'){
      content+=`<div class="tutorial-outcome" role="status"><strong>${m.reason}</strong><span>${m.winner===0?'本次练习获胜；正式对局会赢得对方出战谱印。':'本次平局，双方保留出战谱印。'}</span></div>`;
      if(state.lesson==='battle')content+='<p class="tutorial-retreat-reminder">苔团本次只需撤退一步，因为剩余撤退原本为1。其他卡可能需要多次争得行动权，逐步撤退到0。</p>';
      actions=button(state.lesson==='attribute'?'开始第二场：进攻与撤退':'开始拼点教学','next');
    }else actions=button('开始猜拳','next');
  }else if(m.phase==='between'){
    content=`<div class="tutorial-interlude"><span class="crest">✦</span><h3>第 ${m.round+1} / 5 小局</h3><p>先决定继续，再查看本次自己的卡牌。</p></div>`;
    actions=button('继续本小局','continue');
  }else{
    content=pointBoard();
    if(m.point?.revealed||result?.values)content+=`<div class="tutorial-table-scroll"><table class="tutorial-comparison"><caption>当前卡牌的六项静态数值</caption><thead><tr><th>项目</th>${m.point.cards.map(c=>`<th>${CARD[c.cardId].name}</th>`).join('')}</tr></thead><tbody>${METRICS.map((metric,i)=>`<tr class="${i===focusMetric?'tutorial-metric-focus':''}"><th>${metric.name}</th>${m.point.cards.map(c=>`<td>${metric.read(CARD[c.cardId])}${metric.unit}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    content+=metrics()+pointExplanation(preview??result,!!preview);
    if(m.phase==='point'){
      const target=tutorialPointTarget(state);
      content+=`<div class="options points tutorial-points" aria-label="选择教程点数">${POINT_NUMBERS.map(n=>button(String(n),'point',`data-value="${n}" ${target!==null&&target!==n?'disabled':''}`)).join('')}</div>`;
    }else if(m.phase==='point-tie')actions=button('亮牌后重新选点','next');
    else if(m.phase==='round-result'){
      const r=m.rounds.at(-1),comparison=r.comparison;
      content+=`<div class="tutorial-outcome" role="status"><strong>${r.kind==='same'?'同卡跳过':r.winner===0?'你赢下本小局':'教学AI赢下本小局'}</strong>${comparison?`<span>${METRICS[comparison.metric].name}：${comparison.values[0]} 对 ${comparison.values[1]}</span><span>本次出点：你 ${comparison.numbers[0]} · AI ${comparison.numbers[1]}</span>`:''}<span>已完成 ${m.round} / 5 小局 · 你的胜场 ${m.scores[0]}，AI ${m.scores[1]}</span></div>`;
      actions=button('完成教程，进入对局大厅','complete')+button(m.round===5?'查看五小局结果':'继续练习剩余小局','next','',true);
    }else actions=button('完成教程，进入对局大厅','complete');
  }
  return `<header class="tutorial-top"><a class="tutorial-brand" href="#" data-action="tutorial-pause">✦ 衡潮群岛</a><span>新手教程 · 独立练习</span>${button('稍后继续','pause','',true)}</header><main class="tutorial-wrap"><nav class="tutorial-progress" aria-label="教学进度">${['属性克制','进攻与撤退','拼点强弱项'].map((name,i)=>`<span class="${i===lesson?'current':i<lesson?'done':''}" ${i===lesson?'aria-current="step"':''}><b>${String(i+1).padStart(2,'0')}</b>${name}</span>`).join('')}</nav><section class="tutorial-guide" aria-labelledby="tutorial-heading"><div class="eyebrow">群岛探索入门 · 第 ${lesson+1} / 3 课</div><h1 id="tutorial-heading" tabindex="-1">${guide.title}</h1><p>${guide.text}</p><small>练习中的卡牌、出拳和部分点数固定；练习赢失卡不计入正式收藏。</small></section><section class="tutorial-play" aria-label="教学对局">${content}</section>${actions?`<div class="tutorial-actions">${actions}</div>`:''}</main>`;
}
