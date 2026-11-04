import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMatch,playMatch,SAMPLE_ROSTERS} from '../scripts/simulate-match.mjs';
import {planReel,reelCameraPath,reelReplayPath,REEL} from '../src/match/reel-plan.js';
import {halfHighlights,attackDir,teamIndex} from '../src/match/highlight-edit.js';
import {ballAt} from '../src/match/replay-sampling.js';
import {createMp4Muxer} from '../src/match/mp4-muxer.js';
import {walkoutState,walkoutPose} from '../src/match/walkout.js';
import {getBundledCatalog} from '../src/v1/data/bundled-catalog.ts';

const matches=[11,29,7].map((seed,i)=>{const {snapshot}=buildMatch(SAMPLE_ROSTERS[i][0],SAMPLE_ROSTERS[i][1],seed),m=playMatch(snapshot);return {...m,snapshot,halves:[m.first.replay,m.second.replay]};});
const RESTARTS=new Set(['kick-off','throw-in','goal-kick','corner','free-kick']);

test('the 10- and 5-minute edits play important moments at real speed within budget, every goal included',()=>{
  for(const m of matches)for(const r of m.halves)for(const budget of [300,150]){
    const {segments,seconds}=halfHighlights(r,budget),goals=r.events.filter(e=>e.kind==='goal');
    assert.ok(seconds<=budget+1e-6||segments.every(s=>goals.some(g=>g.seconds>=s.start&&g.seconds<=s.end)),`${seconds} s over ${budget}`);
    segments.forEach((s,i)=>{assert.ok(s.start>=r.startSeconds&&s.end<=r.endSeconds&&s.end>s.start);if(i)assert.ok(s.start>segments[i-1].end,'sorted, apart');});
    for(const g of goals)assert.ok(segments.some(s=>g.seconds-s.start>=3&&s.end-g.seconds>=1.5),`goal at ${g.seconds} with build-up and celebration`);
  }
});
test('moments start from the stoppage that put the ball back in play when it is recent (user decision)',()=>{
  let anchored=0,total=0;
  for(const m of matches)for(const r of m.halves)for(const s of halfHighlights(r,300).segments.slice(1)){
    const restart=r.events.filter(e=>RESTARTS.has(e.kind)&&e.seconds<s.key-.5&&e.seconds>=s.key-25).pop();if(!restart)continue;total++;
    if(s.start<=restart.seconds-1+.05)anchored++;
  }
  assert.ok(total>10&&anchored/total>.9,`${anchored}/${total}`);
});
test('the reel is the goals: each from the final third, every goal kept, replays after their goal, within a minute',()=>{
  for(const m of matches){
    const plan=planReel(m.halves),goals=m.events.filter(e=>e.kind==='goal'),live=plan.clips.filter(c=>c.kind==='live');
    assert.ok(plan.seconds<=REEL.maxSeconds+1e-9,`${plan.seconds} s`);assert.equal(live.length,goals.length,'every goal');assert.equal(plan.goals,goals.length);
    assert.equal(plan.frames,plan.introFrames+plan.outroFrames+plan.clips.reduce((n,c)=>n+c.frames,0));
    let attackingHalf=0;
    plan.clips.forEach((c,i)=>{const r=m.halves[c.half-1];assert.ok(c.start>=r.startSeconds&&c.end<=r.endSeconds);assert.ok(c.event.seconds>=c.start&&c.event.seconds<=c.end);
      if(c.kind==='replay'){assert.equal(plan.clips[i-1].event,c.event,'replay follows its goal');assert.equal(c.speed,REEL.replaySpeed);return;}
      if(ballAt(r,c.start).x*attackDir(teamIndex(c.event.teamId),r.half)>0)attackingHalf++;
      const prev=live[live.indexOf(c)-1];if(prev)assert.ok(c.start>=prev.end-1e-6,'match order');});
    assert.ok(attackingHalf>=live.length*.8,`no midfield battles: ${attackingHalf}/${live.length} start in the attacking half`);
  }
});
test('reel cameras: live from high behind the attack, replays from behind the goal',()=>{
  for(const m of matches)for(const c of planReel(m.halves).clips){
    const r=m.halves[c.half-1],path=(c.kind==='replay'?reelReplayPath:reelCameraPath)(r,c);assert.equal(path.length,c.frames);
    if(c.event.kind==='goal')assert.equal(c.attackedEnd,Math.sign(c.event.destination.x),'goal end');
    for(const p of path){
      if(c.kind==='replay')assert.ok(Math.sign(p.position.x)===c.attackedEnd&&Math.abs(p.position.x)>58&&p.position.y>=8.5);
      else{assert.equal(Math.sign(p.target.x-p.position.x),c.attackedEnd);assert.ok(p.position.y>=17&&Math.abs(p.target.x)<=47+1e-9);}
    }
    for(let i=1;i<path.length;i++)assert.ok(Math.hypot(path[i].target.x-path[i-1].target.x,path[i].target.z-path[i-1].target.z)<1.5,'smooth follow');
  }
});
test('the walk-out shows the 22 real players of the match in two files, keepers first',()=>{
  const ids=new Set(getBundledCatalog().players.map(p=>p.id));
  for(const m of matches)for(const t of [0,3,7,12]){
    const state=walkoutState(m.snapshot.lineups,t),pose=walkoutPose(t);
    assert.equal(state.players.length,22);assert.equal(new Set(state.players.map(p=>p.id)).size,22);assert.ok(state.players.every(p=>ids.has(p.id)&&Number.isFinite(p.x+p.z)));
    for(const team of [0,1]){const file=state.players.filter(p=>p.team===team),keeper=m.snapshot.lineups[team].assignments.find(a=>a.slotId==='GK').playerId;assert.equal(file[0].id,keeper);assert.ok(file.every(p=>Math.sign(p.x)===(team?1:-1)));}
    assert.ok(pose.position.y>1.5&&Number.isFinite(pose.target.z));
  }
});
test('a match without chances still gets the title and final cards',()=>{
  const empty=half=>({half,startSeconds:(half-1)*1800,endSeconds:half*1800,playerOrder:[],teams:[],frameCount:2,samples:new Float32Array(16),events:[]});
  const plan=planReel([empty(1),empty(2)]);assert.equal(plan.clips.length,0);assert.equal(plan.seconds,REEL.introSeconds+REEL.outroSeconds);
});

