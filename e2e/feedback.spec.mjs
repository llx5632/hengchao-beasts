import {test,expect,openSession,session,saved,createLocalMatch,dispatch,noOverflow,openAudioMenu} from './fixtures.mjs';
import {EFFECT_FILES} from '../dist/feedback.js';
import {beginTutorialLesson,tutorialAction} from '../dist/tutorial.js';

async function setup(page, value) {
  value.effectsEnabled = true;
  value.autoAdvance = false;
  await page.addInitScript(()=>{
    window.feedbackEvents=[];
    window.feedbackTimes=[];
    window.cardAnimations=[];
    window.revealSteps=[];
    window.pointPulses=[];
    window.transferFlights=[];
    window.sealAnimations=0;
    window.rpsRolls=[];
    const animate=Element.prototype.animate;
    Element.prototype.animate=function(frames,options){
      if(this.classList.contains('transfer-token'))window.transferFlights.push({duration:options.duration,counts:[...document.querySelectorAll('[data-card-count]')].map(node=>Number(node.textContent))});
      if(this.matches('.lineup-grid figure'))window.sealAnimations++;
      if(this.dataset.revealStep)window.revealSteps.push({part:this.dataset.revealStep,delay:options.delay});
      if(this.hasAttribute('data-point-result')&&options.iterations)window.pointPulses.push(options.iterations);
      if(this.classList.contains('rps-roller'))window.rpsRolls.push({
        duration:options.duration,
        choices:[...this.children].map(face=>face.lastChild.textContent),
      });
      if(this.matches('.played-card, .combat-card')&&this.closest('[data-feedback-side]')){
        const side=this.closest('[data-feedback-side]').dataset.feedbackSide;
        if(frames[0].boxShadow?.includes('#b68434'))window.cardAnimations.push({kind:'gold',side});
        if(frames[0].transform?.includes('translateX'))window.cardAnimations.push({kind:'shake',side});
      }
      return animate.call(this,frames,options);
    };
    window.decodedEffects=0;
    const OriginalAudioContext=window.AudioContext;
    window.AudioContext=class extends OriginalAudioContext {
      async decodeAudioData(...args){
        const buffer=await super.decodeAudioData(...args);
        window.decodedEffects++;
        return buffer;
      }
      createBufferSource(){
        const source=super.createBufferSource();
        const start=source.start.bind(source);
        source.start=(...args)=>{
          start(...args);
          window.feedbackTimes.push(performance.now());
          window.feedbackEvents.push({
            duration:Math.round(source.buffer.duration*1000),
            animating:document.getAnimations().length>0,
            numbers:[...document.querySelectorAll('.feedback-number')].map(node=>node.textContent),
          });
        };
        return source;
      }
    };
  });
  await openSession(page,value);
}

const allEvents=page=>page.evaluate(()=>window.feedbackEvents);
const events=async page=>(await allEvents(page)).filter(event=>![75,90,160].includes(event.duration));
const cardAnimations=page=>page.evaluate(()=>window.cardAnimations);
const ready=page=>expect.poll(()=>page.evaluate(()=>window.decodedEffects)).toBe(Object.keys(EFFECT_FILES).length);
const choose=page=>page.locator('[data-action="attack"][data-skill="1"]');

function selectedBattle(value, own, enemy, between=false) {
  let match=createLocalMatch('battle',value.players);
  for(const p of between?[1]:[0,1]){
    const id=value.players[p].cards.find(card=>card.cardId===(p?enemy:own)).id;
    match=dispatch(match,{type:'select',player:p,ids:[id]});
  }
  if(!between){
    match=dispatch(match,{type:'advance'});
    for(const p of [0,1])match=dispatch(match,{type:'rps',player:p,value:p?'scissors':'rock'});
    match=dispatch(match,{type:'advance'});
  }
  return match;
}

