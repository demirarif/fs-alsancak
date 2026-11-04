/** Serializable identifiers; display names must never act as identity. */
export type PlayerId = string;
export type MatchId = string;
export type RunId = string;
export type RuleId = string;
export type TeamId = 'team-1' | 'team-2';
export type WeekId = string;
export type Revision = number;

export interface Point2 { readonly x: number; readonly z: number }
export interface Point3 extends Point2 { readonly y: number }

export interface VersionStamp {
  readonly schema: number;
  readonly catalog: string;
  readonly rules: string;
  readonly engine: string;
  readonly tuning: string;
}

export interface Problem {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
  readonly playerIds?: readonly PlayerId[];
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };

export interface SourceRef {
  readonly file: string;
  readonly section: string;
  readonly detail?: string;
}
