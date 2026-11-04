import { cameraClearance } from '../v1/rendering/camera-director.ts';
import { ballAt } from './replay-sampling.js';
import { attackStart, teamIndex } from './highlight-edit.js';

/** Instagram reel (user decision: vertical, at most a minute with the title and final cards; the goals, edited for hype, and never the
 * midfield battle). replaySpeed is the slow-motion of the finish replays. */
export const REEL={fps:30,width:1080,height:1920,introSeconds:1.5,outroSeconds:2.5,maxSeconds:60,replaySpeed:.5};
const DEG=Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),smoothstep=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
const ATTEMPTS=new Set(['shot','header','penalty','save']);
/** Shortest build-up shown before a finish. */
const LEAST_BUILD=2.8;

/** The goal a highlight attacks: where the ball or shot went, else the team's direction in that half. */
export function attackedEnd(event,half){
  if(Math.abs(event.destination.x)>25)return Math.sign(event.destination.x);
  if(Math.abs(event.origin.x)>25)return Math.sign(event.origin.x);
  const team=event.teamId==='team-2'?1:0,dir=half===1?[1,-1]:[-1,1];return event.kind==='save'?-dir[team]:dir[team];
}
/** Equalisers and go-ahead goals, headers and late goals get the slow-motion replays first. */
function drama(e){
  const after=/(\d+)–(\d+)$/.exec(e.reason.explanation),lead=after?(teamIndex(e.teamId)?after[2]-after[1]:after[1]-after[2]):2;
  return (lead===0||lead===1?2:1)+(e.outcome==='header'?.5:0)+(e.seconds>3000?.5:0);
}

/** Live clips in match order — each goal from when the attack reached the final third — then, while the minute allows, a slow-motion
 * replay right after the goal it shows. Without goals, the best few chances. */
export function planReel(halves,maxSeconds=REEL.maxSeconds){
  const played=halves.filter(Boolean),fps=REEL.fps,budget=Math.floor((maxSeconds-REEL.introSeconds-REEL.outroSeconds)*fps);
  const halfOf=e=>played.find(h=>e.seconds>=h.startSeconds&&e.seconds<=h.endSeconds),frames=c=>Math.round((c.end-c.start)/c.speed*fps);
  let moments=played.flatMap(h=>h.events.filter(e=>e.kind==='goal'));
  if(!moments.length){const best=[];for(const e of played.flatMap(h=>h.events).filter(x=>ATTEMPTS.has(x.kind)&&x.importance>=.6).sort((a,b)=>b.importance-a.importance)){if(best.length>=4)break;if(!best.some(b=>Math.abs(b.seconds-e.seconds)<8))best.push(e);}moments=best.sort((a,b)=>a.seconds-b.seconds);}
  let live=moments.map(e=>{const r=halfOf(e),team=e.kind==='save'?1-teamIndex(e.teamId):teamIndex(e.teamId);
    return {kind:'live',start:attackStart(r,team,e.seconds,{max:7,min:LEAST_BUILD,zone:12}),end:Math.min(r.endSeconds,e.seconds+(e.kind==='goal'?1.8:2.2)),event:e,half:r.half,attackedEnd:attackedEnd(e,r.half),speed:1};});
  let used=live.reduce((n,c)=>n+frames(c),0);
  // Goal-heavy matches: every goal gets an equal share of the minute, mostly before the finish; only past ~21 goals do the last drop out.
  if(used>budget){
    const share=Math.max(2.6,budget/fps/live.length);for(const c of live){c.start=Math.max(c.start,c.event.seconds-share*.65);c.end=Math.min(c.end,c.event.seconds+share*.35);}
    const kept=[];used=0;for(const c of live){if(used+frames(c)>budget)break;kept.push(c);used+=frames(c);}live=kept;
  }
  const replays=new Map();
  if(moments[0]?.kind==='goal')for(const c of [...live].sort((a,b)=>drama(b.event)-drama(a.event))){
    const r={kind:'replay',start:c.event.seconds-1.4,end:c.event.seconds+.35,event:c.event,half:c.half,attackedEnd:c.attackedEnd,speed:REEL.replaySpeed};
    if(used+frames(r)>budget)continue;replays.set(c,r);used+=frames(r);
  }
  const clips=live.flatMap(c=>replays.has(c)?[c,replays.get(c)]:[c]).map(c=>({...c,frames:frames(c)}));
  const introFrames=Math.round(REEL.introSeconds*fps),outroFrames=Math.round(REEL.outroSeconds*fps),total=introFrames+used+outroFrames;
  return {clips,goals:live.filter(c=>c.event.kind==='goal').length,introFrames,outroFrames,frames:total,seconds:total/fps};
}

/** Live portrait camera: high behind the attack looking at the attacked goal, so the pitch's length runs up the screen.
 * Rendering is offline, so the follow is a centred Gaussian over the ball path: the camera anticipates passes instead of chasing them. */
export function reelCameraPath(replay,clip,fps=REEL.fps){
  const {sx,sz}=smoothedBall(replay,clip,fps,.45),end=clip.attackedEnd,goal=clip.event.kind==='goal',poses=[];
  for(let i=0;i<clip.frames;i++){
    // 44° down keeps the frame on the pitch rather than the stands (~130 px players on 1920 px), with a push-in on the finish.
    const push=smoothstep(clip.event.seconds-1.6,clip.event.seconds+.2,clip.start+i/fps)*(goal?1:.5),d=30-5*push;
    const tx=end>0?Math.min(sx[i]+5,47):Math.max(sx[i]-5,-47),tz=sz[i]*.8,x=tx-end*d*Math.cos(44*DEG);
    poses.push({position:{x,y:Math.max(d*Math.sin(44*DEG),cameraClearance(x,tz)),z:tz},target:{x:tx,y:0,z:tz},verticalFovDegrees:52});
  }
  return poses;
}
/** Slow-motion replay camera: above the stand behind the goal, looking back at the finish with the goal mouth in the foreground. */
export function reelReplayPath(replay,clip,fps=REEL.fps){
  const {sx,sz}=smoothedBall(replay,clip,fps,.25),end=clip.attackedEnd,poses=[];
  for(let i=0;i<clip.frames;i++){
    const x=end*63.5,z=clamp(sz[i]*.3,-5,5);
    poses.push({position:{x,y:Math.max(8.5,cameraClearance(x,z)+1.5),z},target:{x:sx[i]+(end*52.5-sx[i])*.3,y:.9,z:sz[i]*.85},verticalFovDegrees:40});
  }
  return poses;
}
/** Ball path over a clip's frames (slow-motion aware), smoothed with a centred Gaussian of sigmaSeconds of match time. */
function smoothedBall(replay,clip,fps,sigmaSeconds){
  const n=clip.frames,bx=new Float64Array(n),bz=new Float64Array(n);
  for(let i=0;i<n;i++){const b=ballAt(replay,clip.start+i/fps*clip.speed);bx[i]=clamp(b.x,-56,56);bz[i]=clamp(b.z,-34,34);}
  const sigma=sigmaSeconds/clip.speed*fps;return {sx:gaussian(bx,sigma),sz:gaussian(bz,sigma)};
}
function gaussian(v,sigma){
  const r=Math.ceil(sigma*3),w=Array.from({length:2*r+1},(_,k)=>Math.exp(-((k-r)**2)/(2*sigma*sigma)));
  return Array.from(v,(_,i)=>{let s=0,ws=0;for(let k=-r;k<=r;k++){const q=w[k+r];s+=v[clamp(i+k,0,v.length-1)]*q;ws+=q;}return s/ws;});
}
