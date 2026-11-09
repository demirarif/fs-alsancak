import { buildBook, packSample } from '../v1/online/markets.ts';

/* Prices a planned match in the admin's browser: the same lineups played `count` times with fresh seeds over several workers (one per
 * spare core, at most 8), then the suggested book. A desktop does 160 runs in a minute or two; a phone takes longer. */
export function simulateMany(snapshot,count,onProgress=()=>{}){
  const workers=Math.max(1,Math.min(8,(navigator.hardwareConcurrency||4)-1)),seeds=Array.from({length:count},(_,i)=>(snapshot.settings.seed^Math.imul(i+1,0x9e3779b1))>>>0);
  const facts=[];let done=0,finished=0,failed=null;const pool=[];
  return new Promise((resolve,reject)=>{
    for(let w=0;w<workers;w++){
      const mine=seeds.filter((_,i)=>i%workers===w);if(!mine.length){finished++;continue;}
      const worker=new Worker(new URL('../v1/workers/odds.worker.ts',import.meta.url),{type:'module'});pool.push(worker);
      worker.onmessage=event=>{const m=event.data;
        if(m.kind==='facts'){facts.push(m.facts);done++;onProgress(done/count);}
        else if(m.kind==='done'){worker.terminate();if(++finished===workers)resolve(facts);}
        else if(m.kind==='failed'){failed=m.message;pool.forEach(x=>x.terminate());reject(new Error(failed));}};
      worker.onerror=()=>{pool.forEach(x=>x.terminate());reject(new Error('Oran işçisi başlatılamadı.'));};
      worker.postMessage({snapshot,seeds:mine});
    }
    if(finished===workers)resolve(facts);
  });
}
/** The suggested book for a match from its snapshot and public teams, and the simulated matches it came from (packed; kept on the server
 * for pricing coupons). */
export async function suggestBook({snapshot,teams,count=160,onProgress}){
  const sims=await simulateMany(snapshot,count,onProgress);
  return {book:buildBook(sims,[{name:teams.names[0],players:teams.teams[0].players},{name:teams.names[1],players:teams.teams[1].players}]),samples:sims.map(packSample)};
}
