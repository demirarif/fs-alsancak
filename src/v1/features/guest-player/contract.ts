import type { Problem } from '../../domain/common.js';
import type { GuestPlayerRequest, GuestScaling, Player } from '../../domain/players.js';

export interface GuestEditorState {
  readonly name: string;
  readonly referencePlayerId: string | null;
  readonly scaling: GuestScaling;
  readonly referenceKind: Player['kind'] | null;
  readonly preview: Player | null;
  readonly problems: readonly Problem[];
  readonly saving: boolean;
}

export type GuestEditorIntent =
  | { readonly kind: 'choose-reference'; readonly playerId: string }
  | { readonly kind: 'rename'; readonly name: string }
  | { readonly kind: 'change-scaling'; readonly scaling: GuestScaling }
  | { readonly kind: 'save'; readonly request: GuestPlayerRequest }
  | { readonly kind: 'cancel' };

/** Saving inserts into the inventory. Adding to a team remains an explicit click. */
export interface GuestSavedEvent {
  readonly kind: 'guest-saved';
  readonly player: Player;
}
