import type { LineupService } from './services.js';
import type { LineupDraft, Lineup } from '../domain/teams.js';
import { validateLineups } from '../domain/lineups.ts';
import { assessLineups } from '../domain/lineup-evaluation.ts';
import { assignFormation } from '../domain/assignment.ts';
import { resolveMatchCatalog } from '../domain/match-players.ts';
import { deepFreeze } from '../domain/immutable.ts';
import { FORMATIONS } from '../config/formations.ts';

export const lineupService:LineupService={
  validateForMatch:validateLineups,
  evaluate:(draft,context)=>assessLineups(draft,context).evaluation,
  apply(draft,command,context){
    const valid=validateLineups(draft,context);if(!valid.ok)return valid;
    const current=draft.lineups.find(l=>l.teamId===command.teamId);if(!current)return {ok:false,problems:[{code:'TEAM_MISSING',message:'Takım bulunamadı.'}]};
    let next:Lineup=current;
    if(command.kind==='change-formation'){
      if(!Object.hasOwn(FORMATIONS,command.formationId))return {ok:false,problems:[{code:'FORMATION_MISSING',message:'Diziliş bulunamadı.'}]};
      next=assignFormation(context.selection.teams.find(t=>t.teamId===command.teamId)!,command.formationId,resolveMatchCatalog(context.catalog,context.selection));
    }else if(command.kind==='swap-slots'){
      const a=current.assignments.find(a=>a.slotId===command.firstSlot),b=current.assignments.find(a=>a.slotId===command.secondSlot);
      if(!a||!b)return {ok:false,problems:[{code:'SLOT_MISSING',message:'Oyuncu yeri bulunamadı.'}]};
      if(a===b)return {ok:true,value:draft};
      next={...current,provenance:'manual',assignments:current.assignments.map(slot=>slot===a?{...slot,playerId:b.playerId}:slot===b?{...slot,playerId:a.playerId}:slot)};
    }else next=command.suggestion.lineup;
    const value:LineupDraft=deepFreeze({...draft,revision:draft.revision+1,lineups:draft.lineups.map(l=>l.teamId===command.teamId?next:l) as unknown as LineupDraft['lineups']});
    const checked=validateLineups(value,context);return checked.ok?{ok:true,value}:{ok:false,problems:checked.problems};
  },
};
