import type { Point3 } from '../domain/common.js';
import type { MatchFrame } from '../domain/match.js';

export type CameraPreset = 'broadcast' | 'wide' | 'goal';
export type CameraMode = 'auto-follow' | 'free';

export interface CameraOrbit { readonly azimuthRadians: number; readonly elevationRadians: number; readonly distanceMeters: number }

export interface CameraState {
  readonly mode: CameraMode;
  readonly preset: CameraPreset;
  readonly focus: Point3;
  readonly orbit: CameraOrbit;
  /** User values persist while automatic focus follows play. */
  readonly userOffset: { readonly azimuthRadians: number; readonly elevationRadians: number; readonly zoomFactor: number };
  /** Goal end the automatic camera is framing (+1 / -1 along x). */
  readonly attackedEnd: 1 | -1;
  readonly transitioning: boolean;
}

export type CameraIntent =
  | { readonly kind: 'set-preset'; readonly preset: CameraPreset }
  | { readonly kind: 'orbit'; readonly deltaAzimuth: number; readonly deltaElevation: number }
  /** factor > 1 moves away, < 1 moves closer. */
  | { readonly kind: 'zoom'; readonly factor: number }
  /** Screen drag as a fraction of the viewport height; the scene follows the pointer. */
  | { readonly kind: 'pan'; readonly screenDx: number; readonly screenDy: number }
  | { readonly kind: 'resume-follow' }
  | { readonly kind: 'reset-view' };

export interface CameraPose {
  readonly position: Point3;
  readonly target: Point3;
  readonly verticalFovDegrees: number;
}

/** What the camera follows. The motion study and the real replay both reduce to this. */
export interface CameraSubject {
  readonly ball: Point3;
  readonly ballVelocity?: Point3;
  /** Goal the side in possession attacks; null lets the director infer it from ball travel. */
  readonly attackedEnd?: 1 | -1 | null;
}

export function cameraSubjectFromFrame(frame: MatchFrame): CameraSubject {
  const team = frame.possession?.teamId;
  return { ball: frame.ball.position, ballVelocity: frame.ball.velocity, attackedEnd: team ? frame.attackDirection[team] : null };
}

/** Renderer-only: camera time is presentation time, never simulation time. */
export interface CameraDirector {
  apply(intent: CameraIntent): void;
  update(subject: CameraSubject, presentationDeltaSeconds: number, aspect: number): CameraPose;
  getState(): CameraState;
}
