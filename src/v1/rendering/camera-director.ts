import type { Point3 } from '../domain/common.js';
import type { CameraDirector, CameraIntent, CameraPose, CameraPreset, CameraState, CameraSubject } from './camera.js';
import { CAMERA_POLICY } from '../config/defaults.ts';

/** Spherical rig around a ground target: azimuth 0 looks from +z (main stand) toward -z. */
interface Rig { target: { x: number; y: number; z: number }; azimuth: number; elevation: number; distance: number; hfov: number }
interface Offset { azimuth: number; elevation: number; zoom: number }

const P = CAMERA_POLICY, DEG = Math.PI / 180, TAU = Math.PI * 2;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a: number) => { const r = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI; return r === -Math.PI ? Math.PI : r; };
const ELEVATION = { min: P.elevationDegrees.min * DEG, max: P.elevationDegrees.max * DEG };
const zero = (): Offset => ({ azimuth: 0, elevation: 0, zoom: 1 });
const copy = (r: Rig): Rig => ({ ...r, target: { ...r.target } });

/** Long swings (goal end switch) go over the main stand instead of behind the far stand. */
function azimuthStep(from: number, to: number) {
  let d = wrap(to - from);
  if (Math.abs(d) > 150 * DEG) { const alt = d - Math.sign(d) * TAU; if (Math.abs(wrap(from + alt / 2)) < Math.abs(wrap(from + d / 2))) d = alt; }
  return d;
}

function fromPositions(position: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }, hfov: number): Rig {
  const dx = position.x - target.x, dy = position.y - target.y, dz = position.z - target.z, horizontal = Math.hypot(dx, dz);
  return { target: { ...target }, azimuth: Math.atan2(dx, dz), elevation: Math.atan2(dy, horizontal), distance: Math.hypot(horizontal, dy), hfov };
}

/** Lowest allowed camera height at a ground position: turf, then the low stands and their back walls. */
export function cameraClearance(x: number, z: number) {
  const c = P.clearance, ax = Math.abs(x), az = Math.abs(z);
  let min: number = c.turf;
  if (az > c.sideStandStartZ) min = Math.max(min, (az - c.sideStandStartZ) * c.sideStandSlope + c.aboveStand);
  if (az > c.sideWallZ) min = Math.max(min, c.sideWallTop);
  if (ax > c.endStandStartX) min = Math.max(min, c.endStandTop);
  return min;
}

/** The stands a camera stands in or behind (side ±1 along z, end ±1 along x; 0 none): they would only fill the foreground, so the view
 * leaves them out, as a broadcast never shows its own stand. */
export function standsBehindCamera(position: { x: number; z: number }): { side: -1 | 0 | 1; end: -1 | 0 | 1 } {
  const c = P.clearance;
  return { side: position.z > c.sideStandStartZ ? 1 : position.z < -c.sideStandStartZ ? -1 : 0, end: position.x > c.endStandStartX ? 1 : position.x < -c.endStandStartX ? -1 : 0 };
}

