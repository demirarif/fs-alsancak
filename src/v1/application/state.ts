import type { MatchId, PlayerId, Problem, Revision, RunId, TeamId } from '../domain/common.js';
import type { SimulationProgress } from '../engine/contracts.js';
import type { LineupDraft, LineupEvaluation, SelectionDraft } from '../domain/teams.js';
import type { PlaybackState } from '../domain/replay.js';
import type { PlayerCatalog } from '../domain/players.js';
import type { ChemistryRulebook } from '../domain/modifiers.js';

export type Screen = 'team-selection' | 'lineup-review' | 'match-preparation' | 'match-viewer' | 'match-summary';

export type AppFlow =
  | { readonly stage: 'booting' }
  | { readonly stage: 'selecting'; readonly draft: SelectionDraft }
  | { readonly stage: 'optimizing'; readonly draft: SelectionDraft; readonly runId: RunId; readonly requestedRevision: Revision }
  | { readonly stage: 'reviewing'; readonly selection: SelectionDraft; readonly draft: LineupDraft; readonly evaluation: LineupEvaluation }
  | { readonly stage: 'preparing'; readonly matchId: MatchId; readonly runId: RunId; readonly progress: SimulationProgress; readonly introFinished: boolean }
  | { readonly stage: 'ready'; readonly matchId: MatchId; readonly introFinished: boolean }
  | { readonly stage: 'watching'; readonly matchId: MatchId; readonly playback: PlaybackState }
  | { readonly stage: 'finished'; readonly matchId: MatchId }
  | { readonly stage: 'recoverable-error'; readonly previousStage: Screen; readonly problems: readonly Problem[] };

export interface OverlayState {
  readonly playerProfile: { readonly playerId: PlayerId; readonly teamId: TeamId | null } | null;
  readonly guestEditorOpen: boolean;
}

/** Retained workspace survives preparations, cancellation and recoverable errors. */
export interface AppState {
  readonly flow: AppFlow;
  readonly overlays: OverlayState;
  readonly catalog: PlayerCatalog | null;
  readonly rulebook: ChemistryRulebook | null;
  readonly workspace: {
    readonly selection: SelectionDraft | null;
    readonly lineups: LineupDraft | null;
    readonly evaluation: LineupEvaluation | null;
  };
}

export interface ApplicationStore {
  getState(): AppState;
  subscribe(listener: (state: AppState) => void): () => void;
  dispatch(event: AppEvent): void;
}

/** These events describe architecture, not a wired or partially working router. */
export type AppEvent =
  | { readonly kind: 'catalog-loaded'; readonly draft: SelectionDraft }
  | { readonly kind: 'request-lineups' }
  | { readonly kind: 'optimization-complete'; readonly runId: RunId; readonly selectionRevision: Revision }
  | { readonly kind: 'return-to-selection' }
  | { readonly kind: 'request-simulation' }
  | { readonly kind: 'simulation-progress'; readonly runId: RunId; readonly progress: SimulationProgress }
  | { readonly kind: 'simulation-complete'; readonly runId: RunId; readonly matchId: MatchId }
  | { readonly kind: 'intro-complete' }
  | { readonly kind: 'skip-intro' }
  | { readonly kind: 'watch-match' }
  | { readonly kind: 'match-ended' }
  | { readonly kind: 'cancel-current-run' }
  | { readonly kind: 'operation-failed'; readonly problems: readonly Problem[] };

export const FLOW_TRANSITIONS = {
  booting: ['selecting', 'recoverable-error'],
  selecting: ['optimizing', 'recoverable-error'],
  optimizing: ['reviewing', 'selecting', 'recoverable-error'],
  reviewing: ['selecting', 'preparing', 'recoverable-error'],
  preparing: ['ready', 'reviewing', 'recoverable-error'],
  ready: ['watching', 'reviewing', 'recoverable-error'],
  watching: ['finished', 'reviewing', 'recoverable-error'],
  finished: ['watching', 'selecting'],
  'recoverable-error': ['selecting', 'reviewing', 'preparing', 'watching'],
} as const satisfies Readonly<Record<AppFlow['stage'], readonly AppFlow['stage'][]>>;
