// Online mode (2026-11-05): login names, the Alsancak coin bets (settlement, loss bonus, odds rounding and movement, the suggested book and the
// holes an edited book can open), the recording file, the reel's trimmed copy and the live broadcast schedule.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMatch,playMatch,SAMPLE_ROSTERS} from '../scripts/simulate-match.mjs';
import {getBundledCatalog} from '../src/v1/data/bundled-catalog.ts';
import {usernameFor,loginKey,firstPasswordKey,firstPassword} from '../src/v1/online/usernames.ts';
import {wins,settle,floorOdds,fairOdds,liveOdds,buildBook,bookWarnings,covers,scoreOutcome,manOfTheMatch,couponQuote,couponPossible,packSample,unpackSample,COIN,ODDS,COUPON} from '../src/v1/online/markets.ts';
import {encodeRecording,decodeRecording} from '../src/v1/online/recording.ts';
import {buildMatchRecord} from '../src/online/match-record.js';
import {broadcastPlan,broadcastAt,broadcastEdit,BROADCAST} from '../src/match/broadcast-plan.js';
import {EDIT,EDIT_V1} from '../src/match/highlight-edit.js';
import {commentary,withoutEffect,announcedRule} from '../src/match/commentary.js';
import {FRAME_HEADER,PLAYER_CHANNELS} from '../src/v1/engine/replay.ts';
import {CHEMISTRY_RULEBOOK} from '../src/v1/config/chemistry-rulebook.ts';
import {planReel} from '../src/match/reel-plan.js';

const played=(()=>{const {snapshot}=buildMatch(SAMPLE_ROSTERS[0][0],SAMPLE_ROSTERS[0][1],4242),m=playMatch(snapshot);return {snapshot,m};})();
const record=buildMatchRecord({snapshot:played.snapshot,lineups:[played.snapshot.lineups,played.snapshot.lineups],teamNames:['Mavi Takım','Kırmızı Takım'],halfResults:[played.m.first,played.m.second]});
const player=(id,team,o={})=>({id,team,goals:0,assists:0,shots:0,onTarget:0,tackles:0,interceptions:0,saves:0,completed:0,headersWon:0,...o});
// Mavi 6–4 Kırmızı, 2–3 at half time; Alper 3 (one a header), Taha 2, a blue own goal for red; first goal Alper.
const facts={ht:[2,3],ft:[6,4],goals:[{t:100,team:0,player:'alper'},{t:300,team:1,player:'ismail'},{t:500,team:1,player:'ismail'},{t:900,team:0,player:'taha'},{t:1500,team:1,player:null},
  {t:2000,team:0,player:'alper'},{t:2600,team:0,player:'taha'},{t:3000,team:1,player:'mensur'},{t:3300,team:0,player:'alper'},{t:3500,team:0,player:'arif'}],corners:7,penalties:1,headerGoals:1,
  players:[player('alper',0,{goals:3,onTarget:6,completed:20}),player('taha',0,{goals:2,assists:2}),player('arif',0,{goals:1,assists:1}),player('ismail',1,{goals:2}),player('mensur',1,{goals:1,assists:1}),player('sahin',1,{saves:9})]};

