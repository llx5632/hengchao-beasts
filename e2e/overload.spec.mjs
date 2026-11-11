import {test,expect,session,openSession,saved,noOverflow,loadedImages,createLocalMatch,dispatch,CARDS} from './fixtures.mjs';
const id='chihoubaolong';
function scenario(cards=[id,'panjia'],{hp,cooling=0,shield=0}={}){
 const value=session();value.autoAdvance=false;let m=createLocalMatch('battle',value.players);
 for(const p of [0,1])m=dispatch(m,{type:'select',player:p,ids:[value.players[p].cards.find(c=>c.cardId===cards[p]).id]});
 m=dispatch(m,{type:'advance'});for(const p of [0,1])m=dispatch(m,{type:'rps',player:p,value:p?'scissors':'rock'});m=dispatch(m,{type:'advance'});
 if(hp)m.battle.hp=hp;if(cooling){m.battle.cooling[1]=cooling;m.battle.coolingMultiplier[1]=1.5;m.battle.coolingSource[1]=id;}if(shield)m.battle.shield[1]=shield;value.match=m;return value;
}
const attack=page=>page.locator('[data-action="attack"][data-skill="1"]');
async function next(page){await page.getByRole('button',{name:'进入下一轮猜拳',exact:true}).click();await page.getByRole('button',{name:'出石头',exact:true}).click();await page.getByRole('button',{name:'选择本次行动',exact:true}).click();}

test('赤喉暴龙完整卡面与29卡图鉴、选卡均可交互',async({page},info)=>{
 await openSession(page);await page.getByRole('button',{name:'异兽图鉴',exact:true}).click();await expect(page.locator('.beast-card')).toHaveCount(CARDS.length);
 await page.getByRole('button',{name:'放大赤喉暴龙完整卡面',exact:true}).click();await loadedImages(page,'#card-dialog img');await noOverflow(page);await page.screenshot({path:info.outputPath('chihou-card.png'),fullPage:true});
 await page.getByRole('button',{name:'关闭卡面',exact:true}).click();await page.getByRole('button',{name:'对局大厅',exact:true}).click();await page.getByRole('button',{name:'进入战斗　↗',exact:true}).click();await page.getByRole('button',{name:'选择 赤喉暴龙',exact:true}).click();await expect(page.getByRole('button',{name:'选择 赤喉暴龙',exact:true})).toHaveAttribute('aria-pressed','true');await noOverflow(page);
});
test('过载130、状态解释、刷新续局及重复60不刷新',async({page},info)=>{
 await openSession(page,scenario([id,id]));await expect(attack(page)).toContainText('伤害＋70至130');await noOverflow(page);await page.screenshot({path:info.outputPath('chihou-overload-preview.png'),fullPage:true});await attack(page).click();
 let value=await saved(page);expect(value.match.battle.hp).toEqual([240,110]);expect(value.match.battle.cooling).toEqual([2,0]);
 await page.getByRole('button',{name:/查看探索者的散热开鳞/}).click();await expect(page.getByRole('dialog')).toContainText('0直接扣血也计次');await noOverflow(page);await page.screenshot({path:info.outputPath('chihou-status.png'),fullPage:true});await page.getByRole('button',{name:'知道了',exact:true}).click();
 await page.reload();expect((await saved(page)).match).toEqual(value.match);await next(page);await expect(attack(page)).toContainText('仅基础60，不强化、不刷新');await noOverflow(page);await page.screenshot({path:info.outputPath('chihou-repeat-preview.png'),fullPage:true});await attack(page).click();value=await saved(page);expect(value.match.battle.hp[1]).toBe(50);expect(value.match.battle.cooling[0]).toBe(2);
});
test('散热两次均90，最后一次增伤后清除且不再增伤',async({page},info)=>{
 await openSession(page,scenario(['panjia',id],{cooling:2}));await expect(attack(page)).toContainText('散热1.5');await expect(attack(page)).toContainText('实际伤害 90');await attack(page).click();expect((await saved(page)).match.battle.hp[1]).toBe(150);expect((await saved(page)).match.battle.cooling[1]).toBe(1);
 await next(page);await expect(attack(page)).toContainText('实际伤害 90');await attack(page).click();let value=await saved(page);expect(value.match.battle.hp[1]).toBe(60);expect(value.match.battle.cooling[1]).toBe(0);await page.reload();expect((await saved(page)).match).toEqual(value.match);await next(page);await expect(attack(page)).toContainText('实际伤害 60');await noOverflow(page);await page.screenshot({path:info.outputPath('chihou-cooling-cleared.png'),fullPage:true});
});
test('护盾全挡零扣血仍消耗一次，剩余次数可查看',async({page},info)=>{
 await openSession(page,scenario(['panjia',id],{cooling:2,shield:200}));await expect(attack(page)).toContainText('实际伤害 0');await attack(page).click();const value=await saved(page);expect(value.match.battle.hp[1]).toBe(240);expect(value.match.battle.cooling[1]).toBe(1);expect(value.match.battle.shield[1]).toBe(0);await noOverflow(page);await page.screenshot({path:info.outputPath('chihou-zero-hit.png'),fullPage:true});
});
test('130致胜预览与结算一致，不挂散热，刷新不重复转卡',async({page},info)=>{
 const value=scenario(undefined,{hp:[240,120]});await openSession(page,value);await expect(attack(page)).toContainText('战斗结束不再获得散热');await attack(page).click();const before=await saved(page);expect(before.match.winner).toBe(0);expect(before.match.battle.cooling).toEqual([0,0]);expect(before.match.transfers).toHaveLength(1);await page.reload();expect((await saved(page)).players).toEqual(before.players);await noOverflow(page);await page.screenshot({path:info.outputPath('chihou-win.png'),fullPage:true});
});
test('掷骰预览15至90，保留6点只扣一次散热',async({page},info)=>{
 await openSession(page,scenario(['koujinchan',id],{cooling:2}));const dice=page.locator('[data-action="attack"][data-skill="0"]');await expect(dice).toContainText('15～90');await dice.click();expect((await saved(page)).match.battle.cooling[1]).toBe(2);await page.getByRole('button',{name:/保留 6 点/}).click();const value=await saved(page);expect(value.match.battle.hp[1]).toBe(150);expect(value.match.battle.cooling[1]).toBe(1);await noOverflow(page);await page.screenshot({path:info.outputPath('chihou-dice.png'),fullPage:true});
});