for(const remaining of [2,1])test(`撤退剩余${remaining}时步进、擦地声和成功淡出`,async({page})=>{
  const value=session();
  value.match=selectedBattle(value,'lujia','liejing');
  value.match.battle.remaining[0]=remaining;
  await setup(page,value);
  await page.locator('.match-head h2').click();
  await ready(page);
  await page.locator('[data-action="retreat"]').click();
  if(remaining===1)await expect(page.locator('.result-title')).toBeHidden();
  await expect.poll(async()=>(await events(page)).map(event=>event.duration)).toEqual(remaining===1?[280,720]:[280]);
  expect((await saved(page)).match.battle.remaining[0]).toBe(remaining-1);
  if(remaining===1){
    await expect(page.locator('.result-title')).toHaveText('撤退成功，双方保卡');
    await expect.poll(()=>page.locator('[data-feedback-side="0"] .combat-card').evaluate(node=>Number(getComputedStyle(node).opacity))).toBe(0);
    expect((await saved(page)).match.transfers).toHaveLength(0);
  }else{
    expect((await saved(page)).match.status).toBe('active');
  }
  await page.screenshot({path:`qa/retreat-${remaining}-${test.info().project.name}.png`,fullPage:true});
  await page.reload();
  expect(await events(page)).toEqual([]);
  await noOverflow(page);
});

for(const outcome of ['victory','defeat','draw'])test(`最后一击与${outcome}整场提示合并收尾`,async({page})=>{
  const value=session();
  value.match=selectedBattle(value,'luwenzhi','panjia');
  if(outcome!=='defeat')value.match.battle.hp[1]=1;
  if(outcome!=='victory'){
    value.match.battle.hp[0]=1;
    value.match.battle.reflectWard=[false,true];
    value.match.battle.reflectRate=[0,100];
    value.match.battle.reflectCap=[0,50];
  }
  await setup(page,value);
  await page.locator('.match-head h2').click();
  await ready(page);
  await choose(page).click();
  const duration={victory:1030,defeat:580,draw:720}[outcome];
  await expect.poll(async()=>(await events(page)).at(-1)?.duration).toBe(duration);
  const sounds=await events(page);
  expect(sounds.filter(event=>event.duration===duration)).toHaveLength(1);
  if(outcome!=='victory')expect(sounds.some(event=>event.duration===1030)).toBe(false);
  if(outcome!=='draw'){
    await expect.poll(()=>page.evaluate(()=>window.transferFlights.length)).toBe(1);
    expect(await page.evaluate(()=>window.transferFlights[0])).toEqual({duration:560,counts:[33,33]});
    await expect(page.locator('[data-card-count]')).toHaveText(outcome==='victory'?['34','32']:['32','34']);
  }
  expect((await saved(page)).match.winner).toBe(outcome==='draw'?null:outcome==='victory'?0:1);
  await expect(page.locator('.result-title')).toBeVisible();
  await noOverflow(page);
});

test('封存阵容收拢，确认后以牌背洗牌并播放纸声',async({page})=>{
  await setup(page,session());
  await page.locator('[data-action="start-point"]').click();
  const choices=page.locator('.selection-tile [data-action="choose-card"]');
  for(let index=0;index<5;index++)await choices.nth(index).click();
  await ready(page);
  await page.locator('[data-action="submit-cards"]').click();
  await expect(page.locator('.lineup-preview')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.sealAnimations)).toBe(10);
  await page.locator('[data-action="lineup-ready"]').click();
  await expect(page.locator('.shuffle-overlay')).toBeVisible();
  await expect(page.locator('.shuffle-pack span')).toHaveCount(10);
  await expect(page.locator('.shuffle-overlay img')).toHaveCount(0);
  await page.screenshot({path:`qa/polish-shuffle-${test.info().project.name}.png`});
  await expect.poll(async()=>(await events(page)).some(event=>event.duration===600)).toBe(true);
  await expect(page.locator('.shuffle-overlay')).toHaveCount(0);
  await noOverflow(page);
});

