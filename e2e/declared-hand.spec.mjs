import {test,expect,session,openSession,saved,noOverflow,loadedImages,createLocalMatch,dispatch,CARDS} from './fixtures.mjs';

const id='mingzhiyuan';
const skill=(page,index)=>page.locator(`[data-action="attack"][data-skill="${index}"]`);
const declaration=page=>page.locator('[data-kind="declaredHand"][data-player="0"]');
const boost=page=>page.locator('[data-kind="declaredStrike"][data-player="0"]');
function scenario(){
  const value=session();value.autoAdvance=false;
  let m=createLocalMatch('battle',value.players);
  for(const player of [0,1])m=dispatch(m,{type:'select',player,ids:[value.players[player].cards.find(c=>c.cardId===(player?'caiyeqiaojia':id)).id]});
  m=dispatch(m,{type:'advance'});
  for(const player of [0,1])m=dispatch(m,{type:'rps',player,value:player?'scissors':'rock'});
  value.match=dispatch(m,{type:'advance'});
  return value;
}
async function declare(page,hand){
  await skill(page,1).click();
  await page.getByRole('button',{name:`宣告${hand}`,exact:true}).click();
  await expect(declaration(page)).toContainText(`已宣告${hand}`);
}
async function nextRps(page){await page.getByRole('button',{name:'进入下一轮猜拳',exact:true}).click();}
async function winRock(page){
  await page.getByRole('button',{name:'出石头',exact:true}).click();
  await page.getByRole('button',{name:'选择本次行动',exact:true}).click();
}

test('鸣帜鸢完整卡面、图鉴及战斗选卡',async({page},info)=>{
  await openSession(page);
  await page.getByRole('button',{name:'异兽图鉴',exact:true}).click();
  await expect(page.locator('.beast-card')).toHaveCount(CARDS.length);
  await page.getByRole('button',{name:'放大鸣帜鸢完整卡面',exact:true}).click();
  await loadedImages(page,'#card-dialog img');await noOverflow(page);
  await page.locator('#card-dialog').screenshot({path:info.outputPath('mingzhi-card.png')});
  await page.getByRole('button',{name:'关闭卡面',exact:true}).click();
  await page.getByRole('button',{name:'对局大厅',exact:true}).click();
  await page.getByRole('button',{name:'进入战斗　↗',exact:true}).click();
  const pick=page.getByRole('button',{name:'选择 鸣帜鸢',exact:true});
  await pick.click();await expect(pick).toHaveAttribute('aria-pressed','true');await noOverflow(page);
});
test('宣告选择、平手保留、续局强化120及实际兑现',async({page},info)=>{
  await page.emulateMedia({reducedMotion:'reduce'});await openSession(page,scenario());
  await skill(page,1).click();await expect(page.locator('#dialog')).toBeVisible();await noOverflow(page);
  await page.locator('#dialog').screenshot({path:info.outputPath('mingzhi-declare.png')});
  await page.getByRole('button',{name:'宣告石头',exact:true}).click();
  await expect(declaration(page)).toContainText('已宣告石头');
  expect((await saved(page)).match.battle.hp[1]).toBe(130);
  await nextRps(page);
  await page.getByRole('button',{name:'出剪刀',exact:true}).click();
  await page.getByRole('button',{name:'重新猜拳',exact:true}).waitFor();
  await expect(declaration(page)).toContainText('已宣告石头');
  await page.reload();await expect(declaration(page)).toContainText('已宣告石头');
  await page.getByRole('button',{name:'重新猜拳',exact:true}).click();await winRock(page);
  await expect(boost(page)).toContainText('伤害＋55');await expect(skill(page,0)).toContainText('实际伤害 120');
  await page.reload();await expect(skill(page,0)).toContainText('实际伤害 120');await noOverflow(page);
  await page.screenshot({path:info.outputPath('mingzhi-boost.png'),fullPage:true});
  await skill(page,0).click();const match=(await saved(page)).match;
  expect(match.battle.hp[1]).toBe(10);expect(match.battle.declaredStrike[0]).toBe(false);
  await page.reload();expect((await saved(page)).match).toEqual(match);
});
test('临场换拳获胜保留行动权，俯冲只打65',async({page},info)=>{
  await page.emulateMedia({reducedMotion:'reduce'});await openSession(page,scenario());
  await declare(page,'布');await nextRps(page);await winRock(page);
  await expect(declaration(page)).toHaveCount(0);await expect(boost(page)).toHaveCount(0);
  await expect(skill(page,0)).toContainText('实际伤害 65');await noOverflow(page);
  await page.screenshot({path:info.outputPath('mingzhi-bluff.png'),fullPage:true});
  await skill(page,0).click();expect((await saved(page)).match.battle.hp[1]).toBe(65);
});
test('强化后重施鸣哨只打50并建立新宣告',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await openSession(page,scenario());
  await declare(page,'石头');await nextRps(page);await winRock(page);
  await expect(skill(page,1)).toContainText('实际伤害 50');await declare(page,'剪刀');
  const match=(await saved(page)).match;
  expect(match.battle.hp[1]).toBe(80);expect(match.battle.declaredStrike).toEqual([false,false]);
  expect(match.battle.declaredHand[0]).toBe('scissors');await noOverflow(page);
});