const u32=(b,o)=>new DataView(b.buffer,b.byteOffset).getUint32(o);
const at=(b,type,from=0)=>{for(let i=from;i<b.length-4;i++)if(String.fromCharCode(b[i],b[i+1],b[i+2],b[i+3])===type)return i-4;return -1;};
test('the MP4 writer lays out ftyp, moov and mdat with consistent sample tables',async()=>{
  const mux=createMp4Muxer({width:1080,height:1920}),avcc=Uint8Array.of(1,0x64,0,0x28,0xff,0xe1,0,4,0x67,0x64,0,0x28,1,0,4,0x68,0xee,0x3c,0x80),sizes=[];
  for(let i=0;i<90;i++){const data=new Uint8Array(100+i).fill(i);sizes.push(data.length);
    mux.addChunk({byteLength:data.length,copyTo:d=>d.set(data),timestamp:Math.round(i*1e6/30),duration:33333,type:i%60===0?'key':'delta'},i===0?{decoderConfig:{description:avcc.buffer}}:undefined);}
  const b=new Uint8Array(await mux.finalize().arrayBuffer()),top=[];
  for(let o=0;o<b.length;o+=u32(b,o))top.push(String.fromCharCode(...b.subarray(o+4,o+8)));
  assert.deepEqual(top,['ftyp','moov','mdat']);
  const mdat=at(b,'mdat',u32(b,0)+u32(b,u32(b,0))-8),stco=at(b,'stco'),stsz=at(b,'stsz'),stss=at(b,'stss'),mvhd=at(b,'mvhd');
  assert.equal(u32(b,stco+16),mdat+8,'chunk offset points at the first sample');
  assert.equal(u32(b,stsz+16),90);assert.deepEqual(Array.from({length:90},(_,i)=>u32(b,stsz+20+i*4)),sizes);
  assert.equal(u32(b,mdat),8+sizes.reduce((a,c)=>a+c,0));assert.equal(b[mdat+8+100],1,'second sample follows the first');
  assert.deepEqual([u32(b,stss+12),u32(b,stss+16),u32(b,stss+20)],[2,1,61],'keyframes');
  assert.equal(u32(b,mvhd+24),3000,'3 s at 30 fps');assert.ok(at(b,'avcC')>0&&at(b,'ctts')<0);
});
