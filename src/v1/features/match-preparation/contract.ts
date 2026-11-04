import type { MatchId, Problem, RunId } from '../../domain/common.js';
import type { SimulationProgress } from '../../engine/contracts.js';

export interface MatchPreparationViewModel {
  readonly matchId: MatchId;
  readonly runId: RunId;
  readonly scene: 'lineup-presentation' | 'walkout' | 'warmup' | 'waiting' | 'ready';
  readonly progress: SimulationProgress;
  readonly introFinished: boolean;
  /** True only after durable replay completion, not merely worker completion. */
  readonly replayCommitted: boolean;
  readonly problems: readonly Problem[];
  readonly canSkipIntro: boolean;
  readonly canWatch: boolean;
}

export type MatchPreparationIntent =
  | { readonly kind: 'skip-intro' }
  | { readonly kind: 'cancel-and-edit' }
  | { readonly kind: 'retry' }
  | { readonly kind: 'watch-match' };
