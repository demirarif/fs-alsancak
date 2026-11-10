/** Match engine coefficients. Initial tuning decisions, calibrated with seeded batches (scripts/calibrate-engine.mjs).
 * Every random draw uses the match's seeded stream; nothing here prescribes a score. */
export const ENGINE_TUNING = {
  version: 'engine-v1-tuning-9',
  /** User decision 2026-11-03: 60 minutes (2×30). */
  halfSeconds: 30 * 60,
  tickHz: 30,
  decisionEvery: 6,
  snapshotEvery: 3,
  pitch: { halfLength: 52.5, halfWidth: 34, goalHalfWidth: 3.66, goalHeight: 2.44, boxDepth: 16.5, boxHalfWidth: 20.16, sixDepth: 5.5 },
  /** brake: m/s² a player can stop with (harder than he accelerates), so nobody overruns a line into the boards. */
  locomotion: { topBase: 5.2, topPerSpeed: .38, accelBase: 3.1, accelPerSpeed: .3, jog: .6, walk: .32, carry: .84, separation: .9, brake: 6.5 },
  energy: { sprintDrain: .0021, jogDrain: .00055, recover: .0011, staminaWeight: .09, topSpeedLoss: .14, techniqueLoss: .3 },
  ball: { radius: .11, gravity: 9.81, rollDecel: 1.25, bounce: .45, bounceFriction: .8, carryOffset: .55 },
  control: { base: .885, perControl: .013, fastBall: 10, perFastBall: .02, air: .07, pressure: .08, fatigue: .05, guestFactor: 1.08, guestMax: .03, badTouchSpeed: [2.5, 5.5] },
  intercept: { base: .18, perDefending: .032, perPositioning: .02, fastBall: 10, perFastBall: .02, closeBonus: .18, reach: .85, keeperReach: 1.35 },
  pass: {
    angleSigmaBase: .016, angleSigmaSkill: .052, speedSigma: .06, loftLandingSigma: .035, loftLandingSkill: .06,
    pressureSigma: .7, fatigueSigma: .35, arriveSpeed: [5.5, 9], loftFlightPerMeter: 1 / 19, loftFlightBase: .35,
    seeBase: .25, seePerVision: .075, judgementNoise: .22, windup: .17,
    /** Share of his running speed a kicker keeps through the windup when the ball goes the way he runs (none across his body). */
    strideKeep: .7,
  },
  /** firstTouch: m ahead the receiver's first touch takes the ball (toward goal, along his run) until he decides (2026-11-09). */
  decision: { temperatureBase: .045, temperatureVision: .055, shotSelfishness: 1, carryCommit: [.32, .55], receiveDelayBase: .34, receiveDelayControl: .022, firstTouch: 2.5 },
  shot: {
    /** Headers spray more than struck shots (2026-11-04: with corners back, headers had become the most efficient finish). */
    speedBase: 15.5, speedPerShooting: 1.45, angleSigmaBase: .05, angleSigmaSkill: .055, pressureSigma: .8, headerSigma: 2.6, specialistHeaderSigma: 1.85,
    headerSpeedBase: 8.5, headerSpeedPerAerial: .7, headerAimSpread: 1.2,
    /** Accuracy fades past 16 m; long shots are mostly hopeful. */
    distanceSigma: .14, distanceSigmaFrom: 16,
    /** Metres of error independent of distance: a bobbling ball, a snatched finish. Grows with pressure; headers more. */
    absoluteError: .53, headerAbsoluteError: 1.35,
    /** blockPerDefender: the shooter's estimate; execution uses play.blockChance and the real line. Keeper reach in metres, reaction in seconds (halı saha keepers). */
    blockPerDefender: .2, reaction: .3, reactionPerRating: .002, dive: 3.85, standReach: .9, maxReach: 2.9, saveSharpness: .32, catchBase: .5,
    handlingBase: .86, handlingPerRating: .004, minimumGoalChance: .03,
    windup: .24, range: 32, postWidth: .16,
  },
  aerial: { strength: .4, positioning: .2, finishing: .15, control: .15, speed: .1, specialistBonus: 1.1, duelNoise: 1, distancePenalty: .85, keeperClaim: .55 },
  /** beatenLock: s a beaten defender may not tackle or touch the ball; beatenStall / lostBallStall: s he (or the man who lost the ball)
   * is wrong-footed and slow, after which he turns and chases at full speed (2026-11-09: the whole lock at quarter speed read as giving up). */
  duel: { attemptBase: .16, attemptPerPressing: .025, range: 1.45, sharpness: .42, bias: .05, beatenLock: .7, beatenStall: .3, lostBallStall: .25, cooldown: 1.1,
    /** m the pressing defender holds off the carrier, toward his own goal (inside standing tackle range, outside body spacing). */
    jockey: 1.3 },
  foul: { base: .085, aggression: .035, fatigue: .05, frustrated: .06, max: .32 },
  setPiece: { kickoffDelay: 2.4, throwDelay: [1.4, 2.6], cornerDelay: 3.6, goalKickDelay: 3, freeKickDelay: 3.2, penaltyDelay: 3.4, celebration: 6,
    /** 2026-11-10: the scorer's run off (m); up to three outfield team-mates within celebrateReach m run to him; celebrating together
     * they may stand celebrateHug m apart. */
    celebrateRun: 8, celebrateMates: 3, celebrateReach: 22, celebrateHug: .55, celebrationTail: 1,
    /** A kick-off waits (at most kickoffWaitMax s past its time) until everyone is back in his own half, kickoffHalfSlack m allowed. */
    kickoffWaitMax: 15, kickoffHalfSlack: .3,
    directFreeKickRange: 28, penaltyBase: .74, penaltyPerFinishing: .03, penaltyPerKeeper: -.004 },
  /** chemistryShare: a team chemistry point is worth this much on each team-mate's passing/vision/positioning (engine/runtime.ts). */
  personality: { chemistryShare: .25, dayFormGood: .15, dayFormBad: .15, frustrationSeconds: 360, disengageSeconds: 300, frustrationRecovery: 2, servanTrigger: .12, tevfikTrigger: .35, moodSeconds: 300, argumentChance: .35 },
  /** Out of position (rating points below his best position): see engine/position-fit.ts. */
  positionFit: { tolerance: 4, perPoint: .05, max: 1, key: .5 },
  /** Batch calibration knobs (median ~11 total goals in 60 min, user examples 4–2, 7–5, 9–7; 2–1 is nearly impossible).
   * tuning-7 (2026-11-09: duels, first touch, bodies on the ground) keeps these: 36 seeded matches give median 10, mean 10.2 goals,
   * 21 shots on target and 13.7 fouls a match (tuning-6: 10, 9.9, 21, 13.3). tuning-8 (2026-11-10: team-mates join the goal
   * celebration; kick-offs wait for both teams in their own halves) — 36 matches: median 10, mean 10.1, 20.9 on target, 12.9 fouls.
   * tuning-9 (2026-11-10: loose balls — the nearest men go for them, the chaser sticks, a second man waits for the knock-down) — 72
   * matches: median 9, mean 9.4, 39.0 shots, 20.0 on target, 14.3 fouls (tuning-8 on the same 72: 11, 10.7, 42.7, 21.1, 12.5). The
   * goal lost is the scrambles nobody went for; finishing/keeper/defence/intent nudges did not bring it back (72-match checks). */
  calibration: { finishing: .86, keeper: .6, defenseSharpness: .85, attackingIntent: 1.35 },
  /** Finishing, set-piece, duel and game-state knobs from the 3–4 Nov 2026 sessions (user feedback: strike when the angle opens, poor
   * shooters miss wide, real free kicks and corners, halı saha keepers, visible slides, blowouts rare). */
  play: {
    boxUrge: .18, urgePerAbility: .08, rangeUrge: .085, rangeMax: 32, blockChance: .27, blockHeight: 1.95, carryFadeNearGoal: .3, takeOnFadeNearGoal: .5, heldFade: 4, approachUrgency: .05,
    composure: .25, composureFrom: 7.5, finishError: .08, minShotSpeed: 18.5, fkSpeedBase: 17, fkSpeedPerShooting: .7, wallScreen: .08,
    shortCorner: .08, fkShotDelay: 4, fkCrossDelay: 3.6, fkPassDelay: [1.4, 2.4], distance: 9.15, wallJump: [1.75, 2.05],
    /** Sliding tackles: from beyond standing range up to slideReach more; rarer, a little less clean, more fouls. keeperFirst: s a keeper must reach a loose ball before any rival to come for it. */
    slideReach: 1.05, slideAttempt: .55, slideWin: .92, slideFoul: 1.6, keeperFirst: .3,
    /** A pass going astray: a team-mate who reaches it this many seconds before its target goes for it too (2026-11-10). */
    astrayLead: .8,
    /** The man going for a free ball keeps the job unless another reaches it chaseStick s sooner; the nearest other within
     * secondBallRadius m waits secondBallBack m goal-side of where it will be played (2026-11-10). */
    chaseStick: .35, secondBallRadius: 6, secondBallBack: 3.5,
    /** A foul needs body contact: the challenger's centre within these metres of the man on the ball (slides reach further). */
    foulBodyStand: 1.5, foulBodySlide: 1.8,
    /** User 2026-11-04: strike before the six-yard box; alone the finish is calmer, hemmed in by 2–3 it is cramped, weak, often blocked or wide. */
    crowdRadius: 2.6, crowdSigma: .35, freeComposure: .85, smother: .16, crampedSpeed: [.7, .85], closeUrge: .12, sixCarry: .15,
    relaxFrom: 2, relaxPerGoal: .3, relaxMax: .75, tiredDefending: .2, chasingRuns: .4,
    /** User 2026-11-04, both halves of the game state: three up a side switches off a little (relax*), two or more down it takes risks —
     * the back line pushes riskLine m higher and shots from range come (1+riskShots)× as often (chasingRuns sends more runners). */
    riskLine: 5, riskShots: .15,
    /** One man's big score only in a big-scoring game (user 2026-11-04): each extra defender within crowdRadius takes coverBeat off a
     * take-on (capped at beatMax); a man with goals (full at heatGoals) is closed down harder (heatDefense) and picked up first by markers,
     * and passers give him a wide berth (heatWary: most of a hot man's later goals came from cut-out passes and loose balls at the box). */
    coverBeat: .1, beatMax: .85, heatGoals: 2, heatMax: 1.5, heatOpen: .6, heatOpenGoals: 14, heatDefense: .35, heatMark: .6, heatPress: .35, heatWary: .5, takeOnBias: .22,
    /** Central midfielders arrive late in the box (share of a forward's runs, with the ball in the final third); in possession the midfield
     * stays within midfieldGap m behind the ball, up to midfieldTop. */
    midfieldRuns: .6, midfieldGap: 13, midfieldTop: 30,
    /** Ways the ball goes behind for a corner: a parry round the post (share of parries), a block that runs on wide of the goal, a glancing
     * defensive header in the box (more when an attacker contests it), a cross that strikes the man closing the crosser down. */
    parryWide: .42, blockBehind: .4, headBehind: .16, headBehindContested: .2, crossBlock: .45, crossBlockReach: 1.8, crossBlockBehind: .6,
    /** Throw-ins are soft and land at the receiver's knees (they used to fly past him at 12 m/s and run out over the line). */
    throwSpeed: 8.5, throwLanding: .5,
    /** Corners (2026-11-04: 28% of them ended in a goal): markers tighter, defenders first to the ball in their own box more often, and
     * keepers come for what drops into the six-yard box (claimBeyond m past it) below their claim height. */
    cornerMarkGap: .5, boxAerialEdge: .6, claimHeight: 2.7, claimBeyond: 1, crossLine: .8,
    /** Utility a keeper gives up to kick long rather than play it short. */
    keeperLongCost: .015,
  },
} as const;

