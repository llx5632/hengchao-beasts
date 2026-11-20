import { RPS_CHOICES } from './ui.js';

export const EFFECT_FILES = Object.freeze({
  reveal:'sfx-reveal.wav', advantage:'sfx-advantage.wav', hit:'sfx-hit.wav',
  block:'sfx-block.wav', heal:'sfx-heal.wav', win:'sfx-win.wav',
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
  'point-numbers':{part:'choices',gap:1000,tone:{duration:0.15,from:490,to:535,texture:0.40}},
  'point-metric':{part:'metric',gap:1000,tone:{duration:0.20,from:540,to:630,texture:0.10}},
  'point-values':{part:'values',gap:440,tone:{duration:0.24,from:590,to:735,texture:0.07}},
  'point-tie':{part:'values',gap:440,tone:{duration:0.22,from:510,to:490,texture:0.12}},
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
  if (after.mode === 'battle' && !before.battle && after.battle) {
    cues.push({kind:'reveal'});
    if (after.transfers.at(-1)?.reason === '属性克制') cues.push({kind:'advantage',p:after.winner});
  }
  if (after.mode === 'battle' && ['rps-result','rps-tie'].includes(after.phase)) {
    cues.push({kind:'rps-hands'}, after.phase==='rps-tie'
      ? {kind:'rps-tie'} : {kind:'rps-win',p:after.battle.actor});
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
      cues.push(after.phase==='point-tie'
        ? {kind:'point-tie'} : {kind:'point-values',p:after.rounds.at(-1).winner});
    }
  }
  const awards = after.transfers.slice(before.transfers.length);
  if (awards.length) {
    const winner = awards[0].to;
    cues.push({kind:'win',p:winner,audible:winner === 0});
  }
  return cues;
}

export function createFeedbackPlayer(root) {
  let context, revision=0;
  const audio = new Map(), clicks = new Map(), playing = new Set(), timers = new Set(), bars = new Map();
  const resultAnimations = new Set();

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
      for (const [bar,finalWidth] of bars) bar.style.width = finalWidth;
      bars.clear();
    },
    show(cues, isEnabled) {
      if (!cues.length) return;
      const animate = globalThis.Element?.prototype.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!animate && !context) return;
      if (document.hidden) return;
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
          if (animate && !step) draw(cue);
          if (!isEnabled() || cue.audible === false || cue.withPrevious) return;
          if (step) playTone(cue.kind,step.tone,isEnabled,0.30);
          else playBuffer(audio.get(cue.kind),0.38);
        },start);
        if (!cue.withPrevious) {
          previousStart = start;
          delay += cue.gap ?? step?.gap ?? {reveal:180,advantage:440,hit:175,block:175,heal:250,win:0}[cue.kind];
        }
      }
    },
  };
}
