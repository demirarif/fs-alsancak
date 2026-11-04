import { ENGINE_TUNING as T } from '../config/engine-tuning.ts';
import type { RtPlayer } from './runtime.ts';

/* Pure football maths. Team frame: attack toward +X, own goal at X = -52.5. */
const P = T.pitch;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
export const smoothstep = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Abramowitz–Stegun erf; enough for on-target probabilities. */
export function erf(x: number) { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + .3275911 * a); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-a * a)); }

/** Chance of scoring soon from a spot: steep near goal, small reward for progress, wide final third discounted. */
export function threat(X: number, Z: number) {
  const d = Math.hypot(P.halfLength - X, Z);
  return .012 + .52 * Math.exp(-d / 10.5) + .1 * smoothstep(-20, 40, X) - (X > 30 && Math.abs(Z) > 24 ? .03 : 0);
}
/** Cost of losing the ball at a spot: highest in front of the own goal. */
export function lossCost(X: number, Z: number) { return .04 + .32 * Math.exp(-Math.hypot(P.halfLength + X, Z) / 13); }
/** Visible angle of the goal mouth (radians) from a team-frame spot. */
export function goalAngle(X: number, Z: number) {
  const dx = P.halfLength - X;if (dx <= .1) return Math.abs(Z) < P.goalHalfWidth ? Math.PI * .9 : .02;
  return Math.abs(Math.atan2(P.goalHalfWidth - Z, dx) - Math.atan2(-P.goalHalfWidth - Z, dx));
}
export function inBox(X: number, Z: number) { return X > P.halfLength - P.boxDepth && Math.abs(Z) < P.boxHalfWidth; }

export function topSpeed(p: RtPlayer) {
  const l = T.locomotion;
  return (l.topBase + l.topPerSpeed * p.a.speed) * (1 - T.energy.topSpeedLoss * (1 - p.energy));
}
export function acceleration(p: RtPlayer) { return T.locomotion.accelBase + T.locomotion.accelPerSpeed * p.a.speed; }
/** Execution noise grows as the legs go. */
export function fatigueNoise(p: RtPlayer) { return 1 + T.energy.techniqueLoss * (1 - p.energy); }

/** Ground ball: launch speed to cover d metres and still arrive at va under constant rolling deceleration. */
export function groundLaunch(d: number, va: number) { return Math.sqrt(va * va + 2 * T.ball.rollDecel * d); }
export function groundTime(v0: number, s: number) { const a = T.ball.rollDecel, disc = v0 * v0 - 2 * a * s; return disc <= 0 ? Infinity : (v0 - Math.sqrt(disc)) / a; }
/** Ballistic launch reaching horizontal distance d at height yEnd after tf seconds. */
export function loftLaunch(d: number, tf: number, y0: number, yEnd: number) { return { vh: d / tf, vy: (yEnd - y0) / tf + T.ball.gravity * tf / 2 }; }
export function loftFlightTime(d: number) { return clamp(d * T.pass.loftFlightPerMeter + T.pass.loftFlightBase, .8, 2.8); }
