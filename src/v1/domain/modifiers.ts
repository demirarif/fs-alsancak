import type { PlayerId, RuleId, SourceRef, TeamId } from './common.js';
import type { Attribute, BaseAttributes, WeeklyForm } from './players.js';

export type ModifierLayer = 'weekly-form' | 'pair' | 'atmosphere' | 'matchup' | 'fatigue' | 'score-state' | 'guest-adaptation' | 'position-fit';

export interface ModifierTriggerContext {
  readonly phase: 'build-up' | 'attack' | 'defense' | 'transition' | 'restart';
  readonly teamId: TeamId;
  readonly playerId: PlayerId;
  readonly seconds: number;
}

export type ModifierEffect =
  | { readonly kind: 'attribute-delta'; readonly attribute: Attribute; readonly delta: number }
  | { readonly kind: 'attribute-set'; readonly attribute: Attribute; readonly value: number }
  | { readonly kind: 'team-atmosphere'; readonly delta: number }
  | { readonly kind: 'receiver-utility-factor'; readonly factor: number }
  | { readonly kind: 'first-touch-error'; readonly relativeFactor: number; readonly maxAddedProbability: number };

export interface AppliedModifier {
  readonly ruleId: RuleId;
  readonly layer: ModifierLayer;
  readonly playerIds: readonly PlayerId[];
  readonly explanation: string;
  readonly effect: ModifierEffect;
  readonly precedence: number;
  readonly capGroup: 'normal' | 'locked';
  /** The pair and trio versions of a bonus share an exclusion group. */
  readonly exclusionGroup?: string;
}

export interface EffectiveAttributes {
  readonly playerId: PlayerId;
  readonly base: BaseAttributes;
  readonly values: Readonly<Record<Attribute, number>>;
  readonly applied: readonly AppliedModifier[];
  readonly weeklyForm: WeeklyForm | null;
}

export interface RulebookDecisions {
  readonly effectiveAttributeCeiling: 'preserve-locked-overflow';
  readonly normalBonusLimit: number;
  readonly normalPenaltyLimit: number;
  readonly baseAttributeFloor: number;
  readonly baseAttributeCeiling: number;
  readonly lockedOverridesAppliedLast: true;
  readonly stabilizeBeforeAtmosphereThreshold: true;
  readonly maximumMildNegativeOffsetsPerTeam: number;
  readonly erenEnvironmentStacksWithTrioWithinCap: true;
}

export type RuleTrigger =
  | { readonly kind: 'same-team'; readonly playerIds: readonly PlayerId[]; readonly requireLinkedRoles: boolean }
  | { readonly kind: 'opposing-teams'; readonly playerIds: readonly PlayerId[] }
  | { readonly kind: 'phase'; readonly phase: ModifierTriggerContext['phase'] }
  | { readonly kind: 'atmosphere'; readonly state: 'good' | 'bad' }
  | { readonly kind: 'score'; readonly state: 'leading' | 'trailing' | 'close-late' }
  | { readonly kind: 'matchup'; readonly predicateId: string }
  | { readonly kind: 'behavior'; readonly predicateId: string }
  | { readonly kind: 'all'; readonly triggers: readonly RuleTrigger[] };

export interface RuleDefinition {
  readonly id: RuleId;
  readonly description?: string;
  readonly source: SourceRef | null;
  readonly subjectPlayerIds: readonly PlayerId[];
  readonly layer: ModifierLayer;
  readonly trigger: RuleTrigger;
  readonly effects: readonly ModifierEffect[];
  readonly capGroup: AppliedModifier['capGroup'];
  readonly exclusionGroup?: string;
}

export interface PlayerChemistryProfile {
  readonly playerId: PlayerId;
  readonly stabilizer: 'none' | 'supportive' | 'strong';
  readonly negativeRisk: 'none' | 'mild' | 'moderate' | 'strong' | 'conditional';
  readonly sensitiveToAtmosphere: boolean;
  /** Names of versioned behavior predicates, never automatically active risks. */
  readonly behaviorPredicateIds: readonly string[];
  readonly source: SourceRef;
}

export interface ChemistryRulebook {
  readonly version: string;
  readonly rules: readonly RuleDefinition[];
  readonly profiles: readonly PlayerChemistryProfile[];
}

export interface GuestAdaptationSettings {
  readonly receiverUtilityFactor: number;
  readonly attributeDeltas: Readonly<Partial<Record<Attribute, number>>>;
  readonly firstTouchErrorFactor: number;
  readonly maxAddedFirstTouchErrorProbability: number;
  readonly goalkeeperScope: 'distribution-and-communication';
}
