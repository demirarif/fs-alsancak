import type { MatchEvent } from '../domain/match.js';
import { ENGINE_TUNING as T } from '../config/engine-tuning.ts';

/** Packed 10 Hz samples. Frame: [t, ballX, ballY, ballZ, ballState, possession, score1, score2, ...players × PLAYER_CHANNELS]. */
export const FRAME_HEADER = 8;
export const PLAYER_CHANNELS = ['x', 'z', 'heading', 'action', 'actionProgress', 'actionParam'] as const;
export const frameStride = (players: number) => FRAME_HEADER + players * PLAYER_CHANNELS.length;
export const SAMPLE_HZ = T.tickHz / T.snapshotEvery;
export const BALL_STATE = { ground: 0, air: 1, feet: 2, hands: 3, dead: 4 } as const;
/** Animation intent recorded by the engine; the renderer never decides football. */
export const ACTION = { none: 0, pass: 1, shot: 2, receive: 3, touch: 4, tackle: 5, header: 6, throw: 7, dive: 8, catch: 9, celebrate: 10, fall: 11, hold: 12, slide: 13 } as const;

export interface HalfReplay {
  readonly half: 1 | 2;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly playerOrder: readonly string[];
  readonly teams: readonly (0 | 1)[];
  readonly frameCount: number;
  readonly samples: Float32Array;
  /** Ball contact points between samples (kick, header, control, rebound, bounce) as [t, x, y, z] quadruples in time order: the view
   * draws the ball through them, so a contact that falls between two 10 Hz samples is not cut off by straight-line interpolation. */
  readonly ballKeys: Float32Array;
  /** Times the ball was put somewhere new for a restart (out of play → line or flag, net → centre spot): never drawn travelling there. */
  readonly ballCuts: Float32Array;
  readonly events: readonly MatchEvent[];
}

// Viewing edits (real-speed highlights, the Instagram reel) live in src/match/highlight-edit.js and reel-plan.js.
