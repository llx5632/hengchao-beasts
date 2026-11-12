// Preserve historical flags and instance IDs: losing a granted card never grants it again.
export const CARD_GRANTS = [
  {flag:'dewLeechGranted',prefix:'release-dew-leech',cardIds:['luwenzhi'],includeCardId:false},
  {flag:'sandAntlionGranted',prefix:'release-sand-antlion',cardIds:['shishayishi'],includeCardId:false},
  {flag:'redThroatTyrantGranted',prefix:'release-red-throat-tyrant',cardIds:['chihoubaolong'],includeCardId:false},
  {
    "flag": "specialCardsGranted",
    "prefix": "release-special",
    "cardIds": [
      "xianbei",
      "dielin",
      "jinzong",
      "mingnang"
    ],
    "includeCardId": true
  },
  {
    "flag": "twinCardsGranted",
    "prefix": "release-twins",
    "cardIds": [
      "zhoulan",
      "yelan"
    ],
    "includeCardId": true
  },
  {
    "flag": "goldToadGranted",
    "prefix": "release-gold-toad",
    "cardIds": [
      "koujinchan"
    ],
    "includeCardId": false
  },
  {
    "flag": "thornTigerGranted",
    "prefix": "release-thorn-tiger",
    "cardIds": [
      "jiejing"
    ],
    "includeCardId": false
  },
  {
    "flag": "emberFireflyGranted",
    "prefix": "release-ember-firefly",
    "cardIds": [
      "jinnangying"
    ],
    "includeCardId": false
  },
  {
    "flag": "springSalamanderGranted",
    "prefix": "release-spring-salamander",
    "cardIds": [
      "cangquanyuan"
    ],
    "includeCardId": false
  },
  {
    "flag": "mantisTwinsGranted",
    "prefix": "release-mantis-twins",
    "cardIds": [
      "yangfengtang",
      "fufengtang"
    ],
    "includeCardId": true
  },
  {
    "flag": "springPufferGranted",
    "prefix": "release-spring-puffer",
    "cardIds": ["huangjitun"],
    "includeCardId": false
  }
];

export function applyCardGrants(session){
  let changed=false;
  const existing=new Set(session.players.flatMap(p=>p.cards.map(c=>c.id)));
  for(const grant of CARD_GRANTS){
    if(session[grant.flag])continue;
    session.players.forEach((player,index)=>{
      for(const cardId of grant.cardIds){
        const id=`${grant.prefix}-${index}${grant.includeCardId?`-${cardId}`:''}`;
        if(existing.has(id))continue;
        const card={id,cardId};player.cards.push(card);existing.add(id);
        if(session.match?.status==='active')session.match.inventories[index].push({...card});
      }
    });
    session[grant.flag]=true;changed=true;
  }
  return changed;
}
