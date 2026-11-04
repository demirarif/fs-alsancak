import type { MatchId, Problem, Revision, RunId } from '../domain/common.js';
import type { MatchSnapshot, MatchSummary } from '../domain/match.js';
import type { ReplayChunk, ReplayManifest } from '../domain/replay.js';
import type { SimulationProgress } from '../engine/contracts.js';
import type { OptimizationRequest, OptimizationResult } from '../application/services.js';
import type { Lineup } from '../domain/teams.js';
import type { HalfCarry, HalfResult } from '../engine/simulation.ts';

/** Late messages from superseded runId/revision pairs must be discarded. */
export type SimulationWorkerRequest =
  | { readonly kind: 'start'; readonly runId: RunId; readonly snapshot: MatchSnapshot }
  | { readonly kind: 'cancel'; readonly runId: RunId }
  | { readonly kind: 'chunk-persisted'; readonly runId: RunId; readonly index: number };

export type SimulationWorkerResponse =
  | { readonly kind: 'progress'; readonly runId: RunId; readonly matchId: MatchId; readonly progress: SimulationProgress }
  | { readonly kind: 'chunk'; readonly runId: RunId; readonly chunk: ReplayChunk }
  | { readonly kind: 'complete'; readonly runId: RunId; readonly manifest: ReplayManifest; readonly summary: MatchSummary }
  | { readonly kind: 'cancelled'; readonly runId: RunId }
  | { readonly kind: 'failed'; readonly runId: RunId; readonly problems: readonly Problem[] };

/** Half-by-half match simulation (user decision: half-time lineup changes). */
export type MatchWorkerRequest =
  | { readonly kind: 'simulate-half'; readonly runId: RunId; readonly snapshot: MatchSnapshot; readonly half: 1 | 2; readonly lineups: readonly [Lineup, Lineup]; readonly carry: HalfCarry | null };
export type MatchWorkerResponse =
  | { readonly kind: 'progress'; readonly runId: RunId; readonly half: 1 | 2; readonly fraction: number }
  | { readonly kind: 'half-complete'; readonly runId: RunId; readonly half: 1 | 2; readonly result: HalfResult }
  | { readonly kind: 'failed'; readonly runId: RunId; readonly message: string };

export type OptimizerWorkerRequest =
  | { readonly kind: 'suggest'; readonly request: OptimizationRequest }
  | { readonly kind: 'cancel'; readonly runId: RunId };

export type OptimizerWorkerResponse =
  | { readonly kind: 'complete'; readonly result: OptimizationResult }
  | { readonly kind: 'cancelled'; readonly runId: RunId }
  | { readonly kind: 'failed'; readonly runId: RunId; readonly selectionRevision: Revision; readonly problems: readonly Problem[] };
