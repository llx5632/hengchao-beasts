import { RPS_CHOICES } from './ui.js';
import { statusFeedback } from './status-feedback.js';

export const EFFECT_FILES = Object.freeze({
  reveal:'sfx-reveal.wav', advantage:'sfx-advantage.wav', hit:'sfx-hit.wav',
  block:'sfx-block.wav', heal:'sfx-heal.wav', win:'sfx-win.wav',
  'point-numbers':'sfx-point-numbers.wav',
  'point-metric':'sfx-point-metric.wav',
  'point-values':'sfx-point-values.wav',
  'point-result-1':'sfx-point-result-1.wav',
  'point-result-2':'sfx-point-result-2.wav',
  'point-result-3':'sfx-point-result-3.wav',
  'point-tie':'sfx-point-tie.wav',
  retreat:'sfx-retreat.wav', victory:'sfx-win.wav',
  defeat:'sfx-defeat.wav', draw:'sfx-draw.wav',
  shuffle:'sfx-shuffle.wav',
  'status-guard':'sfx-status-guard.wav',
  'status-charge':'sfx-status-charge.wav',
  'status-harm':'sfx-status-harm.wav',
});

const REVEAL_DURATION = 132; // The metal strike begins 132 ms into the WAV.
const RPS_ROLL_DURATION = 420;
const FEEDBACK_CARD = '[data-tutorial-card], .played-card, .combat-card';
const INTERACTION_SOUNDS = {
  select:{duration:0.09,from:580,to:760,texture:0.14},
  deselect:{duration:0.075,from:480,to:370,texture:0.12},
  inspect:{duration:0.16,from:280,to:240,texture:0.90},
  commit:{duration:0.08,from:430,to:390,texture:0.28},
};
const RESULT_STEPS = {
  'rps-hands':{part:'choices',gap:200,tone:{duration:0.135,from:520,to:430,texture:0.60}},
  'rps-win':{part:'outcome',gap:0,tone:{duration:0.25,from:625,to:780,texture:0.08}},
  'rps-tie':{part:'outcome',gap:0,tone:{duration:0.22,from:510,to:490,texture:0.12}},
  'point-numbers':{part:'choices',gap:1000},
  'point-metric':{part:'metric',gap:1000},
  'point-values':{part:'values',gap:1000},
};

