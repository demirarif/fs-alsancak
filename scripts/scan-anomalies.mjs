// Engine QA: simulates matches and scans every 10 Hz replay frame for things that look wrong on screen.
// node --experimental-strip-types scripts/scan-anomalies.mjs [matches=6] [firstSeed=1] [--examples] [--json]
import {buildMatch,playMatch,SAMPLE_ROSTERS} from './simulate-match.mjs';
import {ACTION,BALL_STATE,FRAME_HEADER,PLAYER_CHANNELS,SAMPLE_HZ} from '../src/v1/engine/replay.ts';
import {ENGINE_TUNING as T} from '../src/v1/config/engine-tuning.ts';
import {sampleReplay} from '../src/match/replay-sampling.js';

const P=T.pitch,DT=1/SAMPLE_HZ,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/** At the goal frame: a post or the crossbar. */
const frame=b=>Math.abs(Math.abs(b.x)-P.halfLength)<1.3&&(Math.abs(Math.abs(b.z)-P.goalHalfWidth)<1.2||Math.abs(b.z)<P.goalHalfWidth+.3&&Math.abs(b.y-P.goalHeight)<.7);
/** What each check means; thresholds are what reads as wrong in the 3D view, not engine internals. */
export const CHECKS={
  'ball-jump':'Canlı oyunda top bir karede fizikle açıklanamayacak kadar yer değiştiriyor (ışınlanma)',
  'keeper-snap':'Kaleci, elinden uzaktaki ya da çok yüksekteki topu bir anda tutuyor',
  'possession-snap':'Top, kendisine uzak bir oyuncunun ayağına bir anda yapışıyor',
  'header-low':'Kafa vuruşu göğüs hizasında ya da daha alçak bir topa',
  'header-far':'Kafa vuruşu, topa uzak bir oyuncudan',
  'player-jump':'Oyuncu bir karede koşamayacağı kadar yer değiştiriyor',
  'tackle-far':'Müdahale, topa/rakibe uzak bir oyuncudan',
  'foul-no-tackle':'Faulde faulü yapan müdahale hareketi yapmıyor',
  'foul-far':'Faul, rakibine uzak bir oyuncudan',
  'hands-outside-box':'Kaleci ceza sahası dışında topu elinde tutuyor',
  'ball-stuck':'Top oyunda, duruyor ve kimse almaya gitmiyor',
  'ball-through':'Top, hızla bir oyuncunun gövdesinin içinden geçiyor',
  'player-outside':'Oyuncu saha çevresinin dışına çıkıyor',
};
const thresholds={snap:1.25,keeperHigh:3.2,impulseFar:1.4,contact:1.35,receive:1.2,receiveHands:1.5,headerLow:1.35,headerReach:1.15,playerStep:1.15,tackleReach:1.9,foulReach:1.9,stuckSeconds:4,bodyRadius:.25};

