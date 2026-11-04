import type { Attribute } from '../domain/players.js';
import type { GuestAdaptationSettings, RulebookDecisions } from '../domain/modifiers.js';

export const ARCHITECTURE_VERSION = 1;

export const ATTRIBUTE_GROUPS = {
  physical: ['speed', 'stamina', 'strength'],
  /** Label in UI: "Teknik / oyun". All remaining attributes are covered. */
  game: ['passing', 'vision', 'control', 'dribbling', 'shooting', 'finishing', 'defending', 'pressing', 'positioning'],
} as const satisfies Record<string, readonly Attribute[]>;

export const GUEST_POLICY = {
  version: 'guest-adaptation-v1',
  percent: { min: 60, max: 120, step: 1, initial: 95 },
  baseAttributes: { min: 1, max: 10, precision: 2 },
  goalkeeperRating: { min: 0, max: 100, precision: 2 },
  copySuitability: true,
  inheritNamedChemistry: false,
  inheritWeeklyForm: false,
  automaticAdaptationDecay: false,
  adaptation: {
    /** Candidate utility factor before normalization, never pass prohibition. */
    receiverUtilityFactor: .94,
    attributeDeltas: { passing: -.3, vision: -.3, positioning: -.2 },
    /** p(error) = min(1, p0*factor, p0+maxAddedProbability). */
    firstTouchErrorFactor: 1.08,
    maxAddedFirstTouchErrorProbability: .03,
    /** No invented GK attributes or direct save-rating penalty. */
    goalkeeperScope: 'distribution-and-communication',
  } satisfies GuestAdaptationSettings,
} as const;

/** Explicit application decisions for ambiguities in the source archive. */
export const RULEBOOK_DECISIONS = {
  effectiveAttributeCeiling: 'preserve-locked-overflow',
  normalBonusLimit: 1,
  normalPenaltyLimit: -1,
  baseAttributeFloor: 1,
  baseAttributeCeiling: 10,
  lockedOverridesAppliedLast: true,
  stabilizeBeforeAtmosphereThreshold: true,
  maximumMildNegativeOffsetsPerTeam: 1,
  erenEnvironmentStacksWithTrioWithinCap: true,
} as const satisfies RulebookDecisions;

/** Summary of the engine as built; the working values live in ENGINE_TUNING (engine-tuning.ts). User decision: 60-minute match (2×30). */
export const SIMULATION_POLICY = {
  tickHz: 30,
  decisionHz: 5,
  ballSubstepsPerTick: 2,
  snapshotHz: 10,
  replayChunkSeconds: 30,
  initialMatchSeconds: 60 * 60,
  pitch: { length: 105, width: 68 },
  seedRequired: true,
  workerRequired: true,
} as const;

/** Calibration inputs, not prescribed outcomes, score clamps or guarantees. */
export const SCORE_CALIBRATION = {
  version: 'high-event-amateur-v1',
  observedScores: [[4, 2], [4, 3], [4, 4], [5, 5], [7, 5], [9, 7], [11, 7], [16, 0]],
  alsoPlausible: [[3, 3]],
  initialTargetMedianTotalGoals: 12,
  hardMinimumScore: null,
  hardMaximumScore: null,
  validation: 'seeded-batch-distribution-and-match-events',
} as const;

export const CAMERA_POLICY = {
  defaultMode: 'auto-follow',
  defaultPreset: 'broadcast',
  userOrbitPreservedDuringFollow: true,
  panSwitchesToFreeMode: true,
  resumeFollow: 'explicit-button',
  elevationDegrees: { min: 6, max: 82 },
  distanceMeters: { min: 10, max: 190 },
  verticalFovDegrees: { min: 12, max: 72 },
  /** Screens narrower than this keep this aspect's vertical coverage: the picture narrows instead of growing tall (a tall broadcast frame
   * was mostly sky and stands). The wide view alone still steps back to keep the whole pitch. */
  portraitFrameAspect: 1.25,
  automaticFocus: 'ball-and-active-play',
  maximumLabels: 5,
  concededKeeperLabelSeconds: 3,
  /** Presentation-time easing constants in seconds; never simulation time. */
  smoothing: { target: .38, rig: .6, transition: .5, transitionSeconds: 1.6 },
  ballLeadSeconds: .45,
  /** Initial tuning, not user-given numbers. Pitch: x along length (goals at ±52.5), z across. */
  presets: {
    // Main-stand gantry at the halfway line; slides on a rail and tightens toward the attacked goal.
    // pitchBiasZ: the aim stays this far in from the touchlines, so a throw-in keeps the ball in the picture with mostly pitch around it.
    broadcast: { cameraHeight: 24, cameraZ: 72, railFollow: { midfield: .42, finalThird: .62 }, railLimit: 34, horizontalFovDegrees: { midfield: 40, finalThird: 31 }, pitchBiasZ: 28,
      // Portrait screens (2026-11-04): a higher, closer gantry looking more steeply down, so the pitch rather than sky and stands fills a
      // tall picture; blended in as the screen narrows from aspect `blend[0]` to `blend[1]`.
      portrait: { cameraHeight: 36, cameraZ: 52, railFollow: .85, blend: [1.15, .75] } },
    // Fixed high corner over the near-left flag, whole pitch in view; the aim drifts toward the ball.
    wide: { camera: { x: -84, y: 60, z: 78 }, targetFollow: { x: .4, z: .25 }, horizontalFovDegrees: 64 },
    // Crane behind the goal being attacked; ends switch with hysteresis and swing over the main stand.
    // 24 m back and 10.5 m up keeps the near goal frame in the lower part of the picture and clears the end stand.
    goal: { behindGoalMeters: 24, cameraHeight: 10.5, lateralFollow: .3, minimumLookAheadMeters: 9, switchHysteresisMeters: 8, horizontalFovDegrees: 62 },
  },
  /** Camera clearance over turf and the low stands built in stadium.js. */
  clearance: { turf: 1.6, sideStandStartZ: 39, sideStandSlope: .45, sideWallZ: 51.2, sideWallTop: 10.5, endStandStartX: 58, endStandTop: 6.5, aboveStand: 2.5 },
} as const;
