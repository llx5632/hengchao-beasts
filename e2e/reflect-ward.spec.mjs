import {test,expect,session,openSession,saved,noOverflow,loadedImages,createLocalMatch,dispatch,CARDS} from './fixtures.mjs';

function scenario(cards=['huangjitun','panjia'],hp=null,reflectPlayer=null){
  const value=session();value.autoAdvance=false;let m=createLocalMatch('battle',value.players);
  for(const player of [0,1])m=dispatch(m,{type:'select',player,ids:[value.players[player].cards.find(c=>c.cardId===cards[player]).id]});
  m=dispatch(m,{type:'advance'});
  for(const player of [0,1])m=dispatch(m,{type:'rps',player,value:player?'scissors':'rock'});
  m=dispatch(m,{type:'advance'});
  if(hp)m.battle.hp=hp;
  if(reflectPlayer!==null){m.battle.reflectWard[reflectPlayer]=true;m.battle.reflectRate[reflectPlayer]=100;m.battle.reflectCap[reflectPlayer]=50;m.battle.reflectSource[reflectPlayer]='huangjitun';}
  value.match=m;return value;
}

test('簧棘鲀进入当前图鉴、完整卡面与战斗选卡',async({page},info)=>{
  await openSession(page);
  await page.getByRole('button',{name:'异兽图鉴',exact:true}).click();
  await expect(page.locator('.beast-card')).toHaveCount(CARDS.length);
  await page.getByRole('button',{name:'放大簧棘鲀完整卡面',exact:true}).click();
  await loadedImages(page,'#card-dialog img');await noOverflow(page);
  await page.screenshot({path:info.outputPath('huangji-card.png'),fullPage:true});
  await page.getByRole('button',{name:'关闭卡面',exact:true}).click();
  await page.getByRole('button',{name:'对局大厅',exact:true}).click();
  await page.getByRole('button',{name:'进入战斗　↗',exact:true}).click();
  await page.getByRole('button',{name:'选择 簧棘鲀',exact:true}).click();
  await expect(page.getByRole('button',{name:'选择 簧棘鲀',exact:true})).toHaveAttribute('aria-pressed','true');
  await noOverflow(page);
});

test('实际准备反刺、查看状态、刷新续局并重施不叠加',async({page},info)=>{
  await openSession(page,scenario());
  await page.locator('[data-action="attack"][data-skill="1"]').click();
  await expect(page.locator('.action-feedback')).toContainText('获得一次反刺');
  const before=await saved(page);expect(before.match.battle.reflectWard[0]).toBe(true);expect(before.match.battle.hp[1]).toBe(145);
  await page.getByRole('button',{name:/查看探索者的反刺待发/}).click();
  await expect(page.getByRole('dialog')).toContainText('致命受击仍先反刺再判胜负');
  await noOverflow(page);await page.screenshot({path:info.outputPath('huangji-status.png'),fullPage:true});
  await page.getByRole('button',{name:'知道了',exact:true}).click();
  await page.reload();expect((await saved(page)).match).toEqual(before.match);
  await page.getByRole('button',{name:'进入下一轮猜拳',exact:true}).click();
  await page.getByRole('button',{name:'出石头',exact:true}).click();
  await page.getByRole('button',{name:'选择本次行动',exact:true}).click();
  await expect(page.locator('[data-action="attack"][data-skill="1"]')).toContainText('已有反刺');
  await page.locator('[data-action="attack"][data-skill="1"]').click();
  const after=await saved(page);expect(after.match.battle.reflectCap[0]).toBe(50);expect(after.match.battle.hp[1]).toBe(130);
  await noOverflow(page);
});

test('致命反刺预览与真实平局一致，双方保卡且刷新不重复转移',async({page},info)=>{
  const value=scenario(['panjia','huangjitun'],[30,30],1);
  await openSession(page,value);
  const attack=page.locator('[data-action="attack"][data-skill="1"]');
  await expect(attack).toContainText('反刺及死亡反应后双方HP归零');
  await expect(attack).toContainText('自己最终HP：30 → 0');
  await noOverflow(page);await page.screenshot({path:info.outputPath('huangji-draw-preview.png'),fullPage:true});
  await attack.click();
  await expect(page.locator('.result-title')).toContainText('平局');
  const before=await saved(page);expect(before.match.battle.hp).toEqual([0,0]);expect(before.match.transfers).toHaveLength(0);expect(before.players).toEqual(value.players);expect(before.match.reason).toContain('反刺');
  await page.reload();expect((await saved(page)).match).toEqual(before.match);expect((await saved(page)).players).toEqual(before.players);
  await noOverflow(page);await page.screenshot({path:info.outputPath('huangji-draw-result.png'),fullPage:true});
});

test('弱攻击消耗反刺后继续治疗，预览与真实HP一致',async({page},info)=>{
  await openSession(page,scenario(['woxu','huangjitun'],[25,80],1));
  const attack=page.locator('[data-action="attack"][data-skill="1"]');
  await expect(attack).toContainText('实际反刺伤害15');await expect(attack).toContainText('自己最终HP：25 → 20');
  await attack.click();await expect(page.locator('.action-feedback')).toContainText('反刺');
  const after=await saved(page);expect(after.match.battle.hp).toEqual([20,65]);expect(after.match.battle.reflectWard[1]).toBe(false);expect(after.match.status).toBe('active');
  await noOverflow(page);await page.screenshot({path:info.outputPath('huangji-weak-counter.png'),fullPage:true});
});

test('骰点决定前预告反刺致败，保留后只结一次并转实际卡',async({page},info)=>{
  await openSession(page,scenario(['koujinchan','huangjitun'],[25,80],1));
  await expect(page.locator('[data-action="attack"][data-skill="0"]')).toContainText('骰点6：实际直接伤害60');
  await page.locator('[data-action="attack"][data-skill="0"]').click();
  await expect(page.getByRole('heading',{name:'首掷 6 点',exact:true})).toBeVisible();
  await expect(page.locator('.panel').last()).toContainText('因反刺及后续结算归零，自己战败');
  expect((await saved(page)).match.battle.reflectWard[1]).toBe(true);
  await noOverflow(page);await page.screenshot({path:info.outputPath('huangji-dice-risk.png'),fullPage:true});
  await page.getByRole('button',{name:/保留 6 点.*警告：自己战败/}).click();
  const before=await saved(page);expect(before.match.winner).toBe(1);expect(before.match.transfers).toHaveLength(1);expect(before.match.transfers[0].cardId).toBe('koujinchan');expect(before.players.map(p=>p.cards.length)).toEqual([CARDS.length-1,CARDS.length+1]);
  await page.reload();expect((await saved(page)).players).toEqual(before.players);await noOverflow(page);
});
