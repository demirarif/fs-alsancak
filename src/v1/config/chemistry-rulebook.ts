import type { Attribute } from '../domain/players.js';
import { ATTRIBUTE_KEYS } from '../domain/players.ts';
import type { ChemistryRulebook, ModifierEffect, RuleDefinition, RuleTrigger } from '../domain/modifiers.js';
import { deepFreeze } from '../domain/immutable.ts';

const source={file:'Hali_Saha_Tum_Kaynaklar_Birlestirilmis.md',section:'Kimya ve Performans Kural Kitapçığı / 4–8'};
const attrs=(keys:readonly Attribute[],delta:number):ModifierEffect[]=>keys.map(attribute=>({kind:'attribute-delta',attribute,delta}));
const pv=(delta:number)=>attrs(['passing','vision'],delta);
const same=(playerIds:string[],requireLinkedRoles=false):RuleTrigger=>({kind:'same-team',playerIds,requireLinkedRoles});
const behavior=(predicateId:string):RuleTrigger=>({kind:'behavior',predicateId});
const all=(...triggers:RuleTrigger[]):RuleTrigger=>({kind:'all',triggers});
const rule=(id:string,subjectPlayerIds:string[],trigger:RuleTrigger,effects:ModifierEffect[],description:string,locked=false,exclusionGroup?:string):RuleDefinition=>({id,source,subjectPlayerIds,layer:'pair',trigger,effects,description,capGroup:locked?'locked':'normal',...(exclusionGroup?{exclusionGroup}:{})});
const atmosphere=(delta:number):ModifierEffect=>({kind:'team-atmosphere',delta});

