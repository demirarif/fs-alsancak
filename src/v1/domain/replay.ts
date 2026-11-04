import type { MatchId, VersionStamp } from './common.js';
import type { MatchEvent, MatchFrame, MatchSummary } from './match.js';

/** Packed buffers use a declared channel layout, not guessed array offsets. */
export interface ReplayLayout {
  readonly version: number;
  readonly playerOrder: readonly string[];
  readonly playerChannels: readonly ['x', 'z', 'heading', 'vx', 'vz', 'action', 'actionProgress', 'stamina'];
  readonly ballChannels: readonly ['x', 'y', 'z', 'vx', 'vy', 'vz'];
  readonly sampleHz: number;
}

export interface ReplayChunk {
  readonly matchId: MatchId;
  readonly index: number;
  readonly startTick: number;
  readonly endTick: number;
  readonly layout: ReplayLayout;
  readonly samples: ArrayBuffer;
  /** Possession, score, half, actions and discontinuities are stored explicitly. */
  readonly stateChanges: readonly (Pick<MatchFrame, 'tick' | 'period' | 'phase' | 'score' | 'possession' | 'attackDirection' | 'relevantEventIds' | 'involvement'> & {
    readonly discontinuity: 'none' | 'restart' | 'period-change';
  })[];
  readonly events: readonly MatchEvent[];
}

export interface ReplayManifest {
  readonly matchId: MatchId;
  readonly versions: VersionStamp;
  readonly state: 'writing' | 'complete' | 'failed';
  readonly chunkCount: number;
  readonly durationSeconds: number;
  readonly checksum: string;
  readonly summary: MatchSummary | null;
}

export interface ReplaySource {
  readonly durationSeconds: number;
  readonly metadata: ReplayManifest;
  /** Decode/interpolate from the nearest indexed chunk. No game decisions. */
  frameAt(seconds: number): MatchFrame | null;
  eventsBetween(startSeconds: number, endSeconds: number): readonly MatchEvent[];
  preload(seconds: number): Promise<void>;
  dispose(): void;
}

export interface PlaybackState {
  readonly seconds: number;
  readonly speed: .25 | .5 | 1 | 2 | 4 | 8;
  readonly playing: boolean;
  readonly buffering: boolean;
}
