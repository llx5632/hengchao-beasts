import { CURRENT_ART } from './card-art.js';
const hit = (name, damage, effect = null, amount = 0) => ({ name, damage, effect, amount });
const rows = [
  ['tanling','炭铃','火','低阶',75,1,.5,7,'鼬形异兽，尾端铃状器官储存热量。',hit('炽尾拍击',30),hit('余烬突袭',45),'炭铃鼬_火山秘境图鉴卡.png'],
  ['lujia','炉甲蟹','火','中阶',110,3,.6,60,'厚重耐热甲壳，蓄热循环帮助修复表层。',hit('熔钳夹击',35),hit('温壳回养',15,'heal',10)],
  ['duhuolu','灰烬渡火鹭','火','高阶',105,2,2.4,14,'掠过火山热流，以灼热羽流释放蓄热。',hit('烬羽横扫',35),hit('渡火长鸣',50)],
  ['woxu','涡须鲵','水','低阶',90,2,.8,12,'触须感知水流，湿润体表支持轻度恢复。',hit('涡须抽击',30),hit('活泉回流',15,'heal',10)],
  ['fuchao','负潮巨鳖','水','高阶',140,3,1.1,260,'巨大分层背甲储水，如同一座行走的海岸。',hit('潮壳冲撞',35),hit('蓄潮重压',20,'delay',1),'潮盾鳖_潮汐巨兽卡牌.png'],
  ['chaojing','潮颈鹭','水','中阶',90,2,3,18,'长颈长腿，啄击精准，以局部潮流阻挡退路。',hit('潮颈穿刺',40),hit('压潮长鸣',20,'delay',1)],
  ['taituan','苔团','草','低阶',65,1,.3,3,'小型苔绒鼹兽，共生苔绒缓慢修复伤口。',hit('绒爪拍击',20),hit('苔绒回生',5,'heal',10)],
  ['genguan','根冠鹿','草','高阶',130,3,1.9,95,'根状角支持强力撞击，共生根须延伸封路。',hit('根角冲撞',45),hit('缠根封路',25,'delay',1)],
  ['xunbei','蕈背行者','草','中阶',105,3,.7,40,'背负共生菌群的螺形生物，菌丝修补软组织。',hit('菌壳顶撞',25),hit('孢息修复',10,'heal',15)],
  ['liejing','裂晶蜥','岩','中阶',90,2,.9,22,'晶片可投射，晶化牙列支持较强咬击。',hit('碎晶飞掷',25),hit('裂晶猛咬',40)],
  ['panjia','磐甲','岩','高阶',160,4,1.6,520,'犀形异兽，矿化装甲和身体质量赋予强大撞击力。',hit('磐角重撞',40),hit('岩躯碾压',60)],
  ['mingjing','空谷鸣晶蝠','岩','低阶',70,1,.6,4,'轻小的洞谷蝠兽，共鸣晶体强化声波与回声。',hit('鸣晶脉冲',30),hit('回声阻途',15,'delay',1)],
  ['zhiyi','纸翼','风','低阶',55,1,.25,.4,'薄翼小雀，轻盈易退，以羽片和小股气流攻击。',hit('纸羽飞刃',15),hit('风切穿刺',20)],
  ['fuyun','负云长鬃驼','风','高阶',135,3,3.6,180,'气囊长鬃如背负云朵，调节呼吸以恢复体力。',hit('云鬃撞击',40),hit('蓄风回息',20,'heal',15)],
  ['xuanjiao','旋角羚','风','中阶',88,2,1.6,42,'螺旋长角导流，步伐扬起旋风扰乱退路。',hit('风切突角',40),hit('回旋踏岚',25,'delay',1),'旋角羚_浮岛风境卡牌.png'],
  ['xianbei','弦背猞猁','风','中阶',100,2,.85,28,'伏于海雾苇丛，背筋如弦，收身后骤然扑出。',hit('蓄势扑击',15,'charge',30),hit('裂风突袭',35,'burst',30)],
  ['dielin','叠鳞獾','岩','中阶',115,3,.65,38,'层层肩鳞遇袭合拢，护住钻行碎岩的身体。',hit('迎击护壳',20,'shield',15),hit('掘岩爪击',40)],
  ['jinzong','烬鬃','火','中阶',120,3,1.05,160,'鬃根蓄热，受迫时升温，獠牙冲破围困。',hit('焰鬃冲撞',45),hit('绝境反扑',30,'desperate',60)],
  ['mingnang','鸣囊海豹','水','中阶',130,3,.9,140,'颈囊储存受击震动，借潮声释放回响。',hit('借势回响',25,'echo',30),hit('鳍尾拍浪',40)],
];
export const BEATS = Object.freeze({ 火:'草', 草:'岩', 岩:'风', 风:'水', 水:'火' });
export const ELEMENTS = Object.freeze(['火','水','草','岩','风']);
export const CARDS = Object.freeze(rows.map(([id,name,element,tier,hp,retreat,height,weight,story,s1,s2,art]) => Object.freeze({id,name,element,tier,hp,retreat,height,weight,story,skills:Object.freeze([Object.freeze(s1),Object.freeze(s2)]),art:CURRENT_ART[id] ?? art})));
export const CARD = Object.freeze(Object.fromEntries(CARDS.map(c => [c.id,c])));
export const STARTERS = Object.freeze(['tanling','woxu','taituan','mingjing','zhiyi']);
export const POINT_NUMBERS = Object.freeze([0,1,2,3,4,5,6]);
export const METRICS = Object.freeze([
  { name:'名字字数', read:c => [...c.name].length, unit:'字' },
  { name:'最大 HP', read:c => c.hp, unit:'' },
  { name:'基础撤退点数', read:c => c.retreat, unit:'' },
  { name:'最高基础伤害', read:c => Math.max(...c.skills.map(s => s.damage)), unit:'' },
  { name:'身高', read:c => c.height, unit:'m' },
  { name:'体重', read:c => c.weight, unit:'kg' },
]);
// Sum 0 is the reveal-and-repick draw; positive sums cycle through items 1..6.
export const pointMetricIndex = sum => sum===0 ? null : (sum + METRICS.length - 1) % METRICS.length;
export const skillText = s => `${s.damage} 伤害${({heal:` · 自己回血 ${s.amount}`,delay:` · 对方剩余撤退 +${s.amount}`,charge:' · 下一次裂风突袭＋30，不叠加',burst:' · 蓄势时65伤害，用后清除',shield:' · 获得下次受击减伤15的护盾，不叠加',desperate:' · 自己剩余HP≤60时改为60伤害',echo:' · 追加上次实际受伤量的一半，向下取整、最多＋30，用后清除'})[s.effect]??''}`;
export function inventory(player, laboratory = false) {
  const ids = laboratory ? CARDS.flatMap(c => [c.id,c.id]) : STARTERS;
  return ids.map((cardId,i) => ({ id:`${player}-${laboratory ? 'lab' : 'start'}-${i}`, cardId }));
}
