import type { PlayerId, Problem, TeamId } from '../../domain/common.js';
import type { LineupDraft, LineupEvaluation, LineupSuggestion, SlotId } from '../../domain/teams.js';
import type { LineupCommand } from '../../application/services.js';

export interface LineupReviewViewModel {
  readonly draft: LineupDraft;
  readonly evaluation: LineupEvaluation;
  readonly alternatives: Readonly<Record<TeamId, readonly LineupSuggestion[]>>;
  readonly selectedSlot: { readonly teamId: TeamId; readonly slotId: SlotId } | null;
  readonly problems: readonly Problem[];
  readonly canSimulate: boolean;
}

/** Drag/drop and accessible click-then-click swaps emit the same command. */
export type LineupReviewIntent =
  | LineupCommand
  | { readonly kind: 'select-slot'; readonly teamId: TeamId; readonly slotId: SlotId }
  | { readonly kind: 'open-profile'; readonly playerId: PlayerId; readonly teamId: TeamId }
  | { readonly kind: 'back-to-selection' }
  | { readonly kind: 'prepare-match' };
