import { createMatchSnapshot } from '../v1/application/match-factory.ts';
import { freshSeed } from '../v1/engine/rng.ts';
import { encodeRecording, decodeRecording } from '../v1/online/recording.ts';
import { suggestBook } from './odds-runner.js';
import { buildMatchRecord } from './match-record.js';
import { api } from './api.js';

/* Admin planning (user decision 2026-11-05): whatever device the admin is on simulates the match in a worker, without showing it, and
 * uploads it, then prices it; everyone else waits for the kick-off. Re-planning before kick-off replaces the old match: its bets are
 * refunded (they were priced on other lineups) and the new one is priced again. */
function simulateHalf(snapshot,half,lineups,carry){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('../v1/workers/simulation.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=event=>{const m=event.data;if(m.kind==='half-complete'){worker.terminate();resolve(m.result);}else if(m.kind==='failed'){worker.terminate();reject(new Error(m.message));}};
    worker.onerror=()=>{worker.terminate();reject(new Error('Maç işçisi başlatılamadı.'));};
    worker.postMessage({kind:'simulate-half',runId:1,snapshot,half,lineups,carry});
  });
}
export async function planMatch({draft,context,kickoffAt,replaces=null,onStep=()=>{},sims=160}){
  onStep('Maç hesaplanıyor (1. yarı)…');
  const snapshot=createMatchSnapshot(draft,context,freshSeed()),lineups=[snapshot.lineups,snapshot.lineups],teamNames=context.selection.teams.map(t=>t.name);
  const first=await simulateHalf(snapshot,1,lineups[0],null);onStep('Maç hesaplanıyor (2. yarı)…');
  const second=await simulateHalf(snapshot,2,lineups[1],first.carry);
  const record=buildMatchRecord({snapshot,lineups,teamNames,halfResults:[first,second]});
  onStep('Yükleniyor…');
  const {id}=await api.admin.create({kickoffAt,broadcastMs:Math.round(record.plan.total*1000),teams:record.teams,result:record.result,engineVersion:snapshot.tuning?.version??'',replaces});
  await api.admin.upload(id,'recording',await encodeRecording(record.recording));
  await api.admin.upload(id,'reel',await encodeRecording(record.reel));
  await api.admin.publish(id);
  // The suggested odds: the same lineups played `sims` more times with other seeds; the admin edits them before opening the bulletin.
  const book=await suggestBook({snapshot,teams:record.teams,count:sims,onProgress:f=>onStep(`Oranlar hesaplanıyor… %${Math.round(f*100)}`)});
  await api.admin.saveBook(id,book);
  return {id,broadcastSeconds:record.plan.total,book};
}
/** New suggested odds for a planned match (its snapshot comes back from the recording, which the admin may read before kick-off). */
export async function repriceMatch({id,teams,sims=160,onProgress}){
  const recording=await decodeRecording(await api.recording(id));
  return suggestBook({snapshot:recording.snapshot,teams,count:sims,onProgress});
}
