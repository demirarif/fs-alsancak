import type { PlayerId, SourceRef } from '../../domain/common.js';
import type { Attribute, Player, Position, WeeklyForm } from '../../domain/players.js';
import type { AppliedModifier } from '../../domain/modifiers.js';

export interface ProfileAttributeRow {
  readonly attribute: Attribute;
  readonly label: string;
  readonly base: number;
  readonly effective: number | null;
  readonly explanation: string | null;
}

export interface ProfileNote {
  readonly text: string;
  readonly origin: 'source' | 'derived' | 'match-context';
  readonly source?: SourceRef;
}

export interface PlayerProfileViewModel {
  readonly playerId: PlayerId;
  readonly player: Player;
  readonly sections: Readonly<Record<'physical' | 'technical' | 'mental' | 'defensive', readonly ProfileAttributeRow[]>> | null;
  readonly positionRatings: readonly { readonly position: Position; readonly suitability: number; readonly rating: number | null }[];
  readonly strengths: readonly ProfileNote[];
  readonly limitations: readonly ProfileNote[];
  readonly chemistry: readonly ProfileNote[];
  readonly activeModifiers: readonly AppliedModifier[];
  readonly weeklyForm: WeeklyForm | null;
  readonly estimatedFromReference: boolean;
}

/** Shared modal: focus trap/restore, Escape/close, scroll within narrow screens. */
export interface PlayerProfileDialog {
  open(model: PlayerProfileViewModel, returnFocusTo: HTMLElement): void;
  update(model: PlayerProfileViewModel): void;
  close(): void;
  dispose(): void;
}
