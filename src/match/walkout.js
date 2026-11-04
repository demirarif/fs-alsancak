import { BALL_STATE } from '../v1/engine/replay.ts';

/* Walk-out shown while the worker computes the half (user decision: no "simulating" card; the players walk onto the pitch meanwhile).
 * Two files of players leave the main-stand side and walk toward the centre circle; the camera dollies along with them. */
const SPEED=1.75,GAP=1.45,FRONT=35.5,WALK_SECONDS=10;
export const WALKOUT_MIN_SECONDS=5;
const smooth=u=>{const k=Math.max(0,Math.min(1,u));return k*k*(3-2*k);};
const lerp=(a,b,u)=>({x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:a.z+(b.z-a.z)*u});

/** Replay-shaped state at walk-out second t: keepers lead each file, then the lineup order. */
export function walkoutState(lineups,t,score=[0,0]){
  const walked=SPEED*Math.min(t,WALK_SECONDS),players=[];
  lineups.forEach((lineup,team)=>{
    const ids=[...lineup.assignments].sort((a,b)=>(b.slotId==='GK')-(a.slotId==='GK')).map(a=>a.playerId);
    ids.forEach((id,k)=>players.push({id,team,x:team?.85:-.85,z:FRONT+k*GAP-walked,heading:Math.PI,action:0,u:0,param:0}));
  });
  return {t:0,ball:{x:0,y:.11,z:0,state:BALL_STATE.dead},possession:-1,score,players};
}
/** Low side camera that tracks the head of the files. */
export function walkoutPose(t){
  const u=smooth(t/WALK_SECONDS);
  return {position:lerp({x:-10,y:3.2,z:13},{x:-8.5,y:2.8,z:10},u),target:lerp({x:0,y:1.2,z:30},{x:0,y:1.1,z:22},u),verticalFovDegrees:34};
}
