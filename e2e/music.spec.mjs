import {test,expect,session,openSession,saved,noOverflow,openAudioMenu} from './fixtures.mjs';

test('背景音乐在交互后循环播放、切换场景、暂停并保存开关',async({page})=>{
  await page.addInitScript(()=>{
    const OriginalAudioContext=window.AudioContext;
    window.musicTest={context:null,tracks:[],hidden:false};
    Object.defineProperty(document,'hidden',{get:()=>window.musicTest.hidden});
    window.AudioContext=class extends OriginalAudioContext{
      constructor(){
        super();
        window.musicTest.context=this;
      }
      createBufferSource(){
        const source=super.createBufferSource();
        const start=source.start.bind(source);
        source.start=(...args)=>{
          start(...args);
          window.musicTest.tracks.push({duration:Math.round(source.buffer.duration),loop:source.loop});
        };
        return source;
      }
    };
  });
  const value=session();
  delete value.musicEnabled; // Existing player saves default to enabled.
  await openSession(page,value);
  const toggle=page.locator('[data-action="music-toggle"]');
  const tracks=()=>page.evaluate(()=>window.musicTest.tracks);
  const state=()=>page.evaluate(()=>window.musicTest.context?.state);
  const visibility=hidden=>page.evaluate(hidden=>{
    window.musicTest.hidden=hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  },hidden);
  const explore={duration:48,loop:true};
  const battle={duration:34,loop:true};
  await expect(toggle).toHaveAttribute('aria-pressed','true');
  expect(await state()).toBeUndefined();
  await page.getByRole('button',{name:'异兽图鉴',exact:true}).click();
  await expect.poll(tracks).toEqual([explore]);
  await page.getByRole('button',{name:'对局大厅',exact:true}).click();
  await page.locator('[data-action="start-battle"]').click();
  await expect.poll(tracks).toEqual([explore,battle]);
  await page.getByRole('button',{name:'对局大厅',exact:true}).click();
  await expect.poll(tracks).toEqual([explore,battle,explore]);
  await page.locator('[data-action="start-point"]').click();
  await expect.poll(state).toBe('running');
  expect(await tracks()).toEqual([explore,battle,explore]);
  await visibility(true);
  await expect.poll(state).toBe('suspended');
  await visibility(false);
  await expect.poll(state).toBe('running');
  expect(await tracks()).toEqual([explore,battle,explore]);
  await openAudioMenu(page);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  await expect.poll(state).toBe('suspended');
  expect((await saved(page)).musicEnabled).toBe(false);
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  expect(await state()).toBeUndefined();
  await openAudioMenu(page);
  await toggle.click();
  await expect.poll(tracks).toEqual([explore]);
  await noOverflow(page);
});

test('顶部音频入口在正式页面与教程可用，移动端菜单支持退出和保存',async({page})=>{
  await openSession(page);
  const menu=page.getByRole('button',{name:'音频设置',exact:true});
  const switches=page.locator('#audio-options');
  const mobile=await menu.isVisible();
  await expect(page.locator('.topbar #audio-options')).toHaveCount(1);
  await expect(page.locator('footer #audio-options')).toHaveCount(0);
  if(mobile){
    await expect(switches).toBeHidden();
    await openAudioMenu(page);
    await expect(menu).toHaveAttribute('aria-expanded','true');
    await expect(switches).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    await expect(switches).toBeHidden();
  }else await expect(switches).toBeVisible();
  await page.locator('[data-action="tutorial-open"]').click();
  await page.locator('[data-action="tutorial-begin"]').click();
  await expect(page.locator('.tutorial-top #audio-options')).toHaveCount(1);
  await openAudioMenu(page);
  const music=page.getByRole('button',{name:'背景音乐',exact:true});
  const effects=page.getByRole('button',{name:'对局音效',exact:true});
  const preloads=new Set();
  let requestedLastEffect=false;
  // Wait for this page's audio preloads before navigation cancels them.
  page.on('request',request=>{
    const path=new URL(request.url()).pathname;
    if(!/\/sfx-[^/]+\.wav$/.test(path))return;
    preloads.add(request);
    if(path.endsWith('/sfx-status-harm.wav'))requestedLastEffect=true;
  });
  page.on('requestfinished',request=>preloads.delete(request));
  await effects.click();
  await expect(effects).toHaveAttribute('aria-pressed','true');
  await expect(music).toHaveAttribute('aria-pressed','false');
  if(mobile){
    await page.locator('#tutorial-heading').click({position:{x:4,y:4}});
    await expect(switches).toBeHidden();
  }
  await noOverflow(page);
  await expect.poll(()=>requestedLastEffect&&preloads.size===0).toBe(true);
  await page.reload();
  await openAudioMenu(page);
  await expect(effects).toHaveAttribute('aria-pressed','true');
  await expect(music).toHaveAttribute('aria-pressed','false');
});
