import type { MatchSnapshot } from '../domain/match.js';
import { simulateHalf } from '../engine/simulation.ts';
import { factsOf } from '../online/markets.ts';

/* Odds suggestion: the planned lineups played again with fresh seeds (never the real match's), one MatchFacts per run. Several of these
 * workers run side by side in the admin's browser. */
const worker = self as unknown as { onmessage: ((event: MessageEvent<{ snapshot: MatchSnapshot; seeds: number[] }>) => void) | null; postMessage(message: unknown): void };
worker.onmessage = event => {
  const { snapshot, seeds } = event.data;
  try {
    for (const seed of seeds) {
      const s = { ...snapshot, settings: { ...snapshot.settings, seed } } as MatchSnapshot;
      const first = simulateHalf(s, 1, s.lineups, null), second = simulateHalf(s, 2, s.lineups, first.carry);
      worker.postMessage({ kind: 'facts', facts: factsOf(first, second) });
    }
    worker.postMessage({ kind: 'done' });
  } catch (error) {
    worker.postMessage({ kind: 'failed', message: error instanceof Error ? error.message : 'Simülasyon yapılamadı.' });
  }
};