test('login names: the user list, unique, typed with or without capitals and Turkish letters; observers by their name',()=>{
  const players=getBundledCatalog().players,names=new Map(players.map(p=>[p.id,usernameFor(p)]));
  assert.equal(names.get('kamil-reis'),'kamil');assert.equal(names.get('m-emre'),'emre');assert.equal(names.get('ali-efe'),'aliefe');assert.equal(names.get('arda-barin'),'barin');
  assert.equal(names.get('hakan-goktug'),'hakan');assert.equal(names.get('yigit-cetinkaya'),'yiğit');assert.equal(names.get('eren-emeksiz'),'erenemeksiz');assert.equal(names.get('goktug'),'göktuğ');
  const logins=[...names.values()].map(loginKey);assert.equal(new Set([...logins,'admin','ece','zeynep']).size,players.length+3,'every login is distinct');
  for(const typed of ['Göktuğ','göktuğ','goktug','GÖKTUĞ',' Goktug ']) assert.equal(loginKey(typed),'goktug',typed);
  for(const typed of ['İsmail','ISMAIL','ismail','Ismail']) assert.equal(loginKey(typed),'ismail',typed);
  assert.equal(firstPasswordKey('Göktuğ!'),firstPassword('göktuğ'));assert.equal(firstPasswordKey('goktug'),'goktug');
  assert.equal(usernameFor({id:'',name:'Ece'}),'ece');assert.equal(firstPassword(usernameFor({id:'',name:'Zeynep'})),'zeynep!');
});

test('a coupon with a big exact score is possible: the scan reaches the score market\'s own limit (it stopped at 16)',()=>{
  const none=()=>undefined;
  assert.equal(couponPossible([{family:'score',params:{},code:'17-0'},{family:'ft',params:{},code:'1'}],none),true);
  assert.equal(couponPossible([{family:'score',params:{},code:'17-0'},{family:'ft',params:{},code:'2'}],none),false);
});
test('markets decide every family on the match facts',()=>{
  const w=(family,code,params={})=>wins(family,params,code,facts);
  assert.ok(w('ft','1')&&!w('ft','X')&&!w('ft','2'));assert.ok(w('ht','2'));assert.ok(w('sh','1'),'second half 4–1');assert.ok(w('htft','2/1'));
  assert.ok(w('margin','b12'));assert.ok(!w('margin','b3'));assert.ok(w('half-more','equal'),'5 goals in each half');
  assert.ok(w('total','over',{line:8.5})&&w('total','under',{line:10.5})&&!w('total','over',{line:10.5}));
  assert.ok(w('team-total','over',{team:1,line:3.5})&&w('team-total','under',{team:0,line:6.5}));
  assert.ok(w('ht-total','over',{line:4.5}));assert.ok(w('sh-total','under',{line:5.5}));assert.ok(w('both-4plus','yes'));assert.ok(w('score','6-4')&&!w('score','4-6'));
  assert.ok(w('player-goals','yes',{player:'alper',k:3})&&w('player-goals','no',{player:'alper',k:4})&&w('player-goals','yes',{player:'taha',k:2}));
  assert.ok(w('player-assist','yes',{player:'taha'})&&w('player-assist','no',{player:'alper'}));
  assert.ok(w('top-scorer','alper')&&!w('top-scorer','taha'));
  assert.equal(manOfTheMatch(facts),'alper');assert.ok(w('motm','alper',{listed:['alper','taha']})&&w('motm','other',{listed:['taha']}));
  assert.ok(w('first-team','blue')&&w('first-scorer','alper',{listed:['alper']})&&w('first-scorer','other',{listed:['taha']}));
  assert.ok(w('penalty','yes')&&w('header-goal','yes')&&w('corners','over',{line:6.5}));
  const goalless={...facts,ht:[0,0],ft:[0,0],goals:[],players:facts.players.map(p=>({...p,goals:0}))};
  assert.ok(wins('first-team',{},'none',goalless)&&wins('first-scorer',{listed:['alper']},'none',goalless)&&!wins('top-scorer',{},'alper',goalless));
});