for(const tie of [false,true])test(`猜拳${tie?'平手可立即重比，余下提示停止':'先揭两边手势，再提示行动权'}`,async({page})=>{
  const value=session();
  let match=createLocalMatch('battle',value.players);
  for(const p of [0,1]){
    const id=value.players[p].cards.find(card=>card.cardId===(p?'liejing':'lujia')).id;
    match=dispatch(match,{type:'select',player:p,ids:[id]});
  }
  match=dispatch(match,{type:'advance'});
  value.match=dispatch(match,{type:'rps',player:1,value:tie?'rock':'scissors'});
  await setup(page,value);
  await expect(page.locator('.rps-hands')).toHaveCount(0);
  if(tie){
    await page.locator('.match-head h2').click();
    await ready(page);
    await page.evaluate(()=>{
      document.querySelector('[data-action="rps"][data-value="rock"]').click();
      document.querySelector('[data-action="advance"]').click();
    });
    await page.waitForTimeout(710);
    expect((await saved(page)).match.phase).toBe('rps');
    expect((await events(page)).map(e=>e.duration)).toEqual([]);
    return;
  }
  await page.getByRole('button',{name:'出石头',exact:true}).click();
  await expect(page.locator('.rps-hands')).toContainText('剪刀');
  const steps=await page.evaluate(()=>window.revealSteps);
  expect(steps).toContainEqual({part:'choices',delay:420});
  expect(steps).toContainEqual({part:'outcome',delay:620});
  expect(await page.evaluate(()=>window.rpsRolls)).toEqual([
    {duration:420,choices:['石头','剪刀','布','石头','剪刀','布']},
    {duration:420,choices:['剪刀','布','石头','剪刀','布','石头']},
  ]);
  await expect(page.locator('.rps-roller')).toHaveCount(0);
  await expect(page.locator('[data-rps-roll] > .rps-face > span:last-child')).toHaveText(['石头','剪刀']);
  await expect.poll(async()=> (await events(page)).map(e=>e.duration)).toEqual([135,250]);
  await page.getByRole('button',{name:'选择本次行动',exact:true}).click();
  expect((await saved(page)).match.phase).toBe('battle-action');
  await noOverflow(page);
});

