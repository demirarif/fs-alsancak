import type { PlayerId, Problem, TeamId } from '../../domain/common.js';
import type { Player } from '../../domain/players.js';
import type { SelectionDraft } from '../../domain/teams.js';
import type { SelectionCommand } from '../../application/services.js';

export interface InventoryCard {
  readonly player: Player;
  readonly assignedTo: TeamId | null;
  readonly canAddToActiveTeam: boolean;
  readonly unavailableReason: string | null;
}

export interface TeamSelectionViewModel {
  readonly draft: SelectionDraft;
  readonly query: string;
  readonly positionFilter: string | null;
  readonly inventory: readonly InventoryCard[];
  readonly problems: readonly Problem[];
  readonly readyForSuggestions: boolean;
}

/** Card click adds; the separate info affordance opens the player profile. */
export type TeamSelectionIntent =
  | SelectionCommand
  | { readonly kind: 'search'; readonly query: string }
  | { readonly kind: 'filter-position'; readonly position: string | null }
  | { readonly kind: 'open-profile'; readonly playerId: PlayerId }
  | { readonly kind: 'open-guest-editor' }
  | { readonly kind: 'request-suggestions' };
