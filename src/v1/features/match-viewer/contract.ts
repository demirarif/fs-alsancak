import type { MatchId } from '../../domain/common.js';
import type { MatchEvent, MatchFrame } from '../../domain/match.js';
import type { PlaybackState } from '../../domain/replay.js';
import type { CameraIntent, CameraState } from '../../rendering/camera.js';

export interface MatchViewerViewModel {
  readonly matchId: MatchId;
  readonly frame: MatchFrame | null;
  readonly playback: PlaybackState;
  readonly camera: CameraState;
  readonly namesEnabled: boolean;
  readonly selectedEvent: MatchEvent | null;
}

export type MatchViewerIntent =
  | { readonly kind: 'play' }
  | { readonly kind: 'pause' }
  | { readonly kind: 'seek'; readonly seconds: number }
  | { readonly kind: 'set-speed'; readonly speed: PlaybackState['speed'] }
  | { readonly kind: 'toggle-names' }
  | { readonly kind: 'inspect-event'; readonly eventId: string }
  | { readonly kind: 'camera'; readonly intent: CameraIntent };
