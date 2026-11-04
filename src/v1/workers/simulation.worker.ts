import type { MatchWorkerRequest, MatchWorkerResponse } from './protocol.js';
import { simulateHalf } from '../engine/simulation.ts';

/* One half per request (user decision: lineups may change at half-time). Samples travel as a transferable buffer. */
const worker = self as unknown as { onmessage: ((event: MessageEvent<MatchWorkerRequest>) => void) | null; postMessage(message: MatchWorkerResponse, transfer?: Transferable[]): void };
worker.onmessage = event => {
  const request = event.data;
  if (request.kind !== 'simulate-half') return;
  try {
    const result = simulateHalf(request.snapshot, request.half, request.lineups, request.carry, fraction => worker.postMessage({ kind: 'progress', runId: request.runId, half: request.half, fraction }));
    worker.postMessage({ kind: 'half-complete', runId: request.runId, half: request.half, result }, [result.replay.samples.buffer, result.replay.ballKeys.buffer, result.replay.ballCuts.buffer]);
  } catch (error) {
    worker.postMessage({ kind: 'failed', runId: request.runId, message: error instanceof Error ? error.message : 'Maç hesaplanamadı.' });
  }
};
