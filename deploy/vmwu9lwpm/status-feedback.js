// Shared public feedback vocabulary. Never include a sealed prediction's choice.
const STATES = [
  {key:'shield',name:'护盾',family:'guard'},
  {key:'seal',name:'封伤保护',family:'guard',initial:false},
  {key:'debt',name:'待结伤势',family:'harm'},
  {key:'charge',name:'蓄势',family:'charge',initial:false},
  {key:'wind',name:'逆风蓄势',family:'charge',initial:-1},
  {key:'root',name:'根劲',family:'charge'},
  {key:'echo',name:'回响记录',family:'charge'},
  {key:'foresight',name:'预判增益',family:'charge'},
  {key:'declaredHand',name:'公开宣告',family:'charge',initial:null},
  {key:'declaredStrike',name:'俯风截羽强化',family:'charge',initial:false},
  {key:'prediction',name:'秘密预判',family:'charge',initial:null},
  {key:'burn',name:'余烬烙印',family:'harm'},
  {key:'mark',name:'晶痕',family:'harm',initial:null},
  {key:'weaken',name:'攻击削弱',family:'harm'},
  {key:'cooling',name:'散热开鳞',family:'harm'},
  {key:'reflectWard',name:'反刺',family:'guard',initial:false},
  {key:'reviveWard',name:'回生伏印',family:'guard',initial:false},
  {key:'deathWard',name:'殒爆伏印',family:'harm'},
];

export function statusFeedback(before,after,{effects={},finished=false,refresh=null,target=null,conditions=[]}={}){
  const cues=[];
  for(const p of [0,1]){
    const changes=[];
    for(const state of STATES){
      const initial=state.initial===undefined?0:state.initial;
      const old=before[state.key]?.[p]??initial,value=after[state.key]?.[p]??initial;
      const triggered={burn:effects.burnDamage?.[p]>0,reflectWard:effects.reflectTriggered?.[p],reviveWard:effects.reviveTriggered?.[p],deathWard:effects.deathTriggered?.[p],debt:effects.settled?.[p]>0}[state.key];
      const refreshed=!finished&&target===p&&refresh===state.key&&old!==initial;
      if(old===value&&!triggered&&!refreshed)continue;
      const wasActive=old!==initial,isActive=value!==initial;
      let mode=!wasActive?'gain':!isActive?'consume':value>old?'gain':'trigger';
      if(refreshed)mode='refresh';
      if(triggered)mode='trigger';
      if(state.key==='debt'&&effects.cancelled?.[p])mode='clear';
      if(state.key==='prediction'&&wasActive&&!isActive)mode='trigger';
      if(state.key==='echo'&&isActive)mode=wasActive?'refresh':'gain';
      if(state.key==='deathWard'&&wasActive&&!triggered)mode=isActive?'update':'clear';
      if(finished&&['gain','refresh'].includes(mode)&&!triggered)continue;
      const verbs={gain:'生效',consume:'消耗',trigger:'触发',refresh:'刷新',update:'剩余',clear:state.key==='debt'?'化解':'结束'};
      let label=`${state.name} · ${verbs[mode]}`;
      if(typeof value==='number'&&isActive&&state.key!=='mark'){
        const unit=state.key==='wind'?'层':['root','burn','weaken','cooling','deathWard'].includes(state.key)?'次':'点';
        label+=` · ${value}${unit}`;
      }
      changes.push({key:state.key,family:state.family,mode,label});
    }
    if(before.cards[p]!==after.cards[p])changes.push({key:'form',family:'charge',mode:'trigger',label:'双生形态 · 转换'});
    for(const condition of conditions.filter(condition=>condition.p===p)){
      changes.push({key:condition.key,family:'charge',mode:condition.active?'gain':'clear',label:`${condition.name} · ${condition.active?'生效':'解除'}`});
    }
    if(changes.length)cues.push({kind:'status',p,changes});
  }
  return cues;
}
