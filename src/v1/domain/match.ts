import type { MatchId, PlayerId, Point2, Point3, RuleId, TeamId, VersionStamp, WeekId } from './common.js';
import type { Attribute, Player, WeeklyForm } from './players.js';
import type { Lineup } from './teams.js';
import type { AppliedModifier, ChemistryRulebook, GuestAdaptationSettings, RulebookDecisions } from './modifiers.js';

export interface MatchSettings {
  readonly lengthSeconds: number;
  readonly pitchLengthMeters: number;
  readonly pitchWidthMeters: number;
  readonly seed: number;
  readonly tuningProfileId: string;
}

export interface MatchTuningSnapshot {
  readonly profileId: string;
  readonly version: string;
  readonly tickHz: number;
  readonly decisionHz: number;
  readonly ballSubstepsPerTick: number;
  readonly snapshotHz: number;
  readonly guestAdaptation: GuestAdaptationSettings;
  /** Validated against that engine version's coefficient schema. */
  readonly engineCoefficients: Readonly<Record<string, number>>;
}

/** Immutable, serializable input. No live catalog references cross this boundary. */
export interface MatchSnapshot {
  readonly id: MatchId;
  readonly createdAt: string;
  readonly versions: VersionStamp;
  readonly weekId: WeekId;
  readonly settings: MatchSettings;
  readonly players: readonly Player[];
  readonly lineups: readonly [Lineup, Lineup];
  readonly weeklyForms: readonly WeeklyForm[];
  readonly rulebook: ChemistryRulebook;
  readonly rulebookDecisions: RulebookDecisions;
  readonly tuning: MatchTuningSnapshot;
}

export interface MatchScore { readonly 'team-1': number; readonly 'team-2': number }
export type MatchPeriod = 'first-half' | 'half-time' | 'second-half' | 'full-time';
export type MatchPhase = 'build-up' | 'attack' | 'defense' | 'transition' | 'restart';

export type FootballEventKind = 'kick-off' | 'pass' | 'through-pass' | 'diagonal-pass' | 'reception'
  | 'bad-touch' | 'miscommunication' | 'carry' | 'tackle' | 'interception' | 'shot'
  | 'save' | 'goal' | 'offside' | 'foul' | 'throw-in' | 'corner' | 'goal-kick'
  | 'free-kick' | 'penalty' | 'half-time' | 'full-time'
  | 'cross' | 'header' | 'clearance' | 'beat' | 'mood' | 'keeper-claim' | 'tactics';

export interface EventReason {
  readonly attributeContributions: Readonly<Partial<Record<Attribute, number>>>;
  readonly ruleIds: readonly RuleId[];
  readonly appliedModifiers: readonly AppliedModifier[];
  readonly pressure: number;
  readonly distanceMeters: number;
  readonly successProbability?: number;
  readonly sampledValue?: number;
  readonly explanation: string;
}

export interface MatchEvent {
  readonly id: string;
  readonly tick: number;
  /** Match clock seconds (0–3600 for the user's 60-minute match). */
  readonly seconds: number;
  /** 0–1: drives the 10-minute smart playback and the vertical highlight reel. */
  readonly importance: number;
  readonly outcome?: string;
  readonly kind: FootballEventKind;
  readonly teamId: TeamId | null;
  readonly actorId: PlayerId | null;
  readonly targetPlayerId: PlayerId | null;
  readonly origin: Point3;
  readonly destination: Point3;
  readonly reason: EventReason;
}

export interface PlayerPose {
  readonly playerId: PlayerId;
  readonly teamId: TeamId;
  readonly position: Point2;
  readonly heading: number;
  readonly velocity: Point2;
  readonly action: 'idle' | 'run' | 'sprint' | 'pass' | 'receive' | 'shoot' | 'tackle' | 'save' | 'hold';
  readonly actionProgress: number;
  readonly staminaFraction: number;
}

/** Renderer input. IDs replace the prototype's hardcoded array indices. */
export interface MatchFrame {
  readonly tick: number;
  readonly simulationSeconds: number;
  readonly period: MatchPeriod;
  readonly phase: MatchPhase;
  readonly score: MatchScore;
  readonly poses: readonly PlayerPose[];
  readonly ball: { readonly position: Point3; readonly velocity: Point3; readonly state: 'ground' | 'flight' | 'held' | 'out' };
  readonly possession: { readonly teamId: TeamId; readonly playerId: PlayerId | null } | null;
  readonly attackDirection: Readonly<Record<TeamId, 1 | -1>>;
  readonly relevantEventIds: readonly string[];
  readonly involvement: readonly { readonly playerId: PlayerId; readonly reason: 'carrier' | 'receiver' | 'presser' | 'duel' | 'support' | 'conceded'; readonly priority: number }[];
}

export interface MatchSummary {
  readonly matchId: MatchId;
  readonly score: MatchScore;
  readonly statistics: Readonly<Record<TeamId, {
    readonly shots: number; readonly goals: number; readonly passes: number;
    readonly completedPasses: number; readonly possessionSeconds: number;
  }>>;
}
