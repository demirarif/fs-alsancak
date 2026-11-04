import { FRAME_HEADER, PLAYER_CHANNELS, SAMPLE_HZ } from '../v1/engine/replay.ts';

const stride=replay=>FRAME_HEADER+replay.playerOrder.length*PLAYER_CHANNELS.length;
/** Restarts move the ball (net → centre spot, out of play → line); never draw it flying there. */
const TELEPORT=6;
function cursor(replay,t){
  const n=replay.frameCount,pos=Math.max(0,Math.min(n-1.001,(t-replay.startSeconds)*SAMPLE_HZ)),i=Math.floor(pos),s=stride(replay);
  return {a:i*s,b:Math.min(n-1,i+1)*s,u:pos-i};
}
/** First ball key after ta: binary search on the key times. */
function firstKeyAfter(keys,ta){let lo=0,hi=keys.length/4;while(lo<hi){const m=(lo+hi)>>1;if(keys[m*4]<=ta)lo=m+1;else hi=m;}return lo;}
/** Ball at t: straight between samples, or through the contact keys that fall between them (a header, a kick, a rebound). */
function ballBetween(replay,f,a,b,u,t){
  const lerp=k=>{const x=f[a+k],y=f[b+k];return Math.abs(y-x)>TELEPORT?x:x+(y-x)*u;};
  const keys=replay.ballKeys,cuts=replay.ballCuts,ta=f[a],tb=f[b];
  // A restart put the ball somewhere new in this step: show it where it was, then where it is — never sliding back onto the pitch.
  if(cuts?.length&&tb>ta){let lo=0,hi=cuts.length;while(lo<hi){const m=(lo+hi)>>1;if(cuts[m]<=ta)lo=m+1;else hi=m;}if(lo<cuts.length&&cuts[lo]<=tb){const s=t<cuts[lo]?a:b;return {x:f[s+1],y:f[s+2],z:f[s+3]};}}
  if(!keys?.length||!(tb>ta))return {x:lerp(1),y:lerp(2),z:lerp(3)};
  let k=firstKeyAfter(keys,ta);if(k*4>=keys.length||keys[k*4]>tb)return {x:lerp(1),y:lerp(2),z:lerp(3)};
  let pt=ta,px=f[a+1],py=f[a+2],pz=f[a+3];
  for(;;){
    const last=k*4>=keys.length||keys[k*4]>tb,qt=last?tb:keys[k*4],qx=last?f[b+1]:keys[k*4+1],qy=last?f[b+2]:keys[k*4+2],qz=last?f[b+3]:keys[k*4+3];
    if(t<=qt||last){
      if(Math.hypot(qx-px,qz-pz)>TELEPORT)return {x:px,y:py,z:pz};
      const w=qt>pt?Math.max(0,Math.min(1,(t-pt)/(qt-pt))):1;return {x:px+(qx-px)*w,y:py+(qy-py)*w,z:pz+(qz-pz)*w};
    }
    pt=qt;px=qx;py=qy;pz=qz;k++;
  }
}

/** Interpolated state at match second t from a half replay (10 Hz samples plus ball contact keys). Teleports (restarts) are not smeared. */
export function sampleReplay(replay,t){
  const f=replay.samples,{a,b,u}=cursor(replay,t);
  const lerp=(k,max=4)=>{const x=f[a+k],y=f[b+k];return Math.abs(y-x)>max?x:x+(y-x)*u;};
  const players=replay.playerOrder.map((id,k)=>{const o=FRAME_HEADER+k*PLAYER_CHANNELS.length,h0=f[a+o+2],h1=f[b+o+2],dh=Math.atan2(Math.sin(h1-h0),Math.cos(h1-h0));
    return {id,team:replay.teams[k],x:lerp(o),z:lerp(o+1),heading:h0+dh*u,action:f[a+o+3],u:f[b+o+3]===f[a+o+3]?f[a+o+4]+(f[b+o+4]-f[a+o+4])*u:f[a+o+4],param:f[a+o+5]};});
  return {t,ball:{...ballBetween(replay,f,a,b,u,t),state:f[a+4]},possession:f[a+5],score:[f[a+6],f[a+7]],players};
}

/** Ball only (camera planning), drawn the same way as sampleReplay. */
export function ballAt(replay,t){
  const f=replay.samples,{a,b,u}=cursor(replay,t);
  return ballBetween(replay,f,a,b,u,t);
}
