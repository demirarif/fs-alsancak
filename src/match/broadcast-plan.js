import { halfHighlights } from './highlight-edit.js';
import { BALL_STATE, FRAME_HEADER, PLAYER_CHANNELS } from '../v1/engine/replay.ts';

/* Live broadcast of a planned match (user decision 2026-11-05): everybody watches the same 10-minute edit at the same moment. Where the
 * broadcast is comes from the server clock minus the kick-off, so whoever is ten minutes late joins where it is. Order: walk-out, the
 * first half's highlights at real speed, a half-time card, walk-out, the second half's; set-piece waits are cut as the match screen does. */
export const BROADCAST={walkoutSeconds:8,halftimeSeconds:45,budgetSeconds:300};

/** Dead-ball stretches of a half (a corner or free kick being set up, the kick-off after a goal). */
export function stoppages(r){const out=[],st=FRAME_HEADER+r.playerOrder.length*PLAYER_CHANNELS.length;let from=-1;for(let i=0;i<r.frameCount;i++){const dead=r.samples[i*st+4]===BALL_STATE.dead,at=r.samples[i*st];if(dead&&from<0)from=at;else if(!dead&&from>=0){out.push([from,at]);from=-1;}}if(from>=0)out.push([from,r.endSeconds]);return out;}

/** The continuous stretches the edit plays: each highlight segment at real speed, a set-piece wait of more than 2 s cut to its last 0.8 s. */
export function editPieces(r,budget=BROADCAST.budgetSeconds){
  const segments=halfHighlights(r,budget).segments,stops=stoppages(r),pieces=[];
  segments.forEach((s,seg)=>{
    let t=s.start,first=true,cut=true;
    while(t<s.end-1e-6){
      const stop=stops.find(x=>t>=x[0]&&t<x[1]);
      if(stop&&stop[1]-t>2){const next=stop[1]-.8;if(next>=s.end)break;t=next;cut=true;continue;}
      const ahead=stops.find(x=>x[0]>t+1e-6&&x[0]<s.end),t1=ahead?ahead[0]:s.end;
      pieces.push({t0:t,t1,seg,segStart:first,cut});first=false;cut=false;t=t1;
    }
  });
  return pieces;
}

/** The whole broadcast: parts in order with their lengths (seconds), and each half's pieces. */
export function broadcastPlan(halves){
  const B=BROADCAST,pieces=halves.map(h=>editPieces(h)),length=list=>list.reduce((n,x)=>n+x.t1-x.t0,0);
  const parts=[{kind:'walkout',half:1,seconds:B.walkoutSeconds},{kind:'half',half:1,seconds:length(pieces[0])},{kind:'halftime',half:1,seconds:B.halftimeSeconds},
    {kind:'walkout',half:2,seconds:B.walkoutSeconds},{kind:'half',half:2,seconds:length(pieces[1])}];
  return {pieces,parts,total:parts.reduce((n,p)=>n+p.seconds,0)};
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
