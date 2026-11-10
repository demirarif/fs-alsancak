import { ACTION, FRAME_HEADER, PLAYER_CHANNELS, SAMPLE_HZ } from '../v1/engine/replay.ts';

const stride=replay=>FRAME_HEADER+replay.playerOrder.length*PLAYER_CHANNELS.length;

/* Actions are recorded at 10 Hz as (code, progress), and a pass lasts ~0.38 s. Drawing the last sample's code froze two kicks in three
 * for up to 0.1 s and then snapped them away, and a kick that began between samples lost its backswing (2026-11-09). Progress is
 * linear in time, so each player's actions are rebuilt once per replay as timed spans: its rate gives the start and the end. Hold (and
 * any code without a duration here) keeps the sampled value. */
const DURATION={[ACTION.pass]:.38,[ACTION.shot]:.53,[ACTION.receive]:.55,[ACTION.touch]:.35,[ACTION.tackle]:.6,[ACTION.header]:.7,[ACTION.throw]:1,
  [ACTION.dive]:1,[ACTION.catch]:.7,[ACTION.celebrate]:3,[ACTION.fall]:1.7,[ACTION.slide]:1.35};
const KICK_CONTACT=.45;
const spanCache=new WeakMap();
/** How a pass was struck, from the ball just after contact: lofted (long ball, cross, clearance), driven along the ground, or side-footed. */
function kickStyle(replay,code,contact){
  if(code===ACTION.shot)return 'shot';
  const f=replay.samples,s=stride(replay),n=replay.frameCount,i0=Math.max(0,Math.min(n-1,Math.ceil((contact-replay.startSeconds)*SAMPLE_HZ)));
  let top=0;for(let i=i0;i<Math.min(n,i0+7);i++)top=Math.max(top,f[i*s+2]);
  const a=Math.min(n-1,i0+1),b=Math.min(n-1,i0+4),dt=f[b*s]-f[a*s],speed=dt>0?Math.hypot(f[b*s+1]-f[a*s+1],f[b*s+3]-f[a*s+3])/dt:0;
  return top>.9?'lofted':speed>12.5?'drive':'pass';
}
function spansOf(replay){
  let all=spanCache.get(replay);if(all)return all;
  const f=replay.samples,n=replay.frameCount,s=stride(replay),C=PLAYER_CHANNELS.length;
  all=replay.playerOrder.map((_,k)=>{
    const o=FRAME_HEADER+k*C,spans=[],time=i=>f[i*s],code=i=>f[i*s+o+3],u=i=>f[i*s+o+4];
    for(let i=0;i<n;){
      const c=code(i);if(!(c in DURATION)){i++;continue;}
      // One action: the same code with progress not going back (a second kick of the same kind starts a new one).
      let j=i;while(j+1<n&&code(j+1)===c&&u(j+1)>=u(j)-1e-4)j++;
      const rates=[];for(let q=i;q<j;q++)if(u(q)>1e-3&&u(q+1)<.999&&u(q+1)>u(q))rates.push((u(q+1)-u(q))/(time(q+1)-time(q)));
      rates.sort((x,y)=>x-y);const rate=rates.length?rates[rates.length>>1]:0,d=rate>0?Math.min(6,Math.max(.1,1/rate)):DURATION[c];
      let first=-1;for(let q=i;q<=j;q++)if(u(q)>1e-3&&u(q)<.999){first=q;break;}
      const start=first>=0?time(first)-u(first)*d:u(j)>=.999?time(j)-d:time(i);
      // Not active at the samples either side: shown from the one before at the latest (a move the engine dates back, such as a
      // first touch, keeps its timing and is joined part-way), and over by the one after.
      const from=i>0?Math.max(start,time(i-1)):start,end=Math.max(time(j),Math.min(start+d,j+1<n?time(j+1):Infinity));
      spans.push({code:c,start,from,end,d,param:f[i*s+o+5],style:c===ACTION.pass||c===ACTION.shot?kickStyle(replay,c,start+KICK_CONTACT*d):null});
      i=j+1;
    }
    return spans;
  });
  spanCache.set(replay,all);return all;
}
function spanAt(spans,t){
  let lo=0,hi=spans.length;while(lo<hi){const m=(lo+hi)>>1;if(spans[m].from<=t)lo=m+1;else hi=m;}
  const sp=spans[lo-1];return sp&&t<sp.end?sp:null;
}
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
  const f=replay.samples,{a,b,u}=cursor(replay,t),spans=spansOf(replay);
  const lerp=(k,max=4)=>{const x=f[a+k],y=f[b+k];return Math.abs(y-x)>max?x:x+(y-x)*u;};
  const players=replay.playerOrder.map((id,k)=>{const o=FRAME_HEADER+k*PLAYER_CHANNELS.length,h0=f[a+o+2],h1=f[b+o+2],dh=Math.atan2(Math.sin(h1-h0),Math.cos(h1-h0));
    const base={id,team:replay.teams[k],x:lerp(o),z:lerp(o+1),heading:h0+dh*u},sp=spanAt(spans[k],t);
    if(sp)return {...base,action:sp.code,u:Math.min(1,Math.max(0,(t-sp.start)/sp.d)),param:sp.param,style:sp.style};
    const code=f[a+o+3];
    // Timed actions come only from spans (outside one he is between actions); hold and the rest are drawn as sampled.
    if(code in DURATION)return {...base,action:ACTION.none,u:0,param:0,style:null};
    return {...base,action:code,u:f[b+o+3]===code?f[a+o+4]+(f[b+o+4]-f[a+o+4])*u:f[a+o+4],param:f[a+o+5],style:null};});
  return {t,ball:{...ballBetween(replay,f,a,b,u,t),state:f[a+4]},possession:f[a+5],score:[f[a+6],f[a+7]],players};
}

/** Ball only (camera planning), drawn the same way as sampleReplay. */
export function ballAt(replay,t){
  const f=replay.samples,{a,b,u}=cursor(replay,t);
  return ballBetween(replay,f,a,b,u,t);
}
