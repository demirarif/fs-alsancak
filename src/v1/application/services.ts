import type { PlayerId, Result, Revision, RunId, TeamId } from '../domain/common.js';
import type { MatchSnapshot } from '../domain/match.js';
import type { PlayerCatalog, WeeklyForm } from '../domain/players.js';
import type { ChemistryRulebook } from '../domain/modifiers.js';
import type { FormationId, LineupDraft, LineupEvaluation, LineupSuggestion, SelectionDraft, SlotId } from '../domain/teams.js';
import type { SimulationOutput } from '../engine/contracts.js';

export type SelectionCommand =
  | { readonly kind: 'activate-team'; readonly teamId: TeamId }
  | { readonly kind: 'add-player'; readonly playerId: PlayerId }
  | { readonly kind: 'remove-player'; readonly teamId: TeamId; readonly playerId: PlayerId }
  | { readonly kind: 'clear-team'; readonly teamId: TeamId }
  | { readonly kind: 'rename-team'; readonly teamId: TeamId; readonly name: string }
  | { readonly kind: 'set-week'; readonly weekId: string }
  | { readonly kind: 'set-barkuz-goalkeeper'; readonly enabled:boolean };

export interface SelectionService {
  apply(draft: SelectionDraft, command: SelectionCommand, catalog: PlayerCatalog): Result<SelectionDraft>;
  validateForLineups(draft: SelectionDraft, catalog: PlayerCatalog): Result<void>;
}

export type LineupCommand =
  | { readonly kind: 'change-formation'; readonly teamId: TeamId; readonly formationId: FormationId }
  | { readonly kind: 'swap-slots'; readonly teamId: TeamId; readonly firstSlot: SlotId; readonly secondSlot: SlotId }
  | { readonly kind: 'apply-suggestion'; readonly teamId: TeamId; readonly suggestion: LineupSuggestion };

export interface LineupContext {
  readonly selection: SelectionDraft;
  readonly catalog: PlayerCatalog;
  readonly rulebook: ChemistryRulebook;
  readonly forms: readonly WeeklyForm[];
}

export interface LineupService {
  apply(draft: LineupDraft, command: LineupCommand, context: LineupContext): Result<LineupDraft>;
  evaluate(draft: LineupDraft, context: LineupContext): LineupEvaluation;
  validateForMatch(draft: LineupDraft, context: LineupContext): Result<void>;
}

export interface OptimizationRequest {
  readonly runId: RunId;
  readonly selectionRevision: Revision;
  readonly context: LineupContext;
  readonly formations: readonly FormationId[];
}

export interface OptimizationResult {
  readonly runId: RunId;
  readonly selectionRevision: Revision;
  readonly initialDraft: LineupDraft;
  readonly suggestions: Readonly<Record<TeamId, readonly LineupSuggestion[]>>;
  readonly evaluation: LineupEvaluation;
}

export interface LineupOptimizer {
  suggest(request: OptimizationRequest, signal: AbortSignal): Promise<Result<OptimizationResult>>;
}

export interface MatchSnapshotFactory {
  create(draft: LineupDraft, context: LineupContext, seed: number): Result<MatchSnapshot>;
}

/** Worker gateway: correlation, cancellation and chunk backpressure live here. */
export interface SimulationGateway {
  run(runId: RunId, snapshot: MatchSnapshot, signal: AbortSignal): AsyncIterable<SimulationOutput>;
}
