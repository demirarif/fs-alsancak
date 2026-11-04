import type { OptimizerWorkerRequest, OptimizerWorkerResponse } from './protocol.js';
import { optimizeLineups } from '../application/lineup-optimizer.ts';
const worker=self as unknown as {onmessage:((event:MessageEvent<OptimizerWorkerRequest>)=>void)|null;postMessage(message:OptimizerWorkerResponse):void};
worker.onmessage=event=>{
  if(event.data.kind!=='suggest')return;const request=event.data.request;
  try{const result=optimizeLineups(request);worker.postMessage(result.ok?{kind:'complete',result:result.value}:{kind:'failed',runId:request.runId,selectionRevision:request.selectionRevision,problems:result.problems});}
  catch{worker.postMessage({kind:'failed',runId:request.runId,selectionRevision:request.selectionRevision,problems:[{code:'OPTIMIZER_ERROR',message:'Diziliş hesaplanamadı. Kadroları kontrol edip yeniden dene.'}]});}
};
