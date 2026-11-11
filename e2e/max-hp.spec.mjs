import {test,expect,session,openSession,saved,noOverflow,loadedImages,createLocalMatch,dispatch,CARDS} from './fixtures.mjs';
const id='shishayishi';
function scenario(other='panjia',{hp,shield=0,seal=false,weaken=0,reflect=false,cooling=0,burn=0}={}){
 const value=session();value.autoAdvance=false;let m=createLocalMatch('battle',value.players);
 for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:[value.players[p].cards.find(c=>c.cardId===(p?other:id)).id]});
 m=dispatch(m,{type:'advance'});for(const p of [0,1])m=dispatch(m,{type:'rps',player:p,value:p?'scissors':'rock'});m=dispatch(m,{type:'advance'});
 if(hp)m.battle.hp=hp;m.battle.shield[1]=shield;m.battle.seal[1]=seal;m.battle.weaken[0]=weaken;m.battle.burn[0]=burn;
 if(reflect){m.battle.reflectWard[1]=true;m.battle.reflectRate[1]=100;m.battle.reflectCap[1]=50;m.battle.reflectSource[1]='huangjitun';}
 if(cooling){m.battle.cooling[1]=cooling;m.battle.coolingMultiplier[1]=1.5;m.battle.coolingSource[1]='chihoubaolong';}
 value.match=m;return value;
}
const bite=page=>page.locator('[data-action="attack"][data-skill="1"]');
test('蚀砂蚁狮进入30卡图鉴、No029完整卡面与战斗选卡',async({page},info)=>{
 await openSession(page);await page.getByRole('button',{name:'异兽图鉴',exact:true}).click();await expect(page.locator('.beast-card')).toHaveCount(CARDS.length);
 await page.getByRole('button',{name:'放大蚀砂蚁狮完整卡面',exact:true}).click();await loadedImages(page,'#card-dialog img');await noOverflow(page);await page.screenshot({path:info.outputPath('shisha-card.png'),fullPage:true});
 await page.getByRole('button',{name:'关闭卡面',exact:true}).click();await page.getByRole('button',{name:'对局大厅',exact:true}).click();await page.getByRole('button',{name:'进入战斗　↗',exact:true}).click();await page.getByRole('button',{name:'选择 蚀砂蚁狮',exact:true}).click();await expect(page.getByRole('button',{name:'选择 蚀砂蚁狮',exact:true})).toHaveAttribute('aria-pressed','true');await noOverflow(page);
});
test('最大HP160追加40形成60，实际出手与刷新保持一致',async({page},info)=>{
 await openSession(page,scenario());await expect(bite(page)).toContainText('目标最大HP160的25%');await expect(bite(page)).toContainText('基础20＋最大HP追加40＝60');await expect(bite(page)).toContainText('自己最终HP：135 → 135');await noOverflow(page);await page.screenshot({path:info.outputPath('shisha-preview.png'),fullPage:true});
 await bite(page).click();const before=await saved(page);expect(before.match.battle.hp).toEqual([135,100]);expect(before.match.status).toBe('active');await page.reload();expect((await saved(page)).match).toEqual(before.match);await noOverflow(page);
});
test('削弱护盾封伤按单笔处理，60到45到30后暂存15',async({page},info)=>{
 await openSession(page,scenario('panjia',{weaken:1,shield:15,seal:true}));await expect(bite(page)).toContainText('实际伤害 15');await expect(bite(page)).toContainText('本次暂存15伤害');await bite(page).click();const value=await saved(page);expect(value.match.battle.hp).toEqual([135,145]);expect(value.match.battle.debt[1]).toBe(15);expect(value.match.battle.shield[1]).toBe(0);expect(value.match.battle.seal[1]).toBe(false);await noOverflow(page);await page.screenshot({path:info.outputPath('shisha-defense.png'),fullPage:true});
});
test('反刺局面47保留1HP，50致败预览明确且实际一致',async({page},info)=>{
 await openSession(page,scenario('huangjitun',{hp:[48,80],reflect:true}));await expect(bite(page)).toContainText('自己最终HP：48 → 1');await expect(page.locator('[data-action="attack"][data-skill="0"]')).toContainText('判负失卡');await noOverflow(page);await page.screenshot({path:info.outputPath('shisha-reflect-choice.png'),fullPage:true});await bite(page).click();const value=await saved(page);expect(value.match.battle.hp).toEqual([1,33]);expect(value.match.battle.reflectWard[1]).toBe(false);expect(value.match.status).toBe('active');await page.reload();expect((await saved(page)).match).toEqual(value.match);await noOverflow(page);
});
test('对240HP封顶追加50，散热增幅整笔70为105且只计一次',async({page},info)=>{
 await openSession(page,scenario('chihoubaolong',{cooling:2}));await expect(bite(page)).toContainText('向下取整60，追加最多50');await expect(bite(page)).toContainText('本次追加50');await expect(bite(page)).toContainText('实际伤害 105');await expect(bite(page)).toContainText('（基础20＋最大HP追加50）×散热1.5');await noOverflow(page);await page.screenshot({path:info.outputPath('shisha-capped-cooling.png'),fullPage:true});await bite(page).click();const value=await saved(page);expect(value.match.battle.hp).toEqual([135,135]);expect(value.match.battle.cooling[1]).toBe(1);await noOverflow(page);
});
test('残血10仍按最大HP240计算，致胜不追加行动末且刷新不重复赢卡',async({page},info)=>{
 await openSession(page,scenario('chihoubaolong',{hp:[135,10],burn:2}));await expect(bite(page)).toContainText('目标最大HP240的25%');await expect(bite(page)).toContainText('实际伤害 10');await expect(bite(page)).toContainText('自己最终HP：135 → 135');await bite(page).click();const before=await saved(page);expect(before.match.winner).toBe(0);expect(before.match.battle.hp).toEqual([135,0]);expect(before.match.transfers).toHaveLength(1);await page.reload();expect((await saved(page)).players).toEqual(before.players);expect((await saved(page)).match).toEqual(before.match);await noOverflow(page);await page.screenshot({path:info.outputPath('shisha-win.png'),fullPage:true});
});