test('settlement pays stake × locked odds, 30 % back on a match\'s net loss only (hedging both sides earns no bonus)',()=>{
  const {results,bonuses}=settle([{id:'a1',user:1,family:'ft',params:{},code:'1',stake:1000,odds:1.35},{id:'a2',user:1,family:'score',params:{},code:'5-4',stake:500,odds:31},
    {id:'b1',user:2,family:'ft',params:{},code:'X',stake:1000,odds:8.75},{id:'c1',user:3,family:'total',params:{line:10.5},code:'under',stake:2000,odds:1.95}],facts);
  assert.deepEqual(results.map(r=>[r.id,r.won,r.payout]),[['a1',true,1350],['a2',false,0],['b1',false,0],['c1',true,3900]]);
  assert.deepEqual(bonuses,[{user:1,amount:45},{user:2,amount:300}],'user 1 lost 150 net, user 2 lost 1000; user 3 won');
  assert.equal(COIN.lossBonus,.3);assert.equal(COIN.start,30000);assert.equal(COIN.minStake,100);assert.equal(COIN.maxStake,5000);
});

test('odds: rounded down from fair, never under 1,05 or over 200; near-certain ones (held up at 1,05) not playable',()=>{
  assert.equal(floorOdds(1.96),1.95);assert.equal(floorOdds(1.999),1.95);assert.equal(floorOdds(8.77),8.75);assert.equal(floorOdds(33.3),33);assert.equal(floorOdds(57),55);assert.equal(floorOdds(1.01),1.05);assert.equal(floorOdds(900),200);
  assert.equal(fairOdds(.51),1.95);assert.equal(fairOdds(.2),5);
  const book=buildBook(Array.from({length:60},(_,i)=>({...facts,ft:[4+i%5,3+(i*7)%4],ht:[2+i%2,1+(i*3)%3]})),[{name:'Mavi',players:[{id:'alper',name:'Alper'},{id:'taha',name:'Taha'},{id:'arif',name:'Arif'}]},{name:'Kırmızı',players:[{id:'ismail',name:'İsmail'},{id:'mensur',name:'Mensur'},{id:'sahin',name:'Şahin'}]}]);
  for(const m of book.markets){
    for(const o of m.outcomes){assert.ok(o.odds>=ODDS.min&&o.odds<=ODDS.max,`${m.label} ${o.label} ${o.odds}`);assert.equal(o.playable,o.odds>=ODDS.playableFrom,`${m.label} ${o.label}`);
      assert.ok(o.odds<=Math.max(ODDS.min,1/o.prob)+1e-9,'rounded down');if(o.playable)assert.ok(o.odds<=1/o.prob+1e-9,`${m.label} ${o.label}: a playable pick is never above fair`);}
    if(m.exclusive&&m.family!=='score')assert.ok(Math.abs(m.outcomes.reduce((s,o)=>s+o.prob,0)-1)<1e-9,`${m.label} probabilities add up to one`);
  }
  assert.deepEqual(bookWarnings(book),[],'a suggested book opens no sure win');
  assert.ok(book.markets.some(m=>m.family==='motm')&&book.markets.some(m=>m.family==='score')&&book.markets.some(m=>m.family==='player-goals'));
  assert.ok(scoreOutcome(book,'12-11').odds>=ODDS.min&&scoreOutcome(book,'26-0')===null,'any 0–25 score has odds');
  // Edited holes: three-way odds that add up under one, and an over/under ladder that pays either way.
  const edited=structuredClone(book),ft=edited.markets.find(m=>m.id==='ft');ft.outcomes.forEach(o=>{o.odds=4;});
  const totals=edited.markets.filter(m=>m.family==='total').sort((a,b)=>a.params.line-b.params.line);Object.assign(totals[0].outcomes.find(o=>o.code==='over'),{odds:3,playable:true});Object.assign(totals[1].outcomes.find(o=>o.code==='under'),{odds:3,playable:true});
  const warn=bookWarnings(edited);assert.ok(warn.some(w=>w.startsWith('Maç sonucu'))&&warn.some(w=>/üst ile .* alt birlikte her durumda/.test(w)),warn.join(' | '));
  // A near-certain pick held at 1,05 is above fair, but only counts once the admin opens it.
  const sure=structuredClone(book),goal=sure.markets.find(m=>m.id==='goals-alper-1');assert.ok(goal&&!goal.outcomes[0].playable,'Alper scores in every sample: closed');
  assert.deepEqual(bookWarnings(sure),[]);goal.outcomes[0].playable=true;assert.ok(bookWarnings(sure).some(w=>w.startsWith(goal.label)));
});

