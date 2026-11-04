import type { PlayerId, Result, TeamId } from '../domain/common.js';
import type { MatchEvent, MatchFrame, MatchSnapshot, MatchSummary } from '../domain/match.js';
import type { EffectiveAttributes } from '../domain/modifiers.js';
import type { Player } from '../domain/players.js';
import type { ReplayChunk, ReplayManifest } from '../domain/replay.js';

export interface RuntimePlayerState {
  readonly player: Player;
  readonly teamId: TeamId;
  readonly fatigueFraction: number;
  readonly activeNegativeSource: boolean;
  readonly secondsSinceLastPassReceived: number;
  readonly consecutiveControlErrors: number;
}

export interface RuleContext {
  readonly snapshot: MatchSnapshot;
  readonly frame: MatchFrame;
  readonly players: readonly RuntimePlayerState[];
  readonly recentEvents: readonly MatchEvent[];
}

export interface ModifierPipeline {
  evaluate(context: RuleContext): ReadonlyMap<PlayerId, EffectiveAttributes>;
}

/** No Math.random/Date/DOM access inside the engine. PRNG stream belongs to run. */
export interface SeededRandom {
  next(): number;
  serializeState(): readonly number[];
}

export interface SimulationProgress {
  readonly stage: 'validating' | 'simulating' | 'packing' | 'persisting';
  readonly completedTicks: number;
  readonly totalTicks: number;
  readonly eventCount: number;
}

export type SimulationOutput =
  | { readonly kind: 'progress'; readonly progress: SimulationProgress }
  | { readonly kind: 'chunk'; readonly chunk: ReplayChunk }
  | { readonly kind: 'finished'; readonly manifest: ReplayManifest; readonly summary: MatchSummary };

/** Compute-only implementation will run inside simulation.worker.ts. */
export interface MatchEngine {
  validate(snapshot: MatchSnapshot): Result<void>;
  simulate(snapshot: MatchSnapshot, signal: AbortSignal): AsyncIterable<SimulationOutput>;
}

export interface ActionCandidate {
  readonly kind: 'short-pass' | 'diagonal-pass' | 'through-pass' | 'carry' | 'shoot' | 'clear';
  readonly actorId: PlayerId;
  readonly targetPlayerId: PlayerId | null;
  readonly expectedValue: number;
  readonly risk: number;
  readonly explanation: string;
}

export interface DecisionPolicy {
  candidates(context: RuleContext, playerId: PlayerId): readonly ActionCandidate[];
  choose(candidates: readonly ActionCandidate[], random: SeededRandom): ActionCandidate;
}