export function scanHalf(replay,names){
  const n=replay.playerOrder.length,stride=FRAME_HEADER+n*PLAYER_CHANNELS.length,f=replay.samples,found=[];
  const at=i=>i*stride,ballOf=i=>({x:f[at(i)+1],y:f[at(i)+2],z:f[at(i)+3],state:f[at(i)+4]}),pl=(i,k)=>{const o=at(i)+FRAME_HEADER+k*PLAYER_CHANNELS.length;return {x:f[o],z:f[o+1],action:f[o+3],u:f[o+4],param:f[o+5]};};
  const frameAt=s=>Math.max(0,Math.min(replay.frameCount-1,Math.round((s-replay.startSeconds)*SAMPLE_HZ)));
  const tOf=i=>f[at(i)],hd=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),idx=new Map(replay.playerOrder.map((id,k)=>[id,k]));
  const add=(kind,i,detail)=>found.push({kind,t:Math.round(tOf(i)*10)/10,detail});
  /** Closest ball–player distance as drawn between two samples (the view interpolates both linearly). */
  const drawnGap=(i0,i1,k)=>{let m=Infinity;for(let j=Math.max(0,i0);j<Math.min(replay.frameCount-1,i1);j++)for(let s=0;s<=10;s++){const st=sampleReplay(replay,tOf(j)+s/10*DT),q=st.players[k];m=Math.min(m,Math.hypot(st.ball.x-q.x,st.ball.z-q.z));}return m;};
  // Contact keys: the view draws the ball through them, so contacts are checked there and the straight-line checks skip those steps.
  const keys=replay.ballKeys??new Float32Array(0),keyed=new Set(),contacts=[];
  for(let q=0;q<keys.length;q+=4){const kt=keys[q],j=Math.max(0,Math.min(replay.frameCount-2,Math.floor((kt-replay.startSeconds)*SAMPLE_HZ)));keyed.add(j+1);contacts.push({t:kt,x:keys[q+1],y:keys[q+2],z:keys[q+3],j});}
  const keeperIdx=[0,1].map(team=>{let best=-1,score=-1;for(let k=0;k<n;k++){if(replay.teams[k]!==team)continue;let hold=0;for(let i=0;i<replay.frameCount;i+=10){if(pl(i,k).action===ACTION.hold)hold++;}if(hold>score){score=hold;best=k;}}return best;});
  // Restart frames (dead ball) bound the live stretches; the ball and players may be repositioned there.
  const dead=i=>ballOf(i).state===BALL_STATE.dead;
  let stuckSince=-1;
  for(let i=2;i<replay.frameCount;i++){
    const b0=ballOf(i-2),b1=ballOf(i-1),b2=ballOf(i);
    if(!dead(i)&&!dead(i-1)&&!dead(i-2)){
      // Ball: where it is drawn against the path it was on. The view interpolates between 10 Hz samples, so a ball that reaches a player
      // along its line looks right; one that lands off that line (sideways, behind, far ahead) has visibly snapped.
      const step=Math.hypot(b2.x-b1.x,b2.y-b1.y,b2.z-b1.z),jumpH=Math.hypot(b2.x-2*b1.x+b0.x,b2.z-2*b1.z+b0.z);
      const free=s=>s===BALL_STATE.ground||s===BALL_STATE.air,nearestAt=(j,pt)=>{let k=-1,d=Infinity;for(let q=0;q<n;q++){const e=hd(pl(j,q),pt);if(e<d){d=e;k=q;}}return {k,d};};
      const v={x:b1.x-b0.x,y:b1.y-b0.y,z:b1.z-b0.z},vl=Math.hypot(v.x,v.y,v.z)||1e-9,tau=clamp(((b2.x-b1.x)*v.x+(b2.y-b1.y)*v.y+(b2.z-b1.z)*v.z)/(vl*vl),0,1.2);
      const offPath=Math.hypot(b2.x-(b1.x+v.x*tau),b2.y-(b1.y+v.y*tau),b2.z-(b1.z+v.z*tau));
      const inNet=Math.abs(b2.x)>P.halfLength&&Math.abs(b2.z)<P.goalHalfWidth+.3,fromNet=Math.abs(b1.x)>P.halfLength&&Math.abs(b1.z)<P.goalHalfWidth+.3,atPost=frame(b1);
      const clean=!keyed.has(i)&&!keyed.has(i-1);
      if(fromNet||!clean){}
      else if(free(b1.state)&&b2.state===BALL_STATE.hands){const {k}=nearestAt(i,b2);if(offPath>thresholds.snap||b1.y>thresholds.keeperHigh)add('keeper-snap',i,`${names(replay.playerOrder[k])} topu tuttu: top yolundan ${offPath.toFixed(1)} m saptı, önceki yükseklik ${b1.y.toFixed(1)} m`);}
      else if(free(b1.state)&&b2.state===BALL_STATE.feet&&offPath>thresholds.snap){const {k}=nearestAt(i,b2);add('possession-snap',i,`${names(replay.playerOrder[k])} topu aldı: top yolundan ${offPath.toFixed(1)} m saptı`);}
      else if(b1.state===BALL_STATE.feet&&b2.state===BALL_STATE.feet){const a=nearestAt(i-1,b1),c=nearestAt(i,b2);if(a.k!==c.k&&step>thresholds.snap)add('possession-snap',i,`${names(replay.playerOrder[c.k])} topu ${names(replay.playerOrder[a.k])} ayağından aldı: top ${step.toFixed(1)} m sıçradı (top kapma)`);}
      else if(free(b0.state)&&free(b1.state)&&free(b2.state)&&jumpH>thresholds.snap&&!inNet&&!atPost){const {k,d}=nearestAt(i-1,b1),late=nearestAt(i,b2);if(Math.min(d,late.d)>thresholds.impulseFar)add('ball-jump',i,`top ${jumpH.toFixed(1)} m yön/hız değiştirdi, en yakın oyuncu ${names(replay.playerOrder[k])} ${d.toFixed(1)} m`);}
      // Through a body: a fast free ball passing the centre of a player and carrying on as if he were not there. Both are compared as
      // drawn at the same instant (a running player's end-of-sample position used to flag balls that passed half a metre from him).
      if(clean&&b1.state===BALL_STATE.ground&&b2.state===BALL_STATE.ground&&step>.45&&jumpH<.25){for(let q=0;q<n;q++){const c=pl(i,q),mx=(b1.x+b2.x)/2,mz=(b1.z+b2.z)/2;if(Math.hypot(c.x-mx,c.z-mz)<thresholds.bodyRadius+.6&&drawnGap(i-1,i,q)<thresholds.bodyRadius){add('ball-through',i,`${names(replay.playerOrder[q])} içinden ${(step*SAMPLE_HZ).toFixed(0)} m/sn top geçti`);break;}}}
      // Ball resting in play with nobody going for it.
      const still=step<.03&&b2.state===BALL_STATE.ground&&!inNet;
      if(still){if(stuckSince<0)stuckSince=i;else if((i-stuckSince)*DT>thresholds.stuckSeconds){let d=Infinity;for(let q=0;q<n;q++)d=Math.min(d,hd(pl(i,q),b2));if(d>2){add('ball-stuck',i,`top ${((i-stuckSince)*DT).toFixed(1)} sn duruyor, en yakın oyuncu ${d.toFixed(1)} m`);stuckSince=-1e9;}}}
      else stuckSince=-1;
    }else stuckSince=-1;
    for(let k=0;k<n;k++){
      const a=pl(i-1,k),c=pl(i,k),step=hd(a,c);
      const lunging=c.action===ACTION.dive||c.action===ACTION.slide;
      if(step>(lunging?1.5:thresholds.playerStep)&&!dead(i)&&!dead(i-1))add('player-jump',i,`${names(replay.playerOrder[k])} ${step.toFixed(1)} m atladı`);
      if(Math.abs(c.x)>P.halfLength+5||Math.abs(c.z)>P.halfWidth+4)add('player-outside',i,`${names(replay.playerOrder[k])} (${c.x.toFixed(1)}, ${c.z.toFixed(1)})`);
      // Action starts.
      if(c.action===ACTION.hold&&keeperIdx.includes(k)){const team=replay.teams[k],own=Math.sign(c.x);const inside=Math.abs(c.x)>P.halfLength-P.boxDepth-.3&&Math.abs(c.z)<P.boxHalfWidth+.3;if(!inside&&a.action!==ACTION.hold)add('hands-outside-box',i,`${names(replay.playerOrder[k])} (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) takım ${team} yön ${own}`);}
    }
  }
  for(const c of contacts){
    const j=c.j,before=ballOf(j).state,after=ballOf(Math.min(replay.frameCount-1,j+1)).state;
    if(before===BALL_STATE.dead||after===BALL_STATE.dead||Math.abs(c.x)>P.halfLength&&Math.abs(c.z)<P.goalHalfWidth+.4||frame(c))continue;
    const st=sampleReplay(replay,c.t);let k=-1,d=Infinity;st.players.forEach((q,i)=>{const e=Math.hypot(q.x-c.x,q.z-c.z);if(e<d){d=e;k=i;}});
    // A bounce is the ground, not a player.
    if(c.y<.2&&d>1)continue;
    const keeper=keeperIdx.includes(k),i=Math.min(replay.frameCount-1,j+1);
    if(after===BALL_STATE.hands&&d>thresholds.receiveHands)add('keeper-snap',i,`${names(replay.playerOrder[k])} topu ${d.toFixed(1)} m uzaktan tuttu (temas noktası)`);
    else if(after===BALL_STATE.feet&&d>thresholds.receive)add('possession-snap',i,`${names(replay.playerOrder[k])} topu ${d.toFixed(1)} m uzaktan aldı (temas noktası)`);
    else if(after!==BALL_STATE.hands&&after!==BALL_STATE.feet&&d>(keeper?thresholds.contact+.3:thresholds.contact))add('ball-jump',i,`topa temas eden yok: en yakın ${names(replay.playerOrder[k])} ${d.toFixed(1)} m, yükseklik ${c.y.toFixed(1)} m`);
  }
  // Event-based checks: headers and fouls at the moment they are logged.
  for(const e of replay.events){
    const i=frameAt(e.seconds),k=idx.get(e.actorId);if(k===undefined)continue;const p=pl(i,k),b=ballOf(i);
    if(e.kind==='header'){const d=drawnGap(i-1,i+1,k);if(b.y<thresholds.headerLow)add('header-low',i,`${names(e.actorId)} ${b.y.toFixed(2)} m yükseklikte kafa`);if(d>thresholds.headerReach)add('header-far',i,`${names(e.actorId)} topa ${d.toFixed(1)} m uzaktan kafa`);}
    if(e.kind==='tackle'){const d=hd(p,b);if(d>thresholds.tackleReach)add('tackle-far',i,`${names(e.actorId)} topu ${d.toFixed(1)} m uzaktan kaptı`);}
    if(e.kind==='foul'){const v=idx.get(e.targetPlayerId),q=v===undefined?null:pl(i,v),d=q?hd(p,q):0;if(d>thresholds.foulReach)add('foul-far',i,`${names(e.actorId)} → ${names(e.targetPlayerId)} ${d.toFixed(1)} m`);
      let tackled=false;for(let j=Math.max(0,i-8);j<=Math.min(replay.frameCount-1,i+2);j++)if(pl(j,k).action===ACTION.tackle||pl(j,k).action===ACTION.slide)tackled=true;if(!tackled)add('foul-no-tackle',i,`${names(e.actorId)} → ${names(e.targetPlayerId)}`);}
  }
  return found;
}