/** User decision 2026-11-03: physically strong, relatively technical aerial threats on corners and crosses. */
export const HEADER_SPECIALISTS = ['arif', 'mensur', 'taha', 'servan'] as const;

/** Playing styles the user described (2026-11-03). Weights on decisions only; attributes are never changed.
 * Everyone also gets an attribute tendency: high ÇALIM/HIZ and attacking roles take players on more often. */
export const PLAYER_STYLES: Readonly<Record<string, { readonly pass?: number; readonly dribble?: number; readonly shoot?: number; readonly soloRun?: { readonly chancePerMatch: number; readonly from: 'own-half' | 'defense' }; readonly nutmeg?: boolean; readonly note: string }>> = {
  taha: { dribble: 1.55, note: 'Çalımcı' },
  alper: { pass: 1.3, dribble: .78, note: 'Pasör oyuncu' },
  goktug: { pass: .7, dribble: 1.3, shoot: 1.25, note: 'Pas atmayı pek sevmez' },
  yanki: { soloRun: { chancePerMatch: 1, from: 'own-half' }, note: 'Her maç bir kez topu kendi yarısından rakip kaleye kadar tek başına sürer; bazen gol olur, bazen olmaz' },
  servan: { soloRun: { chancePerMatch: .5, from: 'defense' }, note: 'Bazen savunmada topu kapıp gücüyle karşı kaleye kadar gider' },
  mensur: { nutmeg: true, note: 'Bacak arası atmayı sever: iyi pres yapılmıyorsa ya da yaklaşan oyuncu zayıfsa' },
};
/** User 2026-11-03: outfield players who can hit it almost goal to goal. Others: long balls cap ~50 m and fade past 38 m. */
export const LONG_PASSERS = ['arif', 'servan', 'goktug', 'm-emre', 'mensur', 'alper'] as const;
export const LONG_BALL = { normalMax: 50, normalFadeFrom: 38, normalFade: .02, specialistMax: 72, specialistFade: .006, specialistSigma: .72 } as const;
/** User 2026-11-03: left-footed players; everyone else is right-footed. Weak-foot strikes are less accurate. */
export const LEFT_FOOTED = ['alper', 'mustafa', 'baran', 'm-emre'] as const;
/** Luck the user asked for: a strong side can still lose by one. Execution-level only. */
export const LUCK = { strongFootChance: .84, weakFootSigma: 1.25, weakFootPassSigma: 1.15, keeperDaySigma: .06, deflectionGoal: .06, keeperHowler: .015 } as const;
