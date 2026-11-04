import type { LineupContext } from '../application/services.js';
import type { AppliedModifier, EffectiveAttributes, RuleTrigger } from './modifiers.js';
import type { Attribute, BaseAttributes, Player, OutfieldPlayer, KeeperDistributionAbility } from './players.js';
import { ATTRIBUTE_KEYS } from './players.ts';
import type { LineupDraft, LineupEvaluation, TeamEvaluation, TeamMetric, TeamMetricKey, MetricExplanation, FormationSlot } from './teams.js';
import { FORMATIONS } from '../config/formations.ts';
import { POSITION_WEIGHTS } from '../config/rating-model.ts';
import { GUEST_POLICY } from '../config/defaults.ts';
import { resolveMatchCatalog } from './match-players.ts';
import { roundRating, suitabilityCoefficient } from './ratings.ts';
import { deepFreeze } from './immutable.ts';

/** A keeper has no 12 outfield attributes; only the special distribution's PAS/GÖR take pair modifiers. */
export interface KeeperDistributionEffect {readonly playerId:string;readonly abilityId:KeeperDistributionAbility['id'];readonly base:{readonly passing:number;readonly vision:number};readonly values:{readonly passing:number;readonly vision:number};readonly applied:readonly AppliedModifier[]}
export interface LineupAssessment {readonly evaluation:LineupEvaluation;readonly effective:Readonly<Record<string,EffectiveAttributes>>;readonly keeperDistribution:Readonly<Record<string,KeeperDistributionEffect>>;readonly applied:readonly AppliedModifier[];readonly pendingRuleIds:readonly string[]}
interface Placed {player:Player;slot:FormationSlot;teamIndex:number}
const avg=(a:readonly number[])=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));
export function assessLineups(draft:LineupDraft,context:LineupContext):LineupAssessment {
  const catalog=resolveMatchCatalog(context.catalog,context.selection),placed:Placed[]=draft.lineups.flatMap((lineup,teamIndex)=>lineup.assignments.map(a=>({player:catalog.players.find(p=>p.id===a.playerId)!,slot:FORMATIONS[lineup.formationId].slots.find(s=>s.id===a.slotId)!,teamIndex})));
  const find=(id:string)=>placed.find(p=>p.player.id===id),sameTeam=(ids:readonly string[])=>ids.every(id=>find(id))&&new Set(ids.map(id=>find(id)!.teamIndex)).size===1;
  const distance=(a:Placed,b:Placed)=>Math.hypot(a.slot.anchor.x-b.slot.anchor.x,a.slot.anchor.z-b.slot.anchor.z);
  const linked=(p:Placed)=>placed.filter(q=>q!==p&&q.teamIndex===p.teamIndex&&q.player.kind==='outfield'&&distance(p,q)<=.46);
  const strongCover=(p:Placed)=>linked(p).filter(q=>q.slot.unit==='defense'&&q.player.kind==='outfield'&&q.player.attributes.defending>=7.5);
  // Arif is neutral-positive except in the locked Barkuz pairing.
  const stabilize=(i:number)=>context.rulebook.profiles.filter(p=>p.stabilizer!=='none'&&find(p.playerId)?.teamIndex===i&&!(p.playerId==='arif'&&sameTeam(['arif','barkuz'])));
  const opponentThreat=(p:Placed)=>placed.filter(q=>q.teamIndex!==p.teamIndex&&q.player.kind==='outfield'&&q.slot.unit==='attack').map(q=>q.player as OutfieldPlayer);
  function predicate(id:string):boolean {
    const subjectId=id.startsWith('emre-support-')?id.slice(13):id==='hakan-physical-partner'?'hakan-goktug':id.split('-')[0]!,p=find(subjectId);
    if(id==='tevfik-without-emre')return !!find('tevfik')&&!sameTeam(['tevfik','m-emre']);
    if(!p)return false;
    const near=linked(p),out=near.filter(q=>q.player.kind==='outfield').map(q=>q.player as OutfieldPlayer);
    const strong=out.filter(q=>q.attributes.passing>=8&&q.attributes.vision>=8);
    if(id==='baran-strong-links')return strong.length>=2;
    if(id==='baran-weak-links')return out.length>=2&&avg(out.map(q=>(q.attributes.passing+q.attributes.vision)/2))<5;
    if(id==='eren-strong-links')return strong.length>=1;
    if(id==='eren-weak-links')return out.length>=2&&avg(out.map(q=>(q.attributes.passing+q.attributes.vision)/2))<6;
    if(id==='ismail-core')return ['baran','arif','eren'].filter(id=>find(id)?.teamIndex===p.teamIndex).length>=2;
    if(id==='ismail-dominant-attack')return sameTeam(['ismail','goktug','barkuz'])&&find('barkuz')?.player.kind==='outfield'&&['goktug','barkuz'].every(id=>['attack','midfield'].includes(find(id)!.slot.unit));
    if(id==='melih-positive-passing')return stabilize(p.teamIndex).length>=2&&strong.length>=1;
    if(id==='erhan-runners')return out.some(q=>q.attributes.speed>=8&&q.attributes.passing>=6);
    // M.Emre's support is its own rule; the same partner never adds the cover bonus twice.
    if(id.endsWith('-defensive-cover'))return p.slot.unit==='defense'&&strongCover(p).some(q=>q.player.id!=='m-emre');
    if(id==='berkin-isolated')return p.slot.unit==='defense'&&strongCover(p).length===0;
    if(id.startsWith('emre-support-'))return p.slot.unit==='defense'&&near.some(q=>q.player.id==='m-emre'&&q.slot.unit==='defense');
    if(id==='hakan-physical-partner')return p.slot.position==='CB'&&near.some(q=>q.slot.position==='CB'&&q.player.kind==='outfield'&&q.player.attributes.strength>=8);
    if(id==='eto-critical-mismatch')return p.slot.unit==='defense'&&opponentThreat(p).some(q=>q.attributes.speed>=8&&q.attributes.strength>=8);
    if(id==='eto-mismatch')return p.slot.unit==='defense'&&!predicate('eto-critical-mismatch')&&opponentThreat(p).some(q=>q.attributes.speed>=7&&q.attributes.strength>=7);
    if(id==='eto-cover')return (predicate('eto-critical-mismatch')||predicate('eto-mismatch'))&&strongCover(p).length>0;
    if(id.endsWith('-build-up'))return p.slot.position==='CM'||p.slot.position==='CAM';
    return false; // Score, form-day and behavior events are not invented before kickoff.
  }
  function trigger(t:RuleTrigger):boolean {
    switch(t.kind){
      case 'same-team': {
        if(!sameTeam(t.playerIds))return false;
        if(!t.requireLinkedRoles)return true;
        const group=t.playerIds.map(id=>find(id)!);
        return group.every(p=>['CB','FB','CM','CAM'].includes(p.slot.position)&&group.some(q=>q!==p&&distance(p,q)<=.46));
      }
      case 'opposing-teams':return t.playerIds.every(id=>find(id))&&new Set(t.playerIds.map(id=>find(id)!.teamIndex)).size>1;
      case 'all':return t.triggers.every(trigger);
      case 'behavior':case 'matchup':return predicate(t.predicateId);
      default:return false;
    }
  }
  const candidates=context.rulebook.rules.filter(r=>r.subjectPlayerIds.some(id=>find(id))&&trigger(r.trigger));
  const active=candidates.filter(r=>!r.exclusionGroup||!candidates.some(other=>other!==r&&other.exclusionGroup===r.exclusionGroup&&other.subjectPlayerIds.length>r.subjectPlayerIds.length));
  const applied:AppliedModifier[]=active.flatMap(r=>r.effects.map(effect=>({ruleId:r.id,layer:r.layer,playerIds:r.subjectPlayerIds.filter(id=>find(id)),explanation:`${r.subjectPlayerIds.map(id=>find(id)?.player.name??id).join(' · ')} — ${r.description??r.id}`,effect,precedence:r.capGroup==='locked'?100:10,capGroup:r.capGroup,...(r.exclusionGroup?{exclusionGroup:r.exclusionGroup}:{})})));
  for(const p of placed){
    const form=context.forms.find(f=>f.playerId===p.player.id&&f.weekId===context.selection.weekId);
    if(form)for(const [attribute,delta] of Object.entries(form.attributeDeltas))applied.push({ruleId:`form:${form.version}`,layer:'weekly-form',playerIds:[p.player.id],explanation:`${p.player.name}: haftalık form`,effect:{kind:'attribute-delta',attribute:attribute as Attribute,delta},precedence:5,capGroup:'normal'});
    if(p.player.origin.kind==='guest')for(const [attribute,delta] of Object.entries(GUEST_POLICY.adaptation.attributeDeltas))applied.push({ruleId:'guest-adaptation-v1',layer:'guest-adaptation',playerIds:[p.player.id],explanation:`${p.player.name}: yeni takımda pas bağlantısı ve zamanlama için alışma payı.`,effect:{kind:'attribute-delta',attribute:attribute as Attribute,delta},precedence:5,capGroup:'normal'});
  }
  const adjust=(base:number,attribute:Attribute,effects:readonly AppliedModifier[])=>{
    const deltas=effects.filter(a=>a.effect.kind==='attribute-delta'&&a.effect.attribute===attribute);
    const normal=deltas.filter(a=>a.capGroup==='normal').map(a=>a.effect.kind==='attribute-delta'?a.effect.delta:0);
    const locked=deltas.filter(a=>a.capGroup==='locked').reduce((s,a)=>s+(a.effect.kind==='attribute-delta'?a.effect.delta:0),0);
    const delta=Math.min(1,normal.filter(n=>n>0).reduce((s,n)=>s+n,0))+Math.max(-1,normal.filter(n=>n<0).reduce((s,n)=>s+n,0));
    return Math.max(1,Math.min(10,base+delta)+locked);
  };
  const effective:Record<string,EffectiveAttributes>={},keeperDistribution:Record<string,KeeperDistributionEffect>={};
  for(const {player} of placed){
    const effects=applied.filter(a=>a.playerIds.includes(player.id));
    if(player.kind==='goalkeeper'){
      for(const ability of player.specialAbilities??[])keeperDistribution[player.id]={playerId:player.id,abilityId:ability.id,base:{passing:ability.passing,vision:ability.vision},
        values:{passing:adjust(ability.passing,'passing',effects),vision:adjust(ability.vision,'vision',effects)},applied:effects.filter(a=>a.effect.kind==='attribute-delta'&&(a.effect.attribute==='passing'||a.effect.attribute==='vision'))};
      continue;
    }
    const values=Object.fromEntries(ATTRIBUTE_KEYS.map(attribute=>[attribute,adjust(player.attributes[attribute],attribute,effects)])) as unknown as BaseAttributes;
    effective[player.id]={playerId:player.id,base:player.attributes,values,applied:effects,weeklyForm:context.forms.find(f=>f.playerId===player.id&&f.weekId===context.selection.weekId)??null};
  }
  const attrs=(p:Placed)=>effective[p.player.id]?.values;
  const fit=(p:Placed)=>p.player.kind==='goalkeeper'?1:suitabilityCoefficient(p.player.suitability[p.slot.position]);
  const ability=(p:Placed,keys:readonly Attribute[])=>{const a=attrs(p);return a?avg(keys.map(key=>a[key]))*10:0;};
  const role=(p:Placed)=>{if(p.player.kind==='goalkeeper'){const form=context.forms.find(f=>f.playerId===p.player.id&&f.weekId===context.selection.weekId);return clamp(p.player.goalkeeperRating+(form?.goalkeeperDelta??0));}
    const weights=POSITION_WEIGHTS[p.slot.position as keyof typeof POSITION_WEIGHTS];return weights?clamp(.92*ATTRIBUTE_KEYS.reduce((s,key)=>s+attrs(p)![key]*weights[key]/100,0)*10+.08*fit(p)*100):0;};
  const teams=([0,1] as const).map(i=>{
    const own=placed.filter(p=>p.teamIndex===i),outfield=own.filter(p=>p.player.kind==='outfield'),opponent=placed.filter(p=>p.teamIndex!==i&&p.slot.unit==='attack'),defense=outfield.filter(p=>p.slot.unit==='defense'),mid=outfield.filter(p=>p.slot.unit==='midfield'),attack=outfield.filter(p=>p.slot.unit==='attack');
    const teamEffects=applied.filter(a=>a.playerIds.some(id=>find(id)?.teamIndex===i));
    const atmosphereDelta=teamEffects.filter(a=>a.effect.kind==='team-atmosphere').reduce((s,a)=>s+(a.effect.kind==='team-atmosphere'?a.effect.delta:0),0);
    const connections=outfield.flatMap(p=>linked(p).filter(q=>p.player.id<q.player.id).map(q=>({quality:(ability(p,['passing','vision','control'])+ability(q,['passing','vision','control']))/2,weight:(p.slot.position==='CM'||p.slot.position==='CAM'||q.slot.position==='CM'||q.slot.position==='CAM')?1.8:1,fit:(fit(p)+fit(q))/2})));
    const passing=connections.length?connections.reduce((s,e)=>s+e.quality*(.75+.25*e.fit)*e.weight,0)/connections.reduce((s,e)=>s+e.weight,0):0;
    const guestCount=own.filter(p=>p.player.origin.kind==='guest').length;
    const cohesion=72+Math.min(8,stabilize(i).length*1.2)+atmosphereDelta*6-avg(outfield.map(p=>(1-fit(p))*20))-guestCount*1.5;
    const opposingPace=avg(opponent.map(p=>ability(p,['speed','strength']))),defenseLevel=avg(defense.map(p=>ability(p,['defending','positioning','strength'])*(.65+.35*fit(p))));
    const keeper=own.find(p=>p.slot.position==='GK')!;
    const defensiveBalance=.65*defenseLevel+.2*avg(mid.map(p=>ability(p,['defending','pressing','stamina'])))+.15*role(keeper)-Math.max(0,opposingPace-defenseLevel)*.12;
    const attackingThreat=.65*avg(attack.map(p=>ability(p,['finishing','shooting','speed','positioning'])*(.7+.3*fit(p))))+.35*avg([...mid,...outfield.filter(p=>p.slot.position==='W')].map(p=>ability(p,['passing','vision','control'])));
    const explanations:MetricExplanation[]=[...new Map(teamEffects.map(a=>[a.ruleId,{playerIds:a.playerIds,ruleId:a.ruleId,text:a.explanation,impact:a.effect.kind==='attribute-delta'?a.effect.delta:a.effect.kind==='team-atmosphere'?a.effect.delta:0}])).values()];
    const metric=(key:TeamMetricKey,score:number,text:string):TeamMetric=>({key,score:roundRating(clamp(score)),explanations:[{playerIds:own.map(p=>p.player.id),text,impact:0},...explanations]});
    const warnings=outfield.filter(p=>fit(p)<.73).map(p=>({playerIds:[p.player.id],text:`${p.player.name}: ${p.slot.label} rolüne uygunluk düşük (${Math.round(p.player.suitability[p.slot.position]*2)}/20).`}));
    for(const p of outfield)if(p.player.id==='eto'&&(predicate('eto-mismatch')||predicate('eto-critical-mismatch')))warnings.push({playerIds:[p.player.id,...opponent.map(q=>q.player.id)],text:`Eto, ${opponent.map(q=>q.player.name).join(', ')} hücumuna karşı hız/güç eşleşmesinde zorlanabilir.`});
    if(guestCount)warnings.push({playerIds:own.filter(p=>p.player.origin.kind==='guest').map(p=>p.player.id),text:'Misafir uyumu: pas bağlantısında küçük azalma; maç motorunda kontrol kalitesine bağlı ek hata riski.'});
    const distribution=own.some(p=>p.player.id==='barkuz'&&p.player.kind==='goalkeeper')?keeperDistribution['barkuz']:undefined;
    if(distribution){
      const lowered=distribution.applied.some(a=>a.effect.kind==='attribute-delta'&&a.effect.delta<0),pairs=[...new Set(distribution.applied.flatMap(a=>a.playerIds).filter(id=>id!=='barkuz'))].map(id=>find(id)?.player.name??id);
      warnings.push({playerIds:['barkuz',...distribution.applied.flatMap(a=>a.playerIds).filter(id=>id!=='barkuz')],text:`Barkuz kalede: Yusuf seviyesinde kalecilik ve orta saha ilerisindeki kanatlara isabetli uzun pas.${lowered?` ${pairs.join(', ')} aynı takımda olduğu için uzun pas isabeti biraz düşer.`:''} Genel kurtarış puanı artmaz.`});
    }
    const stabilizers=stabilize(i).map(s=>find(s.playerId)!.player);
    const atmosphere={state:stabilizers.length>=2?'good' as const:'neutral' as const,playerIds:stabilizers.map(p=>p.id),
      text:stabilizers.length>=2?`Atmosfer iyi eşikte: ${stabilizers.map(p=>p.name).join(', ')} olumlu stabilizatör. Maç öncesi aktif negatif kaynak yok; tartışma/kopma maç içinde tetiklenirse yeniden hesaplanır.`
        :`Atmosfer nötr: ${stabilizers.length?`${stabilizers[0]!.name} tek olumlu stabilizatör`:'olumlu stabilizatör yok'}; iyi eşik için en az iki gerekir.`};
    return {teamId:draft.lineups[i].teamId,atmosphere,metrics:{roleStrength:metric('roleStrength',avg(own.map(role)),'Atanılan mevkilerdeki efektif özellik ve uygunluk ortalaması.'),passing:metric('passing',passing,'Yakın pas bağlantılarında pas/görüş/kontrol; merkez rollere daha fazla ağırlık.'),cohesion:metric('cohesion',cohesion,'İsim bazlı ilişkiler, pozitif iletişim, rol uyumu ve misafir alışma payı.'),defensiveBalance:metric('defensiveBalance',defensiveBalance,'Savunma hattı, orta saha desteği ve kaleci; rakibin hız/güç tehdidiyle birlikte.'),attackingThreat:metric('attackingThreat',attackingThreat,'Hücumcuların bitiricilik/şut/koşu kalitesi ve bağlantılı pas desteği.')},warnings} satisfies TeamEvaluation;
  });
  return deepFreeze({evaluation:{revision:draft.revision,teams:teams as unknown as LineupEvaluation['teams'],evaluatedAgainstOpponent:true},effective,keeperDistribution,applied,pendingRuleIds:context.rulebook.rules.filter(r=>!active.includes(r)&&r.subjectPlayerIds.some(id=>find(id))).map(r=>r.id)});
}

export function evaluationScore(team:TeamEvaluation){const m=team.metrics;return m.roleStrength.score*.45+m.passing.score*.2+m.cohesion.score*.15+m.defensiveBalance.score*.1+m.attackingThreat.score*.1;}
