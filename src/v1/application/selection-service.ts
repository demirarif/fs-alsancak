import type { Problem, Result } from '../domain/common.js';
import type { SelectionService } from './services.js';
import type { SelectionDraft } from '../domain/teams.js';
import { deepFreeze } from '../domain/immutable.ts';
import { validateSelectionDraft } from '../domain/selection.ts';
import { resolveMatchCatalog } from '../domain/match-players.ts';

const fail=(code:string,message:string):Result<never>=>({ok:false,problems:[{code,message}]});
export const selectionService:SelectionService={
  apply(draft,command,catalog){
    const valid=validateSelectionDraft(draft);if(!valid.ok)return valid;
    catalog=resolveMatchCatalog(catalog,draft);
    let next:SelectionDraft=draft;
    switch(command.kind){
      case 'set-barkuz-goalkeeper': {
        if(command.enabled===!!draft.barkuzGoalkeeper)break;
        const team=draft.teams.find(t=>t.playerIds.includes('barkuz'));
        if(command.enabled&&team?.playerIds.some(id=>id!=='barkuz'&&catalog.players.find(p=>p.id===id)?.kind==='goalkeeper'))return fail('GOALKEEPER_FULL',`${team.name} kadrosunda başka kaleci var. Barkuz'u kaleye geçirmek için önce onu çıkar.`);
        next={...draft,barkuzGoalkeeper:command.enabled};break;
      }
      case 'activate-team':
        if(!draft.teams.some(t=>t.teamId===command.teamId))return fail('UNKNOWN_TEAM','Takım bulunamadı.');
        if(draft.activeTeamId!==command.teamId)next={...draft,activeTeamId:command.teamId};break;
      case 'add-player': {
        const player=catalog.players.find(p=>p.id===command.playerId&&!p.archived);
        if(!player)return fail('PLAYER_UNAVAILABLE','Oyuncu envanterde bulunamadı.');
        if(draft.teams.some(t=>t.playerIds.includes(player.id)))return fail('ALREADY_ASSIGNED','Bu oyuncu zaten bir takımda. Önce takımından çıkar.');
        const team=draft.teams.find(t=>t.teamId===draft.activeTeamId)!;
        if(team.playerIds.length>=11)return fail('TEAM_FULL','Bu takım 11 kişi. Yeni oyuncu için önce birini çıkar.');
        if(player.kind==='goalkeeper'&&team.playerIds.some(id=>catalog.players.find(p=>p.id===id)?.kind==='goalkeeper'))return fail('GOALKEEPER_FULL','Bu takımda bir kaleci var. Önce mevcut kaleciyi çıkar.');
        next={...draft,teams:draft.teams.map(t=>t===team?{...t,playerIds:[...t.playerIds,player.id]}:t) as unknown as SelectionDraft['teams']};break;
      }
      case 'remove-player':
        if(!draft.teams.some(t=>t.teamId===command.teamId))return fail('UNKNOWN_TEAM','Takım bulunamadı.');
        if(draft.teams.some(t=>t.teamId===command.teamId&&t.playerIds.includes(command.playerId)))next={...draft,teams:draft.teams.map(t=>t.teamId===command.teamId?{...t,playerIds:t.playerIds.filter(id=>id!==command.playerId)}:t) as unknown as SelectionDraft['teams']};break;
      case 'clear-team':
        if(!draft.teams.some(t=>t.teamId===command.teamId))return fail('UNKNOWN_TEAM','Takım bulunamadı.');
        if(draft.teams.some(t=>t.teamId===command.teamId&&t.playerIds.length))next={...draft,teams:draft.teams.map(t=>t.teamId===command.teamId?{...t,playerIds:[]}:t) as unknown as SelectionDraft['teams']};break;
      case 'rename-team': {
        const name=command.name.trim();if(name.length<2||name.length>40)return fail('TEAM_NAME','Takım adı 2–40 karakter olmalı.');
        if(!draft.teams.some(t=>t.teamId===command.teamId))return fail('UNKNOWN_TEAM','Takım bulunamadı.');
        if(draft.teams.some(t=>t.teamId===command.teamId&&t.name!==name))next={...draft,teams:draft.teams.map(t=>t.teamId===command.teamId?{...t,name}:t) as unknown as SelectionDraft['teams']};break;
      }
      case 'set-week':
        if(!/^\d{4}-\d{2}-\d{2}$/.test(command.weekId))return fail('WEEK_INVALID','Geçerli bir maç tarihi seç.');
        if(draft.weekId!==command.weekId)next={...draft,weekId:command.weekId};break;
    }
    return {ok:true,value:next===draft?draft:deepFreeze({...next,revision:draft.revision+1})};
  },
  validateForLineups(draft,catalog){
    const valid=validateSelectionDraft(draft);if(!valid.ok)return valid;
    catalog=resolveMatchCatalog(catalog,draft);
    const problems:Problem[]=[];
    for(const team of draft.teams){
      if(team.playerIds.length!==11)problems.push({code:'TEAM_INCOMPLETE',message:`${team.name}: ${11-team.playerIds.length} oyuncu daha seç.`});
      const players=team.playerIds.map(id=>catalog.players.find(p=>p.id===id&&!p.archived));
      if(players.some(p=>!p))problems.push({code:'PLAYER_UNAVAILABLE',message:`${team.name}: envanterde bulunamayan oyuncuyu çıkar.`});
      if(players.filter(p=>p?.kind==='goalkeeper').length!==1)problems.push({code:'GOALKEEPER_REQUIRED',message:`${team.name}: bir kaleci seç.`});
    }
    return problems.length?{ok:false,problems}:{ok:true,value:undefined};
  },
};
