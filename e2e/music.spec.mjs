import {test,expect,session,openSession,saved,noOverflow} from './fixtures.mjs';

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
  const toggle=page.getByRole('button',{name:'背景音乐',exact:true});
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
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  await expect.poll(state).toBe('suspended');
  expect((await saved(page)).musicEnabled).toBe(false);
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  expect(await state()).toBeUndefined();
  await toggle.click();
  await expect.poll(tracks).toEqual([explore]);
  await noOverflow(page);
});