test('no bettor may hold bets that win whatever happens (hem kazanan hem kaybeden), whatever the odds',()=>{
  const teamOf=p=>({alper:0,taha:0,ismail:1})[p];
  const bet=(family,code,params={})=>({family,code,params}),c=list=>covers(list,teamOf);
  assert.ok(c([bet('total','over',{line:7.5}),bet('total','under',{line:9.5})]),'7,5 üst + 9,5 alt');
  assert.ok(!c([bet('total','under',{line:7.5}),bet('total','over',{line:9.5})]),'8–9 goals lose both');
  assert.ok(c([bet('player-goals','yes',{player:'alper',k:1}),bet('player-goals','no',{player:'alper',k:2})]),'Alper 1+ evet + 2+ hayır');
  assert.ok(!c([bet('player-goals','no',{player:'alper',k:1}),bet('player-goals','yes',{player:'alper',k:2})]),'one goal loses both');
  assert.ok(c([bet('both-4plus','yes'),bet('team-total','under',{team:0,line:3.5}),bet('team-total','under',{team:1,line:3.5})]),'iki takım 4+ with both 3,5 alt');
  assert.ok(!c([bet('both-4plus','yes'),bet('team-total','under',{team:0,line:2.5}),bet('team-total','under',{team:1,line:3.5})]),'3–4 loses all three');
  assert.ok(c([bet('first-team','none'),bet('total','over',{line:.5})]),'no goal or a goal');
  assert.ok(!c([bet('ht-total','under',{line:1.5}),bet('ht','1'),bet('htft','1/1')]),'1–1 at half time loses all three');
  assert.ok(c([bet('header-goal','no'),bet('total','over',{line:.5})]),'a goalless match has no header goal');
  assert.ok(c([bet('player-assist','no',{player:'ismail'}),bet('team-total','over',{team:1,line:.5})]),'no red goal, no assist for İsmail');
  assert.ok(!c([bet('ft','1'),bet('ht','2'),bet('sh','1'),bet('score','6-4'),bet('motm','alper',{listed:['alper']}),bet('penalty','yes'),bet('player-assist','no',{player:'taha'})]),'ordinary slips are fine');
  const t0=performance.now();assert.ok(c([bet('ht-total','over',{line:1.5}),bet('ht-total','under',{line:3.5}),bet('half-more','first'),bet('margin','x')]));assert.ok(performance.now()-t0<200,'the half search is quick');
});

