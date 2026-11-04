import { FRAME_HEADER, PLAYER_CHANNELS, SAMPLE_HZ } from '../v1/engine/replay.ts';

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

const RESTARTS=new Set(['kick-off','throw-in','goal-kick','corner','free-kick']);
/** User decision: a moment starts from the stoppage that put the ball back in play (goal kick, throw-in, free kick, corner, kick-off)
 * when that is recent enough to watch; otherwise from where the move began. */
export function momentStart(replay,team,te,{least=4,longest=25}={}){
  let restart=null;for(const e of replay.events){if(e.seconds>=te-.5)break;if(RESTARTS.has(e.kind)&&e.seconds>=te-longest)restart=e;}
  return restart?Math.max(replay.startSeconds,restart.seconds-1):attackStart(replay,team,te,{max:14,min:least,zone:-8});
}

/** Which events make a moment, how long to keep after it, and the least importance that counts. Set pieces start at the set-up. */
const MOMENTS={
  goal:{after:5.5,least:0},shot:{after:3,least:.45},header:{after:3,least:.45},penalty:{after:3.5,least:0},save:{after:2.5,least:0},
  corner:{before:1.5,after:5.5,least:0,setPiece:true},'free-kick':{before:2,after:4.5,least:.5,setPiece:true},
  beat:{before:3,after:2.5,least:.32},'through-pass':{before:3,after:3,least:.45},cross:{before:3,after:3,least:.3},
  // Signature solo runs (Yankı, Servan) are logged as a mood event with high importance.
  mood:{before:1,after:12,least:.6},
};

/** Real-speed highlights of a half within budgetSeconds: kick-off, every goal, then big chances and saves, then the best of the rest. */
export function halfHighlights(replay,budgetSeconds=300){
  const lo=replay.startSeconds,hi=replay.endSeconds,raw=[{start:lo,end:lo+5,key:lo,importance:.2,goal:false}];
  for(const e of replay.events){
    const m=MOMENTS[e.kind];if(!m||e.importance<m.least)continue;
    const team=e.kind==='save'?1-teamIndex(e.teamId):teamIndex(e.teamId);
    const start=m.setPiece?e.seconds-m.before:momentStart(replay,team,e.seconds,{least:m.before??4});
    raw.push({start:Math.max(lo,start),end:Math.min(hi,e.seconds+m.after),key:e.seconds,importance:e.kind==='goal'?1:e.importance,goal:e.kind==='goal'});
  }
  raw.sort((a,b)=>a.start-b.start);
  const merged=[];
  for(const r of raw){const last=merged[merged.length-1];
    if(last&&r.start<=last.end+2.5){last.end=Math.max(last.end,r.end);last.count++;if(r.importance>last.importance){last.importance=r.importance;last.key=r.key;}last.goal||=r.goal;}
    else merged.push({...r,count:1});}
  const length=s=>s.end-s.start,must=merged.filter(s=>s.goal);
  // Goal-heavy halves in a short edit: trim the goals' build-ups rather than drop a goal.
  if(must.reduce((n,s)=>n+length(s),0)>budgetSeconds)for(const s of must)s.start=Math.max(s.start,s.key-8);
  const chosen=new Set(must);let total=must.reduce((n,s)=>n+length(s),0);
  for(const s of merged.filter(x=>!chosen.has(x)).sort((a,b)=>b.importance+.04*b.count-(a.importance+.04*a.count))){if(total+length(s)>budgetSeconds)continue;chosen.add(s);total+=length(s);}
  const segments=merged.filter(s=>chosen.has(s)).map(({start,end,key,importance})=>({start,end,key,importance}));
  return {segments,seconds:segments.reduce((n,s)=>n+s.end-s.start,0)};
}
