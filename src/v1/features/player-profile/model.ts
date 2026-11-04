import type { Player, PlayerCatalog, Attribute } from '../../domain/players.js';
import type { PlayerProfileViewModel, ProfileAttributeRow, ProfileNote } from './contract.js';
import { ALL_POSITIONS } from '../../config/rating-model.ts';
import { attributeOnTwenty } from './presentation.ts';

export const ATTRIBUTE_LABELS:Readonly<Record<Attribute,string>>={speed:'Hız',stamina:'Dayanıklılık',strength:'Güç',passing:'Pas',vision:'Oyun görüşü',control:'Top kontrolü',dribbling:'Dripling',shooting:'Şut',finishing:'Bitiricilik',defending:'Savunma',pressing:'Pres',positioning:'Pozisyon alma'};
export const PROFILE_GROUPS={technical:['passing','control','dribbling','shooting','finishing'],mental:['vision','positioning'],physical:['speed','stamina','strength'],defensive:['defending','pressing']} as const;

export function buildPlayerProfile(player:Player,_catalog:PlayerCatalog):PlayerProfileViewModel {
  const rows=(keys:readonly Attribute[]):readonly ProfileAttributeRow[]=>keys.map(attribute=>({attribute,label:ATTRIBUTE_LABELS[attribute],base:player.kind==='outfield'?player.attributes[attribute]:0,effective:null,explanation:null}));
  const sections=player.kind==='outfield'?{physical:rows(PROFILE_GROUPS.physical),technical:rows(PROFILE_GROUPS.technical),mental:rows(PROFILE_GROUPS.mental),defensive:rows(PROFILE_GROUPS.defensive)}:null;
  const ranked=player.kind==='outfield'?Object.entries(player.attributes).sort((a,b)=>b[1]-a[1]):[];
  const strengths:ProfileNote[]=ranked.slice(0,3).map(([key,value])=>({text:`${ATTRIBUTE_LABELS[key as Attribute]} · ${attributeOnTwenty(value)}/20`,origin:'derived'}));
  const limitations:ProfileNote[]=ranked.filter(([,value])=>value<7).slice(-3).reverse().map(([key,value])=>({text:`${ATTRIBUTE_LABELS[key as Attribute]} · ${attributeOnTwenty(value)}/20`,origin:'derived'}));
  const chemistry:ProfileNote[]=player.origin.kind==='guest'?
    [{text:'Takıma yeni katıldığı için pas bağlantılarında hafif bir alışma dezavantajı yaşar.',origin:'derived'},
      {text:player.kind==='outfield'?'Pas, oyun görüşü ve koşu zamanlamasında küçük bir koordinasyon kaybı olabilir.':'Uyum etkisi top dağıtımı ve iletişimde değerlendirilir.',origin:'derived'},
      {text:'Baskı altında kontrol hatası riski biraz artar. Etkinin büyüklüğü oyuncunun kontrol kalitesine bağlıdır.',origin:'derived'}]
    :player.notes.map(note=>({text:note.text,origin:'source',...(note.source?{source:note.source}:{})}));
  return {playerId:player.id,player,sections,positionRatings:ALL_POSITIONS.map(position=>({position,suitability:player.suitability[position],rating:player.kind==='goalkeeper'?(position==='GK'?player.goalkeeperRating:null):(position==='GK'?null:player.positionRatings[position])})),
    strengths,limitations,chemistry,activeModifiers:[],weeklyForm:null,estimatedFromReference:player.origin.kind==='guest'};
}