test('coupons: odds multiplied, lowered when the picks come together more often than chance, impossible ones refused, paid only if all win',()=>{
  // 200 simulated matches: blue wins 120 (50 of them by 3+), draws 30, red wins 50; a penalty in every second match, independently.
  const sim=(a,b,pen)=>({...facts,ht:[0,0],ft:[a,b],penalties:pen,goals:a+b?[{t:10,team:a?0:1,player:a?'alper':'ismail'}]:[]});
  const samples=[];for(let i=0;i<200;i++){const pen=i%2;samples.push(i<50?sim(6,2,pen):i<120?sim(5,4,pen):i<150?sim(4,4,pen):sim(3,5,pen));}
  const leg=(family,code,odds,params={})=>({family,code,params,odds});
  const implied=couponQuote([leg('ft','1',1.65),leg('margin','b3',4)],samples);
  assert.ok(implied.factor>1.4&&implied.odds<=4.1&&implied.odds>=3.6,`Mavi kazanır + Mavi 3+ farkla: ${JSON.stringify(implied)} (the second alone pays 4)`);
  const independent=couponQuote([leg('ft','1',1.65),leg('penalty','yes',2)],samples);
  assert.equal(independent.factor,1,'a penalty says nothing about the winner');assert.equal(independent.odds,3.3,'1,65 × 2');
  assert.equal(couponQuote([leg('ft','X',6.5)],samples).odds,6.5,'one pick is a plain bet');
  assert.ok(couponQuote([leg('ft','1',200),leg('penalty','yes',200)],samples).odds<=COUPON.maxOdds,'capped');
  const teamOf=p=>({alper:0,ismail:1})[p];
  assert.ok(!couponPossible([leg('ft','1'),leg('margin','r3')],teamOf),'blue wins and red wins by 3+');
  assert.ok(!couponPossible([leg('first-team','none'),leg('total','over',1,{line:.5})],teamOf),'no goal and a goal');
  assert.ok(!couponPossible([leg('player-goals','yes',1,{player:'alper',k:2}),leg('player-goals','no',1,{player:'alper',k:2})],teamOf),'2+ and not 2+');
  assert.ok(!couponPossible([leg('team-total','under',1,{team:0,line:1.5}),leg('player-goals','yes',1,{player:'alper',k:3})],teamOf),'blue scores at most once, Alper three');
  assert.ok(couponPossible([leg('ft','1'),leg('total','over',1,{line:7.5}),leg('player-goals','yes',1,{player:'alper',k:2}),leg('ht','2')],teamOf),'a comeback with Alper 2+');
  const back=unpackSample(packSample(facts));assert.deepEqual([back.ft,back.ht,back.motm,back.goals.length,back.corners],[facts.ft,facts.ht,'alper',facts.goals.length,facts.corners]);
  for(const [family,code,params] of [['player-goals','yes',{player:'alper',k:3}],['top-scorer','alper',{}],['motm','alper',{listed:['alper']}],['first-scorer','alper',{listed:['alper']}],['player-assist','yes',{player:'taha'}]])
    assert.equal(wins(family,params,code,back),wins(family,params,code,facts),`${family} decided the same on a stored simulation`);
  const {results}=settle([{id:'c1',user:1,stake:1000,odds:3.3,legs:[{family:'ft',params:{},code:'1'},{family:'penalty',params:{},code:'yes'}]},{id:'c2',user:1,stake:1000,odds:9,legs:[{family:'ft',params:{},code:'1'},{family:'score',params:{},code:'5-4'}]}],facts);
  assert.deepEqual(results.map(r=>[r.id,r.won,r.payout]),[['c1',true,3300],['c2',false,0]],'6–4 with a penalty: the first coupon wins, the second misses its score');
  // A coupon among one's bets: under 7,5 alone and over 7,5 as a one-pick coupon cover everything; with "Mavi kazanır" added they do not.
  const pos=(family,code,params={})=>({family,code,params});
  assert.ok(covers([pos('total','under',{line:7.5}),{legs:[pos('total','over',{line:7.5})]}],teamOf));
  assert.ok(!covers([pos('total','under',{line:7.5}),{legs:[pos('total','over',{line:7.5}),pos('ft','1')]}],teamOf),'8+ goals and blue not winning loses both');
});

test('odds move with the money: the backed side shortens, the others lengthen, slowly and within 30 %',()=>{
  const market={id:'ft',family:'ft',group:'Maç',label:'Maç sonucu',params:{},exclusive:true,active:true,outcomes:[{code:'1',label:'Mavi',prob:.7,odds:1.35,playable:true},{code:'X',label:'Ber.',prob:.11,odds:8.75,playable:true},{code:'2',label:'Kırmızı',prob:.19,odds:5,playable:true}]};
  const at=st=>Object.fromEntries(liveOdds(market,st,ODDS.liquidity).map(o=>[o.code,o.odds]));
  assert.deepEqual(at({}),{'1':1.35,'X':8.75,'2':5},'no money, the admin\'s odds');
  const some=at({'2':5000});assert.ok(some['2']<5&&some['2']>4.3,`one 5 000 bet moves red a little: ${some['2']}`);assert.ok(some['1']>=1.35,'blue lengthens');
  const flood=at({'2':400000});assert.equal(flood['2'],3.5,'never below 70 % of the admin\'s odds');assert.ok(flood['1']<=1.75);
  const scorer={...market,exclusive:false,outcomes:[{code:'alper',label:'Alper',prob:.4,odds:2.5,playable:true},{code:'taha',label:'Taha',prob:.2,odds:5,playable:true}]};
  const s=Object.fromEntries(liveOdds(scorer,{alper:20000},ODDS.liquidity).map(o=>[o.code,o.odds]));assert.ok(s.alper<2.5&&s.taha===5,'a non-exclusive market moves only the backed outcome');
});

