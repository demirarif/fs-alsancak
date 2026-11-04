import type { PlayerCatalog, GoalkeeperPlayer } from './players.js';
import type { SelectionDraft } from './teams.js';
import { deepFreeze } from './immutable.ts';

export const BARKUZ_DISTRIBUTION={id:'accurate-long-wide-distribution',passing:9,vision:8.5,minimumDistanceMeters:30,targetBeyondHalfway:true,targetWideFraction:.25} as const;

/** Identity/chemistry are Barkuz's; only goalkeeping level comes from Yusuf. */
export function resolveMatchCatalog(catalog:PlayerCatalog,selection:Pick<SelectionDraft,'barkuzGoalkeeper'>):PlayerCatalog {
  if(!selection.barkuzGoalkeeper)return catalog;
  const barkuz=catalog.players.find(p=>p.id==='barkuz'),yusuf=catalog.players.find(p=>p.id==='yusuf');
  if(!barkuz||yusuf?.kind!=='goalkeeper')throw new Error('Barkuz kaleci modu için Barkuz ve Yusuf kaydı gerekli.');
  if(barkuz.kind==='goalkeeper'&&barkuz.goalkeeperReferenceId==='yusuf')return catalog;
  const keeper:GoalkeeperPlayer={id:barkuz.id,name:barkuz.name,origin:barkuz.origin,archived:barkuz.archived,
    kind:'goalkeeper',mainPosition:'GK',goalkeeperRating:yusuf.goalkeeperRating,suitability:yusuf.suitability,preferredPositions:['GK'],
    goalkeeperReferenceId:'yusuf',specialAbilities:[BARKUZ_DISTRIBUTION],notes:[...barkuz.notes,
      {text:'Kadroya özel kaleci modu: Yusuf ile aynı kalecilik seviyesi. Ana forvet verileri korunur.'},
      {text:'Özel yetenek: oyun kurarken orta sahanın ilerisine, kanatlara isabetli uzun top. Genel kalecilik puanını yükseltmez.'}]};
  return deepFreeze({...catalog,version:`${catalog.version}+barkuz-gk-v1`,players:catalog.players.map(p=>p.id==='barkuz'?keeper:p)});
}
