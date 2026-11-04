// Seeded batch: node --experimental-strip-types scripts/calibrate-engine.mjs [matches=6]
import {buildMatch,playMatch,SAMPLE_ROSTERS} from './simulate-match.mjs';

const n=Number(process.argv[2]??6),rows=[],shots=[],scorers={};
for(let i=0;i<n;i++){
  const roster=SAMPLE_ROSTERS[i%SAMPLE_ROSTERS.length],seed=1000+i*7919,{snapshot}=buildMatch(roster[0],roster[1],seed),m=playMatch(snapshot);
  const s=m.stats,kinds={};for(const e of m.events)kinds[e.kind]=(kinds[e.kind]??0)+1;
  rows.push({goals:m.score[0]+m.score[1],score:m.score.join('–'),shots:s[0].shots+s[1].shots,onTarget:s[0].onTarget+s[1].onTarget,saves:s[0].saves+s[1].saves,
    passes:s[0].passes+s[1].passes,completed:s[0].completed+s[1].completed,headerGoals:s[0].headerGoals+s[1].headerGoals,corners:s[0].corners+s[1].corners,fouls:s[0].fouls+s[1].fouls,
    penalties:s[0].penalties+s[1].penalties,throwIns:kinds['throw-in']??0,beats:kinds.beat??0,tackles:kinds.tackle??0,interceptions:kinds.interception??0,badTouches:kinds['bad-touch']??0,crosses:kinds.cross??0});
  for(const e of m.events){
    if(e.kind==='shot'||e.kind==='header'||e.kind==='penalty'){if(e.outcome===undefined)continue;shots.push({kind:e.kind,d:e.reason.distanceMeters,xg:e.reason.successProbability??0,outcome:e.outcome,actor:e.actorId});}
    if(e.kind==='goal'&&e.actorId)scorers[e.actorId]=(scorers[e.actorId]??0)+1;
  }
}
const avg=k=>rows.reduce((a,r)=>a+r[k],0)/rows.length,sorted=rows.map(r=>r.goals).sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
console.log('Skorlar:',rows.map(r=>r.score).join('  '));
console.log(`Gol medyan ${median} ort ${avg('goals').toFixed(1)} · şut ${avg('shots').toFixed(1)} isabet ${avg('onTarget').toFixed(1)} kurtarış ${avg('saves').toFixed(1)} · pas isabeti %${(100*avg('completed')/avg('passes')).toFixed(0)} (${avg('passes').toFixed(0)} pas)`);
console.log(`Kafa golü ${avg('headerGoals').toFixed(2)} · korner ${avg('corners').toFixed(1)} · orta ${avg('crosses').toFixed(1)} · faul ${avg('fouls').toFixed(1)} · penaltı ${avg('penalties').toFixed(2)} · taç ${avg('throwIns').toFixed(0)}`);
console.log(`Çalım/sıyrılma ${avg('beats').toFixed(0)} · top kapma ${avg('tackles').toFixed(0)} · kazanma/kesme ${avg('interceptions').toFixed(0)} · kötü kontrol ${avg('badTouches').toFixed(0)}`);
const buckets=[[0,8],[8,12],[12,16],[16,20],[20,25],[25,40]];
for(const [a,b] of buckets){const g=shots.filter(s=>s.d>=a&&s.d<b),on=g.filter(s=>['goal','save','parry'].includes(s.outcome)).length,goals=g.filter(s=>s.outcome==='goal').length;
  console.log(`${String(a).padStart(2)}–${b} m: ${String(g.length).padStart(3)} şut · isabet %${g.length?Math.round(100*on/g.length):0} · gol %${g.length?Math.round(100*goals/g.length):0} · kurtarış/isabet %${on?Math.round(100*(on-goals)/on):0} · tahmin %${g.length?Math.round(100*g.reduce((s,x)=>s+x.xg,0)/g.length):0}`);}
const hs=shots.filter(s=>s.kind==='header');console.log(`Kafa şutu ${hs.length} · gol ${hs.filter(s=>s.outcome==='goal').length}`);
console.log('Golcüler:',Object.entries(scorers).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>`${k} ${v}`).join(', '));
