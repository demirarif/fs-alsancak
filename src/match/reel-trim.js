import { planReel } from './reel-plan.js';
import { FRAME_HEADER, PLAYER_CHANNELS } from '../v1/engine/replay.ts';

/* What stays of a planned match for good (user decision 2026-11-05: three days after kick-off only the score, the goals and the 9:16
 * reel remain): the reel's clips with a margin, every goal's build-up and each half's first second. All other samples are zeroed — they
 * compress to almost nothing — so the reel plans and renders exactly as it does from the full recording (~0.2 MB instead of ~9). */
const MARGIN=3,BUILD_UP=12,AFTER_GOAL=4;
export function trimForReel(halves){
  const windows=halves.map(h=>[[h.startSeconds,h.startSeconds+1]]);
  for(const c of planReel(halves).clips){const i=halves.findIndex(h=>c.start>=h.startSeconds-1e-6&&c.start<=h.endSeconds);if(i>=0)windows[i].push([c.start-MARGIN,c.end+MARGIN]);}
  halves.forEach((h,i)=>{for(const e of h.events)if(e.kind==='goal')windows[i].push([e.seconds-BUILD_UP,e.seconds+AFTER_GOAL]);});
  return halves.map((h,i)=>{
    const w=windows[i],kept=s=>w.some(([a,b])=>s>=a&&s<=b),st=FRAME_HEADER+h.playerOrder.length*PLAYER_CHANNELS.length,samples=new Float32Array(h.samples.length);
    for(let f=0;f<h.frameCount;f++)if(kept(h.samples[f*st]))samples.set(h.samples.subarray(f*st,(f+1)*st),f*st);
    const keys=[];for(let k=0;k<h.ballKeys.length;k+=4)if(kept(h.ballKeys[k]))for(let j=0;j<4;j++)keys.push(h.ballKeys[k+j]);
    return {...h,samples,ballKeys:new Float32Array(keys),events:h.events.filter(e=>e.kind==='goal'||kept(e.seconds))};
  });
}

/* What everybody downloads to watch the live broadcast (user, 2026-11-06: "işlemciyi hafiflet"): only what the 10-minute edit shows —
 * each highlight segment with 2 s either side, each half's first and last second. Every other frame is zeroed (they compress to almost
 * nothing); the ball's keys and the events stay whole (they are small). ~3 MB instead of ~10. The edit itself travels with the file. */
const LIVE_MARGIN=2;
export function trimForLive(halves,edit){
  return halves.map((h,i)=>{
    const w=[[h.startSeconds,h.startSeconds+1],[h.endSeconds-1,h.endSeconds],...edit.segments[i].map(s=>[s.start-LIVE_MARGIN,s.end+LIVE_MARGIN])],kept=s=>w.some(([a,b])=>s>=a&&s<=b);
    const st=FRAME_HEADER+h.playerOrder.length*PLAYER_CHANNELS.length,samples=new Float32Array(h.samples.length);
    for(let f=0;f<h.frameCount;f++)if(kept(h.samples[f*st]))samples.set(h.samples.subarray(f*st,(f+1)*st),f*st);
    return {...h,samples};
  });
}
