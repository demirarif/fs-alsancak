import { BALL_STATE, FRAME_HEADER, PLAYER_CHANNELS, SAMPLE_HZ } from '../v1/engine/replay.ts';

/* Viewing edits of a half replay. User decision: the "10 dk" mode is a real-speed package of the important moments, not a fast-forward,
 * and midfield battles are skipped. Pure functions over the packed replay, testable in Node. */
const stride=replay=>FRAME_HEADER+replay.playerOrder.length*PLAYER_CHANNELS.length;
export const teamIndex=id=>id==='team-2'?1:0;
/** World-x direction a team attacks in a half. */
export const attackDir=(team,half)=>(half===1)===(team===0)?1:-1;

/** Start of the move behind a moment at te: walk back while the team keeps (or contests a loose) ball beyond `zone` metres in its
 * attacking direction; clamped to [te-max, te-min] and the half. */
export function attackStart(replay,team,te,{max=14,min=4,zone=-8}={}){
  const s=stride(replay),f=replay.samples,d=attackDir(team,replay.half),at=sec=>Math.floor((sec-replay.startSeconds)*SAMPLE_HZ);
  let i=Math.max(0,Math.min(replay.frameCount-1,at(te)));const stop=Math.max(0,at(te-max));
  for(;i>stop;i--){const o=i*s,p=f[o+5];if(!(p===team||p===-1)||f[o+1]*d<zone)break;}
  return Math.max(replay.startSeconds,Math.min(te-min,Math.max(te-max,replay.startSeconds+i/SAMPLE_HZ)));
}

/** Dead-ball stretches of a half (a corner or free kick being set up, the kick-off after a goal). A throw-in, goal kick, foul or corner
 * is logged when the ball goes dead, i.e. at the start of its stretch; a kick-off when it is taken, at the end. */
export function stoppages(r){const out=[],st=FRAME_HEADER+r.playerOrder.length*PLAYER_CHANNELS.length;let from=-1;for(let i=0;i<r.frameCount;i++){const dead=r.samples[i*st+4]===BALL_STATE.dead,at=r.samples[i*st];if(dead&&from<0)from=at;else if(!dead&&from>=0){out.push([from,at]);from=-1;}}if(from>=0)out.push([from,r.endSeconds]);return out;}

/** How an edit is cut. v1 is the edit of the first broadcasts (5 Nov 2026), kept so their recordings replay exactly as they were timed.
 * v2 (user, 2026-11-06: "gol ve önemli anların daha geriye dönük hallerini istiyorum… pat pat kesiliyor… taçtan geldi gol oldu ya tacın
 * biraz öncesi de olmalı, bir önceki duran anı da içermeli… 10 dakikaya göre ayarlarsın"):
 * - a moment that came from a throw-in, goal kick, free kick or corner starts 5 s before the ball went dead for it (how it went out, the
 *   foul), not 1 s;
 * - a set-up wait is cut only when more than 3 s of it is left, to its last 1.5 s (v1: 2 s, 0.8 s) — most throw-ins now run on uncut;
 * - moments less than 8 s apart play as one stretch (v1: 2.5 s), and no moment is shorter than 8 s;
 * - the budget counts what is on screen (after the cuts), 90 % of the nominal one, so the broadcast stays about 10 minutes. */
export const EDIT_V1=Object.freeze({version:1,lookback:25,restartLead:1,deadLead:0,mergeGap:2.5,minLength:0,cutOver:2,cutKeep:.8,goalTrim:8,shownBudget:false,budgetShare:1});
export const EDIT=Object.freeze({version:2,lookback:30,restartLead:1,deadLead:5,mergeGap:8,minLength:8,cutOver:3,cutKeep:1.5,goalTrim:12,shownBudget:true,budgetShare:.9});
/** The edit a recording was planned with (a recording without one is from the first broadcasts). */
export const editOf=version=>version===EDIT.version?EDIT:EDIT_V1;

const RESTARTS=new Set(['kick-off','throw-in','goal-kick','corner','free-kick']);
/** v2: where the build-up of a restart begins, `deadLead` seconds before its dead-ball stretch; a kick-off keeps its own start. */
function deadStart(restart,edit,stops){
  if(!edit.deadLead||restart.kind==='kick-off')return Infinity;
  const dead=stops.find(x=>x[0]<=restart.seconds+.6&&x[1]>=restart.seconds-.6);
  return (dead?dead[0]:restart.seconds)-edit.deadLead;
}
/** User decision: a moment starts from the stoppage that put the ball back in play (goal kick, throw-in, free kick, corner, kick-off)
 * when that is recent enough to watch; otherwise from where the move began. */