test('recording file: what goes up comes back identical; the reel copy is small and plans the same reel',async()=>{
  const bytes=await encodeRecording(record.recording),back=await decodeRecording(bytes);
  assert.ok(bytes.length>2e6&&bytes.length<20e6,`recording ${(bytes.length/1e6).toFixed(1)} MB`);
  for(const i of [0,1]){const a=record.recording.halves[i],b=back.halves[i];
    assert.ok(b.samples instanceof Float32Array&&b.ballKeys instanceof Float32Array);assert.deepEqual(b.samples,a.samples);assert.deepEqual(b.ballKeys,a.ballKeys);assert.deepEqual(b.ballCuts,a.ballCuts);
    assert.deepEqual(b.events,a.events);assert.equal(b.frameCount,a.frameCount);}
  assert.deepEqual(back.snapshot,record.recording.snapshot);assert.deepEqual(back.results,record.recording.results);
  const reel=await encodeRecording(record.reel);assert.ok(reel.length<600e3,`reel ${(reel.length/1e3).toFixed(0)} KB`);
  const clip=c=>({start:c.start,end:c.end,kind:c.kind,speed:c.speed});
  assert.deepEqual(planReel((await decodeRecording(reel)).halves).clips.map(clip),planReel(record.recording.halves).clips.map(clip),'the reel is planned the same from the kept part');
  const r=record.result;assert.ok(r.score.every(Number.isInteger)&&r.goals.length===r.score[0]+r.score[1]);assert.deepEqual(r.facts.ft,r.score);assert.ok(r.motm?.name,'man of the match named');
  assert.ok(record.teams.teams.every(t=>t.players.length===11)&&!JSON.stringify(record.teams).includes(String(played.snapshot.settings.seed)),'teams carry no seed');
});

test('broadcast: about 11 minutes, everybody at the same match second for the same clock, halves in order, never backwards',()=>{
  const plan=broadcastPlan(record.recording.halves),B=BROADCAST;
  assert.ok(plan.total>B.walkoutSeconds*2+B.halftimeSeconds+400&&plan.total<B.walkoutSeconds*2+B.halftimeSeconds+2*B.budgetSeconds+5,`total ${plan.total.toFixed(0)} s`);
  assert.equal(broadcastAt(plan,-30).kind,'before');assert.equal(broadcastAt(plan,1).kind,'walkout');assert.equal(broadcastAt(plan,plan.total+1).kind,'end');
  const keys=[];let last=null;
  for(let e=0;e<plan.total;e+=.5){const at=broadcastAt(plan,e);if(keys.at(-1)!==at.key)keys.push(at.key);
    if(at.kind==='half'){const h=record.recording.halves[at.half-1];assert.ok(at.t>=h.startSeconds&&at.t<=h.endSeconds);if(last&&last.half===at.half)assert.ok(at.t>=last.t-1e-6,`time went back at ${e}`);last=at;}}
  assert.deepEqual(keys,['walkout1','half1','halftime1','walkout2','half2']);
});