for(const doubleZero of [false,true])test(`拼点${doubleZero?'双零跳过比较':'从点数到比较项和结果'}按次序反馈`,async({page})=>{
  const value=session();
  let match=createLocalMatch('point',value.players);
  for(const p of [0,1]){
    const cards=p?['tanling','woxu','xianbei','xuanjiao','yelan']:['chihoubaolong','tanling','xuanjiao','yelan','zhoulan'];
    const ids=cards.map(cardId=>value.players[p].cards.find(card=>card.cardId===cardId).id);
    match=dispatch(match,{type:'select',player:p,ids});
  }
  for(const p of [0,1])match=dispatch(match,{type:'lineup-ready',player:p},()=>0.999);
  for(const p of [0,1])match=dispatch(match,{type:'decision',player:p,value:'continue'});
  const number=doubleZero?0:1;
  value.match=dispatch(match,{type:'point',player:1,value:number});
  await setup(page,value);
  await page.locator('.match-head h2').click();
  await ready(page);
  await expect(page.locator('.revealed-points')).toHaveCount(0);
  await page.getByRole('button',{name:`选择点数 ${number}`,exact:true}).click();
  const banner=page.locator('[data-point-result]');
  await expect(banner).toBeVisible();
  await expect(banner).toBeEmpty();
  await expect(banner).toHaveAttribute('aria-hidden','true');
  await expect(page.locator('[data-point-result] + .comparison')).toBeVisible();
  const bannerHeight=(await banner.boundingBox()).height;
  const comparisonTop=(await page.locator('.comparison').boundingBox()).y;
  await page.evaluate(()=>{
    window.originalPointBoard=document.querySelector('.board');
    window.originalComparison=document.querySelector('.comparison');
  });
  await expect(page.locator('.value-winner')).toHaveCount(0);
  await expect(page.locator('.score')).toHaveText('0:0');
  await expect(page.locator('.log')).not.toContainText('获胜并获得');
  const steps=await page.evaluate(()=>window.revealSteps);
  expect(steps).toContainEqual({part:'choices',delay:360});
  if(doubleZero){
    expect(steps.some(step=>step.part==='metric')).toBe(false);
    expect(steps.some(step=>step.part==='values')).toBe(false);
    await expect.poll(async()=> (await events(page)).map(e=>e.duration)).toEqual([640,190,300,300,300]);
    expect((await saved(page)).match.transfers).toHaveLength(0);
  }else{
    expect(steps).toContainEqual({part:'metric',delay:1360});
    expect(steps).toContainEqual({part:'values',delay:2360});
    await expect.poll(async()=> (await events(page)).map(e=>e.duration),{timeout:7000}).toEqual([640,190,230,280,620,620,620,1030]);
    expect((await saved(page)).match.transfers.at(-1).to).toBe(0);
  }
  await expect(banner).toContainText(doubleZero?'比拼平手':'获胜');
  await expect(page.locator('[data-point-result] + .comparison')).toBeVisible();
  expect((await banner.boundingBox()).height).toBe(bannerHeight);
  expect((await page.locator('.comparison').boundingBox()).y).toBe(comparisonTop);
  expect(await page.evaluate(()=>window.originalPointBoard===document.querySelector('.board')&&window.originalComparison===document.querySelector('.comparison'))).toBe(true);
  if(!doubleZero)await page.screenshot({path:`qa/polish-point-${test.info().project.name}.png`,fullPage:true});
  expect(await page.evaluate(()=>window.pointPulses)).toEqual([3]);
  const times=await page.evaluate(()=>window.feedbackTimes);
  const resultStart=doubleZero?2:4;
  for(let index=resultStart+1;index<resultStart+3;index++){
    expect(times[index]-times[index-1]).toBeGreaterThan(250);
    expect(times[index]-times[index-1]).toBeLessThan(650);
  }
  await page.reload();
  expect(await events(page)).toEqual([]);
  await noOverflow(page);
});

test('教程拼点减少动态效果时按拍发声，静音取消后续结果音',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const value=session();
  let tutorial=beginTutorialLesson(null,'point');
  const act=action=>{tutorial=tutorialAction(tutorial,action);};
  for(const card of tutorial.match.inventories[0])act({type:'choose',id:card.id});
  for(const type of ['submit','ready','continue'])act({type});
  value.tutorial=tutorial;
  await setup(page,value);
  await page.locator('#tutorial-heading').click();
  await ready(page);
  await page.locator('[data-action="tutorial-point"][data-value="0"]').click();
  await expect.poll(async()=>(await events(page)).map(event=>event.duration)).toEqual([640,190,300,300,300]);
  expect(await page.evaluate(()=>window.pointPulses)).toEqual([]);
  await page.locator('[data-action="tutorial-next"]').click();
  await page.locator('[data-action="tutorial-point"][data-value="3"]').click();
  await page.waitForFunction(()=>window.feedbackEvents.some(event=>event.duration===620));
  await expect(page.locator('[data-point-result]')).toContainText('你赢下本小局');
  await openAudioMenu(page);
  await page.locator('[data-action="effects-toggle"]').click();
  const muted=await events(page);
  expect(muted.filter(event=>event.duration===620).length).toBeLessThan(3);
  await page.waitForTimeout(1000);
  expect(await events(page)).toEqual(muted);
  await noOverflow(page);
});