export function momentStart(replay,team,te,{least=4,longest}={},edit=EDIT,stops=stoppages(replay)){
  let restart=null;const back=longest??edit.lookback;
  for(const e of replay.events){if(e.seconds>=te-.5)break;if(RESTARTS.has(e.kind)&&e.seconds>=te-back)restart=e;}
  if(!restart)return attackStart(replay,team,te,{max:14,min:least,zone:-8});
  return Math.max(replay.startSeconds,Math.min(restart.seconds-edit.restartLead,deadStart(restart,edit,stops)));
}

/** Which events make a moment, how long to keep after it, and the least importance that counts. Set pieces start at the set-up. */
const MOMENTS={
  goal:{after:5.5,least:0},shot:{after:3,least:.45},header:{after:3,least:.45},penalty:{after:3.5,least:0},save:{after:2.5,least:0},
  corner:{before:1.5,after:5.5,least:0,setPiece:true},'free-kick':{before:2,after:4.5,least:.5,setPiece:true},
  beat:{before:3,after:2.5,least:.32},'through-pass':{before:3,after:3,least:.45},cross:{before:3,after:3,least:.3},
  // Signature solo runs (Yankı, Servan) are logged as a mood event with high importance.
  mood:{before:1,after:12,least:.6},
};

/** The stretches of [start, end] that play: a set-up wait with more than `cutOver` seconds left jumps to its last `cutKeep` seconds.
 * `cut` marks a piece entered by a jump (the screen dips there). */
export function playedPieces(start,end,stops,edit=EDIT){
  const out=[];let t=start,cut=true;
  while(t<end-1e-6){
    const stop=stops.find(x=>t>=x[0]&&t<x[1]);
    if(stop&&stop[1]-t>edit.cutOver){const next=stop[1]-edit.cutKeep;if(next>=end)break;t=next;cut=true;continue;}
    const ahead=stops.find(x=>x[0]>t+1e-6&&x[0]<end),t1=ahead?ahead[0]:end;
    out.push({t0:t,t1,cut});cut=false;t=t1;
  }
  return out;
}

/** Real-speed highlights of a half within budgetSeconds: kick-off, every goal, then big chances and saves, then the best of the rest. */
export function halfHighlights(replay,budgetSeconds=300,edit=EDIT){
  const lo=replay.startSeconds,hi=replay.endSeconds,stops=stoppages(replay),raw=[{start:lo,end:lo+5,key:lo,importance:.2,goal:false}];
  for(const e of replay.events){
    const m=MOMENTS[e.kind];if(!m||e.importance<m.least)continue;
    const team=e.kind==='save'?1-teamIndex(e.teamId):teamIndex(e.teamId),end=Math.min(hi,e.seconds+m.after);
    let start=m.setPiece?Math.min(e.seconds-m.before,deadStart(e,edit,stops)):momentStart(replay,team,e.seconds,{least:m.before??4},edit,stops);
    if(end-start<edit.minLength)start=end-edit.minLength;
    raw.push({start:Math.max(lo,start),end,key:e.seconds,importance:e.kind==='goal'?1:e.importance,goal:e.kind==='goal'});
  }
  raw.sort((a,b)=>a.start-b.start);
  const merged=[];
  for(const r of raw){const last=merged[merged.length-1];
    if(last&&r.start<=last.end+edit.mergeGap){last.end=Math.max(last.end,r.end);last.count++;if(r.importance>last.importance){last.importance=r.importance;last.key=r.key;}last.goal||=r.goal;}
    else merged.push({...r,count:1});}
  const length=s=>edit.shownBudget?playedPieces(s.start,s.end,stops,edit).reduce((n,p)=>n+p.t1-p.t0,0):s.end-s.start;
  const budget=budgetSeconds*edit.budgetShare,must=merged.filter(s=>s.goal);
  // Goal-heavy halves in a short edit: trim the goals' build-ups rather than drop a goal.
  if(must.reduce((n,s)=>n+length(s),0)>budget)for(const s of must)s.start=Math.max(s.start,s.key-edit.goalTrim);
  const chosen=new Set(must);let total=must.reduce((n,s)=>n+length(s),0);
  for(const s of merged.filter(x=>!chosen.has(x)).sort((a,b)=>b.importance+.04*b.count-(a.importance+.04*a.count))){const l=length(s);if(total+l>budget)continue;chosen.add(s);total+=l;}
  const segments=merged.filter(s=>chosen.has(s)).map(({start,end,key,importance})=>({start,end,key,importance}));
  return {segments,seconds:segments.reduce((n,s)=>edit.shownBudget?n+length(s):n+s.end-s.start,0)};
}
