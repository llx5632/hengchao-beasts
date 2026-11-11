import { CURRENT_ART } from './card-art.js';
const hit = (name, damage, effect = null, amount = 0) => ({ name, damage, effect, amount });
const rows = [
  ['tanling','炭铃','火','低阶',75,1,.5,7,'鼬形异兽，尾端铃状器官储存热量。',hit('炽尾拍击',30),hit('余烬突袭',45),'炭铃鼬_火山秘境图鉴卡.png'],
  ['lujia','炉甲蟹','火','中阶',110,3,.6,60,'厚重耐热甲壳，蓄热循环帮助修复表层。',hit('熔钳夹击',35),hit('温壳回养',15,'heal',10)],
  ['duhuolu','灰烬渡火鹭','火','高阶',105,2,2.4,14,'灼热羽流留下余烬，长鸣释放胸腔蓄热。',hit('烬羽横扫',30,'burn',15),hit('渡火长鸣',50)],
  ['woxu','涡须鲵','水','低阶',90,2,.8,12,'触须感知水流，湿润体表支持轻度恢复。',hit('涡须抽击',30),hit('活泉回流',15,'heal',10)],
  ['fuchao','负潮巨鳖','水','高阶',140,3,1.1,260,'巨大分层背甲储水，如同一座行走的海岸。',hit('潮壳冲撞',35),hit('蓄潮重压',20,'delay',1),'潮盾鳖_潮汐巨兽卡牌.png'],
  ['chaojing','潮颈鹭','水','中阶',90,2,3,18,'长颈静观潮纹，预判进退后精准啄击。',hit('潮颈穿刺',40),hit('伏路预判',20,'predict',30)],
  ['taituan','苔团','草','低阶',65,1,.3,3,'小型苔绒鼹兽，共生苔绒缓慢修复伤口。',hit('绒爪拍击',20),hit('苔绒回生',5,'heal',10)],
  ['genguan','根冠鹿','草','高阶',130,3,1.9,95,'根须锚定土层蓄力，分枝长角释放沉重撞击。',hit('根角冲撞',45,'root-strike',20),hit('扎根蓄能',20,'root',2)],
  ['xunbei','蕈背行者','草','中阶',105,3,.7,40,'共生菌群散布抑力孢雾，菌丝缓缓修补软组织。',hit('抑力孢雾',20,'weaken',25),hit('孢息修复',10,'heal',15)],
  ['liejing','裂晶蜥','岩','中阶',90,2,.9,22,'飞晶嵌入猎物鳞隙，晶化牙列循痕咬合。',hit('碎晶飞掷',25,'mark',1),hit('裂晶猛咬',40,'bite',25)],
  ['panjia','磐甲','岩','高阶',160,4,1.6,520,'犀形异兽，矿化装甲和身体质量赋予强大撞击力。',hit('矿甲封伤',40,'seal',30),hit('岩躯碾压',60)],
  ['mingjing','空谷鸣晶蝠','岩','低阶',70,1,.6,4,'轻小的洞谷蝠兽，共鸣晶体强化声波与回声。',hit('鸣晶脉冲',30),hit('回声阻途',15,'delay',1)],
  ['zhiyi','纸翼','风','低阶',55,1,.25,.4,'薄翼小雀，轻盈易退，以羽片和小股气流攻击。',hit('纸羽飞刃',15),hit('风切穿刺',20)],
  ['fuyun','负云长鬃驼','风','高阶',135,3,3.6,180,'气囊长鬃如背负云朵，调节呼吸以恢复体力。',hit('云鬃撞击',40),hit('蓄风回息',20,'heal',15)],
  ['xuanjiao','旋角羚','风','中阶',88,2,1.6,42,'螺旋长角积蓄风压，失去先机后借势突击。',hit('风切突角',40),hit('逆风蓄势',25,'wind',25),'旋角羚_浮岛风境卡牌.png'],
  ['xianbei','弦背猞猁','风','中阶',100,2,.85,28,'伏于海雾苇丛，背筋如弦，收身后骤然扑出。',hit('蓄势扑击',15,'charge',30),hit('裂风突袭',35,'burst',30)],
  ['dielin','叠鳞獾','岩','中阶',115,3,.65,38,'层层肩鳞遇袭合拢，护住钻行碎岩的身体。',hit('迎击护壳',20,'shield',15),hit('掘岩爪击',40)],
  ['jinzong','烬鬃','火','中阶',120,3,1.05,160,'鬃根蓄热，受迫时升温，獠牙冲破围困。',hit('焰鬃冲撞',45),hit('绝境反扑',30,'desperate',60)],
  ['mingnang','鸣囊海豹','水','中阶',130,3,.9,140,'颈囊储存受击震动，借潮声释放回响。',hit('借势回响',25,'echo',30),hit('鳍尾拍浪',40)],
  ['zhoulan','昼岚狐','风','中阶',100,2,.70,14,'与夜岚狐同窝而生，以升风巡林，岚纹遥相呼应。',hit('扬岚掠袭',30,'twin-day'),hit('双生相转',10,'twin-shift')],
  ['yelan','夜岚狐','风','中阶',100,2,.65,16,'与昼岚狐同窝而生，以伏风巡林，岚纹遥相呼应。',hit('伏岚掠袭',30,'twin-night'),hit('双生相转',10,'twin-shift')],
  ['koujinchan','叩金蟾','岩','中阶',110,3,.55,32,'喉珠叩响矿壁，金斑随回声明灭。',hit('掷金碰运',10,'dice'),hit('沉身撞击',40)],
  ['jiejing','截径棘虎','草','高阶',145,3,1.65,230,'掌缘感须追踪足震，棘爪循着退路落下。',hit('棘爪横扫',50),hit('封路追击',40,'pursuit',40)],
  ['jinnangying','烬囊萤','火','低阶',60,2,.18,.8,'烬囊微光劝退来敌，囊阀闭合时勿再逼近。',hit('灼翅扑击',25),hit('殒爆伏印',5,'death-ward',60)],
  ['cangquanyuan','藏泉螈','水','高阶',120,3,.60,64,'泉囊封存最后生机，濒危之际破印回流。',hit('泉尾重拍',45),hit('回生伏印',15,'revive-ward',50)],
  ['yangfengtang','扬锋螳','岩','中阶',110,2,.90,12,'与伏锋螳同鞘而生，扬镰驱赶健壮猎物。',hit('扬镰驱击',25,'twin-healthy',35),hit('错锋相替',15,'twin-shift')],
  ['fufengtang','伏锋螳','岩','中阶',110,2,.75,15,'与扬锋螳同鞘而生，伏隙截住疲弱猎物。',hit('伏镰截击',25,'twin-wounded',35),hit('错锋相替',15,'twin-shift')],
  ['huangjitun','簧棘鲀','水','中阶',110,3,.55,18,'礁隙鼓身绷棘，受压骤弹以退来敌。',hit('破浪冲吻',40),hit('绷棘待发',15,'reflect-ward',50)],
];
export const TWIN_PARTNERS = Object.freeze({zhoulan:'yelan',yelan:'zhoulan',yangfengtang:'fufengtang',fufengtang:'yangfengtang'});
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
export const skillText = s => `${s.damage} 伤害${({'reflect-ward':' · 获得一次反刺：下次受技能直接伤害时，按实际扣血100%反伤，最多50，致命仍触发；不叠加，持续至触发或战斗结束','twin-healthy':' · 对方HP高于最大HP一半时，伤害＋35','twin-wounded':' · 对方HP不高于最大HP一半时，伤害＋35','revive-ward':' · 低于半血时可施放，每战1次；获得伏印，HP归零时恢复至最大HP的50%，溢出伤害不再扣除','death-ward':' · 当次行动末及之后2次任一方行动内，HP归零时殒爆60；每局仅挂印1次，不刷新',pursuit:' · 对方剩余撤退点数为1时，伤害＋40',dice:' · 掷1枚六面骰，伤害乘点数；可重掷1次，须接受新结果','twin-day':' · 对草伤害×2，对火伤害×0.5','twin-night':' · 对火伤害×2，对草伤害×0.5','twin-shift':' · 持有另一张双生卡时，伤害后转换；继承全部战斗状态',wind:' · 进入蓄势：每次猜拳落败积1层，最多2层；下次进攻每层伤害＋25，随后结束蓄势',predict:' · 秘密预判对方下次行动为进攻或撤退；行动后若猜中且战斗继续，下次进攻伤害＋30，不叠加',seal:' · 有待结伤势则取消，本次不获保护；否则获得不叠加的封伤保护，下次直接受伤暂存一半、最多30，再次受伤时结清',heal:` · 自己回血 ${s.amount}`,delay:` · 对方剩余撤退 +${s.amount}`,charge:' · 下一次裂风突袭＋30，不叠加',burst:' · 蓄势时65伤害，用后清除',shield:' · 获得下次受击减伤15的护盾，不叠加',desperate:' · 自己剩余HP≤60时改为60伤害',echo:' · 追加上次实际受伤量的一半，向下取整、最多＋30，用后清除',burn:' · 之后2次任一方行动结束，对方各受15烙印伤害；刷新不叠加',mark:' · 留下1个晶痕，不叠加',bite:' · 消耗对方晶痕，伤害＋25',weaken:' · 对方之后2次进攻伤害降低25%，刷新不叠加',root:' · 无根劲且自己剩余撤退＜5时，剩余撤退＋1，获得2次根劲','root-strike':' · 有根劲时伤害＋20，消耗1次'})[s.effect]??''}`;
export function inventory(player, laboratory = false) {
  const ids = laboratory ? CARDS.flatMap(c => [c.id,c.id]) : STARTERS;
  return ids.map((cardId,i) => ({ id:`${player}-${laboratory ? 'lab' : 'start'}-${i}`, cardId }));
}
