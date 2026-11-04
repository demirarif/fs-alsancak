import type { Result } from './common.js';
import type { SelectionDraft } from './teams.js';
import { deepFreeze } from './immutable.ts';
import { TEAM_PRESENTATION } from '../config/team-presentation.ts';

export function createSelectionDraft(id:string,weekId:string):SelectionDraft {
  return deepFreeze({id,weekId,revision:0,activeTeamId:'team-1',teams:[
    {teamId:'team-1',name:TEAM_PRESENTATION['team-1'].name,playerIds:[]},
    {teamId:'team-2',name:TEAM_PRESENTATION['team-2'].name,playerIds:[]},
  ]});
}

/** Checks persisted shape without depending on a changing player inventory. */
export function validateSelectionDraft(value:unknown):Result<SelectionDraft> {
  const invalid=():Result<never>=>({ok:false,problems:[{code:'INVALID_SELECTION',message:'Kayıtlı kadro doğrulanamadı. Mevcut kayıt korundu.'}]});
  if(!value||typeof value!=='object')return invalid();
  const d=value as Record<string,unknown>;
  if(d.barkuzGoalkeeper!==undefined&&typeof d.barkuzGoalkeeper!=='boolean')return invalid();
  if(typeof d.id!=='string'||!d.id||!Number.isSafeInteger(d.revision)||Number(d.revision)<0||
    !['team-1','team-2'].includes(String(d.activeTeamId))||typeof d.weekId!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d.weekId)||
    !Array.isArray(d.teams)||d.teams.length!==2)return invalid();
  const seen=new Set<string>();
  for(const [index,team] of d.teams.entries()){
    if(!team||typeof team!=='object'||team.teamId!==`team-${index+1}`||typeof team.name!=='string'||
      team.name.trim().length<2||team.name.length>40||!Array.isArray(team.playerIds)||team.playerIds.length>11)return invalid();
    for(const id of team.playerIds){if(typeof id!=='string'||!id||seen.has(id))return invalid();seen.add(id);}
  }
  return {ok:true,value:deepFreeze(structuredClone(value as SelectionDraft))};
}
