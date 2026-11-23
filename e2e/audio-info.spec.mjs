import {test,expect,session,openSession,saved,noOverflow,openAudioMenu,createLocalMatch,dispatch} from './fixtures.mjs';
import {EFFECT_FILES} from '../dist/feedback.js';

test('音乐与音效音量即时独立调整，零音量、键盘操作与刷新保存',async({page})=>{
  await page.addInitScript(()=>{
    window.volumeTest={gains:[],effects:[],musicStarts:0,decoded:0};
    const Original=window.AudioContext;
    window.AudioContext=class extends Original{
      createGain(){const gain=super.createGain();window.volumeTest.gains.push(gain);return gain;}
      async decodeAudioData(...args){const buffer=await super.decodeAudioData(...args);window.volumeTest.decoded++;return buffer;}
      createBufferSource(){
        const source=super.createBufferSource(),connect=source.connect.bind(source),start=source.start.bind(source);
        let target;
        source.connect=node=>{target=node;return connect(node);};
        source.start=(...args)=>{
          if(source.loop)window.volumeTest.musicStarts++;
          else window.volumeTest.effects.push(target.gain.value);
          return start(...args);
        };
        return source;
      }
    };
  });
  const value=session();value.musicEnabled=true;value.effectsEnabled=true;
  await openSession(page,value);
  await page.locator('.brand').click();
  await expect.poll(()=>page.evaluate(()=>window.volumeTest.decoded)).toBe(Object.keys(EFFECT_FILES).length+1);
  await openAudioMenu(page);
  const music=page.getByRole('slider',{name:'音乐音量'}),effects=page.getByRole('slider',{name:'音效音量'});
  await expect(music).toHaveValue('25');await expect(effects).toHaveValue('100');
  await music.evaluate(node=>{node.value='35';node.dispatchEvent(new Event('input',{bubbles:true}));});
  await music.press('ArrowRight');
  await expect(music).toHaveValue('36');
  await expect.poll(()=>page.evaluate(()=>window.volumeTest.gains.some(node=>Math.abs(node.gain.value-.36)<.005))).toBe(true);
  expect(await page.evaluate(()=>window.volumeTest.musicStarts)).toBe(1);
  await effects.press('Home');
  await expect(effects).toHaveValue('0');
  await page.getByRole('button',{name:'异兽图鉴',exact:true}).click();
  await page.getByRole('button',{name:'放大炭铃完整卡面',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.volumeTest.effects.at(-1))).toBe(0);
  expect((await saved(page)).musicVolume).toBe(36);
  expect((await saved(page)).effectsVolume).toBe(0);
  await page.reload();await openAudioMenu(page);
  await expect(music).toHaveValue('36');await expect(effects).toHaveValue('0');
  await page.screenshot({path:`qa/audio-levels-${test.info().project.name}.png`,fullPage:true});
  await noOverflow(page);
});

test('技能预览和行动结算默认精简，详情可独立展开',async({page})=>{
  const value=session();value.autoAdvance=false;
  let match=createLocalMatch('battle',value.players);
  for(const player of [0,1])match=dispatch(match,{type:'select',player,ids:[value.players[player].cards.find(card=>card.cardId===(player?'panjia':'luwenzhi')).id]});
  match=dispatch(match,{type:'advance'});
  for(const player of [0,1])match=dispatch(match,{type:'rps',player,value:player?'scissors':'rock'});
  match=dispatch(match,{type:'advance'});match.battle.hp[0]=40;match.battle.seal=[false,true];
  value.match=match;
  await openSession(page,value);
  const choice=page.locator('.skill-choice').nth(1),details=choice.locator('details');
  await expect(details).not.toHaveAttribute('open');
  await expect(choice.locator('.skill-button')).toContainText('实际回血');
  await expect(choice.locator('.skill-state-preview')).toContainText('待结伤势');
  await page.screenshot({path:`qa/combat-summary-${test.info().project.name}.png`,fullPage:true});
  await details.locator('summary').click();
  await expect(details).toContainText('暂存');
  await details.locator('summary').click();
  await choice.locator('.skill-button').click();
  const result=page.locator('.action-feedback');
  await expect(result.locator('.change-list')).toBeVisible();
  await expect(result.locator('details')).not.toHaveAttribute('open');
  await result.locator('summary').click();
  await expect(result.locator('details')).toContainText('暂存');
  await page.screenshot({path:`qa/combat-details-${test.info().project.name}.png`,fullPage:true});
  await noOverflow(page);
});
