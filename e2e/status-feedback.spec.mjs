import {test,expect,session,openSession,createLocalMatch,dispatch,saved,noOverflow,openAudioMenu} from './fixtures.mjs';

function active(own='panjia',enemy='fuchao'){
  const value=session();value.effectsEnabled=true;value.autoAdvance=false;
  let match=createLocalMatch('battle',value.players);
  for(const player of [0,1]){
    const cardId=player?enemy:own;
    match=dispatch(match,{type:'select',player,ids:[value.players[player].cards.find(card=>card.cardId===cardId).id]});
  }
  match=dispatch(match,{type:'advance'});
  for(const player of [0,1])match=dispatch(match,{type:'rps',player,value:player?'scissors':'rock'});
  value.match=dispatch(match,{type:'advance'});
  return value;
}

test('磐甲封伤生效时卡面与状态标记一起反馈，刷新静态恢复',async({page})=>{
  await openSession(page,active());
  await page.locator('[data-action="attack"][data-skill="0"]').click();
  await expect(page.locator('[data-feedback-side="0"] .status-feedback')).toContainText('封伤保护 · 生效');
  expect((await saved(page)).match.battle.seal[0]).toBe(true);
  await page.screenshot({path:`qa/status-seal-${test.info().project.name}.png`,fullPage:true});
  await page.reload();
  await expect(page.locator('.status-feedback')).toHaveCount(0);
  expect((await saved(page)).match.battle.seal[0]).toBe(true);
  await noOverflow(page);
});

test('封伤暂存及旧伤结算以实际伤势显示，不增加额外行动',async({page})=>{
  const value=active();value.match.battle.seal=[false,true];
  await openSession(page,value);
  await page.locator('[data-action="attack"][data-skill="1"]').click();
  const notice=page.locator('[data-feedback-side="1"] .status-feedback');
  await expect(notice).toContainText('封伤保护 · 消耗');
  await expect(notice).toContainText('待结伤势 · 生效');
  expect((await saved(page)).match.battle.debt[1]).toBe(30);
  expect((await saved(page)).match.phase).toBe('battle-turn');
  await noOverflow(page);
});

test('减少动态效果与静音下仍显示状态变化文字',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const value=active();value.effectsEnabled=false;value.match.battle.debt=[20,0];
  await openSession(page,value);
  await page.locator('[data-action="attack"][data-skill="0"]').click();
  const notice=page.locator('.status-feedback');
  await expect(notice).toContainText('待结伤势 · 化解');
  expect(await notice.evaluate(node=>node.getAnimations().length)).toBe(0);
  expect((await saved(page)).match.battle.debt[0]).toBe(0);
  await openAudioMenu(page);
  await expect(page.locator('[data-action="effects-toggle"]')).toHaveAttribute('aria-pressed','false');
  await noOverflow(page);
});