test('拼点结果留在比拼界面，按钮倒计时并在零秒直接进入下一局',async({page})=>{
  const value=session();
  let match=createLocalMatch('point',value.players);
  for(const p of [0,1]){
    const names=p?['tanling','woxu','xianbei','xuanjiao','yelan']:['chihoubaolong','fuchao','xuanjiao','yelan','zhoulan'];
    match=dispatch(match,{type:'select',player:p,ids:names.map(cardId=>value.players[p].cards.find(card=>card.cardId===cardId).id)});
  }
  for(const p of [0,1])match=dispatch(match,{type:'lineup-ready',player:p},()=>0.999);
  for(const p of [0,1])match=dispatch(match,{type:'decision',player:p,value:'continue'});
  for(const p of [0,1])match=dispatch(match,{type:'point',player:p,value:1});
  value.match=match;
  await page.clock.install({time:new Date('2026-11-20T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-11-20T00:00:01Z'));
  await openSession(page,value);
  const next=page.locator('[data-action="decision"][data-value="continue"]');
  await expect(next).toHaveText('继续下一小局（10s后自动进入）');
  await page.clock.runFor(2000);
  await expect(next).toHaveText('继续下一小局（8s后自动进入）');
  await page.locator('[data-action="pause"]').click();
  await page.clock.runFor(6000);
  await expect(page.locator('.comparison')).toBeVisible();
  await expect(next).toHaveText('继续下一小局');
  await page.locator('[data-action="pause"]').click();
  await page.clock.runFor(7999);
  await expect(next).toHaveText('继续下一小局（1s后自动进入）');
  await page.clock.runFor(1);
  expect((await saved(page)).match.phase).toBe('point');
  await expect(page.getByRole('button',{name:'选择点数 6',exact:true})).toBeVisible();
});

test('选卡、取消和放大卡面各有点击反馈，静音和减少动态效果可用',async({page})=>{
  await setup(page,session());
  await page.locator('[data-action="start-battle"]').click();
  const card=page.getByRole('button',{name:'选择 炭铃',exact:true});
  await card.focus();
  await card.press('Space');
  await expect(card).toBeFocused();
  await expect(card).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>allEvents(page)).toContainEqual({duration:90,animating:true,numbers:[]});
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed','false');
  await expect.poll(()=>allEvents(page)).toContainEqual({duration:75,animating:true,numbers:[]});
  await page.getByRole('button',{name:'对局大厅',exact:true}).click();
  await page.getByRole('button',{name:'异兽图鉴',exact:true}).click();
  const inspect=page.getByRole('button',{name:'放大炭铃完整卡面',exact:true});
  await inspect.click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect.poll(()=>allEvents(page)).toContainEqual({duration:160,animating:true,numbers:[]});
  await page.getByRole('button',{name:'关闭卡面',exact:true}).click();
  await openAudioMenu(page);
  await page.getByRole('button',{name:'对局音效',exact:true}).click();
  await page.emulateMedia({reducedMotion:'reduce'});
  const prior=await allEvents(page);
  await inspect.click();
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(node=>node.getAnimations().length)).toBe(0);
  expect(await allEvents(page)).toEqual(prior);
});

test('亮牌、属性直胜和真实获卡依次播放，刷新不重放',async({page})=>{
  const value=session();
  value.match=selectedBattle(value,'tanling','genguan',true);
  await setup(page,value);
  await page.getByRole('button',{name:'选择 炭铃',exact:true}).click();
  await ready(page);
  await page.getByRole('button',{name:'封存出战卡',exact:true}).click();
  await expect(page.locator('[data-feedback-result]')).toContainText('火克制草，直接获胜');
  await expect.poll(async()=> (await events(page)).map(e=>e.duration)).toEqual([640,630,1030]);
  expect((await events(page))[0].animating).toBe(true);
  expect(await cardAnimations(page)).toContainEqual({kind:'gold',side:'0'});
  expect((await saved(page)).match.transfers).toHaveLength(1);
  await page.reload();
  await expect(page.locator('[data-feedback-result]')).toContainText('火克制草，直接获胜');
  expect(await events(page)).toEqual([]);
  await noOverflow(page);
});