export const CHEMISTRY_RULEBOOK:ChemistryRulebook=deepFreeze({version:'chemistry-v1-match-1',profiles:[
  ...['baran','kamil-reis','suleyman','alper','hakan-goktug','m-emre'].map(playerId=>({playerId,stabilizer:'strong' as const,negativeRisk:'none' as const,sensitiveToAtmosphere:false,behaviorPredicateIds:[],source})),
  ...['mali','onur','omer','eto','melih','taha','arif'].map(playerId=>({playerId,stabilizer:'supportive' as const,negativeRisk:'none' as const,sensitiveToAtmosphere:false,behaviorPredicateIds:[],source})),
  ...['goktug','servan','ugur','mensur','mahmut','utku','altug','barkuz','ismail','tevfik','mustafa'].map(playerId=>({playerId,stabilizer:'none' as const,negativeRisk:playerId==='goktug'||playerId==='servan'?'strong' as const:playerId==='utku'?'conditional' as const:'mild' as const,sensitiveToAtmosphere:true,behaviorPredicateIds:[`${playerId}-negative-behavior`],source})),
],rules:[
  rule('alper-taha',['alper','taha'],same(['alper','taha']),pv(.5),'Alper–Taha: ikisine pas ve görüş +0,5.',true),
  rule('arif-barkuz',['arif','barkuz'],same(['arif','barkuz']),[...pv(-.5),atmosphere(-1)],'Arif–Barkuz: pas/görüş −0,5; takım kimyası −1. Pozitif ortam bu ilişkiyi silmez.',true),
  rule('baran-eren',['baran','eren'],same(['baran','eren']),pv(.5),'Baran–Eren: pas ve görüş +0,5.',true,'technical-core'),
  rule('baran-eren-arif',['baran','eren','arif'],same(['baran','eren','arif'],true),pv(.5),'Baran–Eren–Arif bağlantılı oyun kurulumunda: üçüne pas/görüş +0,5. İkili bonusla üst üste eklenmez.',true,'technical-core'),
  rule('onur-omer-together',['onur','omer'],same(['onur','omer']),attrs(ATTRIBUTE_KEYS,1),'Onur–Ömer aynı takımda: tüm 12 özellik +1.',true),
  rule('onur-omer-opposed',['onur','omer'],{kind:'opposing-teams',playerIds:['onur','omer']},attrs(ATTRIBUTE_KEYS,-.5),'Onur ve Ömer rakipte: ikisinin 12 özelliği −0,5.',true),
  rule('tevfik-without-emre',['tevfik'],behavior('tevfik-without-emre'),[atmosphere(-.5)],'Tevfik, M.Emre ile aynı takımda değil: takım kimyası −0,5. İrritasyona bağlı kişisel ceza maç içinde ayrıca tetiklenir.'),
  rule('baran-strong-links',['baran'],behavior('baran-strong-links'),attrs(['vision','positioning'],.5),'Baran güçlü pas/görüş bağlantılarıyla çevrili: görüş/pozisyon +0,5.'),
  rule('baran-weak-links',['baran'],behavior('baran-weak-links'),attrs(['vision','positioning'],-.5),'Baran çok düşük pas/görüş desteğinde: görüş/pozisyon −0,5; teknik bağlantı sorunu.'),
  rule('eren-strong-links',['eren'],behavior('eren-strong-links'),pv(.5),'Eren’in bağlantılı hattında pas ve görüşü en az 8 olan destek: pas/görüş +0,5.'),
  rule('eren-weak-links',['eren'],behavior('eren-weak-links'),pv(-.5),'Eren düşük pas/görüş desteğinde: pas/görüş −0,5.'),
  rule('ismail-core',['ismail'],behavior('ismail-core'),pv(.5),'İsmail, Baran/Arif/Eren üçlüsünden en az ikisiyle: pas/görüş +0,5.'),
  rule('ismail-dominant-attack',['ismail'],behavior('ismail-dominant-attack'),pv(-.5),'İsmail, Göktuğ ve saha oyuncusu Barkuz ile aynı hücum grubunda: pas/görüş −0,5.'),
  rule('melih-positive-passing',['melih'],behavior('melih-positive-passing'),pv(.5),'Melih güçlü, pozitif kombinasyon ortamında: pas/görüş +0,5.'),
  rule('erhan-runners',['erhan'],behavior('erhan-runners'),pv(.5),'Erhan bağlantılı hızlı koşucularla: pas/görüş +0,5.'),
  ...['berkin','direnc','seker'].map(id=>rule(`${id}-defensive-cover`,[id],behavior(`${id}-defensive-cover`),attrs(['defending','positioning'],.5),'Güçlü savunmacı yanında: savunma/pozisyon +0,5.')),
  rule('berkin-isolated',['berkin'],behavior('berkin-isolated'),attrs(['defending','positioning'],-.5),'Berkin savunmayı yalnız taşıyor: savunma/pozisyon −0,5.'),
  ...['berkin','direnc','seker','halit','metehan'].map(id=>rule(`emre-support-${id}`,[id],behavior(`emre-support-${id}`),attrs(['defending','positioning'],.5),'M.Emre yakın savunma partnerini destekliyor: savunma/pozisyon +0,5.')),
  rule('hakan-physical-partner',['hakan-goktug'],behavior('hakan-physical-partner'),attrs(['defending','positioning'],.5),'Hakan Göktuğ güçlü stoper partneriyle: savunma/pozisyon +0,5.'),
  rule('eto-mismatch',['eto'],{kind:'matchup',predicateId:'eto-mismatch'},attrs(['defending','positioning'],-.5),'Eto hızlı ve güçlü rakip hücumcuya karşı: savunma/pozisyon −0,5.'),
  rule('eto-critical-mismatch',['eto'],{kind:'matchup',predicateId:'eto-critical-mismatch'},attrs(['defending','positioning'],-1),'Eto hem hızı hem gücü 8+ rakibe karşı: savunma/pozisyon −1.'),
  rule('eto-cover',['eto'],behavior('eto-cover'),attrs(['defending','positioning'],.5),'Eto’nun güçlü savunma partneri matchup cezasını 0,5 azaltıyor.'),
  ...['halit','metehan'].map(id=>rule(`${id}-build-up`,[id],behavior(`${id}-build-up`),attrs(['passing','control','vision'],-.5),'Fazla merkez oyun kurma sorumluluğu: pas/kontrol/görüş −0,5.')),
  rule('kamil-leadership',['kamil-reis'],same(['kamil-reis']),[atmosphere(.5)],'Kamil Reis: takım kimyası +0,5; kişisel özellik bonusu yok.'),
  rule('suleyman-leadership',['suleyman'],same(['suleyman']),[atmosphere(.5)],'Süleyman: takım kimyası +0,5; kişisel özellik bonusu yok.'),
  // Temporal rules remain serialized for the engine; pregame never activates them.
  rule('yanki-attack',['yanki'],{kind:'phase',phase:'attack'},[{kind:'attribute-set',attribute:'speed',value:10},{kind:'attribute-set',attribute:'passing',value:1}],'Yankı aktif hücum fazında: hız 10, pas 1; faz sonunda baz değere döner.',true),
  rule('utku-leading',['utku'],{kind:'score',state:'leading'},attrs(['defending','pressing','positioning','stamina'],.5),'Utku öndeyken: savunma/pres/pozisyon/dayanıklılık +0,5.'),
  rule('utku-trailing',['utku'],{kind:'score',state:'trailing'},attrs(['defending','pressing','positioning','stamina'],-.5),'Utku gerideyken: savunma/pres/pozisyon/dayanıklılık −0,5.'),
  rule('akin-clutch',['akin'],{kind:'score',state:'close-late'},attrs(['shooting','finishing','positioning'],.5),'Akın yakın maçın sonunda: şut/bitiricilik/pozisyon +0,5.'),
  rule('servan-disruption',['servan'],behavior('servan-negative-behavior'),[...attrs(['positioning','passing'],-.5),atmosphere(-1)],'Servan küçümseme/pozisyon terk etme davranışında: pas/pozisyon −0,5; takım kimyası −1.'),
  rule('goktug-frustration',['goktug'],behavior('goktug-negative-behavior'),attrs(['pressing','positioning','finishing'],-.5),'Göktuğ servis alamama/tartışma tetiklenirse: pres/pozisyon/bitiricilik −0,5.'),
  rule('altug-disengaged',['altug'],behavior('altug-negative-behavior'),attrs(['stamina','pressing','passing'],-.5),'Altuğ mental koptuğunda: dayanıklılık/pres/pas −0,5.'),
  rule('tevfik-irritated',['tevfik'],all(behavior('tevfik-without-emre'),behavior('tevfik-negative-behavior')),pv(-.5),'Tevfik’te M.Emre yokluğu ve irritasyon birlikte: pas/görüş −0,5.'),
  rule('ismail-bad-atmosphere',['ismail'],{kind:'atmosphere',state:'bad'},attrs(['control','vision'],-.5),'İsmail kötü atmosferde: kontrol/görüş −0,5.'),
  rule('ugur-negative-environment',['ugur'],{kind:'atmosphere',state:'bad'},[atmosphere(-.5)],'Uğur negatif/tartışmalı ortamda: takım kimyası −0,5; kendi performansı sabit.'),
  rule('mahmut-brawl',['mahmut'],{kind:'atmosphere',state:'bad'},[atmosphere(-.5)],'Mahmut çok kavgacı ortamda: takım kimyası −0,5 risk.'),
  rule('erhan-clash',['erhan'],behavior('erhan-clash'),pv(-.5),'Erhan bencil/çatışmalı hücum grubunda: pas/görüş −0,5.'),
  rule('batu-breath',['batu'],behavior('batu-breath'),[...attrs(['speed'],-.5),...attrs(['stamina'],-1)],'Batu nefes/fizik probleminde: hız −0,5, dayanıklılık −1.'),
  // Match-day form (source §5): drawn once per simulation from the match's seeded stream; never in pregame screens.
  rule('ali-efe-bad-day',['ali-efe'],behavior('ali-efe-bad-day'),attrs(['stamina','pressing','positioning'],-.5),'Ali Efe belirgin kötü form gününde: dayanıklılık/pres/pozisyon −0,5.'),
  rule('arda-barin-clutch',['arda-barin'],behavior('arda-barin-clutch'),attrs(['shooting','finishing','positioning'],.5),'Arda Barin pozitif clutch modunda: şut/bitiricilik/pozisyon +0,5.'),
  rule('arda-barin-bad-day',['arda-barin'],behavior('arda-barin-bad-day'),attrs(['passing','control','positioning'],-.5),'Arda Barin kötü varyans gününde: pas/kontrol/pozisyon −0,5.'),
  rule('barkuz-good-day',['barkuz'],behavior('barkuz-good-day'),attrs(['shooting','finishing'],.5),'Barkuz çok iyi form gününde: şut/bitiricilik +0,5.'),
  rule('barkuz-bad-day',['barkuz'],behavior('barkuz-bad-day'),attrs(['control','shooting','finishing'],-.5),'Barkuz çok kötü form gününde: kontrol/şut/bitiricilik −0,5.'),
  rule('direnc-bad-day',['direnc'],behavior('direnc-bad-day'),attrs(['passing','defending','positioning'],-.5),'Direnç kötü gününde: pas/savunma/pozisyon −0,5.'),
  rule('eren-good-day',['eren'],behavior('eren-good-day'),attrs(['passing','vision','control'],.5),'Eren çok iyi form gününde: teknik özellikler +0,5.'),
  rule('eren-bad-day',['eren'],behavior('eren-bad-day'),attrs(['passing','vision','control'],-.5),'Eren kötü form gününde: teknik özellikler −0,5.'),
  rule('fuat-reckless',['fuat'],behavior('fuat-reckless'),[...attrs(['positioning'],-1),...attrs(['defending'],-.5)],'Fuat kontrolsüz ileri koşularda: pozisyon −1, savunma −0,5.'),
  rule('fuat-overconfident',['fuat'],behavior('fuat-overconfident'),attrs(['control','passing'],-.5),'Fuat aşırı özgüvenli top kullanımında: kontrol/pas −0,5.'),
  rule('goktug-good-day',['goktug'],behavior('goktug-good-day'),attrs(['shooting','finishing'],.5),'Göktuğ çok iyi gününde: şut/bitiricilik +0,5.'),
  rule('mensur-good-day',['mensur'],behavior('mensur-good-day'),attrs(['passing','vision','control'],.5),'Mensur iyi gününde: pas/görüş/kontrol +0,5.'),
  rule('mensur-bad-day',['mensur'],behavior('mensur-bad-day'),attrs(['passing','vision','control'],-.5),'Mensur kötü gününde: pas/görüş/kontrol −0,5.'),
  rule('mustafa-good-day',['mustafa'],behavior('mustafa-good-day'),attrs(['positioning','shooting'],.5),'Mustafa sorumluluk aldığı iyi gününde: pozisyon/şut +0,5.'),
  rule('mustafa-bad-day',['mustafa'],behavior('mustafa-bad-day'),pv(-.5),'Mustafa bencil/kötü karar gününde: pas/görüş −0,5.'),
]});
