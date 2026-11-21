export const EASTER_EGG_MESSAGES = Object.freeze([
  '恭喜你发现了彩蛋',
  '彩蛋的内容是......',
  '彩蛋的内容是......',
  '彩蛋的内容是......',
  '其实，彩蛋的内容还没有想好，但是能玩到这里，谢谢你玩这个游戏，这是我小时候的一种卡牌玩法，不知道你会不会喜欢，再次感谢',
]);
export const FIREWORKS_DURATION = 6000;
export function normalizeEasterEgg(value) {
  if(value?.version!==1||!['active','paused','fireworks','completed'].includes(value.status))return null;
  const max=value.status==='active'?4:5;
  if(!Number.isInteger(value.step)||value.step<0||value.step>max)return null;
  return {version:1,status:value.status,step:value.step};
}
export function earnedEasterEgg(session) {
  const players=session.players,m=session.match;
  return Boolean(players?.[0]?.cards?.length>0&&players?.[1]?.cards?.length===0&&
    m&&m.inventories?.[1]?.length===0&&m.transfers?.some(t=>t.from===1&&t.to===0)&&
    ['battle','point'].includes(m.mode));
}
export function unlockEasterEgg(session) {
  if(normalizeEasterEgg(session.easterEgg)||!earnedEasterEgg(session))return session.easterEgg??null;
  return {version:1,status:'active',step:0};
}
export function nextEasterEgg(state,expectedStep) {
  if(state?.status!=='active'||state.step!==expectedStep)return state;
  const step=state.step+1;
  return {...state,step,status:step===EASTER_EGG_MESSAGES.length?'fireworks':'active'};
}
export function fireworksMarkup() {
  const bursts=[[18,24,45,0],[75,20,175,.35],[45,46,315,.75],[80,66,30,1.1],[20,68,210,1.45],[52,18,55,1.8]];
  return bursts.map(([x,y,hue,delay])=>`<div class="egg-burst" style="left:${x}%;top:${y}%;--hue:${hue};--delay:${delay}s">${Array.from({length:28},(_,i)=>{
    const angle=i*Math.PI*2/28,radius=66+(i%3)*24;
    return `<i style="--dx:${Math.cos(angle)*radius}px;--dy:${Math.sin(angle)*radius}px;--trail:${(i%4)*.035}s"></i>`;
  }).join('')}</div>`).join('');
}
