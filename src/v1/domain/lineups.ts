import type { Result } from './common.js';
import type { LineupDraft, Lineup } from './teams.js';
import type { LineupContext } from '../application/services.js';
import { FORMATIONS } from '../config/formations.ts';
import { selectionService } from '../application/selection-service.ts';
import { resolveMatchCatalog } from './match-players.ts';
import { deepFreeze } from './immutable.ts';

export function validateLineupShape(value:unknown):Result<LineupDraft>{
  const bad=():Result<never>=>({ok:false,problems:[{code:'INVALID_LINEUP',message:'Kayıtlı diziliş doğrulanamadı; kayıt korundu.'}]});
  if(!value||typeof value!=='object')return bad();const d=value as LineupDraft;
  if(typeof d.selectionId!=='string'||!Number.isSafeInteger(d.selectionRevision)||d.selectionRevision<0||!Number.isSafeInteger(d.revision)||d.revision<0||!Array.isArray(d.lineups)||d.lineups.length!==2)return bad();
  for(const [i,lineup] of d.lineups.entries()){
    if(!lineup||lineup.teamId!==`team-${i+1}`||!Object.hasOwn(FORMATIONS,lineup.formationId)||!['suggested','manual'].includes(lineup.provenance)||!Array.isArray(lineup.assignments)||lineup.assignments.length!==11)return bad();
    const slots=new Set(),players=new Set();
    for(const a of lineup.assignments){if(!a||typeof a.slotId!=='string'||typeof a.playerId!=='string'||slots.has(a.slotId)||players.has(a.playerId))return bad();slots.add(a.slotId);players.add(a.playerId);}
    if(FORMATIONS[lineup.formationId].slots.some(s=>!slots.has(s.id)))return bad();
  }
  return {ok:true,value:deepFreeze(structuredClone(d))};
}
export function validateLineups(draft:LineupDraft,context:LineupContext):Result<void>{
  const shape=validateLineupShape(draft);if(!shape.ok)return shape;
  const ready=selectionService.validateForLineups(context.selection,context.catalog);if(!ready.ok)return ready;
  if(draft.selectionId!==context.selection.id||draft.selectionRevision!==context.selection.revision)return {ok:false,problems:[{code:'STALE_SELECTION',message:'Kadrolar değişti. Yeni kadroya göre diziliş önerilerini yenile.'}]};
  const catalog=resolveMatchCatalog(context.catalog,context.selection);
  for(const lineup of draft.lineups){
    const team=context.selection.teams.find(t=>t.teamId===lineup.teamId)!;
    if(lineup.assignments.some(a=>!team.playerIds.includes(a.playerId)))return {ok:false,problems:[{code:'WRONG_ROSTER',message:'Dizilişte takım kadrosu dışından oyuncu var.'}]};
    for(const a of lineup.assignments){const p=catalog.players.find(p=>p.id===a.playerId),slot=FORMATIONS[lineup.formationId].slots.find(s=>s.id===a.slotId)!;
      if(!p||p.archived||((p.kind==='goalkeeper')!==(slot.position==='GK')))return {ok:false,problems:[{code:'KEEPER_SLOT',message:'Kaleci kaleci yerinde kalmalı. Saha oyuncuları kendi aralarında değiştirilebilir.'}]};
    }
  }
  return {ok:true,value:undefined};
}
/** Active team, name or date edits bump the selection revision without touching rosters.
 * A saved lineup survives them only if it still validates against the current rosters and Barkuz mode. */
export function rebaseLineupDraft(draft:LineupDraft,context:LineupContext):LineupDraft|null{
  if(draft.selectionId!==context.selection.id)return null;
  const value=draft.selectionRevision===context.selection.revision?draft:deepFreeze({...draft,selectionRevision:context.selection.revision,revision:0});
  return validateLineups(value,context).ok?value:null;
}
export function makeLineupDraft(selection:LineupContext['selection'],lineups:readonly [Lineup,Lineup]):LineupDraft {
  return deepFreeze({selectionId:selection.id,selectionRevision:selection.revision,revision:0,lineups});
}