for(const compact of [true,false])test(`正式战斗${compact?'紧凑':'完整'}视图，受击卡轻震后播放汲取回血`,async({page})=>{
  const value=session();
  value.battleCompact=!compact;
  value.match=selectedBattle(value,'luwenzhi','panjia');
  value.match.battle.hp[0]=40;
  await setup(page,value);
  await page.locator('[data-action="battle-layout"]').click();
  await ready(page);
  await choose(page).click();
  await expect.poll(async()=> (await events(page)).map(e=>e.duration)).toEqual([185,560]);
  const [hit,heal]=await events(page);
  expect(hit).toMatchObject({animating:true,numbers:['-25']});
  expect(await cardAnimations(page)).toEqual([{kind:'shake',side:'1'}]);
  expect(heal.animating).toBe(true);
  expect(heal.numbers).toContain('+12');
  expect((await saved(page)).match.battle.hp).toEqual([52,135]);
  await noOverflow(page);
});

test('完全格挡播放独立音效，减少动态效果与静音设置生效',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const value=session();
  value.match=selectedBattle(value,'luwenzhi','panjia');
  value.match.battle.hp[0]=40;
  value.match.battle.shield[1]=25;
  await setup(page,value);
  await page.locator('[data-action="battle-layout"]').click();
  await ready(page);
  await choose(page).click();
  await expect.poll(()=>events(page)).toEqual([
    {duration:280,animating:false,numbers:[]},
    {duration:240,animating:false,numbers:[]},
  ]);
  expect((await saved(page)).match.battle.hp).toEqual([40,160]);
  const toggle=page.locator('[data-action="effects-toggle"]');
  await openAudioMenu(page);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('[data-action="music-toggle"]')).toHaveAttribute('aria-pressed','false');
  expect(await events(page)).toEqual([]);
});

test('教程亮牌翻面，命中时卡面震动与血条一起反馈',async({page})=>{
  await page.addInitScript(()=>{
    window.tutorialAnimations=[];
    const animate=Element.prototype.animate;
    Element.prototype.animate=function(frames,options){
      const animation=animate.call(this,frames,options);
      const side=this.closest('[data-feedback-side]')?.dataset.feedbackSide;
      if(this.matches('.played-card')&&this.querySelector('.feedback-flip-back')){
        window.tutorialAnimations.push({kind:'flip',side,duration:options});
      }
      if(this.matches('[data-tutorial-card]')&&frames[0].transform?.includes('translateX')){
        window.tutorialAnimations.push({kind:'shake',side});
      }
      if(this.matches('.hp-fill')&&this.closest('[data-tutorial-combat]')){
        window.tutorialAnimations.push({kind:'hp',side,from:frames[0].width,to:frames[1].width});
      }
      return animation;
    };
  });
  await setup(page,session());
  const click=action=>page.locator(`[data-action="tutorial-${action}"]`).click();
  await click('open');
  await click('begin');
  await click('choose');
  await ready(page);
  await click('submit');
  const animations=()=>page.evaluate(()=>window.tutorialAnimations);
  await expect.poll(animations).toEqual([
    {kind:'flip',side:'0',duration:132},{kind:'flip',side:'1',duration:132},
  ]);
  await expect(page.locator('.feedback-flip-back')).toHaveCount(0);
  await expect.poll(async()=> (await events(page)).map(e=>e.duration)).toEqual([640,630,1030]);
  await click('next');
  await click('choose');
  await click('submit');
  await click('next');
  await page.locator('[data-action="tutorial-rps"][data-value="rock"]').click();
  await click('next');
  await click('attack');
  await expect.poll(async()=> (await animations()).slice(-2)).toEqual([
    {kind:'shake',side:'1'},
    {kind:'hp',side:'1',from:'100%',to:`${120/140*100}%`},
  ]);
  const hit=(await events(page)).at(-1);
  expect(hit).toMatchObject({duration:185,animating:true,numbers:['-20']});
  await expect(page.locator('[data-feedback-side="1"] .tutorial-vitals')).toContainText('120 / 140');
  await noOverflow(page);
});
