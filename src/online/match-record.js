import { FORMATIONS } from '../v1/config/formations.ts';
import { factsOf, manOfTheMatch, topScorers } from '../v1/online/markets.ts';
import { broadcastEdit } from '../match/broadcast-plan.js';
import { trimForLive, trimForReel } from '../match/reel-trim.js';

/* A planned match as the admin's browser uploads it (pure: no network, no worker, so tests run it in Node). The recording holds the
 * seed and every frame and is served only from the kick-off; `teams` is all anyone sees before; `result` (with the facts every bet is
 * decided on) only after the broadcast. */
export function publicTeams(snapshot,lineups,teamNames){
  const names=new Map(snapshot.players.map(p=>[p.id,p.name]));
  return {names:[...teamNames],teams:lineups.map((l,i)=>{const f=FORMATIONS[l.formationId];
    return {name:teamNames[i],formation:f?.label??l.formationId,players:(f?.slots??[]).map(s=>{const a=l.assignments.find(x=>x.slotId===s.id);return a?{id:a.playerId,name:names.get(a.playerId)??a.playerId,slot:s.id,label:s.label}:null;}).filter(Boolean)};})};
}
/** Score, the goals as shown (minute, scorer, own goal, penalty), top scorers, the man of the match, and the facts for settlement. */
export function matchResult(snapshot,halfResults){
  const names=new Map(snapshot.players.map(p=>[p.id,p.name])),events=halfResults.flatMap(h=>h.replay.events),facts=factsOf(halfResults[0],halfResults[1]);
  const goals=events.filter(e=>e.kind==='goal').map(e=>({minute:Math.floor(Math.min(e.seconds,3599.9)/60)+1,team:e.teamId==='team-2'?1:0,playerId:e.actorId??null,name:names.get(e.actorId)??'',ownGoal:e.outcome==='own-goal',
    penalty:events.some(x=>x.kind==='penalty'&&x.actorId===e.actorId&&x.seconds<=e.seconds&&e.seconds-x.seconds<3)}));
  const motm=manOfTheMatch(facts);
  return {score:[...facts.ft],halfTime:[...facts.ht],goals,topScorers:topScorers(facts),motm:motm?{id:motm,name:names.get(motm)??motm}:null,facts};
}
/** halfResults: the two HalfResult objects of the simulation. The recording carries its edit (the broadcast plan, the highlight segments,
 * the dead-ball stretches); `live` is the trimmed copy everybody watches the broadcast from, `reel` the one the 9:16 summary is made from. */
export function buildMatchRecord({snapshot,lineups,teamNames,halfResults}){
  const halves=halfResults.map(r=>r.replay),results=halfResults.map(r=>({score:[...r.score],teamStats:r.teamStats})),edit=broadcastEdit(halves);
  const recording={format:1,snapshot,lineups:[lineups[0],lineups[1]],halves,results,teamNames:[...teamNames],edit};
  return {recording,live:{...recording,halves:trimForLive(halves,edit),trimmed:true},reel:{...recording,halves:trimForReel(halves)},plan:edit.plan,
    teams:publicTeams(snapshot,lineups[1],teamNames),result:matchResult(snapshot,halfResults)};
}
