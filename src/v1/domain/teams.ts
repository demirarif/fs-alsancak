import type { PlayerId, Point2, Revision, TeamId } from './common.js';
import type { Position } from './players.js';

export type FormationId = '4-2-3-1' | '4-3-3' | '4-4-2' | '3-5-2' | '5-3-2';
export type SlotId = string;

export interface FormationSlot {
  readonly id: SlotId;
  readonly label: string;
  readonly position: Position;
  readonly side: 'left' | 'center' | 'right';
  /** Normalized pitch coordinates; x=0 own goal, x=1 opponent goal. */
  readonly anchor: Point2;
  readonly unit: 'goalkeeper' | 'defense' | 'midfield' | 'attack';
}

export interface FormationDefinition {
  readonly id: FormationId;
  readonly label: string;
  readonly slots: readonly FormationSlot[];
}

export interface TeamSelection {
  readonly teamId: TeamId;
  readonly name: string;
  readonly playerIds: readonly PlayerId[];
}

export interface SelectionDraft {
  readonly id: string;
  readonly revision: Revision;
  readonly activeTeamId: TeamId;
  readonly teams: readonly [TeamSelection, TeamSelection];
  readonly weekId: string;
  readonly barkuzGoalkeeper?: boolean;
}

export interface SlotAssignment {
  readonly slotId: SlotId;
  readonly playerId: PlayerId;
}

export interface Lineup {
  readonly teamId: TeamId;
  readonly formationId: FormationId;
  readonly assignments: readonly SlotAssignment[];
  readonly provenance: 'suggested' | 'manual';
}

export interface LineupDraft {
  readonly selectionId: string;
  readonly selectionRevision: Revision;
  readonly revision: Revision;
  readonly lineups: readonly [Lineup, Lineup];
}

export type TeamMetricKey = 'roleStrength' | 'passing' | 'cohesion' | 'defensiveBalance' | 'attackingThreat';

export interface MetricExplanation {
  readonly playerIds: readonly PlayerId[];
  readonly ruleId?: string;
  readonly text: string;
  readonly impact: number;
}

export interface TeamMetric {
  readonly key: TeamMetricKey;
  /** Display scale [0,100]. Not a win probability or a universal stat bonus. */
  readonly score: number;
  readonly explanations: readonly MetricExplanation[];
}

export interface TeamEvaluation {
  readonly teamId: TeamId;
  readonly metrics: Readonly<Record<TeamMetricKey, TeamMetric>>;
  readonly warnings: readonly { readonly playerIds: readonly PlayerId[]; readonly text: string }[];
  /** Pregame threshold only; behavior-triggered negative sources are decided in the match. */
  readonly atmosphere: { readonly state: 'good' | 'neutral'; readonly playerIds: readonly PlayerId[]; readonly text: string };
}

export interface LineupEvaluation {
  readonly revision: Revision;
  readonly teams: readonly [TeamEvaluation, TeamEvaluation];
  readonly evaluatedAgainstOpponent: true;
}

export interface LineupSuggestion {
  readonly lineup: Lineup;
  readonly evaluation: TeamEvaluation;
  readonly explanation: string;
}
