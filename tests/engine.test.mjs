import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMatch,playMatch,SAMPLE_ROSTERS} from '../scripts/simulate-match.mjs';
import {simulateHalf} from '../src/v1/engine/simulation.ts';
import {FORMATIONS} from '../src/v1/config/formations.ts';
import {assignFormation} from '../src/v1/domain/assignment.ts';
import {aerialScore} from '../src/v1/engine/runtime.ts';
import {ACTION,BALL_STATE,FRAME_HEADER,PLAYER_CHANNELS} from '../src/v1/engine/replay.ts';
import {scanHalf} from '../scripts/scan-anomalies.mjs';
import {createRng} from '../src/v1/engine/rng.ts';

const cache=new Map();
function match(roster,seed){const key=`${roster}:${seed}`;if(!cache.has(key)){const {snapshot}=buildMatch(SAMPLE_ROSTERS[roster][0],SAMPLE_ROSTERS[roster][1],seed);cache.set(key,{snapshot,...playMatch(snapshot)});}return cache.get(key);}
const ALL=[[0,3],[0,17],[1,4],[1,23],[2,9],[2,31]];

test('the same seed replays the same match; a fresh seed plays a different one',()=>{
  const {snapshot}=buildMatch(SAMPLE_ROSTERS[0][0],SAMPLE_ROSTERS[0][1],5),a=playMatch(snapshot),b=playMatch(snapshot),c=match(0,6);
  assert.deepEqual(a.score,b.score);assert.equal(a.events.length,b.events.length);
  assert.ok(Buffer.from(a.first.replay.samples.buffer).equals(Buffer.from(b.first.replay.samples.buffer)),'identical replay frames');
  const trace=m=>m.events.slice(0,60).map(e=>`${e.kind}@${e.seconds}`).join();assert.notEqual(trace(a),trace(c),'user decision: every simulation is a different match');
});
test('the random stream resumes exactly from a saved state, and reading the state changes nothing',()=>{
  const r=createRng(7);for(let i=0;i<5;i++)r.next();r.normal();// leaves the second normal of the pair pending
  const saved=r.state(),ahead=[r.normal(),r.next(),r.normal(),r.range(2,5),r.chance(.5)];
  const again=createRng(7,saved);assert.deepEqual([again.normal(),again.next(),again.normal(),again.range(2,5),again.chance(.5)],ahead,'resumes where it was saved');
  const a=createRng(9),b=createRng(9);a.normal();b.normal();a.state();assert.equal(a.normal(),b.normal(),'state() has no side effect');
});
test('the second half continues the first: clock, score and the random stream',()=>{
  const m=match(0,3),r=m.second.replay,stride=FRAME_HEADER+r.playerOrder.length*PLAYER_CHANNELS.length;
  assert.equal(m.first.replay.startSeconds,0);assert.equal(r.startSeconds,1800);assert.equal(r.endSeconds,3600);
  assert.deepEqual([r.samples[6],r.samples[7]],[...m.first.score],'second half kicks off at the half-time score');
  const again=simulateHalf(m.snapshot,2,m.snapshot.lineups,m.first.carry);assert.deepEqual(again.score,m.second.score);assert.equal(again.replay.events.length,r.events.length);
  assert.ok(stride>0&&r.frameCount>=1800*10-1,'10 Hz samples for 30 minutes');
});
test('a line-up change during a half keeps everything before it and plays on in the new shape',()=>{
  const m=match(0,3),[blue,red]=m.snapshot.lineups,at=600;
  const team=l=>({teamId:l.teamId,name:l.teamId,playerIds:l.assignments.map(a=>a.playerId)}),catalog={players:m.snapshot.players};
  const formation=Object.keys(FORMATIONS).find(id=>id!==blue.formationId);
  const outfield=red.assignments.filter(a=>a.slotId!=='GK'),[x,y]=[outfield[0],outfield[outfield.length-1]];
  const swapped={...red,assignments:red.assignments.map(a=>a===x?{...a,playerId:y.playerId}:a===y?{...a,playerId:x.playerId}:a)};
  const changed=simulateHalf(m.snapshot,1,m.snapshot.lineups,null,undefined,[{seconds:at,lineups:[assignFormation(team(blue),formation,catalog),swapped]}]);
  const a=m.first.replay,b=changed.replay,stride=FRAME_HEADER+a.playerOrder.length*PLAYER_CHANNELS.length,upTo=Math.floor(at*10)*stride;
  assert.deepEqual(b.playerOrder,a.playerOrder,'same player channels');
  assert.ok(Buffer.from(a.samples.buffer,0,upTo*4).equals(Buffer.from(b.samples.buffer,0,upTo*4)),'every frame before the change is the one already watched');
  assert.deepEqual(b.events.filter(e=>e.seconds<at).map(e=>e.id+e.kind),a.events.filter(e=>e.seconds<at).map(e=>e.id+e.kind),'same events before it');
  const notes=b.events.filter(e=>e.kind==='tactics');
  assert.deepEqual(notes.map(e=>[e.teamId,e.seconds]),[['team-1',at],['team-2',at]],'the feed says what changed, for each side');
  assert.match(notes[0].reason.explanation,new RegExp(formation));assert.match(notes[1].reason.explanation,/↔/);
  assert.notDeepEqual(b.events.filter(e=>e.seconds>at+60).slice(0,20).map(e=>e.kind+e.seconds),a.events.filter(e=>e.seconds>at+60).slice(0,20).map(e=>e.kind+e.seconds),'the rest of the half plays differently');
});
test('no offside and no cards; fouls, free kicks and penalties happen',()=>{
  let fouls=0,penalties=0,freeKicks=0;
  for(const [roster,seed] of ALL){const m=match(roster,seed);
    assert.ok(!m.events.some(e=>e.kind==='offside'),'no offside');assert.ok(!m.events.some(e=>/kart/i.test(e.reason.explanation)),'no cards');
    fouls+=m.events.filter(e=>e.kind==='foul').length;penalties+=m.stats[0].penalties+m.stats[1].penalties;freeKicks+=m.stats[0].freeKicks+m.stats[1].freeKicks;}
  assert.ok(fouls>=ALL.length*4,`fouls ${fouls}`);assert.ok(freeKicks>=ALL.length,`free kicks ${freeKicks}`);
});
test('header specialists (Arif, Mensur, Taha, Servan) are stronger in the air and headers score',()=>{
  const a={strength:7,positioning:7,finishing:6,speed:6,control:6,passing:6,vision:6,dribbling:6,shooting:6,defending:6,pressing:6,stamina:6,technique:6,crossing:6};
  assert.ok(aerialScore(a,true)>aerialScore(a,false));
  const headers=ALL.reduce((n,[r,s])=>{const m=match(r,s);return n+m.stats[0].headerGoals+m.stats[1].headerGoals;},0);assert.ok(headers>=2,`header goals ${headers}`);
});
test('Yankı carries the ball end to end once every match',()=>{
  for(const seed of [4,23,41]){const m=match(1,seed),runs=m.events.filter(e=>e.kind==='mood'&&e.actorId==='yanki'&&/tek başına/.test(e.reason.explanation));
    assert.equal(m.second.carry.solo.yanki,'done',`seed ${seed}`);assert.equal(runs.length,1,`seed ${seed}: ${runs.length} runs`);}
});
test('left-footers (Alper, Mustafa, Baran, M. Emre) kick mostly with the left foot',()=>{
  const feet=new Map();
  for(const seed of [3,17]){const m=match(0,seed);for(const r of [m.first.replay,m.second.replay]){const stride=FRAME_HEADER+r.playerOrder.length*PLAYER_CHANNELS.length;
    r.playerOrder.forEach((id,k)=>{const o=FRAME_HEADER+k*PLAYER_CHANNELS.length;let prev=0;const f=feet.get(id)??[0,0];
      for(let i=0;i<r.frameCount;i++){const a=r.samples[i*stride+o+3];if((a===ACTION.pass||a===ACTION.shot)&&a!==prev)f[r.samples[i*stride+o+5]?1:0]++;prev=a;}feet.set(id,f);});}}
  const left=id=>{const [l,r]=feet.get(id);return l/Math.max(1,l+r);};
  for(const id of ['alper','mustafa','baran','m-emre'])assert.ok(left(id)>.65,`${id} left ${left(id).toFixed(2)}`);
  for(const id of ['arif','ismail','goktug'])assert.ok(left(id)<.35,`${id} left ${left(id).toFixed(2)}`);
});
const MORE=[[0,41],[1,57],[2,63],[0,77],[1,89],[2,97]];
test('penalties happen (about one in three to five matches, so twelve are counted)',()=>{
  const penalties=[...ALL,...MORE].reduce((n,[r,s])=>{const m=match(r,s);return n+m.stats[0].penalties+m.stats[1].penalties;},0);assert.ok(penalties>=1,`penalties ${penalties}`);
});
test('every goal ends up in the net and belongs to an attacker: no keeper own goals (user decision)',()=>{
  let goals=0,own=0;
  for(const [roster,seed] of [...ALL,...MORE]){const m=match(roster,seed),keepers=new Set(m.snapshot.lineups.flatMap(l=>l.assignments.filter(a=>a.slotId==='GK').map(a=>a.playerId)));
    for(const r of [m.first.replay,m.second.replay]){const stride=FRAME_HEADER+r.playerOrder.length*PLAYER_CHANNELS.length;
      for(const e of r.events.filter(x=>x.kind==='goal')){goals++;if(e.outcome==='own-goal')own++;
        assert.ok(e.actorId,`${roster}/${seed} ${e.seconds}: goal without a scorer`);assert.ok(!keepers.has(e.actorId),`${roster}/${seed} ${e.seconds}: keeper credited · ${e.reason.explanation}`);
        const k=Math.min(r.frameCount-1,Math.round((e.seconds+1-r.startSeconds)*10)),o=k*stride,x=r.samples[o+1],y=r.samples[o+2],z=r.samples[o+3];
        assert.ok(Math.abs(x)>52.5&&Math.abs(z)<3.66&&y<2.44,`${roster}/${seed} ${e.seconds}: ball at ${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)} a second after "${e.reason.explanation}"`);}}}
  assert.ok(goals>60&&own<=goals*.03,`${goals} goals, ${own} own goals`);
});
test('shots never trail goals, for each team in every half',()=>{
  for(const [roster,seed] of [...ALL,...MORE]){const m=match(roster,seed);
    for(const t of [0,1]){const a=m.first.teamStats[t],b=m.second.teamStats[t];
      assert.ok(a.shots>=a.goals,`${roster}/${seed} T${t+1} first half ${a.shots} shots, ${a.goals} goals`);assert.ok(b.shots-a.shots>=b.goals-a.goals,`${roster}/${seed} T${t+1} second half`);}}
});
test('calibration stays in the halı saha range: goals, shots, passing, corners, headers (2026-11-04)',()=>{
  let passes=0,done=0,corners=0,shots=0,on=0,headers=0;
  for(const [roster,seed] of ALL){const m=match(roster,seed),s=m.stats,goals=m.score[0]+m.score[1],n=s[0].shots+s[1].shots;
    assert.ok(goals>=2&&goals<=26,`${roster}/${seed}: goals ${goals}`);assert.ok(n>=15&&n<=70,`${roster}/${seed}: shots ${n}`);
    passes+=s[0].passes+s[1].passes;done+=s[0].completed+s[1].completed;corners+=s[0].corners+s[1].corners;shots+=n;on+=s[0].onTarget+s[1].onTarget;headers+=s[0].headerGoals+s[1].headerGoals;}
  // A pass near a defender used to be lost twice over (he missed it, then it cannoned off him): accuracy had fallen to ~55% unnoticed.
  assert.ok(done/passes>=.6&&done/passes<=.8,`pass accuracy ${(done/passes).toFixed(3)}`);
  // Parries round the post, blocks, glancing headers and blocked crosses go behind: corners had fallen to ~1 a match unnoticed.
  assert.ok(corners/ALL.length>=3&&corners/ALL.length<=9,`corners per match ${(corners/ALL.length).toFixed(2)}`);
  assert.ok(on/shots<=.66,`on target ${(on/shots).toFixed(2)}`);assert.ok(headers/ALL.length<=4,`header goals per match ${(headers/ALL.length).toFixed(2)}`);
});
test('a parry round the post stays out of the keeper\'s gloves and usually becomes a corner',()=>{
  let parries=0,corners=0;
  for(const [roster,seed] of ALL){const m=match(roster,seed);
    for(const r of [m.first.replay,m.second.replay]){const stride=FRAME_HEADER+r.playerOrder.length*PLAYER_CHANNELS.length;
      for(const e of r.events.filter(x=>x.kind==='save'&&x.outcome==='parry'&&/korner/.test(x.reason.explanation))){parries++;
        for(let i=Math.round((e.seconds+.15-r.startSeconds)*10);i<=Math.round((e.seconds+.9-r.startSeconds)*10)&&i<r.frameCount;i++)assert.notEqual(r.samples[i*stride+4],BALL_STATE.hands,`${roster}/${seed} ${e.seconds}: ${e.reason.explanation} — back in his hands`);
        if(r.events.some(x=>x.kind==='corner'&&x.seconds>e.seconds&&x.seconds<e.seconds+3))corners++;}}}
  assert.ok(parries>=4,`parries round the post ${parries}`);assert.ok(corners>=parries*.5,`${corners} corners from ${parries} parries round the post`);
});
test('what the 3D view draws stays physical: no teleports, snaps, distant headers or tackles, fouls without a challenge (user 2026-11-04)',()=>{
  // Per match ceilings; the scan reads the replay exactly as the view draws it (10 Hz samples plus ball contact keys).
  const limits={'keeper-snap':1,'possession-snap':1.5,'header-far':1,'header-low':.5,'ball-jump':1.5,'player-jump':2,'tackle-far':.5,'foul-no-tackle':0,'foul-far':0,'hands-outside-box':0,'player-outside':0,'ball-stuck':.5,'ball-through':1.5};
  const games=ALL.slice(0,4).map(([r,s])=>match(r,s)),counts={};
  for(const m of games){const names=new Map(m.snapshot.players.map(p=>[p.id,p.name])),name=id=>names.get(id)??id;for(const f of [...scanHalf(m.first.replay,name),...scanHalf(m.second.replay,name)])counts[f.kind]=(counts[f.kind]??0)+1;}
  for(const [kind,limit] of Object.entries(limits))assert.ok((counts[kind]??0)/games.length<=limit,`${kind}: ${((counts[kind]??0)/games.length).toFixed(2)} per match > ${limit}`);
});
test('tackles: slides come from distance, every foul has a challenge and the fouled man goes down',()=>{
  let slides=0,fouls=0,falls=0;
  for(const [r,s] of ALL.slice(0,3)){const m=match(r,s);
    for(const rep of [m.first.replay,m.second.replay]){const st=FRAME_HEADER+rep.playerOrder.length*PLAYER_CHANNELS.length;
      for(let i=1;i<rep.frameCount;i++)for(let k=0;k<rep.playerOrder.length;k++){const o=i*st+FRAME_HEADER+k*PLAYER_CHANNELS.length,a=rep.samples[o+3],b=rep.samples[o-st+3];if(a===ACTION.slide&&b!==ACTION.slide)slides++;if(a===ACTION.fall&&b!==ACTION.fall)falls++;}
      fouls+=rep.events.filter(e=>e.kind==='foul').length;}}
  assert.ok(slides>=10,`slides ${slides}`);assert.ok(falls>=fouls*.9,`falls ${falls} for ${fouls} fouls`);
});
