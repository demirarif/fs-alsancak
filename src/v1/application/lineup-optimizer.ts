import type { OptimizationRequest, OptimizationResult } from './services.js';
import type { Lineup, LineupSuggestion } from '../domain/teams.js';
import type { Result } from '../domain/common.js';
import { selectionService } from './selection-service.ts';
import { assignFormation } from '../domain/assignment.ts';
import { makeLineupDraft } from '../domain/lineups.ts';
import { assessLineups, evaluationScore } from '../domain/lineup-evaluation.ts';
import { resolveMatchCatalog } from '../domain/match-players.ts';

export function optimizeLineups(request:OptimizationRequest):Result<OptimizationResult>{
  const {context}=request,valid=selectionService.validateForLineups(context.selection,context.catalog);if(!valid.ok)return valid;
  const catalog=resolveMatchCatalog(context.catalog,context.selection);
  const candidates=context.selection.teams.map(team=>request.formations.map(id=>assignFormation(team,id,catalog)));
  if(!candidates[0]?.length||!candidates[1]?.length)return {ok:false,problems:[{code:'NO_FORMATIONS',message:'En az bir diziliş gerekli.'}]};
  let best:readonly [Lineup,Lineup]=[candidates[0][0]!,candidates[1][0]!],bestScore=-Infinity;
  for(const blue of candidates[0])for(const red of candidates[1]){
    const pair=[blue,red] as const,evaluation=assessLineups(makeLineupDraft(context.selection,pair),context).evaluation;
    const score=evaluation.teams.reduce((s,t)=>s+evaluationScore(t),0);
    if(score>bestScore){best=pair;bestScore=score;}
  }
  // Refine the exact role assignment with pair/linked-role chemistry, never moving GK.
  for(let team=0;team<2;team++){
    let pair=[...best] as [Lineup,Lineup];
    for(let pass=0;pass<2;pass++){
      let improved=false;const current=pair[team]!;
      for(let a=1;a<11;a++)for(let b=a+1;b<11;b++){
        const first=current.assignments[a]!,second=current.assignments[b]!;
        const changed={...current,assignments:current.assignments.map((s,i)=>i===a?{...s,playerId:second.playerId}:i===b?{...s,playerId:first.playerId}:s)};
        const trial=[...pair] as [Lineup,Lineup];trial[team]=changed;
        const score=assessLineups(makeLineupDraft(context.selection,trial),context).evaluation.teams.reduce((s,t)=>s+evaluationScore(t),0);
        if(score>bestScore+1e-7){pair=trial;bestScore=score;improved=true;break;}
      }
      if(!improved)break;
    }
    best=pair;
  }
  const initialDraft=makeLineupDraft(context.selection,best),evaluation=assessLineups(initialDraft,context).evaluation;
  const suggestions=context.selection.teams.map((team,i)=>candidates[i]!.map(lineup=>{
    const pair=[...best] as [Lineup,Lineup];pair[i]=lineup;
    const assessment=assessLineups(makeLineupDraft(context.selection,pair),context).evaluation;
    return {lineup,evaluation:assessment.teams[i]!,explanation:'10 saha oyuncusu için tam mevki eşleştirmesi; rakip ve kaynaklı kimya ile karşılaştırıldı.'} satisfies LineupSuggestion;
  }).sort((a,b)=>evaluationScore(b.evaluation)-evaluationScore(a.evaluation)).map(s=>({...s,lineup:{...s.lineup,teamId:team.teamId}})));
  return {ok:true,value:{runId:request.runId,selectionRevision:request.selectionRevision,initialDraft,evaluation,suggestions:{'team-1':suggestions[0]!,'team-2':suggestions[1]!}}};
}
