import type { PlayerId, SourceRef, WeekId } from './common.js';

export const ATTRIBUTE_KEYS = [
  'speed', 'stamina', 'strength', 'passing', 'vision', 'control',
  'dribbling', 'shooting', 'finishing', 'defending', 'pressing', 'positioning',
] as const;
export type Attribute = typeof ATTRIBUTE_KEYS[number];
/** Base values: [1,10], decimals retained. Effective values are a separate type. */
export type BaseAttributes = Readonly<Record<Attribute, number>>;
export type Position = 'GK' | 'CB' | 'FB' | 'CM' | 'CAM' | 'W' | 'ST';
export type OutfieldPosition = Exclude<Position, 'GK'>;
export type PositionSuitability = Readonly<Record<Position, number>>;

export type GuestScaling =
  | { readonly mode: 'overall'; readonly overallPercent: number }
  | { readonly mode: 'split'; readonly physicalPercent: number; readonly gamePercent: number };

export type PlayerOrigin =
  | { readonly kind: 'catalog'; readonly source: SourceRef }
  | {
    readonly kind: 'guest';
    readonly referencePlayerId: PlayerId;
    readonly referenceCatalogVersion: string;
    readonly scaling: GuestScaling;
    readonly createdAt: string;
    /** Always unfamiliar under the requested v1 policy, including later weeks. */
    readonly adaptation: 'unfamiliar';
  };

export interface KeeperDistributionAbility {
  readonly id:'accurate-long-wide-distribution';
  readonly passing:number;
  readonly vision:number;
  readonly minimumDistanceMeters:number;
  readonly targetBeyondHalfway:true;
  readonly targetWideFraction:number;
}
interface PlayerBase {
  readonly id: PlayerId;
  readonly name: string;
  readonly origin: PlayerOrigin;
  readonly suitability: PositionSuitability;
  readonly preferredPositions: readonly Position[];
  readonly notes: readonly { readonly text: string; readonly source?: SourceRef }[];
  readonly archived: boolean;
  /** Match selection overlay only; never replaces the source player. */
  readonly goalkeeperReferenceId?: 'yusuf';
  readonly specialAbilities?: readonly KeeperDistributionAbility[];
}

export interface OutfieldPlayer extends PlayerBase {
  readonly kind: 'outfield';
  readonly attributes: BaseAttributes;
  readonly mainPosition: OutfieldPosition;
  /** Recomputed to two decimals on import/guest creation; no stale scaled ratings. */
  readonly positionRatings: Readonly<Record<OutfieldPosition, number>>;
}

export interface GoalkeeperPlayer extends PlayerBase {
  readonly kind: 'goalkeeper';
  readonly goalkeeperRating: number;
  readonly mainPosition: 'GK';
  // The source has no 12-attribute GK breakdown. Do not invent it.
}

export type Player = OutfieldPlayer | GoalkeeperPlayer;

export type GuestPlayerRequest =
  | { readonly kind: 'outfield'; readonly name: string; readonly referencePlayerId: PlayerId; readonly scaling: GuestScaling }
  | { readonly kind: 'goalkeeper'; readonly name: string; readonly referencePlayerId: PlayerId; readonly scaling: Extract<GuestScaling, { mode: 'overall' }> };

export interface PlayerCatalog {
  readonly schemaVersion: number;
  readonly version: string;
  readonly players: readonly Player[];
  readonly source: SourceRef;
  readonly importedAt: string;
}

/** Future weekly input. It never overwrites catalog attributes or old matches. */
export interface WeeklyForm {
  readonly playerId: PlayerId;
  readonly weekId: WeekId;
  readonly version: number;
  readonly attributeDeltas: Readonly<Partial<Record<Attribute, number>>>;
  readonly goalkeeperDelta?: number;
  readonly note?: string;
}