export function createCameraDirector(initial: CameraPreset = P.defaultPreset): CameraDirector {
  let preset: CameraPreset = initial, mode: 'auto-follow' | 'free' = 'auto-follow', end: 1 | -1 = 1, endKnown = false;
  let base: Rig | null = null, free: Rig | null = null, offset = zero(), shown = zero(), transition = 0, aspect = 16 / 9;
  // The user's rotation relative to the preset, carried through free mode so resume restores it.
  let freeOffset: Offset | null = null;
  let focus: Point3 = { x: 0, y: 0, z: 0 };

  function desired(f: { x: number; z: number }): Rig {
    if (preset === 'broadcast') {
      // On a portrait screen the gantry blends toward a higher, closer position that looks more steeply down at the play.
      const b = P.presets.broadcast, t = smoothstep(20, 42, Math.abs(f.x)), q = smoothstep(b.portrait.blend[0], b.portrait.blend[1], aspect);
      const railX = clamp(f.x * lerp(lerp(b.railFollow.midfield, b.railFollow.finalThird, t), b.portrait.railFollow, q), -b.railLimit, b.railLimit);
      return fromPositions({ x: railX, y: lerp(b.cameraHeight, b.portrait.cameraHeight, q), z: lerp(b.cameraZ, b.portrait.cameraZ, q) }, { x: f.x, y: 0, z: clamp(f.z, -b.pitchBiasZ, b.pitchBiasZ) },
        lerp(b.horizontalFovDegrees.midfield, b.horizontalFovDegrees.finalThird, t) * DEG);
    }
    if (preset === 'wide') {
      const w = P.presets.wide;
      return fromPositions(w.camera, { x: f.x * w.targetFollow.x, y: 0, z: f.z * w.targetFollow.z }, w.horizontalFovDegrees * DEG);
    }
    const g = P.presets.goal, goalX = end * 52.5, lookX = end > 0 ? Math.min(f.x, goalX - g.minimumLookAheadMeters) : Math.max(f.x, goalX + g.minimumLookAheadMeters);
    return fromPositions({ x: end * (52.5 + g.behindGoalMeters), y: g.cameraHeight, z: f.z * g.lateralFollow }, { x: lookX, y: 0, z: f.z }, g.horizontalFovDegrees * DEG);
  }
  /** The rig currently on screen, with user offsets folded in. */
  function current(): Rig {
    if (mode === 'free' && free) return copy(free);
    const b = base ?? desired(focus);
    return { target: { ...b.target }, azimuth: wrap(b.azimuth + shown.azimuth), elevation: clamp(b.elevation + shown.elevation, ELEVATION.min, ELEVATION.max),
      distance: clamp(b.distance * shown.zoom, P.distanceMeters.min, P.distanceMeters.max), hfov: b.hfov };
  }
  /** Absorb the on-screen view into the smoothed base so switching never jumps. */
  function settleFromScreen() { base = current(); mode = 'auto-follow'; free = null; freeOffset = null; offset = zero(); shown = zero(); transition = P.smoothing.transitionSeconds; }
  function toPose(rig: Rig): CameraPose {
    // Portrait screens keep the vertical coverage of a P.portraitFrameAspect screen (the picture narrows); the wide view keeps the whole pitch.
    const frameAspect = preset === 'wide' ? aspect : Math.max(aspect, P.portraitFrameAspect);
    const tanHalf = Math.tan(rig.hfov / 2) / frameAspect, maxV = P.verticalFovDegrees.max * DEG / 2;
    // Narrow screens keep the horizontal coverage by stepping back instead of an extreme lens.
    const vHalf = clamp(Math.atan(tanHalf), P.verticalFovDegrees.min * DEG / 2, maxV), distance = rig.distance * Math.max(1, tanHalf / Math.tan(vHalf));
    const horizontal = Math.cos(rig.elevation) * distance;
    const position = { x: rig.target.x + Math.sin(rig.azimuth) * horizontal, y: rig.target.y + Math.sin(rig.elevation) * distance, z: rig.target.z + Math.cos(rig.azimuth) * horizontal };
    position.y = Math.max(position.y, cameraClearance(position.x, position.z));
    return { position, target: { ...rig.target }, verticalFovDegrees: vHalf * 2 / DEG };
  }

  return {
    apply(intent: CameraIntent) {
      switch (intent.kind) {
        case 'set-preset': preset = intent.preset; settleFromScreen(); break;
        case 'reset-view': settleFromScreen(); break;
        case 'resume-follow': {
          if (mode !== 'free' || !free) break;
          const b = desired(focus), view = free, kept = freeOffset ?? zero();
          // Start exactly where the free view is, then ease back to the user's own rotation of the preset.
          shown = { azimuth: azimuthStep(b.azimuth, view.azimuth), elevation: view.elevation - b.elevation, zoom: view.distance / b.distance };
          offset = { azimuth: kept.azimuth, elevation: clamp(b.elevation + kept.elevation, ELEVATION.min, ELEVATION.max) - b.elevation,
            zoom: clamp(b.distance * kept.zoom, P.distanceMeters.min, P.distanceMeters.max) / b.distance };
          base = { ...b, target: { ...view.target }, hfov: view.hfov }; mode = 'auto-follow'; free = null; freeOffset = null; transition = P.smoothing.transitionSeconds; break;
        }
        case 'orbit':
          if (mode === 'free' && free) {
            const elevation = clamp(free.elevation + intent.deltaElevation, ELEVATION.min, ELEVATION.max);
            if (freeOffset) { freeOffset.azimuth = wrap(freeOffset.azimuth + intent.deltaAzimuth); freeOffset.elevation += elevation - free.elevation; }
            free.azimuth = wrap(free.azimuth + intent.deltaAzimuth); free.elevation = elevation; break;
          }
          {
            const b = base ?? desired(focus), elevation = clamp(b.elevation + offset.elevation + intent.deltaElevation, ELEVATION.min, ELEVATION.max) - b.elevation;
            offset.azimuth = wrap(offset.azimuth + intent.deltaAzimuth); shown.azimuth = wrap(shown.azimuth + intent.deltaAzimuth);
            shown.elevation += elevation - offset.elevation; offset.elevation = elevation;
          }
          break;
        case 'zoom': {
          const f = clamp(intent.factor, .2, 5);
          if (mode === 'free' && free) { const next = clamp(free.distance * f, P.distanceMeters.min, P.distanceMeters.max); if (freeOffset) freeOffset.zoom *= next / free.distance; free.distance = next; break; }
          // Limits use the preset's settled distance, not a mid-transition one, so the factor stays meaningful.
          const b = desired(focus), zoom = clamp(b.distance * offset.zoom * f, P.distanceMeters.min, P.distanceMeters.max) / b.distance;
          shown.zoom *= zoom / offset.zoom; offset.zoom = zoom; break;
        }
        case 'pan': {
          if (mode !== 'free' || !free) { free = current(); freeOffset = { ...offset }; mode = 'free'; transition = 0; }
          const vHalf = Math.atan(Math.tan(free.hfov / 2) / aspect), scale = 2 * free.distance * Math.tan(clamp(vHalf, .1, 1.2));
          const right = { x: Math.cos(free.azimuth), z: -Math.sin(free.azimuth) }, forward = { x: -Math.sin(free.azimuth), z: -Math.cos(free.azimuth) };
          const across = -intent.screenDx * scale, along = intent.screenDy * scale / Math.max(.35, Math.sin(free.elevation));
          free.target.x = clamp(free.target.x + right.x * across + forward.x * along, -75, 75);
          free.target.z = clamp(free.target.z + right.z * across + forward.z * along, -55, 55);
          break;
        }
      }
    },
    update(subject: CameraSubject, dt: number, nextAspect: number) {
      aspect = nextAspect > 0 ? nextAspect : aspect; dt = clamp(dt, 0, .1);
      const lead = P.ballLeadSeconds, v = subject.ballVelocity;
      focus = { x: clamp(subject.ball.x + (v?.x ?? 0) * lead, -54, 54), y: 0, z: clamp(subject.ball.z + (v?.z ?? 0) * lead, -35, 35) };
      const hysteresis = P.presets.goal.switchHysteresisMeters;
      if (subject.attackedEnd) end = subject.attackedEnd;
      else if (!endKnown) end = focus.x >= 0 ? 1 : -1;
      else if (focus.x > hysteresis) end = 1;
      else if (focus.x < -hysteresis) end = -1;
      endKnown = true;
      const goal = desired(focus);
      if (!base) base = copy(goal);
      else {
        const s = P.smoothing, slow = transition > 0, a = (tau: number) => 1 - Math.exp(-dt / tau);
        const t = a(slow ? s.transition : s.target), r = a(slow ? s.transition : s.rig);
        base.target.x = lerp(base.target.x, goal.target.x, t); base.target.z = lerp(base.target.z, goal.target.z, t);
        base.azimuth = wrap(base.azimuth + azimuthStep(base.azimuth, goal.azimuth) * r);
        base.elevation = lerp(base.elevation, goal.elevation, r); base.distance = lerp(base.distance, goal.distance, r); base.hfov = lerp(base.hfov, goal.hfov, r);
        const o = a(s.transition);
        shown = { azimuth: wrap(shown.azimuth + wrap(offset.azimuth - shown.azimuth) * o), elevation: lerp(shown.elevation, offset.elevation, o), zoom: lerp(shown.zoom, offset.zoom, o) };
        transition = Math.max(0, transition - dt);
      }
      return toPose(current());
    },
    getState(): CameraState {
      const rig = current();
      return { mode, preset, focus, orbit: { azimuthRadians: rig.azimuth, elevationRadians: rig.elevation, distanceMeters: rig.distance },
        userOffset: { azimuthRadians: offset.azimuth, elevationRadians: offset.elevation, zoomFactor: offset.zoom }, attackedEnd: end, transitioning: transition > 0 };
    },
  };
}
