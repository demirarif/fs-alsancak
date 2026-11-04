import type { PlayerId, Point2 } from '../domain/common.js';
import type { Player } from '../domain/players.js';
import type { MatchEvent, MatchFrame, MatchSnapshot } from '../domain/match.js';
import type { ReplaySource } from '../domain/replay.js';
import type { CameraIntent } from './camera.js';

export interface LabelPlacement {
  readonly playerId: PlayerId;
  readonly priority: number;
  readonly highlighted: boolean;
}

export interface ContextualLabelPolicy {
  choose(frame: MatchFrame, recentEvents: readonly MatchEvent[], players: readonly Player[]): readonly LabelPlacement[];
}

export interface ScreenRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export interface MatchScenePort {
  loadMatch(snapshot: MatchSnapshot): Promise<void>;
  draw(frame: MatchFrame, presentationDeltaSeconds: number): void;
  setCamera(intent: CameraIntent): void;
  setNamesEnabled(value: boolean): void;
  setHudExclusions(rectangles: readonly ScreenRect[]): void;
  pickPlayer(screenPosition: Point2): PlayerId | null;
  resize(width: number, height: number): void;
  dispose(): void;
}

/** Adapter point for both the current motion study and the future real replay. */
export interface ReplaySceneAdapter {
  attach(source: ReplaySource, scene: MatchScenePort): void;
  detach(): void;
}