export function scanMatches(count,firstSeed){
  const rows=[];
  for(let s=0;s<count;s++){const seed=firstSeed+s,r=seed%SAMPLE_ROSTERS.length,{snapshot}=buildMatch(SAMPLE_ROSTERS[r][0],SAMPLE_ROSTERS[r][1],seed),m=playMatch(snapshot);
    const names=new Map(snapshot.players.map(p=>[p.id,p.name])),name=id=>names.get(id)??id;
    const found=[...scanHalf(m.first.replay,name),...scanHalf(m.second.replay,name)];
    rows.push({seed,score:m.score,events:m.events,found,minutes:60});}
  return rows;
}

if(process.argv[1]?.endsWith('scan-anomalies.mjs')){
  const args=process.argv.slice(2).filter(a=>!a.startsWith('--')),count=Number(args[0]??6),first=Number(args[1]??1),rows=scanMatches(count,first);
  const totals=Object.fromEntries(Object.keys(CHECKS).map(k=>[k,0]));for(const r of rows)for(const f of r.found)totals[f.kind]++;
  const counts=kind=>rows.reduce((n,r)=>n+r.events.filter(e=>e.kind===kind).length,0);
  if(process.argv.includes('--json')){console.log(JSON.stringify({matches:rows.length,totals,headers:counts('header'),fouls:counts('foul'),tackles:counts('tackle')}));}
  else{
    console.log(`${rows.length} maç · kafa ${counts('header')} · faul ${counts('foul')} · müdahale ${counts('tackle')} · kurtarış ${counts('save')} · skorlar ${rows.map(r=>r.score.join('-')).join(' ')}`);
    for(const [k,v] of Object.entries(totals))console.log(`${String(v).padStart(5)}  ${(v/rows.length).toFixed(1).padStart(5)}/maç  ${k.padEnd(18)} ${CHECKS[k]}`);
    if(process.argv.includes('--examples'))for(const k of Object.keys(CHECKS)){const ex=rows.flatMap(r=>r.found.filter(f=>f.kind===k).map(f=>`seed ${r.seed} ${String(Math.floor(f.t/60)).padStart(2,'0')}:${String(Math.floor(f.t%60)).padStart(2,'0')} ${f.detail}`)).slice(0,4);if(ex.length)console.log(`\n[${k}]\n  ${ex.join('\n  ')}`);}
  }
}
