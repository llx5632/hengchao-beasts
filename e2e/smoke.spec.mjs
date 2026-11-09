import {test,expect,session,openSession,saved,noOverflow,loadedImages,battleSession,CARDS,CARD} from './fixtures.mjs';

test('图鉴、全部卡图与四张正式归档卡放大',async({page})=>{
  await openSession(page);
  await page.getByRole('button',{name:'异兽图鉴',exact:true}).click();
  await expect(page.locator('.beast-card')).toHaveCount(CARDS.length);
  await loadedImages(page,'.collection-grid img');await noOverflow(page);
  for(const id of ['xianbei','dielin','jinzong','mingnang']){
    await page.getByRole('button',{name:`放大${CARD[id].name}完整卡面`,exact:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await loadedImages(page,'#card-dialog img');await noOverflow(page);
    await page.getByRole('button',{name:'关闭卡面',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  }
});

test('选卡、筛选、常用阵容和刷新恢复',async({page})=>{
  await openSession(page);
  await page.getByRole('button',{name:'进入拼点　↗',exact:true}).click();
  const chosen=CARDS.slice(0,5);
  for(const card of chosen)await page.getByRole('button',{name:`选择 ${card.name}`,exact:true}).click();
  await expect(page.locator('[data-action="choose-card"][aria-pressed="true"]')).toHaveCount(5);
  await page.getByRole('button',{name:'筛选风属性',exact:true}).click();
  await expect(page.locator('.draft-slot:not(.empty-slot)')).toHaveCount(5);
  await noOverflow(page);
  await page.getByRole('button',{name:'保存为常用阵容',exact:true}).click();
  await page.getByLabel('阵容名称').fill('冒烟检查阵容');
  await page.getByRole('button',{name:'保存阵容',exact:true}).click();
  const before=await saved(page);
  await page.reload();
  await expect(page.locator('[data-action="choose-card"][aria-pressed="true"]')).toHaveCount(5);
  const after=await saved(page);
  expect(after.selectionDrafts.point).toEqual(before.selectionDrafts.point);
  expect(after.lineupPresets).toEqual(before.lineupPresets);
  await noOverflow(page);
});

test('活动战斗刷新保持HP、撤退、收藏和行动阶段',async({page})=>{
  const value=battleSession();value.autoAdvance=false;
  await openSession(page,value);
  await page.locator('[data-action="attack"][data-skill="0"]').click();
  await expect(page.locator('.action-feedback')).toBeVisible();
  const before=await saved(page);expect(before.match.battle.hp[1]).toBeLessThan(CARD.liejing.hp);
  await page.reload();
  await expect(page.locator('.action-feedback')).toBeVisible();
  const after=await saved(page);
  expect(after.match).toEqual(before.match);expect(after.players).toEqual(before.players);
  await noOverflow(page);
});

test('卡面弹窗和公开记录暂停AI，关闭后重新计时',async({page})=>{
  // A pending AI action must remain pending while a real dialog/details is open.
  await page.clock.install({time:new Date('2026-11-06T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-11-06T00:00:01Z'));
  await openSession(page,battleSession(1));
  await page.getByRole('button',{name:'放大炉甲蟹完整卡面',exact:true}).click();
  const before=await saved(page);
  await page.clock.runFor(5000);
  expect((await saved(page)).match).toEqual(before.match);
  await page.getByRole('button',{name:'关闭卡面',exact:true}).click();
  await page.locator('.log summary').click();
  await expect(page.locator('.flow-controls [role="status"]')).toContainText('查看内容');
  await page.clock.runFor(5000);
  expect((await saved(page)).match).toEqual(before.match);
  await page.locator('.log summary').click();
  await expect(page.locator('.flow-controls [role="status"]')).not.toContainText('查看内容');
  await page.clock.runFor(649);
  expect((await saved(page)).match).toEqual(before.match);
  await page.clock.runFor(1);
  expect((await saved(page)).match.phase).toBe('battle-turn');
  await expect(page.locator('.action-feedback')).toBeVisible();
});

test('保存失败保留阵容命名，恢复后重试只保存一份',async({page})=>{
  await openSession(page);
  await page.getByRole('button',{name:'进入战斗　↗',exact:true}).click();
  await page.getByRole('button',{name:'选择 炭铃',exact:true}).click();
  await page.getByRole('button',{name:'保存为常用阵容',exact:true}).click();
  await page.getByLabel('阵容名称').fill('失败后保留的名称');
  await page.evaluate(()=>{
    window.smokeSetItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(){throw new DOMException('Smoke quota failure','QuotaExceededError');};
  });
  await page.getByRole('button',{name:'保存阵容',exact:true}).click();
  await expect(page.locator('.save-warning')).toContainText('存档未能写入');
  await expect(page.getByLabel('阵容名称')).toHaveValue('失败后保留的名称');
  expect((await saved(page)).lineupPresets).toHaveLength(0);
  await page.evaluate(()=>{Storage.prototype.setItem=window.smokeSetItem;delete window.smokeSetItem;});
  await page.getByRole('button',{name:'保存阵容',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await saved(page)).lineupPresets).toHaveLength(1);
  await page.reload();expect((await saved(page)).lineupPresets).toHaveLength(1);
});

test('草稿保存失败时重试按钮可恢复，刷新后保留原选择',async({page})=>{
  await openSession(page);
  await page.getByRole('button',{name:'进入战斗　↗',exact:true}).click();
  await page.evaluate(()=>{
    window.smokeSetItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(){throw new DOMException('Smoke quota failure','QuotaExceededError');};
  });
  await page.getByRole('button',{name:'选择 炭铃',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('存档未能写入');
  await page.getByRole('button',{name:'重试保存',exact:true}).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.evaluate(()=>{Storage.prototype.setItem=window.smokeSetItem;delete window.smokeSetItem;});
  await page.getByRole('button',{name:'重试保存',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('已成功写入');
  await page.reload();
  await expect(page.getByRole('button',{name:'选择 炭铃',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('从大厅完成战斗，实际赢卡且刷新不重复转卡',async({page})=>{
  const value=session();value.autoAdvance=false;
  await openSession(page,value);
  await page.getByRole('button',{name:'进入战斗　↗',exact:true}).click();
  await page.getByRole('button',{name:'选择 炭铃',exact:true}).click();
  await page.getByRole('button',{name:'封存出战卡',exact:true}).click();
  await page.getByRole('button',{name:'开始猜拳',exact:true}).click();
  for(let hit=0;hit<2;hit++){
    await page.getByRole('button',{name:'出石头',exact:true}).click();
    await page.getByRole('button',{name:'选择本次行动',exact:true}).click();
    await page.locator('[data-action="attack"][data-skill="1"]').click();
    if(hit===0)await page.getByRole('button',{name:'进入下一轮猜拳',exact:true}).click();
  }
  await expect(page.locator('.result-title')).toContainText('探索者 胜利');
  const before=await saved(page);
  expect(before.match.transfers).toHaveLength(1);
  expect(before.players.map(p=>p.cards.length)).toEqual([CARDS.length+1,CARDS.length-1]);
  await page.reload();expect((await saved(page)).players).toEqual(before.players);
  await noOverflow(page);
});

test('从选卡完成五小局拼点，实例守恒且结果可刷新',async({page})=>{
  const value=session();value.autoAdvance=false;
  await openSession(page,value);
  await page.getByRole('button',{name:'进入拼点　↗',exact:true}).click();
  // Random .999 keeps AI's first five and both shuffle orders stable.
  for(const card of CARDS.slice(5,10))await page.getByRole('button',{name:`选择 ${card.name}`,exact:true}).click();
  await page.getByRole('button',{name:'封存出战卡',exact:true}).click();
  await expect(page.getByRole('heading',{name:'双方五张出战牌已公开'})).toBeVisible();
  await page.getByRole('button',{name:'已了解阵容，打乱并继续',exact:true}).click();
  for(let round=0;round<5;round++){
    await page.getByRole('button',{name:'继续下一小局',exact:true}).click();
    // AI selects 6; 6+6 compares weight, different for all five selected pairs.
    await page.getByRole('button',{name:'选择点数 6',exact:true}).click();
    await page.getByRole('button',{name:round===4?'查看整场结果':'前往下一小局',exact:true}).click();
  }
  await expect(page.locator('.result-title')).toBeVisible();
  const before=await saved(page);
  expect(before.match.status).toBe('finished');expect(before.match.rounds).toHaveLength(5);
  expect(before.match.transfers).toHaveLength(5);
  const ids=before.players.flatMap(p=>p.cards.map(c=>c.id));
  expect(ids).toHaveLength(CARDS.length*2);expect(new Set(ids).size).toBe(ids.length);
  await page.reload();expect((await saved(page)).match).toEqual(before.match);
  await noOverflow(page);
});
