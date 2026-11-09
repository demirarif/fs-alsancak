import { EDIT, halfHighlights, playedPieces, stoppages } from './highlight-edit.js';

/* Live broadcast of a planned match (user decision 2026-11-05): everybody watches the same 10-minute edit at the same moment. Where the
 * broadcast is comes from the server clock minus the kick-off, so whoever is ten minutes late joins where it is. Order: walk-out, the
 * first half's highlights at real speed, a half-time card, walk-out, the second half's; set-piece waits are cut as the match screen does. */
export const BROADCAST={walkoutSeconds:8,halftimeSeconds:45,budgetSeconds:300};
export { stoppages };

/** The continuous stretches the edit plays: each highlight segment at real speed, a long set-piece wait cut to its last moments. */
export function editPieces(r,budget=BROADCAST.budgetSeconds,edit=EDIT){
  const segments=halfHighlights(r,budget,edit).segments,stops=stoppages(r),pieces=[];
  segments.forEach((s,seg)=>playedPieces(s.start,s.end,stops,edit).forEach((p,i)=>pieces.push({t0:p.t0,t1:p.t1,seg,segStart:i===0,cut:p.cut})));
  return pieces;
}

/** The whole broadcast: parts in order with their lengths (seconds), and each half's pieces. */
export function broadcastPlan(halves,edit=EDIT){
  const B=BROADCAST,pieces=halves.map(h=>editPieces(h,B.budgetSeconds,edit)),length=list=>list.reduce((n,x)=>n+x.t1-x.t0,0);
  const parts=[{kind:'walkout',half:1,seconds:B.walkoutSeconds},{kind:'half',half:1,seconds:length(pieces[0])},{kind:'halftime',half:1,seconds:B.halftimeSeconds},
    {kind:'walkout',half:2,seconds:B.walkoutSeconds},{kind:'half',half:2,seconds:length(pieces[1])}];
  return {pieces,parts,total:parts.reduce((n,p)=>n+p.seconds,0)};
}

/** What a recording carries of its edit (user, 2026-11-06): the plan the broadcast plays, each half's highlight segments and its dead-ball
 * stretches. With them stored, the broadcast plays exactly as planned even from the trimmed live copy (which cannot be re-edited). */
export function broadcastEdit(halves,edit=EDIT){
  return {version:edit.version,plan:broadcastPlan(halves,edit),segments:halves.map(h=>halfHighlights(h,BROADCAST.budgetSeconds,edit).segments),stops:halves.map(stoppages)};
}

/** What is on air `elapsed` seconds after the kick-off: before, a walk-out or the half-time card (offset into it), a half (match second
 * t and the piece), or the end. `key` changes exactly when the screen has to change what it shows. */
export function broadcastAt(plan,elapsed){
  if(elapsed<0)return {kind:'before',key:'before',remaining:-elapsed};
  let start=0;
  for(const p of plan.parts){
    if(p.seconds>0&&elapsed<start+p.seconds){
      const offset=elapsed-start,key=`${p.kind}${p.half}`;
      if(p.kind!=='half')return {kind:p.kind,key,half:p.half,offset,remaining:p.seconds-offset};
      const list=plan.pieces[p.half-1];let acc=0;
      for(let k=0;k<list.length;k++){const x=list[k],d=x.t1-x.t0;if(offset<acc+d||k===list.length-1)return {kind:'half',key,half:p.half,piece:k,t:Math.min(x.t1,x.t0+Math.max(0,offset-acc)),seg:x.seg,segStart:x.segStart,cut:x.cut};acc+=d;}
    }
    start+=p.seconds;
  }
  return {kind:'end',key:'end'};
}