function interactionBuffer(context, {duration,from,to,texture}) {
  const buffer = context.createBuffer(1,Math.round(context.sampleRate*duration),context.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 27, smooth = 0;
  for (let i=0;i<samples.length;i++) {
    const t = i/context.sampleRate;
    const progress = t/duration;
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
    const noise = seed/0x100000000*2-1;
    smooth += 0.22*(noise-smooth);
    const phase = 2*Math.PI*(from*t+(to-from)*t*progress/2);
    const shape = Math.min(1,t/0.006)*(1-progress)**3;
    samples[i] = shape*(0.38*Math.sin(phase)+0.09*Math.sin(phase*2.13)+texture*smooth);
  }
  return buffer;
}

export function matchFeedback(before, after) {
  if (!before || !after || before.mode !== after.mode || before.phase === after.phase) return [];
  const cues = [];
  if(after.mode==='point'&&before.phase==='select'&&after.phase==='lineup-reveal')cues.push({kind:'seal'});
  if(after.mode==='point'&&before.phase==='lineup-reveal'&&after.phase==='between')cues.push({kind:'shuffle'});
  if (after.mode === 'battle' && !before.battle && after.battle) {
    cues.push({kind:'reveal'});
    if (after.transfers.at(-1)?.reason === '属性克制') cues.push({kind:'advantage',p:after.winner});
  }
  if (after.mode === 'battle' && ['rps-result','rps-tie'].includes(after.phase)) {
    cues.push({kind:'rps-hands'}, after.phase==='rps-tie'
      ? {kind:'rps-tie'} : {kind:'rps-win',p:after.battle.actor});
    const statuses=statusFeedback(before.battle,after.battle);
    if(statuses.length)cues.at(-1).gap=300;
    cues.push(...statuses);
  }
  if (after.mode === 'battle' && ['battle-turn','finished'].includes(after.phase)) {
    cues.push(...(after.battle?.last?.feedback ?? []));
  }
  if (after.mode === 'point' && ['point-tie','round-result'].includes(after.phase)) {
    const newRound = before.point?.index !== after.point?.index;
    if (newRound || !before.point?.revealed) cues.push({kind:'reveal',gap:360});
    const comparison = after.point?.comparisons.at(-1);
    if (comparison) {
      cues.push({kind:'point-numbers'});
      if (comparison.values) cues.push({kind:'point-metric'});
      if (comparison.values) cues.push({kind:'point-values'});
      cues.push({kind:'point-result',tie:after.phase==='point-tie'});
    }
  }
  const awards = after.transfers.slice(before.transfers.length);
  if(after.status==='finished'&&before.status!=='finished'){
    const escaped=cues.some(cue=>cue.kind==='retreat'&&cue.escaped);
    cues.push({kind:after.winner===null?'draw':after.winner===0?'victory':'defeat',p:after.winner,escaped,terminal:true});
  }else if (awards.length) {
    const winner = awards[0].to;
    cues.push({kind:'win',p:winner,audible:winner === 0&&!(after.mode==='point'&&after.round===5)});
  }
  if(awards.length){
    const cue=cues.at(-1);
    cue.transfer=true;
    cue.countsBefore=before.inventories.map(cards=>cards.length);
    cue.countsAfter=after.inventories.map(cards=>cards.length);
  }
  return cues;
}

export function pointResultDelay(cues){
  let delay=0;
  for(const cue of cues){
    if(cue.kind==='point-result')return delay;
    delay+=cue.gap??RESULT_STEPS[cue.kind]?.gap??0;
  }
  return null;
}
export const POINT_RESULT_PULSE_MS=1200;

export function createFeedbackPlayer(root) {
  let context, revision=0;
  const audio = new Map(), clicks = new Map(), playing = new Set(), timers = new Set(), bars = new Map();
  const resultAnimations = new Set();
  const hiddenOutcomes = new Set();
  const transientNodes = new Set();
  const pendingCounts = new Map();

  function settleCounts(cue){
    cue.countsAfter?.forEach((count,p)=>{
      const node=root.querySelector(`[data-card-count="${p}"]`);
      if(!node)return;
      node.textContent=count;
      pendingCounts.delete(node);
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
        const animation=node.animate([{backgroundColor:'#dec27b',transform:'scale(1.18)'},{backgroundColor:'transparent',transform:'none'}],{duration:280});
        resultAnimations.add(animation);
      }
    });
  }

  function flyTransfer(cue){
    const origin=root.querySelector(`[data-feedback-side="${1-cue.p}"] img`);
    const target=root.querySelectorAll('.scoreboard .player')[cue.p];
    if(!origin||!target){settleCounts(cue);return;}
    const from=origin.getBoundingClientRect(),to=target.getBoundingClientRect();
    const token=document.createElement('img');
    token.src=origin.src;
    token.alt='';
    token.className='transfer-token';
    token.style.left=`${from.left+from.width/2-32}px`;
    token.style.top=`${from.top+from.height/2-48}px`;
    token.setAttribute('aria-hidden','true');
    document.body.append(token);
    transientNodes.add(token);
    const animation=token.animate([
      {transform:'translate(0,0) scale(1)',opacity:1},
      {transform:`translate(${to.left+to.width/2-from.left-from.width/2}px,${to.top+to.height/2-from.top-from.height/2}px) scale(.35)`,opacity:.25},
    ],{duration:560,easing:'ease-in-out'});
    resultAnimations.add(animation);
    animation.onfinish=()=>{token.remove();transientNodes.delete(token);settleCounts(cue);};
  }

  function stopAudio() {
    for (const source of playing) source.stop();
    playing.clear();
  }

  function unlock() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) return;
    try {
      context ??= new Audio();
      void context.resume().catch(() => {});
      for (const [kind,file] of Object.entries(EFFECT_FILES)) {
        if (audio.has(kind)) continue;
        audio.set(kind,null);
        void fetch(new URL(file,import.meta.url))
          .then(response => {
            if (!response.ok) throw new Error('音效资源加载失败');
            return response.arrayBuffer();
          })
          .then(bytes => context.decodeAudioData(bytes))
          .then(buffer => audio.set(kind,buffer))
          .catch(() => audio.delete(kind));
      }
    } catch {
      // Visual feedback is still available when audio cannot be initialized.
    }
  }

  function playBuffer(buffer, level) {
    if (!buffer || context.state !== 'running') return;
    const source = context.createBufferSource();
    const volume = context.createGain();
    source.buffer = buffer;
    volume.gain.value = level;
    source.connect(volume).connect(context.destination);
    playing.add(source);
    source.onended = () => {
      playing.delete(source);
      source.disconnect();
      volume.disconnect();
    };
    source.start();
  }

  function later(action, delay) {
    if (!delay) { action(); return; }
    const timer = setTimeout(() => {timers.delete(timer); action();},delay);
    timers.add(timer);
  }

  function playTone(kind, spec, isEnabled, level) {
    if (!context || !isEnabled()) return;
    if (!clicks.has(kind)) clicks.set(kind,interactionBuffer(context,spec));
    const buffer=clicks.get(kind);
    if (context.state==='running') {
      playBuffer(buffer,level);
      return;
    }
    const started=performance.now(), request=revision;
    void context.resume().then(()=>{
      if(request===revision&&performance.now()-started<90&&!document.hidden&&isEnabled())playBuffer(buffer,level);
    }).catch(()=>{});
  }

  function animateResult(cue, step, delay) {
    const animate = (element, frames, duration, fill='none') => {
      const animation=element.animate(frames,{duration,delay,fill,easing:'ease-out'});
      resultAnimations.add(animation);
      animation.onfinish=()=>resultAnimations.delete(animation);
    };
    const keyframes = [
      {opacity:delay&&cue.kind!=='rps-hands' ? .28 : 1,backgroundColor:'transparent'},
      {opacity:1,backgroundColor:'#dcbc743d',offset:.45},
      {opacity:1,backgroundColor:'transparent'},
    ];
    for(const element of root.querySelectorAll(`[data-reveal-step="${step.part}"]`)){
      animate(element,keyframes,360,'backwards');
    }
    if(cue.kind==='rps-win'){
      const hand=root.querySelector('.rps-hand.rps-winner');
      if(hand)animate(hand,[
        {backgroundColor:'#eee8d9',borderColor:'var(--line)',boxShadow:'none'},
        {backgroundColor:'#e1eadc',borderColor:'#7d9970',boxShadow:'inset 0 0 0 1px #7d9970'},
      ],360,'backwards');
    }
    if(cue.p===0||cue.p===1){
      const side=root.querySelector(`[data-feedback-side="${cue.p}"]`);
      const card=side?.querySelector(FEEDBACK_CARD);
      if(card)animate(card,[
        {boxShadow:'0 0 0 2px #b68434,0 0 14px #bc873c80'},
        {boxShadow:'0 0 0 0 transparent'},
      ],560);
    }
  }

  function rollHands() {
    const hands=Object.values(RPS_CHOICES), frames=hands.length*2;
    for(const [seat,window] of [...root.querySelectorAll('[data-rps-roll]')].entries()){
      const result=window.querySelector('.rps-face');
      const roller=document.createElement('div');
      roller.className='rps-roller';
      roller.setAttribute('aria-hidden','true');
      for(let i=0;i<frames;i++){
        const {label,symbol}=hands[(i+seat)%hands.length];
        const frame=document.createElement('div');
        const icon=document.createElement('span');
        frame.className='rps-face';
        icon.className='rps-face-icon';
        icon.textContent=symbol;
        frame.append(icon,label);
        roller.append(frame);
      }
      window.append(roller);
      const cover=result.animate([{opacity:0},{opacity:0}],RPS_ROLL_DURATION);
      const motion=roller.animate([{transform:'translateY(0)'},{transform:`translateY(-${frames*100}%)`}],
        {duration:RPS_ROLL_DURATION,easing:`steps(${frames},end)`});
      resultAnimations.add(cover);
      resultAnimations.add(motion);
      cover.onfinish=()=>resultAnimations.delete(cover);
      motion.onfinish=motion.oncancel=()=>{
        roller.remove();
        resultAnimations.delete(motion);
      };
    }
  }

  function flipCard(face) {
    const back = document.createElement('span');
    back.className = 'feedback-flip-back';
    back.setAttribute('aria-hidden','true');
    back.textContent = '✦';
    face.append(back);
    face.animate([
      {transform:'perspective(620px) rotateY(0deg)',offset:0,easing:'ease-in'},
      {transform:'perspective(620px) rotateY(-90deg)',offset:0.48},
      {transform:'perspective(620px) rotateY(90deg)',offset:0.481,easing:'ease-out'},
      {transform:'perspective(620px) rotateY(0deg)',offset:1},
    ],REVEAL_DURATION);
    const cover = back.animate([{opacity:1},{opacity:0}],{
      duration:REVEAL_DURATION * 0.48,easing:'steps(1,end)',
    });
    cover.onfinish = () => back.remove();
  }

  function draw(cue) {
    if(cue.kind==='status'){
      const side=root.querySelector(`[data-feedback-side="${cue.p}"]`);
      if(!side)return;
      const family=cue.changes[0].mode==='clear'?'guard':cue.changes[0].family;
      const color={guard:'#6c9eae',charge:'#ba9349',harm:'#a96d55'}[family];
      const card=side.querySelector(FEEDBACK_CARD);
      const notice=document.createElement('div');
      notice.className=`status-feedback status-${family}`;
      notice.setAttribute('role','status');
      for(const change of cue.changes){
        const line=document.createElement('span');
        line.className=`status-line status-line-${change.mode==='clear'?'guard':change.family}`;
        line.dataset.status=change.key;
        line.dataset.mode=change.mode;
        line.textContent=change.label;
        notice.append(line);
      }
      side.append(notice);
      transientNodes.add(notice);
      const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(!reduced){
        const animation=notice.animate([{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'none',offset:.2},{opacity:1,offset:.85},{opacity:0}],{duration:1500,easing:'ease-out'});
        resultAnimations.add(animation);
        if(card){
          const glow=card.animate([{boxShadow:`0 0 0 2px ${color},0 0 18px ${color}88`},{boxShadow:'0 0 0 0 transparent'}],{duration:680,easing:'ease-out'});
          resultAnimations.add(glow);
        }
        if(cue.changes.some(change=>['trigger','consume'].includes(change.mode))){
          for(let index=0;index<4;index++){
            const particle=document.createElement('span');
            particle.className='status-particle';
            particle.style.backgroundColor=color;
            particle.setAttribute('aria-hidden','true');
            side.append(particle);
            transientNodes.add(particle);
            const burst=particle.animate([{transform:'translate(0,0) scale(1)',opacity:.9},{transform:`translate(${(index-1.5)*22}px,${-18-index%2*18}px) scale(0)`,opacity:0}],{duration:540,easing:'ease-out'});
            resultAnimations.add(burst);
            burst.onfinish=()=>{particle.remove();transientNodes.delete(particle);};
          }
        }
      }
      later(()=>{notice.remove();transientNodes.delete(notice);},1600);
      return;
    }
    if(cue.kind==='seal'){
      root.querySelectorAll('.lineup-grid figure,.tutorial-five figure').forEach((card,index)=>{
        const animation=card.animate([{transform:'translateY(0) scale(1)'},{transform:'translateY(7px) scale(.96)',offset:.45},{transform:'none'}],{duration:420,delay:index%5*25,easing:'ease-in-out'});
        resultAnimations.add(animation);
      });
      return;
    }
    if(cue.kind==='shuffle'){
      const overlay=document.createElement('div');
      overlay.className='shuffle-overlay';
      overlay.setAttribute('role','status');
      overlay.innerHTML=`<div class="shuffle-packs">${[0,1].map(()=>`<div class="shuffle-pack">${Array.from({length:5},()=>'<span aria-hidden="true">✦</span>').join('')}</div>`).join('')}</div><p>双方分别洗牌</p>`;
      document.body.append(overlay);
      transientNodes.add(overlay);
      overlay.querySelectorAll('.shuffle-pack span').forEach((card,index)=>{
        const offset=(index%5-2)*18;
        const animation=card.animate([{transform:`translateX(${offset}px) rotate(${offset/4}deg)`},{transform:`translateX(${-offset}px) rotate(${-offset/4}deg)`,offset:.45},{transform:'none'}],{duration:540,easing:'ease-in-out'});
        resultAnimations.add(animation);
      });
      later(()=>{overlay.remove();transientNodes.delete(overlay);},600);
      return;
    }
    if(cue.kind==='retreat'){
      const side=root.querySelector(`[data-feedback-side="${cue.p}"]`);
      const card=side?.querySelector(FEEDBACK_CARD);
      if(card){
        const frames=cue.escaped?[
          {transform:'translateY(0) scale(1)',opacity:1},
          {transform:'translateY(-10px) scale(.97)',opacity:1,offset:.45},
          {transform:'translateY(-16px) scale(.95)',opacity:0},
        ]:[{transform:'translateY(0) scale(1)'},{transform:'translateY(-10px) scale(.97)',offset:.6},{transform:'translateY(0) scale(1)'}];
        const animation=card.animate(frames,{duration:cue.escaped?760:420,easing:'ease-in-out',fill:cue.escaped?'forwards':'none'});
        resultAnimations.add(animation);
      }
      return;
    }
    if(cue.terminal){
      for(const element of root.querySelectorAll('[data-match-outcome]')){
        element.style.visibility='';element.removeAttribute('aria-hidden');
        hiddenOutcomes.delete(element);
        const animation=element.animate([{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:260,easing:'ease-out'});
        resultAnimations.add(animation);
      }
      if(cue.transfer)draw({...cue,kind:'win',terminal:false,audible:cue.kind==='victory'});
      return;
    }
    if(cue.kind==='point-result'){
      const animation=root.querySelector('[data-point-result]')?.animate([
        {backgroundColor:'#e8dfc9',boxShadow:'0 0 0 0 transparent'},
        {backgroundColor:'#f5e2a7',boxShadow:'0 0 0 2px #ac873c',offset:.45},
        {backgroundColor:'#e8dfc9',boxShadow:'0 0 0 0 transparent'},
      ],{duration:POINT_RESULT_PULSE_MS/3,iterations:3,easing:'ease-in-out'});
      if(animation){
        resultAnimations.add(animation);
        animation.onfinish=()=>resultAnimations.delete(animation);
      }
      return;
    }
    const side = root.querySelector(`[data-feedback-side="${cue.p}"]`);
    const card = side?.querySelector(FEEDBACK_CARD);
    const result = root.querySelector('[data-feedback-result]');
    if (cue.kind === 'reveal') {
      for (const face of root.querySelectorAll('[data-feedback-side] :is(.played-card,.combat-card)')) {
        flipCard(face);
      }
    } else if (cue.kind === 'advantage') {
      result?.animate([{backgroundColor:'#ead9a9'},{backgroundColor:'transparent'}],280);
      later(() => {
        side?.animate([{boxShadow:'inset 0 0 0 3px #b68434'},{boxShadow:'inset 0 0 0 0 transparent'}],360);
        card?.animate([
          {boxShadow:'0 0 0 2px #b68434, 0 0 18px #bc873c99'},
          {boxShadow:'0 0 0 0 transparent, 0 0 0 transparent'},
        ],380);
      },156);
    } else if (cue.kind === 'win') {
      if(cue.transfer)flyTransfer(cue);
      const transfer = root.querySelector('[data-feedback-transfer]') ?? side;
      side?.animate([{boxShadow:'inset 0 0 0 2px #b68434'},{boxShadow:'inset 0 0 0 0 transparent'}],380);
      later(() => transfer?.animate([
        {transform:'translateY(8px)',opacity:.64,backgroundColor:'#e6d8ad'},
        {transform:'translateY(0)',opacity:1,backgroundColor:'transparent'},
      ],300), cue.audible ? 492 : 0);
    } else if (side) {
      const color = {hit:'#b54b34',block:'#9d803d',heal:'#42835e'}[cue.kind];
      side.animate([{boxShadow:`inset 0 0 0 3px ${color}`},{boxShadow:'inset 0 0 0 0 transparent'}],220);
      if (cue.kind === 'block') return;
      if (cue.kind === 'hit') {
        const direction = cue.p === 0 ? -1 : 1;
        card?.animate([
          {transform:`translateX(${4 * direction}px) rotate(${direction}deg)`},
          {transform:`translateX(${-2 * direction}px) rotate(${-0.5 * direction}deg)`},
          {transform:'translateX(0) rotate(0)'},
        ],135);
      }
      const bar = side.querySelector('.hp-fill');
      if (bar) {
        const from = `${cue.before / cue.max * 100}%`, to = `${cue.after / cue.max * 100}%`;
        bar.style.width = to;
        bar.animate([{width:from},{width:to}], {duration:145,easing:'ease-out'});
      }
      const change = cue.after-cue.before;
      const number = document.createElement('span');
      number.className = 'feedback-number';
      number.style.color = color;
      number.setAttribute('aria-hidden','true');
      number.textContent = change > 0 ? `+${change}` : String(change);
      (side.querySelector('[data-tutorial-card]') ?? side).append(number);
      number.animate([{transform:'translateY(0)',opacity:1},{transform:'translateY(-16px)',opacity:0}],360)
        .onfinish = () => number.remove();
    }
  }

  return {
    unlock,
    stopAudio,
    interact(kind, element, isEnabled) {
      if (globalThis.document?.hidden) return;
      if (element?.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const frames = kind === 'inspect'
          ? [{transform:'translateY(5px) scale(.984)',opacity:.78},{transform:'none',opacity:1}]
          : [{transform:kind==='select'?'scale(.975)':'scale(.989)'},{transform:'none'}];
        element.animate(frames,{duration:kind==='inspect'?160:110,easing:'ease-out'});
      }
      playTone(kind,INTERACTION_SOUNDS[kind],isEnabled,0.22);
    },
    clear() {
      revision++;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const animation of resultAnimations) animation.cancel();
      resultAnimations.clear();
      for(const node of transientNodes)node.remove();
      transientNodes.clear();
      for(const [node,count] of pendingCounts)node.textContent=count;
      pendingCounts.clear();
      for (const [bar,finalWidth] of bars) bar.style.width = finalWidth;
      bars.clear();
      for(const element of hiddenOutcomes){element.style.visibility='';element.removeAttribute('aria-hidden');}
      hiddenOutcomes.clear();
    },
    show(cues, isEnabled) {
      if (!cues.length) return;
      if(typeof root.querySelectorAll!=='function')return;
      const animate = globalThis.Element?.prototype.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (document.hidden) return;
      for(const cue of cues)cue.countsBefore?.forEach((count,p)=>{
        const node=root.querySelector(`[data-card-count="${p}"]`);
        if(node){node.textContent=count;pendingCounts.set(node,cue.countsAfter[p]);}
      });
      if(cues.some(cue=>cue.terminal)&&cues.length>1){
        for(const element of root.querySelectorAll('[data-match-outcome]')){
          element.style.visibility='hidden';element.setAttribute('aria-hidden','true');
          hiddenOutcomes.add(element);
        }
      }
      if (animate) {
        for (const cue of cues) {
          if (cue.before === undefined) continue;
          const bar = root.querySelector(`[data-feedback-side="${cue.p}"] .hp-fill`);
          if (!bar || bars.has(bar)) continue;
          bars.set(bar,bar.style.width);
          bar.style.width = `${cue.before / cue.max * 100}%`;
        }
      }
      let delay = 0;
      let previousStart = 0;
      for (const cue of cues) {
        if(cue.kind==='rps-hands'&&animate){
          rollHands();
          delay+=RPS_ROLL_DURATION;
        }
        const start = cue.withPrevious ? previousStart : delay;
        const step = RESULT_STEPS[cue.kind];
        if (animate && step) animateResult(cue,step,start);
        later(() => {
          if (document.hidden) return;
          if(cue.terminal)for(const element of hiddenOutcomes){element.style.visibility='';element.removeAttribute('aria-hidden');hiddenOutcomes.delete(element);}
          if ((animate||cue.kind==='status') && !step) draw(cue);
          if(!animate&&cue.countsAfter)settleCounts(cue);
          if (!isEnabled() || cue.audible === false || cue.withPrevious) return;
          if(cue.kind==='point-result'){
            for(let index=0;index<3;index++)later(()=>{
              if(!document.hidden&&isEnabled())playBuffer(audio.get(cue.tie?'point-tie':`point-result-${index+1}`),0.38);
            },index*POINT_RESULT_PULSE_MS/3);
          }
          else if(cue.kind==='status')playBuffer(audio.get(`status-${cue.changes[0].mode==='clear'?'guard':cue.changes[0].family}`),.24);
          else if(cue.kind==='seal')playTone('commit',INTERACTION_SOUNDS.commit,isEnabled,.24);
          else if(cue.kind.startsWith('point-'))playBuffer(audio.get(cue.kind),0.38);
          else if (step) playTone(cue.kind,step.tone,isEnabled,0.30);
          else playBuffer(audio.get(cue.kind),0.38);
        },start);
        if (!cue.withPrevious) {
          previousStart = start;
          delay += cue.gap ?? step?.gap ?? {reveal:180,advantage:440,hit:230,block:230,heal:300,status:180,retreat:cue.escaped?800:420,seal:0,shuffle:0,win:0,victory:0,defeat:0,draw:0,'point-result':POINT_RESULT_PULSE_MS}[cue.kind];
        }
      }
    },
  };
}
