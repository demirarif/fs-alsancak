// Node harness: node --experimental-strip-types scripts/simulate-match.mjs [seed] [--events]
import {getBundledCatalog} from '../src/v1/data/bundled-catalog.ts';
import {createSelectionDraft} from '../src/v1/domain/selection.ts';
import {selectionService} from '../src/v1/application/selection-service.ts';
import {optimizeLineups} from '../src/v1/application/lineup-optimizer.ts';
import {createMatchSnapshot} from '../src/v1/application/match-factory.ts';
import {simulateHalf} from '../src/v1/engine/simulation.ts';
import {CHEMISTRY_RULEBOOK} from '../src/v1/config/chemistry-rulebook.ts';
import {FORMATIONS} from '../src/v1/config/formations.ts';

export const SAMPLE_ROSTERS=[
  [['kiyan','arif','baran','eren','taha','servan','mensur','m-emre','onur','omer','yigit-cetinkaya'],['sahin','alper','goktug','ismail','mahmut','erhan','mustafa','mali','hakan-goktug','caca','tevfik']],
  [['talha','barkuz','emir','melih','suleyman','kamil-reis','utku','berkin','direnc','eto','batu'],['yusuf','yanki','mamadou','ali-efe','ugur','arda-barin','seker','halit','metehan','altug','oguz']],
  [['kiyan','taha','alper','baran','m-emre','omer','onur','eren','arif','barkuz','mali'],['sarp','fuat','akin','eren-emeksiz','oguz','metehan','halit','seker','direnc','batu','yigit-cetinkaya']],
];
export function buildMatch(blue,red,seed){
  const catalog=getBundledCatalog();let d=createSelectionDraft('harness','2026-11-03');
  const step=c=>{const r=selectionService.apply(d,c,catalog);if(!r.ok)throw new Error(JSON.stringify(r.problems));d=r.value;};
  [blue,red].forEach((ids,i)=>{step({kind:'activate-team',teamId:`team-${i+1}`});ids.forEach(playerId=>step({kind:'add-player',playerId}));});
  const context={selection:d,catalog,rulebook:CHEMISTRY_RULEBOOK,forms:[]};
  const opt=optimizeLineups({runId:'h',selectionRevision:d.revision,context,formations:Object.keys(FORMATIONS)});if(!opt.ok)throw new Error(JSON.stringify(opt.problems));
  return {snapshot:createMatchSnapshot(opt.value.initialDraft,context,seed,'2026-11-03T12:00:00.000Z'),draft:opt.value.initialDraft};
}
export function playMatch(snapshot){
  const first=simulateHalf(snapshot,1,snapshot.lineups,null),second=simulateHalf(snapshot,2,snapshot.lineups,first.carry);
  return {first,second,score:second.score,stats:second.teamStats,events:[...first.replay.events,...second.replay.events],players:second.players};
}
if(import.meta.url===`file:///${process.argv[1].replace(/\\/g,'/')}`||process.argv[1]?.endsWith('simulate-match.mjs')){
  const seed=Number(process.argv[2]??7),roster=SAMPLE_ROSTERS[Number(process.argv[3]??0)];
  const started=performance.now(),{snapshot}=buildMatch(roster[0],roster[1],seed),m=playMatch(snapshot),ms=performance.now()-started;
  const s=m.stats,kinds={};for(const e of m.events)kinds[e.kind]=(kinds[e.kind]??0)+1;
  console.log(`Skor ${m.score[0]}–${m.score[1]} · ${ms.toFixed(0)} ms · kare ${m.first.replay.frameCount+m.second.replay.frameCount}`);
  for(const i of [0,1]){const t=s[i];console.log(`T${i+1}: şut ${t.shots} (isabet ${t.onTarget}) gol ${t.goals} kafa ${t.headerGoals} · pas ${t.passes} isabet %${Math.round(t.completed/Math.max(1,t.passes)*100)} · top %${Math.round(t.possession/36)} · korner ${t.corners} faul ${t.fouls} pen ${t.penalties}`);}
  console.log(JSON.stringify(kinds));
  for(const e of m.events.filter(e=>e.kind==='goal'||e.kind==='mood'||(process.argv.includes('--events')&&e.importance>=.6)))console.log(`${String(Math.floor(e.seconds/60)).padStart(2,'0')}' ${e.kind.padEnd(10)} ${e.reason.explanation}`);
}