test('live copy (user, 2026-11-06): a few MB, carries its edit, and every frame the broadcast shows is as in the full recording',async()=>{
  const bytes=await encodeRecording(record.live),live=await decodeRecording(bytes),full=record.recording;
  assert.ok(bytes.length<4.5e6,`live ${(bytes.length/1e6).toFixed(1)} MB`);assert.ok(live.trimmed&&!full.trimmed);
  assert.deepEqual(live.edit,full.edit,'the same edit travels with both');assert.equal(live.edit.version,EDIT.version);
  assert.deepEqual(live.edit.plan,broadcastPlan(full.halves),'the stored plan is the broadcast of the full recording');
  assert.deepEqual(broadcastEdit(full.halves),full.edit);assert.equal(record.plan,full.edit.plan);
  for(const i of [0,1]){
    const a=full.halves[i],b=live.halves[i],st=FRAME_HEADER+a.playerOrder.length*PLAYER_CHANNELS.length,segs=live.edit.segments[i];let shown=0,kept=0;
    assert.deepEqual(b.events,a.events);assert.deepEqual(b.ballKeys,a.ballKeys);assert.equal(b.frameCount,a.frameCount);
    for(let f=0;f<a.frameCount;f++){const t=a.samples[f*st],same=b.samples.subarray(f*st,(f+1)*st).every((x,j)=>x===a.samples[f*st+j]);if(same)kept++;
      if(segs.some(s=>t>=s.start&&t<=s.end)){shown++;assert.ok(same,`frame at ${t.toFixed(1)} s of half ${i+1} kept`);}}
    assert.ok(shown>0&&kept<a.frameCount*.45,`half ${i+1}: ${kept}/${a.frameCount} frames kept`);
  }
});
test('edit versions: recordings planned before 6 Nov replay with the v1 edit they were timed with; v2 keeps the broadcast about 10 minutes',()=>{
  const v1=broadcastPlan(record.recording.halves,EDIT_V1),v2=broadcastPlan(record.recording.halves),B=BROADCAST,cards=B.walkoutSeconds*2+B.halftimeSeconds;
  assert.notDeepEqual(v1.pieces,v2.pieces);
  for(const plan of [v1,v2])assert.ok(plan.total>cards+400&&plan.total<cards+2*B.budgetSeconds+5,`total ${plan.total.toFixed(0)} s`);
  assert.ok(Math.abs(v2.total-v1.total)<90,`v2 ${v2.total.toFixed(0)} s against v1 ${v1.total.toFixed(0)} s`);
});
test('in-match rule numbers stay off the screen (user, 2026-11-06: "Utku … −0,5 yazmasın", "hepsini gizle"); the rule still acts',()=>{
  const ev=(text,importance=.32)=>({id:'e1',kind:'mood',importance,reason:{explanation:text}}),none=()=>'';
  const announced=CHEMISTRY_RULEBOOK.rules.filter(announcedRule);
  assert.ok(announced.length>=8&&announced.some(r=>r.id==='utku-trailing'));
  for(const r of announced){assert.equal(commentary(ev(r.description),none),'',r.id);assert.ok(!/[+−]\d/.test(withoutEffect(r.description)),r.id);assert.ok(withoutEffect(r.description).length>3,r.id);}
  assert.equal(withoutEffect('Utku gerideyken: savunma/pres/pozisyon/dayanıklılık −0,5.'),'Utku gerideyken');
  assert.equal(commentary(ev('Göktuğ uzun süredir pas alamadı, küstü · Göktuğ küsünce: pas/görüş −0,5.',.25),none),'Göktuğ uzun süredir pas alamadı, küstü');
  assert.equal(commentary(ev('Günün formu · Batu kötü gününde: hız −0,5.',.2),none),'');
  assert.equal(commentary(ev('Altuğ oyundan koptu',.25),none),'Altuğ oyundan koptu');
  assert.ok(CHEMISTRY_RULEBOOK.rules.find(r=>r.id==='utku-trailing').effects.every(e=>e.delta===-.5),'the effect itself is unchanged');
});
