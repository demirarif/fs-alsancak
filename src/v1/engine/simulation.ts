import type { MatchEvent, MatchSnapshot, FootballEventKind } from '../domain/match.js';
import type { Lineup } from '../domain/teams.js';
import type { Attribute } from '../domain/players.js';
import { ENGINE_TUNING as T, PLAYER_STYLES, LEFT_FOOTED, LUCK, LONG_PASSERS, LONG_BALL } from '../config/engine-tuning.ts';
import { createRng } from './rng.ts';
import { createRuntimePlayers, drawDayForms, updateTemporalModifiers, teamAtmosphere, pregameAssessment, TEAM_IDS, type RtPlayer, type Team, type Role, type Mood } from './runtime.ts';
import { clamp, lerp, sigmoid, smoothstep, erf, threat, lossCost, goalAngle, inBox, topSpeed, acceleration, fatigueNoise, groundLaunch, groundTime, loftLaunch, loftFlightTime } from './football.ts';
import { ACTION, BALL_STATE, FRAME_HEADER, PLAYER_CHANNELS, frameStride, type HalfReplay } from './replay.ts';

/* One half of the user's 60-minute match. Deterministic for (seed, lineups, carry); every football draw comes from one seeded stream. */
const PI = T.pitch, DT = 1 / T.tickHz, R: number = T.ball.radius, GOAL_X: number = PI.halfLength;
type PassKind = 'short' | 'long' | 'through' | 'cross' | 'clear' | 'throw' | 'keeper' | 'header' | 'kickoff';
interface PassInfo { from: number; to: number; kind: PassKind; team: Team; t0: number; tx: number; tz: number; lofted: boolean; tried: Map<number, number>; corner: boolean }
type ShotOutcome = 'goal' | 'save' | 'parry' | 'wide' | 'post' | 'block';
interface ShotInfo { shooter: number; team: Team; outcome: ShotOutcome; endT: number; ex: number; ey: number; ez: number; keeper: number; header: boolean; xg: number; blocker: number; penalty: boolean; eventId: string }
type RestartKind = 'kick-off' | 'throw-in' | 'corner' | 'goal-kick' | 'free-kick' | 'penalty';
/** How a free kick is used: at goal over the wall, crossed into the box, or passed (never dribbled from a dead ball). */
type SetPlay = 'shot' | 'cross' | 'pass';
/** World positions for a box set piece: where each man starts, where he goes when the ball is struck, whom a marker follows. */
interface SetRole { player: number; start: { x: number; z: number }; zone: { x: number; z: number }; mark: number }
interface SetPlan { attackers: SetRole[]; defenders: SetRole[]; short: number; keeper: { x: number; z: number } }
interface Restart { kind: RestartKind; team: Team; x: number; z: number; taker: number; readyAt: number; direct: boolean; play: SetPlay | null; plan: SetPlan | null }
/** Finishing, set-piece, duel and game-state knobs: ENGINE_TUNING.play (one source, recorded with every match). */
const K = T.play;
/** The receiving move: its length and where in it the ball is met (the view draws the same keyframes). */
const RECEIVE_SECONDS = .55, RECEIVE_CONTACT = .45;
/** Where team-mates gather round a scorer: [angle from his facing, metres] — behind-left, behind-right, right behind him. */
const CELEBRATE_SLOTS = [[1.9, .7], [-1.9, .7], [Math.PI, .8]] as const;
/** m: half the thickness of a player lying on the ground (legs, back) for a low ball. */
const LYING_RADIUS = .22;
export interface TeamStats { shots: number; onTarget: number; goals: number; passes: number; completed: number; possession: number; corners: number; fouls: number; penalties: number; headerGoals: number; saves: number; freeKicks: number }
export interface HalfCarry {
  readonly rngState: readonly number[]; readonly score: readonly [number, number]; readonly firstKickoff: Team; readonly eventSeq: number;
  readonly teamStats: readonly [TeamStats, TeamStats];
  readonly players: readonly { readonly id: string; readonly energy: number; readonly mood: Mood | null; readonly moodUntil: number; readonly dayForm: string | null; readonly lastReceived: number; readonly stats: RtPlayer['stats'] }[];
  /** Signature solo runs still to come this match, and each keeper's luck of the day. */
  readonly solo: Readonly<Record<string, 'pending' | 'done' | 'skip'>>;
  readonly keeperDay: Readonly<Record<string, number>>;
}
/** A line-up change during a half (user 2026-11-10: "maç sırasında da dizilişi değiştirebilelim"): from match time `seconds` on, the
 * same eleven play in `lineups`. The half is simulated again from its kick-off with the changes in it, so everything before the first
 * change is exactly what was already watched. */
export interface LineupChange { readonly seconds: number; readonly lineups: readonly [Lineup, Lineup] }
export interface HalfResult { readonly replay: HalfReplay; readonly carry: HalfCarry; readonly score: readonly [number, number]; readonly teamStats: readonly [TeamStats, TeamStats]; readonly players: readonly { id: string; name: string; team: Team; stats: RtPlayer['stats']; energy: number }[] }
const emptyStats = (): TeamStats => ({ shots: 0, onTarget: 0, goals: 0, passes: 0, completed: 0, possession: 0, corners: 0, fouls: 0, penalties: 0, headerGoals: 0, saves: 0, freeKicks: 0 });
const pct = (p: number) => `%${Math.round(clamp(p, 0, 1) * 100)}`;

export function simulateHalf(snapshot: MatchSnapshot, half: 1 | 2, lineups: readonly [Lineup, Lineup], carry: HalfCarry | null, onProgress?: (fraction: number) => void, changes: readonly LineupChange[] = []): HalfResult {
  const rng = createRng(snapshot.settings.seed, carry?.rngState), C = T.calibration;
  const players = createRuntimePlayers(snapshot, lineups);
  if (carry) for (const p of players) { const c = carry.players.find(q => q.id === p.id); if (c) { p.energy = Math.min(1, c.energy + .1); p.mood = c.mood; p.moodUntil = c.moodUntil; p.dayForm = c.dayForm; p.lastReceived = c.lastReceived; p.stats = { ...c.stats }; } }
  const byTeam: [RtPlayer[], RtPlayer[]] = [players.filter(p => p.team === 0), players.filter(p => p.team === 1)];
  const keeperOf = (team: Team) => byTeam[team].find(p => p.keeper)!;
  const dir: [number, number] = half === 1 ? [1, -1] : [-1, 1];
  const X = (team: Team, x: number) => x * dir[team], Z = X, W = X; // team frame <-> world (180° rotation for the side attacking −x)
  const start = (half - 1) * T.halfSeconds, end = half * T.halfSeconds;
  let t = start, tick = 0;
  const score: [number, number] = carry ? [carry.score[0], carry.score[1]] : [0, 0];
  const stats: [TeamStats, TeamStats] = carry ? [{ ...carry.teamStats[0] }, { ...carry.teamStats[1] }] : [emptyStats(), emptyStats()];
  const events: MatchEvent[] = [];let seq = carry?.eventSeq ?? 0;
  const assessment = pregameAssessment(snapshot, lineups), cohesion = [assessment.evaluation.teams[0].metrics.cohesion.score, assessment.evaluation.teams[1].metrics.cohesion.score];
  const atmosphere: ['good' | 'neutral' | 'bad', 'good' | 'neutral' | 'bad'] = ['neutral', 'neutral'];
  const ball = { x: 0, y: R, z: 0, vx: 0, vy: 0, vz: 0, owner: -1, hands: false, lastTouch: -1, lastTeam: 0 as Team, pass: null as PassInfo | null, shot: null as ShotInfo | null, aerialDone: false, dead: true, settle: 0, outUntil: -1, spot: null as { x: number; z: number } | null };
  // Assigned from nested helpers; the casts keep TypeScript from narrowing them to their initial null.
  let restart = null as Restart | null, pending = null as { player: number; at: number; run: () => void } | null, possession = -1 as Team | -1, celebrateUntil = -1;
  let lastPass: { from: number; to: number; team: Team; t: number } | null = null, path: { t: number; x: number; y: number; z: number }[] = [], netted = false, netSign = 1;
  // Goal credit (user decision: no keeper own goals): the last strike — shot, header, pass, cross — and each team's last touch.
  let lastStrike = null as { player: number; team: Team; t: number; shot: boolean } | null;
  const lastTouchOf: [number, number] = [-1, -1];
  let restartPass = -1;
  const supportSpots = new Map<number, { x: number; z: number }>(), beatChain = new Map<number, { t: number; count: number }>();
  let takeOn = null as { carrier: number; defender: number; at: number; pBeat: number; nutmeg: boolean } | null, solo = null as { player: number; until: number } | null;
  // A tackle in flight: decided at the contact moment, where the defender's foot actually reaches (or misses) the ball.
  let challenge = null as { d: number; carrier: number; at: number; slide: boolean; pWin: number; pFoul: number } | null;
  // A cross struck into the man closing the crosser down: it meets his shins a few ticks later and comes off him (behind, or looping up).
  let deflectBy = null as { player: number; behind: boolean; until: number } | null;
  const soloPlan: Record<string, 'pending' | 'done' | 'skip'> = carry ? { ...carry.solo } : {}, keeperDay: Record<string, number> = carry ? { ...carry.keeperDay } : {};
  if (!carry) for (const p of players) {
    const s = PLAYER_STYLES[p.id]?.soloRun;if (s) soloPlan[p.id] = rng.chance(s.chancePerMatch) ? 'pending' : 'skip';
    if (p.keeper) keeperDay[p.id] = clamp(1 + rng.normal() * LUCK.keeperDaySigma, .86, 1.12);
  }
  const stride = frameStride(players.length), maxFrames = Math.ceil(T.halfSeconds * T.tickHz / T.snapshotEvery) + 4, samples = new Float32Array(maxFrames * stride);let frameCount = 0;
  const ballKeys: number[] = [], ballCuts: number[] = [];
  /** The ball is put somewhere new for a restart: the replay shows it there at once rather than travelling. */
  const placeBall = (x: number, z: number) => { ball.x = x; ball.z = z; ball.y = R; ball.vx = ball.vy = ball.vz = 0; if (ballCuts[ballCuts.length - 1] !== t) ballCuts.push(t); };
  /** Record where the ball is at a contact (once per tick): the replay draws it through this point. */
  const keyBall = () => { const n = ballKeys.length; if (n && ballKeys[n - 4] === t) { ballKeys[n - 3] = ball.x; ballKeys[n - 2] = ball.y; ballKeys[n - 1] = ball.z; } else ballKeys.push(t, ball.x, ball.y, ball.z); };

  const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
  const opponents = (team: Team) => byTeam[1 - team as Team];
  const nearestOpponent = (team: Team, x: number, z: number) => { let best: RtPlayer | null = null, d = Infinity; for (const o of opponents(team)) { const e = Math.hypot(o.x - x, o.z - z); if (e < d) { d = e; best = o; } } return { player: best!, d }; };
  /** 0 free – 1 surrounded: closing opponents within 4 m. */
  const pressureAt = (team: Team, x: number, z: number) => { let s = 0; for (const o of opponents(team)) { const d = Math.hypot(o.x - x, o.z - z); if (d < 4) s += (1 - d / 4) ** 2 * (.7 + .03 * o.a.pressing); } return clamp(s, 0, 1); };
  /** Halı saha game state: three goals up, the leading side switches off a little at the back — fewer challenges, slower reads —
   * so the trailing side gets its goals and blowouts stay rare (the user's scores rarely run away completely). 0 = full focus. */
  /** Outfield opponents hemming a player in. */
  const crowdAt = (team: Team, x: number, z: number) => { let n = 0; for (const o of opponents(team)) if (!o.keeper && Math.hypot(o.x - x, o.z - z) < K.crowdRadius) n++; return n; };
  const inSix = (X0: number, Z0: number) => X0 > GOAL_X - PI.sixDepth && Math.abs(Z0) < PI.goalHalfWidth + PI.sixDepth;
  const relax = (team: Team) => clamp((score[team] - score[1 - team as Team] - K.relaxFrom) * K.relaxPerGoal, 0, K.relaxMax);
  /** The other half of the game state (user 2026-11-04: both are right): two or more down, a side takes risks; 0 level or one down, 1 three down. */
  const risk = (team: Team) => clamp((score[1 - team as Team] - score[team] - 1) / 2, 0, 1);
  /** A player who is scoring gets the defence's attention, 0 to K.heatMax (full by K.heatGoals goals). User 2026-11-04: five from one man only
   * in a big-scoring game — a tight game's defence sticks to him; in an open, goal-filled one (toward K.heatOpenGoals) it loosens. */
  const heat = (p: RtPlayer) => clamp(p.stats.goals / K.heatGoals, 0, K.heatMax) * (1 - K.heatOpen * clamp((score[0] + score[1] - 6) / (K.heatOpenGoals - 6), 0, 1));
  const attrs = (p: RtPlayer, keys: readonly Attribute[]) => Object.fromEntries(keys.map(k => [k, Math.round(p.a[k] * 10) / 10])) as Partial<Record<Attribute, number>>;

  function log(kind: FootballEventKind, team: Team | -1, actor: RtPlayer | null, target: RtPlayer | null, importance: number, explanation: string, o: { x?: number; z?: number; dx?: number; dz?: number; p?: number; sampled?: number; pressure?: number; distance?: number; attrs?: Partial<Record<Attribute, number>>; outcome?: string } = {}) {
    const e: MatchEvent = { id: `e${++seq}`, tick: Math.round(t * T.tickHz), seconds: Math.round(t * 100) / 100, importance, kind, teamId: team === -1 ? null : TEAM_IDS[team]!, actorId: actor?.id ?? null, targetPlayerId: target?.id ?? null,
      origin: { x: o.x ?? actor?.x ?? ball.x, y: 0, z: o.z ?? actor?.z ?? ball.z }, destination: { x: o.dx ?? ball.x, y: 0, z: o.dz ?? ball.z },
      reason: { attributeContributions: o.attrs ?? {}, ruleIds: actor ? actor.activeRuleIds.slice(0, 8) : [], appliedModifiers: [], pressure: o.pressure ?? 0, distanceMeters: o.distance ?? 0, explanation,
        ...(o.p !== undefined ? { successProbability: Math.round(o.p * 1000) / 1000 } : {}), ...(o.sampled !== undefined ? { sampledValue: Math.round(o.sampled * 1000) / 1000 } : {}) },
      ...(o.outcome ? { outcome: o.outcome } : {}) };
    events.push(e);return e;
  }
  function act(p: RtPlayer, code: number, duration: number, contactAt = 0, param = 0) { p.action = code; p.actionStart = t - contactAt * duration; p.actionEnd = p.actionStart + duration; p.actionParam = param; }

  // --- possession -------------------------------------------------------------
  function giveBall(p: RtPlayer, hands = false) {
    const changed = possession !== p.team;
    if (!ball.dead && ball.owner !== p.idx) keyBall();
    ball.owner = p.idx; ball.hands = hands; ball.pass = null; ball.shot = null; ball.aerialDone = false; ball.dead = false; ball.lastTouch = p.idx; ball.lastTeam = p.team; ball.vx = ball.vy = ball.vz = 0;
    ball.settle = t + .24;
    possession = p.team; p.lastReceived = t; p.receivedSinceMood++; lastTouchOf[p.team] = p.idx;
    const press = pressureAt(p.team, p.x, p.z);
    p.decideAt = t + (hands ? rng.range(1.1, 2.4) : (T.decision.receiveDelayBase - T.decision.receiveDelayControl * (p.a.control - 5)) * (1 + press * .4) * rng.range(.75, 1.25));
    if (solo && solo.player !== p.idx) solo = null;
    // Signature solo runs start from the user's described zone (own half for Yankı, defence for Servan); late in the match they are forced.
    const plan = soloPlan[p.id], style = PLAYER_STYLES[p.id]?.soloRun;
    if (plan === 'pending' && style && !hands && !restart && press < .7) {
      const pX = X(p.team, p.x), zone = style.from === 'defense' ? pX < -22 : pX < -3, late = t > 2700;
      if ((zone || (late && pX < 15)) && rng.chance(late ? 1 : .3)) {
        soloPlan[p.id] = 'done'; solo = { player: p.idx, until: t + 16 };
        log('mood', p.team, p, null, .6, style.from === 'defense' ? `${p.name} savunmada topu aldı, gücüyle karşı kaleye doğru gidiyor!` : `${p.name} topu aldı, tek başına sürüyor!`);
      }
    }
    return changed;
  }
  function looseBall(vx: number, vz: number, vy = 0) { keyBall(); ball.owner = -1; ball.hands = false; ball.vx = vx; ball.vz = vz; ball.vy = vy; ball.pass = null; ball.shot = null; ball.aerialDone = false; if (vy > 0 && ball.y < R + .05) ball.y = R + .02; }

  /** Predicted free-ball path for interception targets (same physics as the tick, 0.1 s steps). */
  function predictPath() {
    path = [];let x = ball.x, y = ball.y, z = ball.z, vx = ball.vx, vy = ball.vy, vz = ball.vz;
    for (let k = 1; k <= 30; k++) {
      const h = .1;
      if (y > R + .01 || vy > 0) { vy -= T.ball.gravity * h; x += vx * h; y += vy * h; z += vz * h; if (y <= R) { y = R; if (Math.abs(vy) > 1.2) { vy = -vy * T.ball.bounce; vx *= T.ball.bounceFriction; vz *= T.ball.bounceFriction; } else vy = 0; } }
      else { const s = Math.hypot(vx, vz); if (s > 0) { const n = Math.max(0, s - T.ball.rollDecel * h) / s; vx *= n; vz *= n; } x += vx * h; z += vz * h; }
      path.push({ t: k * h, x, y, z });
    }
  }
  function intercept(p: RtPlayer) {
    const top = topSpeed(p) * .93, reach = p.keeper ? 1 : .6;
    // A man on the ground or not yet allowed to touch the ball (beaten, fouled) is not there as soon as his top speed says, and a
    // wrong-footed one starts late (2026-11-09: the chaser picked was often the beaten defender, so nobody else went for the ball).
    // The man who has just touched it cannot play it again for a moment either (2026-11-10: picked as the chaser, he stood over it).
    const ready = Math.max(0, p.groundedUntil - t, p.lockUntil - t, p.touchUntil - t), late = .75 * Math.max(0, p.stallUntil - t);
    for (const q of path) { const need = Math.max(0, Math.hypot(q.x - p.x, q.z - p.z) - reach); if (q.t >= ready && need / top + .12 + late <= q.t && q.y < (p.keeper ? 2.4 : 1.9)) return { x: q.x, z: q.z, t: q.t }; }
    const last = path.at(-1) ?? { x: ball.x, z: ball.z, t: 3 };return { x: last.x, z: last.z, t: Math.max(3, ready) + late + Math.hypot(last.x - p.x, last.z - p.z) / top };
  }

  // --- positioning ------------------------------------------------------------
  const deepestOpponent = (team: Team) => { let m = 52; for (const o of opponents(team)) if (!o.keeper) m = Math.min(m, X(team, o.x)); return m; };
  const lastLine = (team: Team) => { let m = -52; for (const o of opponents(team)) if (!o.keeper) m = Math.max(m, X(team, o.x)); return m; };
  function shapeTarget(p: RtPlayer, inPossession: boolean, bx: number, bz: number) {
    const team = p.team, b = clamp(X(team, bx) / PI.halfLength, -1, 1), zb = Z(team, bz);
    let back = (inPossession ? lerp(-38, -4, (b + 1) / 2) : lerp(-42, -19, (b + 1) / 2)) + K.riskLine * risk(team);
    // No offside (user decision): the back line stays goal-side of the deepest opponent.
    if (!inPossession) back = Math.max(-46, Math.min(back, deepestOpponent(team) - 1.6));
    const depth = inPossession ? 46 : 33, width = inPossession ? 62 : 46, shift = inPossession ? .22 : .38;
    const rel = clamp((p.slot.anchor.x - .2) / .64, -.3, 1.15);
    // In possession the midfield follows the ball up, no more than midfieldGap behind it, up to midfieldTop (2026-11-04: with the ball near
    // the box the central midfield stood 30 m off the play, and the forwards took nine shots in ten).
    const line = back + rel * depth, tx = clamp(inPossession && p.slot.unit === 'midfield' ? Math.max(line, Math.min(X(team, bx) - K.midfieldGap, K.midfieldTop)) : line, -50, 47);
    const tz = clamp((p.slot.anchor.z - .5) * width + zb * shift, -32, 32);
    return { x: W(team, tx), z: W(team, tz) };
  }
  /** Angle-narrowing position; with a cross or corner in the air (one he is not coming for) he holds near his line, as keepers do. */
  function keeperTarget(p: RtPlayer, bx: number, bz: number, crossIn = false) {
    const team = p.team, gx = -GOAL_X, bX = X(team, bx), bZ = Z(team, bz), d = Math.hypot(bX - gx, bZ);
    const off = crossIn ? K.crossLine : clamp(1.4 + d * .075, 1.2, 7.5), ang = Math.atan2(bZ, bX - gx);
    return { x: W(team, gx + Math.cos(ang) * off), z: W(team, clamp(Math.sin(ang) * off, -3, 3)) };
  }
  function supportSpot(p: RtPlayer, carrier: RtPlayer) {
    const team = p.team, cX = X(team, carrier.x), cZ = Z(team, carrier.z), anchor = shapeTarget(p, true, carrier.x, carrier.z);
    let best = anchor, bestScore = -Infinity;
    for (const r of [9, 13, 17]) for (const deg of [-75, -40, -12, 12, 40, 75, 115, -115]) {
      const ang = deg * Math.PI / 180, sX = clamp(cX + Math.cos(ang) * r, -50, 49), sZ = clamp(cZ + Math.sin(ang) * r, -32, 32), sx = W(team, sX), sz = W(team, sZ);
      let open = 10, lane = 6;
      for (const o of opponents(team)) {
        open = Math.min(open, Math.hypot(o.x - sx, o.z - sz));
        const lx = sx - carrier.x, lz = sz - carrier.z, len = Math.hypot(lx, lz) || 1, u = clamp(((o.x - carrier.x) * lx + (o.z - carrier.z) * lz) / (len * len), 0, 1);
        lane = Math.min(lane, Math.hypot(carrier.x + lx * u - o.x, carrier.z + lz * u - o.z));
      }
      const s = .45 * open + .6 * lane + .06 * (sX - cX) - .045 * Math.hypot(sx - anchor.x, sz - anchor.z) + rng.normal() * .35;
      if (s > bestScore) { bestScore = s; best = { x: sx, z: sz }; }
    }
    return best;
  }
  /** Who may stand beyond a goal line: only the man taking a corner, at the flag. */
  const cornerTaker = (p: RtPlayer) => restart?.kind === 'corner' && restart.taker === p.idx;
  // Nobody walks into the net or round the back of the goal: targets stay in front of the goal lines (the corner taker excepted).
  function setTarget(p: RtPlayer, x: number, z: number, pace: number, role: Role) { const lim = cornerTaker(p) ? GOAL_X + .6 : GOAL_X - .3; p.tx = clamp(x, -lim, lim); p.tz = clamp(z, -35.5, 35.5); p.pace = pace; p.role = role; }

  /** Each side's man going for the free ball at the last decision: he keeps the job unless another gets there clearly sooner (2026-11-10:
   * under a ball looping up the job changed hands every 0.2 s, and each man who lost it turned and ran 20 m back to his place). */
  const lastChaser: [number, number] = [-1, -1];
  function assignRoles() {
    const carrier = ball.owner >= 0 ? players[ball.owner]! : null, free = !carrier && !ball.dead;
    const bx = carrier ? carrier.x : ball.x, bz = carrier ? carrier.z : ball.z;
    if (free) predictPath();
    // For each side, how soon the other side can reach the free ball (a keeper only comes for what he reaches clearly first).
    const rivalFirst: [number, number] = [Infinity, Infinity];
    if (free) for (const team of [0, 1] as Team[]) for (const o of opponents(team)) rivalFirst[team] = Math.min(rivalFirst[team], intercept(o).t);
    for (const team of [0, 1] as Team[]) {
      const own = byTeam[team], inPossession = carrier ? carrier.team === team : ball.pass ? ball.pass.team === team : possession === team;
      for (const p of own) {
        if (p === carrier) continue;
        if (p.role === 'run' && t < p.roleUntil && inPossession) continue;
        if (p.role === 'setpiece' && t < p.roleUntil) continue;
        if (p.keeper && t < p.roleUntil) continue;
        if (p.keeper) {
          // One-on-one: the keeper comes off his line to narrow the angle.
          const cX = carrier && carrier.team !== team ? X(team, carrier.x) : 99, cZ = carrier ? Z(team, carrier.z) : 0, dGoal = Math.hypot(cX + GOAL_X, cZ);
          if (dGoal < 15 && Math.abs(cZ) < 12) { const f = clamp(.38 - .1 * (p.gk - 70) / 12, .22, .45); setTarget(p, W(team, -GOAL_X + (cX + GOAL_X) * f), W(team, cZ * f), 1, 'keeper'); continue; }
          // Out of position he runs back to his line, not jogs.
          const crossIn = !carrier && !!ball.pass && ball.pass.team !== team && ball.pass.lofted && X(team, ball.pass.tx) < -GOAL_X + PI.boxDepth;
          const k = keeperTarget(p, bx, bz, crossIn); setTarget(p, k.x, k.z, Math.hypot(k.x - p.x, k.z - p.z) > 3 || crossIn ? 1 : .8, 'keeper'); continue;
        }
        const s = shapeTarget(p, inPossession, bx, bz), far = Math.hypot(s.x - p.x, s.z - p.z) > 9;
        setTarget(p, s.x, s.z, far ? .85 : .6, 'shape');
      }
      if (free) {
        // The pass target and the best-placed opponent go for a moving ball; otherwise one chaser per team.
        const intended = ball.pass?.team === team ? players[ball.pass.to]! : null;
        let spot: { x: number; z: number } | null = null;
        if (intended && !intended.keeper) {
          const i = intercept(intended);setTarget(intended, i.x, i.z, 1, 'receive');spot = i;lastChaser[team] = intended.idx;
          // A pass going astray: a team-mate who gets to it clearly first goes for it too, instead of watching the target run 15 m for a
          // ball at his own feet (2026-11-10, user: "5 metre önündeki topa koşmuyor, 20 metre geriden rakip gelip topu alıyor").
          let mate: RtPlayer | null = null, mt = i.t - K.astrayLead;
          for (const p of own) { if (p === intended || p.keeper) continue; const q = intercept(p); if (q.t < mt) { mt = q.t; mate = p; } }
          if (mate) { const q = intercept(mate); setTarget(mate, q.x, q.z, 1, 'chase'); spot = q; }
        }
        else {
          let best: RtPlayer | null = null, bt = Infinity, keepT = Infinity;
          // Keepers sweep only what they reach clearly first: a keeper caught off his line leaves the goal empty.
          for (const p of own) {
            const i = intercept(p); if (p.keeper && ((!inBox(-X(team, ball.x), Z(team, ball.z)) && !inBox(-X(team, i.x), Z(team, i.z))) || i.t + K.keeperFirst > rivalFirst[team])) continue;
            if (p.idx === lastChaser[team]) keepT = i.t;
            if (i.t < bt) { bt = i.t; best = p; }
          }
          if (keepT <= bt + K.chaseStick) best = players[lastChaser[team]]!;
          if (best) { const i = intercept(best); setTarget(best, i.x, i.z, 1, 'chase'); spot = i; lastChaser[team] = best.idx; }
        }
        // The second ball: the nearest other man close to it stays for the knock-down or rebound, a few metres goal-side of where it will
        // be played, instead of turning his back on it and jogging off to his place.
        if (spot) {
          let second: RtPlayer | null = null, sd: number = K.secondBallRadius;
          for (const p of own) { if (p.keeper || p.role !== 'shape') continue; const d = Math.hypot(p.x - ball.x, p.z - ball.z); if (d < sd) { sd = d; second = p; } }
          if (second) setTarget(second, W(team, X(team, spot.x) - K.secondBallBack), spot.z * .85 + second.z * .15, .75, 'cover');
        }
        // A loose ball running into the box toward the own goal is the keeper's, whoever played it (a stray throw or back pass used to roll in).
        const k = keeperOf(team), lofted = ball.pass && ball.pass.team !== team && ball.pass.lofted ? ball.pass : null;
        // A cross or corner dropping into his six-yard box (or just beyond) is his to come for when he gets under it in time.
        if (lofted && t >= k.roleUntil && t >= k.groundedUntil) {
          const drop = path.find((q, i) => i > 0 && q.y < K.claimHeight && path[i - 1]!.y >= q.y);
          if (drop && X(team, drop.x) < -GOAL_X + PI.sixDepth + K.claimBeyond && Math.abs(Z(team, drop.z)) < PI.goalHalfWidth + PI.sixDepth + K.claimBeyond
            && Math.hypot(drop.x - k.x, drop.z - k.z) / (topSpeed(k) * .93) + .15 <= drop.t) { setTarget(k, drop.x, drop.z, 1, 'chase'); k.roleUntil = t + Math.min(drop.t, 1.6); }
        }
        if (t >= k.roleUntil && path.some(q => inBox(-X(team, q.x), Z(team, q.z)))) { const i = intercept(k); if (inBox(-X(team, i.x), Z(team, i.z)) && i.t + K.keeperFirst <= rivalFirst[team]) setTarget(k, i.x, i.z, 1, 'chase'); }
      }
      if (carrier && carrier.team !== team) {
        // Defending: nearest presses, the next covers the lane to the most dangerous receiver, defenders mark nearest attackers.
        const sorted = own.filter(p => !p.keeper).sort((a, b) => dist(a, carrier) - dist(b, carrier));
        // He jockeys a step off, between the ball and his goal, and backs off as the carrier comes on; the tackle is a step in (duels()).
        // 2026-11-09: his spot was 0.6 m from the carrier, inside the bodies' 0.9 m spacing, so the two stood pressed together ~20 s a match.
        const presser = sorted[0];
        if (presser) { const gx = W(team, -GOAL_X), gl = Math.hypot(gx - carrier.x, carrier.z) || 1, j = T.duel.jockey;
          setTarget(presser, carrier.x + carrier.vx * .25 + (gx - carrier.x) / gl * j, carrier.z + carrier.vz * .25 - carrier.z / gl * j, .95 * (1 - .4 * relax(team)), 'press'); }
        const second = sorted[1];
        // The next man covers the path from the ball to goal, so beating one defender is not beating the line.
        // Near the own goal he steps in tight, so a dribbler in and around the box meets a second challenge (user: "biri müdahale etsin").
        if (second && dist(second, carrier) < 14) { const gx = W(team, -GOAL_X), gl = Math.hypot(gx - carrier.x, carrier.z) || 1, close = smoothstep(-28, -42, X(team, carrier.x)), gap = 4.5 - 1.8 * close; setTarget(second, carrier.x + (gx - carrier.x) / gl * gap, carrier.z - carrier.z / gl * gap, .92 + .06 * close, 'cover'); }
        const marked = new Set<number>();
        for (const p of own) {
          if (p.keeper || p.role === 'press' || p.role === 'cover' || p.role === 'chase' || p.slot.unit === 'attack') continue;
          let best: RtPlayer | null = null, bd = p.slot.unit === 'defense' ? 15 : 9;
          for (const o of opponents(team)) { if (o.keeper || o === carrier || marked.has(o.idx)) continue; const d = Math.hypot(o.x - p.tx, o.z - p.tz) / (1 + K.heatMark * heat(o)); if (d < bd) { bd = d; best = o; } }
          if (best) { marked.add(best.idx); const gx = W(team, -GOAL_X), gl = Math.hypot(gx - best.x, -best.z) || 1, tight = (1.2 + (10 - p.a.positioning) * .12) * (1 - .3 * heat(best));
            setTarget(p, best.x + (gx - best.x) / gl * tight, best.z - best.z / gl * tight, .88, 'mark'); }
        }
      }
      if (carrier && carrier.team === team && !carrier.keeper) {
        const mates = own.filter(p => p !== carrier && !p.keeper && p.role !== 'run').sort((a, b) => dist(a, carrier) - dist(b, carrier));
        for (const p of mates.slice(0, 3)) { let s = supportSpots.get(p.idx); if (!s || t >= p.supportAt) { s = supportSpot(p, carrier); supportSpots.set(p.idx, s); p.supportAt = t + rng.range(.8, 1.4); } setTarget(p, s.x, s.z, .78, 'support'); }
        const cX = X(team, carrier.x), line = lastLine(team);
        for (const p of own) {
          // Forwards, wingers and the No. 10 run in behind; with the ball in the final third central midfielders arrive late in the box, in
          // front of the back line, and stay for the cut-back or the cross (2026-11-04: they stood 20 m off the play, forwards took 3 shots in 4).
          const late = p.slot.position === 'CM', runner = p.slot.unit === 'attack' || p.slot.position === 'CAM' || p.slot.position === 'W' ? 1 : late && cX > 12 ? K.midfieldRuns : 0;
          if (p === carrier || p.keeper || !runner || p.role === 'run') continue;
          // A side chasing the game sends more runners.
          if (cX > -15 && rng.chance(.07 * runner * (p.a.speed + p.a.positioning) / 15 * C.attackingIntent * (1 + K.chasingRuns * clamp((score[1 - team as Team] - score[team]) / 2, 0, 1)))) {
            const pX = X(team, p.x), rX = late ? clamp(Math.min(line, 46) - rng.range(1, 6), Math.max(pX + 3, 34), 44) : clamp(line + rng.range(4, 11), pX + 3, 47);
            const rZ = clamp(Z(team, p.z) * (late ? rng.range(.2, .6) : rng.range(.5, .95)), -26, 26);
            setTarget(p, W(team, rX), W(team, rZ), 1, 'run'); p.roleUntil = t + (late ? clamp(Math.hypot(rX - pX, rZ - Z(team, p.z)) / topSpeed(p) + rng.range(1, 2.2), 2.2, 6) : rng.range(2.2, 3.6));
          }
        }
      }
    }
  }

  // --- movement ---------------------------------------------------------------
  function movePlayers() {
    for (const p of players) {
      const owner = ball.owner === p.idx, stalled = t < p.stallUntil;
      if (p.lunge && t > p.lunge.t1 + .02 && t >= p.groundedUntil) p.lunge = null;
      const g = p.lunge;
      if (g && t <= g.t1 + .02) {
        // Dive or slide: the body travels with the animation to its end point.
        if (t >= g.t0) { const u = smoothstep(g.t0, g.t1, t), nx = lerp(g.x0, g.x1, u), nz = lerp(g.z0, g.z1, u); p.vx = (nx - p.x) / DT; p.vz = (nz - p.z) / DT; p.x = nx; p.z = nz; }
        else { p.vx *= .6; p.vz *= .6; }
      } else if (t < p.groundedUntil) { p.vx = 0; p.vz = 0; }
      else {
        let top = topSpeed(p) * (owner && !ball.hands ? T.locomotion.carry * (.7 + .03 * p.a.dribbling) : 1);
        if (stalled) top *= .25;
        const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
        // Arrive without overrunning: never faster than he can still stop from in the distance left.
        let speed = Math.min(top * p.pace, Math.sqrt(2 * T.locomotion.brake * Math.max(0, d - .1)));if (d < .25) speed = 0;
        const ux = d > 0 ? dx / d : 0, uz = d > 0 ? dz / d : 0, slowing = speed < Math.hypot(p.vx, p.vz) - .05, acc = (slowing ? Math.max(acceleration(p), T.locomotion.brake) : acceleration(p)) * DT;
        let ax = ux * speed - p.vx, az = uz * speed - p.vz;const al = Math.hypot(ax, az);if (al > acc) { ax *= acc / al; az *= acc / al; }
        p.vx += ax; p.vz += az; p.x += p.vx * DT; p.z += p.vz * DT;
      }
      // In front of the goal lines (so never into the net or round the back of the goal), never into the boards along the touchlines.
      const line = cornerTaker(p) ? GOAL_X + .6 : GOAL_X - .2;if (Math.abs(p.x) > line) { p.x = Math.sign(p.x) * line; p.vx = 0; }
      p.z = clamp(p.z, -PI.halfWidth - 2.6, PI.halfWidth + 2.6);
      const v = Math.hypot(p.vx, p.vz), want = owner || v < .4 ? (owner && v > .4 ? Math.atan2(p.vx, p.vz) : Math.atan2(ball.x - p.x, ball.z - p.z)) : Math.atan2(p.vx, p.vz);
      // After the first touch he turns with the ball instead of holding the receiving stance to the end of the move.
      if ((t >= p.actionEnd || p.action === ACTION.none || (p.action === ACTION.receive && t > p.actionStart + .3)) && t >= p.groundedUntil) p.heading += Math.atan2(Math.sin(want - p.heading), Math.cos(want - p.heading)) * Math.min(1, DT * 9);
      const frac = v / Math.max(1, topSpeed(p)), drainMul = 1.3 - .09 * p.a.stamina;
      p.energy = clamp(p.energy - (frac > .75 ? T.energy.sprintDrain : T.energy.jogDrain * frac) * drainMul * DT + (frac < .3 ? T.energy.recover * (.6 + .06 * p.a.stamina) * DT : 0), 0, 1);
      if (t >= p.actionEnd && p.action !== ACTION.none && p.action !== ACTION.hold) p.action = ACTION.none;
    }
    // Bodies keep apart; a man on the ground or mid-dive is not shoved, the one standing steps round him.
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
      const a = players[i]!, b = players[j]!, dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      // Celebrating team-mates may close in to hug.
      const hug = t < celebrateUntil && a.role === 'celebrate' && b.role === 'celebrate' && a.team === b.team;
      if (!(d > 0 && d < (hug ? T.setPiece.celebrateHug : T.locomotion.separation))) continue;
      const wa = a.lunge || t < a.groundedUntil ? 0 : 1, wb = b.lunge || t < b.groundedUntil ? 0 : 1;if (!wa && !wb) continue;
      const push = (T.locomotion.separation - d) / d / (wa + wb);a.x -= dx * push * wa; a.z -= dz * push * wa; b.x += dx * push * wb; b.z += dz * push * wb;
    }
  }

  // --- execution ----------------------------------------------------------------
  function controlChance(p: RtPlayer, speed: number, air: boolean, pressure: number) {
    const c = T.control, guest = p.guest;
    let pc = c.base + c.perControl * (p.a.control - 5) - Math.max(0, speed - c.fastBall) * c.perFastBall - (air ? c.air : 0) - c.pressure * pressure - c.fatigue * (1 - p.energy);
    pc = clamp(pc, .25, .98);
    if (guest) { const err = 1 - pc; pc = 1 - Math.min(1, err * c.guestFactor, err + c.guestMax); }
    return pc;
  }
  /** Ground or lofted pass with execution error from PAS, pressure and fatigue. */
  function launchPass(p: RtPlayer, q: RtPlayer | null, tx: number, tz: number, kind: PassKind, lofted: boolean, opts: { yEnd?: number; tf?: number; skill?: number; corner?: boolean } = {}) {
    const press = pressureAt(p.team, p.x, p.z), noise = fatigueNoise(p) * (weakFoot(p) ? LUCK.weakFootPassSigma : 1), skill = opts.skill ?? p.a.passing, d = Math.max(1, Math.hypot(tx - p.x, tz - p.z));
    ball.owner = -1; ball.hands = false; ball.x = p.x + Math.sin(p.heading) * .3; ball.z = p.z + Math.cos(p.heading) * .3; ball.y = R; keyBall();
    if (!lofted) {
      const sigma = (T.pass.angleSigmaBase + T.pass.angleSigmaSkill * (1 - skill / 10)) * (1 + T.pass.pressureSigma * press) * noise;
      const ang = Math.atan2(tz - p.z, tx - p.x) + rng.normal() * sigma, va = lerp(T.pass.arriveSpeed[0], T.pass.arriveSpeed[1], clamp(d / 40, 0, 1));
      const v0 = groundLaunch(d, va) * (1 + rng.normal() * T.pass.speedSigma * (1.4 - skill / 10));
      ball.vx = Math.cos(ang) * v0; ball.vz = Math.sin(ang) * v0; ball.vy = 0;
    } else {
      const sl = d * (T.pass.loftLandingSigma + T.pass.loftLandingSkill * (1 - skill / 10)) * (1 + .5 * press) * noise * longBallFactor(p, d);
      const lx = tx + rng.normal() * sl, lz = tz + rng.normal() * sl, ld = Math.max(1, Math.hypot(lx - ball.x, lz - ball.z)), tf = (opts.tf ?? loftFlightTime(ld)) * rng.range(.94, 1.06);
      const v = loftLaunch(ld, tf, R, opts.yEnd ?? R);ball.vx = (lx - ball.x) / ld * v.vh; ball.vz = (lz - ball.z) / ld * v.vh; ball.vy = v.vy;
    }
    ball.pass = { from: p.idx, to: q?.idx ?? -1, kind, team: p.team, t0: t, tx, tz, lofted, tried: new Map(), corner: !!opts.corner }; ball.shot = null; ball.aerialDone = false;
    // A clearance is not a pass: it does not count toward pass accuracy.
    ball.lastTouch = p.idx; ball.lastTeam = p.team; p.touchUntil = t + .4; if (kind !== 'clear') { p.stats.passes++; stats[p.team].passes++; }
    lastStrike = { player: p.idx, team: p.team, t, shot: false }; lastTouchOf[p.team] = p.idx;
    if (q) lastPass = { from: p.idx, to: q.idx, team: p.team, t };
  }

  /** Shot model shared by the decision estimate and the execution. */
  function shotSkill(p: RtPlayer, d: number, header: boolean) {
    if (header) return clamp(.55 * p.aerial + .3 * p.a.finishing + .15 * p.a.positioning, 1, 11);
    const w = clamp((d - 9) / 14, 0, 1);return lerp(.35 * p.a.shooting + .65 * p.a.finishing, .72 * p.a.shooting + .28 * p.a.finishing, w);
  }
  function shotSigma(p: RtPlayer, d: number, header: boolean, press: number, crowd = 0) {
    const s = T.shot, S = shotSkill(p, d, header), room = (1 + K.crowdSigma * crowd) * (crowd === 0 && press < .15 ? K.freeComposure : 1);
    // Composure: below good shooting a strike sprays (user: low ŞUT/BİTİRİCİLİK shoot too and often go wide).
    return (s.angleSigmaBase + s.angleSigmaSkill * (1 - S / 10)) * (1 + s.pressureSigma * press) * fatigueNoise(p) * (header ? (p.headerSpecialist ? s.specialistHeaderSigma : s.headerSigma) : 1 + K.composure * Math.max(0, K.composureFrom - S))
      * (1 + s.distanceSigma * Math.max(0, d - s.distanceSigmaFrom)) * room / C.finishing;
  }
  /** Placement: composed finishers pick the corners; pressure and low BİT pull shots toward the keeper. */
  const absError = (p: RtPlayer, header: boolean, press: number) => T.shot.absoluteError * (1 + .8 * press) * (header ? T.shot.headerAbsoluteError * (p.headerSpecialist ? .8 : 1) : 1 + K.finishError * Math.max(0, 7 - p.a.finishing)) * fatigueNoise(p) / C.finishing;
  /** Struck shots always carry pace: a poor shooter misses by aim, he does not roll it to the keeper. */
  const strikeSpeed = (p: RtPlayer) => Math.max(K.minShotSpeed, T.shot.speedBase + T.shot.speedPerShooting * p.a.shooting);
  /** A header carries far less pace than a strike: a keeper set on his line can reach it. */
  const headerSpeed = (p: RtPlayer) => T.shot.headerSpeedBase + T.shot.headerSpeedPerAerial * p.aerial;
  const aimSpread = (p: RtPlayer, press: number) => .9 + 1.4 * press + Math.max(0, 8 - p.a.finishing) * .15;
  /** The keeper stands off his line, so the shot's offset is measured at his depth: coming out narrows the angle. */
  function keeperNeed(k: RtPlayer, team: Team, sX: number, sZ: number, ez: number, ey: number) {
    const kX = X(team, k.x), kZ = Z(team, k.z), u = clamp((kX - sX) / Math.max(.5, GOAL_X - sX), .05, 1), zAt = sZ + (ez - sZ) * u, yAt = .2 + (ey - .2) * u;
    return { need: Math.hypot(zAt - kZ, Math.max(0, yAt - 1.1) * .7), fraction: u };
  }
  function keeperSaveChance(k: RtPlayer, need: number, travel: number, speed: number, screened = 0) {
    const s = T.shot, rating = k.gk, reaction = s.reaction - s.reactionPerRating * (rating - 70) + (travel < 8 ? .06 : 0) + screened, ta = travel / speed;
    // A ball from distance is seen early: the keeper is set and covers more of his goal (corners from 20 m+ are not automatic).
    const reach = Math.min(s.maxReach + .55 * clamp(ta - .65, 0, .6), s.standReach + s.dive * Math.max(0, ta - reaction)), handling = clamp((s.handlingBase + s.handlingPerRating * (rating - 70)) * C.keeper * (keeperDay[k.id] ?? 1), .5, .97);
    // Handling errors grow with the difficulty of the save: a ball struck at him is held, a full-stretch dive is where weak keepers fail.
    // ...and a ball he sees coming from far is rarely spilled.
    const slip = (1 - handling) * clamp((need - .6) / 2, 0, 1) ** 1.5 * clamp(speed / 24, .5, 1.2) * clamp(1.25 - ta, .15, 1);
    return sigmoid((reach - need) / s.saveSharpness) * (1 - slip);
  }
  function shotEstimate(p: RtPlayer, header: boolean) {
    const team = p.team, sX = X(team, p.x), sZ = Z(team, p.z), d = Math.hypot(GOAL_X - sX, sZ), ang = goalAngle(sX, sZ), press = clamp(pressureAt(team, p.x, p.z) + K.heatPress * heat(p), 0, 1), crowd = header ? 0 : crowdAt(team, p.x, p.z);
    const sigma = shotSigma(p, d, header, press, crowd), half = Math.max(.15, d * Math.tan(ang / 2) - .55), onZ = erf(half / (Math.max(.05, Math.hypot(d * sigma, absError(p, header, press))) * Math.SQRT2)), onY = erf(1 / (Math.max(.05, Math.hypot(d * sigma * .8, absError(p, header, press) * .8)) * Math.SQRT2));
    const k = keeperOf(1 - team as Team), kZ = Z(team, k.z), side = kZ > 0 ? -1 : 1, aimZ = side * Math.max(0, PI.goalHalfWidth - .5 - (aimSpread(p, press) + (header ? T.shot.headerAimSpread : 0)) / 2);
    const geo = keeperNeed(k, team, sX, sZ, aimZ, .9), speed = header ? headerSpeed(p) : strikeSpeed(p);
    let blockers = 0;for (const o of opponents(team)) { if (o.keeper) continue; const oX = X(team, o.x), oZ = Z(team, o.z); if (oX > sX && oX < GOAL_X) { const u = (oX - sX) / Math.max(1, GOAL_X - sX), lineZ = sZ * (1 - u); if (Math.abs(oZ - lineZ) < 1.1 && u < .85) blockers++; } }
    const pOn = onZ * onY, pSave = keeperSaveChance(k, geo.need, d * geo.fraction, speed * (crowd >= 2 ? .78 : 1)), pBlock = 1 - (1 - T.shot.blockPerDefender) ** blockers * (1 - K.smother) ** crowd;
    return { pGoal: clamp(pOn * (1 - pSave) * (1 - pBlock), 0, .95), d, press, pOn, crowd };
  }
  function shoot(p: RtPlayer, header: boolean, opts: { penalty?: boolean; freeKick?: boolean } = {}) {
    const team = p.team, k = keeperOf(1 - team as Team), sX = X(team, p.x), sZ = Z(team, p.z), d = Math.max(2, Math.hypot(GOAL_X - sX, sZ)), press = opts.penalty ? .35 : clamp(pressureAt(team, p.x, p.z) + (header ? 0 : K.heatPress * heat(p)), 0, 1);
    const kZ = Z(team, k.z), side = kZ > .25 ? -1 : kZ < -.25 ? 1 : rng.chance(.5) ? 1 : -1, nearPost = rng.chance(.22);
    // A header cannot be placed like a strike: it is aimed less tight to the posts, within reach of a set keeper more often.
    let aimZ = (nearPost ? -side : side) * Math.max(0, PI.goalHalfWidth - .5 - rng.range(0, aimSpread(p, press) + (header ? T.shot.headerAimSpread : 0))), aimY = header ? rng.range(.25, 1.3) : rng.chance(.55) ? rng.range(.2, .7) : rng.range(1, 2.1);
    if (opts.penalty) { aimZ = side * rng.range(1.6, 3); aimY = rng.range(.3, 1.8); }
    // Direct free kick: mostly curled over the wall into the top half, now and then driven low under it.
    if (opts.freeKick) { aimZ = (rng.chance(.55) ? side : -side) * (PI.goalHalfWidth - .45 - rng.range(0, .6)); aimY = rng.chance(.82) ? rng.range(1.45, 2.25) : rng.range(.15, .4); }
    const crowd = header || opts.penalty || opts.freeKick ? 0 : crowdAt(team, p.x, p.z);
    const sigma = shotSigma(p, d, header, press, crowd) * (opts.penalty ? .55 : 1) * (!header && weakFoot(p) ? LUCK.weakFootSigma : 1);
    // The end height never goes below the ball's radius: a low shot that bounced before the line would not arrive where it is resolved.
    const spread = Math.hypot(d * sigma, opts.penalty ? .25 : absError(p, header, press)), ez = aimZ + rng.normal() * spread, ey = clamp(aimY + rng.normal() * spread * .8, R + .02, 5);
    // Hemmed in by two or more there is no backlift: a cramped, weaker strike (the only shots allowed below the minimum pace).
    const speed = opts.freeKick ? (K.fkSpeedBase + K.fkSpeedPerShooting * p.a.shooting) * rng.range(.95, 1.05) : header ? headerSpeed(p) * rng.range(.9, 1.08) : crowd >= 2 ? strikeSpeed(p) * rng.range(K.crampedSpeed[0], K.crampedSpeed[1]) : Math.max(K.minShotSpeed, strikeSpeed(p) * rng.range(.9, 1.08));
    const est = shotEstimate(p, header), ta = d / speed;let outcome: ShotOutcome = 'wide', endT = t + ta, endX = GOAL_X, endZ = ez, endY = ey, blocker = -1;
    // Smothered: a defender right on him gets a leg to it before it is away.
    if (crowd) for (const o of opponents(team)) {
      if (o.keeper || dist(o, p) > K.crowdRadius) continue;
      const oX = X(team, o.x), oZ = Z(team, o.z), ahead = Math.cos(Math.atan2(oZ - sZ, oX - sX) - Math.atan2(ez - sZ, GOAL_X - sX));
      if (ahead > .35 && rng.chance(K.smother * (.8 + .04 * o.a.defending))) { outcome = 'block'; blocker = o.idx; endT = t + Math.max(.05, dist(o, p) / speed); endX = oX; endZ = oZ; endY = rng.range(.2, .8); break; }
    }
    // Blocks: defenders standing in the line can get a body in the way.
    if (!opts.penalty && blocker < 0) for (const o of opponents(team)) {
      if (o.keeper) continue; const oX = X(team, o.x), oZ = Z(team, o.z);if (oX <= sX + 1 || oX >= GOAL_X - .5) continue;
      const u = (oX - sX) / (GOAL_X - sX), lineZ = sZ + (ez - sZ) * u;
      // Height of the ball as it passes him: nobody blocks what goes over his head, and the wall stops what passes below a jumping head.
      const y0 = header ? Math.max(ball.y, 1.6) : R, yAt = y0 + (ey - y0) * u + T.ball.gravity * ta * ta * u * (1 - u) / 2;
      if (opts.freeKick && dist(o, p) < 11) { if (Math.abs(oZ - lineZ) < .75 && yAt < rng.range(K.wallJump[0], K.wallJump[1])) { outcome = 'block'; blocker = o.idx; endT = t + ta * u; endX = oX; endZ = oZ; endY = clamp(yAt, .3, 2.2); break; } continue; }
      if (Math.abs(oZ - lineZ) < 1.05 && u < .88 && yAt < K.blockHeight && rng.chance(K.blockChance * (.8 + .04 * o.a.positioning))) { outcome = 'block'; blocker = o.idx; endT = t + ta * u; endX = oX; endZ = oZ; endY = clamp(yAt, .3, 1.8); break; }
    }
    const post = Math.abs(Math.abs(ez) - PI.goalHalfWidth) < T.shot.postWidth && ey < PI.goalHeight || Math.abs(ey - PI.goalHeight) < T.shot.postWidth && Math.abs(ez) < PI.goalHalfWidth;
    const onTarget = Math.abs(ez) < PI.goalHalfWidth - R && ey < PI.goalHeight - R;
    let pSave = 0;
    if (blocker < 0) {
      if (post) outcome = 'post';
      else if (!onTarget) outcome = 'wide';
      else {
        const geo = keeperNeed(k, team, sX, sZ, ez, ey);pSave = keeperSaveChance(k, geo.need, d * geo.fraction, speed, opts.freeKick ? K.wallScreen : 0) * (opts.penalty ? .55 : 1);
        outcome = rng.chance(pSave) ? (rng.chance(T.shot.catchBase + .006 * (k.gk - 70) + (speed < 18 ? .2 : 0)) ? 'save' : 'parry') : 'goal';
        // The save is made where the keeper is: at his depth, on the ball's line there (the reach that decided it), not on the goal line.
        if (outcome !== 'goal') { const kX = Math.min(X(team, k.x), GOAL_X - .5), u = clamp((kX - sX) / Math.max(.5, GOAL_X - sX), .05, 1); endX = kX; endZ = clamp(sZ + (ez - sZ) * u, kZ - 2.9, kZ + 2.9); endY = clamp(R + (ey - R) * u, .2, 2.3); endT = t + ta * u; }
      }
    }
    const wEndX = W(team, endX), wEndZ = W(team, endZ), dur = Math.max(.12, endT - t);
    // A header leaves from where the head met the ball; a struck shot from in front of the kicking foot.
    ball.owner = -1; ball.hands = false; ball.y = header ? Math.max(ball.y, 1.6) : R;if (!header) { ball.x = p.x + Math.sin(p.heading) * .35; ball.z = p.z + Math.cos(p.heading) * .35; } keyBall();
    ball.vx = (wEndX - ball.x) / dur; ball.vz = (wEndZ - ball.z) / dur; ball.vy = (endY - ball.y) / dur + T.ball.gravity * dur / 2;
    const e = log(header ? 'header' : opts.penalty ? 'penalty' : 'shot', team, p, k, Math.max(opts.freeKick ? .6 : 0, outcome === 'goal' ? .95 : onTarget ? .72 : est.pGoal > .2 ? .62 : .45),
      `${p.name} ${header ? 'kafa vuruşu' : opts.penalty ? 'penaltı' : opts.freeKick ? 'serbest vuruştan şut' : 'şut'} · ${d.toFixed(0)} m · gol olasılığı ${pct(est.pGoal)}${header && p.headerSpecialist ? ' · güçlü kafa vuruşu' : ''}`,
      { p: est.pGoal, sampled: pSave, pressure: press, distance: d, attrs: header ? { strength: p.a.strength, positioning: p.a.positioning, finishing: p.a.finishing } : attrs(p, ['shooting', 'finishing']), outcome, dx: wEndX, dz: wEndZ });
    ball.shot = { shooter: p.idx, team, outcome, endT, ex: wEndX, ey: endY, ez: wEndZ, keeper: k.idx, header, xg: est.pGoal, blocker, penalty: !!opts.penalty, eventId: e.id };
    ball.pass = null; ball.lastTouch = p.idx; ball.lastTeam = team; p.touchUntil = t + .5; lastStrike = { player: p.idx, team, t, shot: true }; lastTouchOf[team] = p.idx;
    p.stats.shots++; stats[team].shots++; if (onTarget && blocker < 0) { p.stats.onTarget++; stats[team].onTarget++; }
    // The keeper commits to the shot: dive toward the crossing point.
    if (outcome !== 'wide' && outcome !== 'block') diveFor(k, team, sX, sZ, ez, endZ, Math.max(.12, endT - t), outcome);
  }

  /** The keeper's body goes for the ball along his line so his gloves meet it at the contact time; beaten, he lands just short of it. */
  function diveFor(k: RtPlayer, team: Team, sX: number, sZ: number, ez: number, endZ: number, contact: number, outcome: ShotOutcome) {
    const kX = Math.min(X(team, k.x), GOAL_X - .5), kZ = Z(team, k.z), u = clamp((kX - sX) / Math.max(.5, GOAL_X - sX), .05, 1);
    const lineZ = outcome === 'goal' ? sZ + (ez - sZ) * u : endZ, lateral = lineZ - kZ, side = Math.sign(lateral) || 1, dive = Math.abs(lateral) > .8;
    // Same reach as the save model: standing reach of the gloves plus the dive's travel after the reaction, never faster than a dive.
    const react = Math.min(contact * .45, T.shot.reaction), hands = dive ? T.shot.standReach : .15, length = Math.max(.6, contact + .9), travel = T.shot.dive * Math.max(.05, contact - react) + .2;
    const reach = Math.min(travel, Math.max(0, Math.abs(lateral) - hands - (outcome === 'goal' ? rng.range(.3, .8) : 0)));
    act(k, dive ? ACTION.dive : ACTION.catch, length, 0, Math.sign(lateral * dir[k.team]) || 1); k.actionStart = t + react * .5; k.actionEnd = k.actionStart + length;
    k.lunge = { t0: t + react, t1: t + Math.max(react + .12, contact), x0: k.x, z0: k.z, x1: W(team, kX), z1: W(team, kZ + side * Math.min(reach, 3)) };
    if (dive) k.groundedUntil = k.lunge.t1 + .7;
    k.tx = k.lunge.x1; k.tz = k.lunge.z1; k.role = 'keeper'; k.roleUntil = t + contact + 1.1;
  }

  // --- carrier decision -------------------------------------------------------
  interface Option { utility: number; run: () => void; label: string }
  function passOption(p: RtPlayer, q: RtPlayer, kind: PassKind, tx: number, tz: number, lofted: boolean, skill = p.a.passing): Option | null {
    const d = Math.hypot(tx - p.x, tz - p.z);if (d < 3.5 || d > (lofted ? maxLongBall(p) : 40)) return null;
    const team = p.team, react = .2;let pInt = 1;
    const va = lerp(T.pass.arriveSpeed[0], T.pass.arriveSpeed[1], clamp(d / 40, 0, 1)), v0 = groundLaunch(d, va), arrive = lofted ? loftFlightTime(d) : groundTime(v0, d);
    for (const o of opponents(team)) {
      let danger = 0;
      for (const s of lofted ? [.06, 1] : [.15, .32, .5, .68, .84, 1]) {
        const px = p.x + (tx - p.x) * s, pz = p.z + (tz - p.z) * s, tb = lofted ? (s < .5 ? .1 : arrive) : groundTime(v0, s * d);
        const to = Math.max(0, Math.hypot(o.x - px, o.z - pz) - (o.keeper ? T.intercept.keeperReach : T.intercept.reach)) / topSpeed(o) + react + .04 * (10 - o.a.positioning);
        danger = Math.max(danger, sigmoid((tb - to) / .13) * (lofted && s === 1 ? .7 : 1));
      }
      // A forward who has been feeding on loose passes is given a wide berth: lanes near him look riskier to the man on the ball.
      pInt *= 1 - Math.min(.95, danger * clamp(.5 + .045 * (o.a.defending - 5) + .03 * (o.a.positioning - 5), .25, .88) * C.defenseSharpness * (1 - .35 * relax(o.team)) * (1 + K.heatWary * heat(o)));
    }
    pInt = 1 - pInt;
    const reachT = Math.max(0, Math.hypot(q.x - tx, q.z - tz) - .7) / topSpeed(q) + .1, pReach = sigmoid((arrive + .5 - reachT) / .22);
    const sigma = (T.pass.angleSigmaBase + T.pass.angleSigmaSkill * (1 - skill / 10)) * (1 + T.pass.pressureSigma * pressureAt(team, p.x, p.z)) * fatigueNoise(p);
    const lateral = lofted ? d * (T.pass.loftLandingSigma + T.pass.loftLandingSkill * (1 - skill / 10)) * longBallFactor(p, d) : d * sigma, pExec = erf((1.25 + .02 * d) / (Math.max(.05, lateral) * Math.SQRT2));
    const near = nearestOpponent(team, tx, tz), pCtrl = controlChance(q, lofted ? 8 : va, lofted, clamp(1 - near.d / 4, 0, 1));
    let ps = (1 - pInt) * pReach * pExec * pCtrl;
    // Vision: low GÖR misjudges lanes.
    ps = clamp(ps + rng.normal() * (T.pass.judgementNoise * (1 - p.a.vision / 10) + .02), .01, .99);
    const tX = X(team, tx), tZ = Z(team, tz), space = clamp(near.d / 10, 0, 1) * .02;
    let u = ps * (threat(tX, tZ) + space) - (1 - ps) * lossCost(X(team, (p.x + tx) / 2), Z(team, (p.z + tz) / 2));
    if (q.guest && u > 0) u *= snapshot.tuning.guestAdaptation.receiverUtilityFactor;
    if (q.keeper) u -= .02;
    return { utility: u, label: `${kind}→${q.name}`, run: () => windup(p, ACTION.pass, () => {
      launchPass(p, q, tx, tz, kind, lofted, { skill });
      log(kind === 'through' ? 'through-pass' : lofted ? 'diagonal-pass' : 'pass', team, p, q, kind === 'through' && inBox(tX, tZ) ? .45 : .08,
        `${p.name} → ${q.name} ${kind === 'through' ? 'ara pas' : lofted ? 'uzun top' : 'pas'} · başarı tahmini ${pct(ps)}`, { p: ps, distance: d, attrs: attrs(p, ['passing', 'vision']), dx: tx, dz: tz });
    }, T.pass.windup, tx, tz) };
  }
  /** Strike delay: the kicker plants and swings (animation contact at 45%), staying tackle-able meanwhile. */
  function windup(p: RtPlayer, code: number, run: () => void, duration: number = T.pass.windup, faceX?: number, faceZ?: number) {
    if (faceX !== undefined && faceZ !== undefined) p.heading = Math.atan2(faceX - p.x, faceZ - p.z);
    act(p, code, duration / .45, .0);p.actionStart = t;p.actionEnd = t + duration / .45;
    // Struck on the move when the ball goes roughly the way he runs; across or back over his body he plants and stops as before
    // (2026-11-09: every kick braked to a standstill, so runners stopped dead to pass).
    const v = Math.hypot(p.vx, p.vz), along = v > .5 ? (p.vx * Math.sin(p.heading) + p.vz * Math.cos(p.heading)) / v : 0;
    const keep = T.pass.strideKeep * clamp((along - .3) / .55, 0, 1), lead = duration / .45;
    setTarget(p, p.x + p.vx * lead, p.z + p.vz * lead, keep * v / Math.max(1, topSpeed(p)), 'carry');
    // Kicking foot: strong foot most of the time (left-footers per the user), the weak foot is less accurate.
    if (code === ACTION.pass || code === ACTION.shot) p.actionParam = rng.chance(LUCK.strongFootChance) ? strongFoot(p) : 1 - strongFoot(p);
    pending = { player: p.idx, at: t + duration, run };
  }
  const isLongPasser = (p: RtPlayer) => (LONG_PASSERS as readonly string[]).includes(p.id);
  /** Long balls: the user's long passers reach ~72 m and stay accurate; others fade past 38 m and stop near 50 m. Keepers use their distribution. */
  const maxLongBall = (p: RtPlayer) => p.keeper ? 68 : isLongPasser(p) ? LONG_BALL.specialistMax : LONG_BALL.normalMax;
  const longBallFactor = (p: RtPlayer, d: number) => p.keeper ? 1 : isLongPasser(p) ? LONG_BALL.specialistSigma * (1 + LONG_BALL.specialistFade * Math.max(0, d - LONG_BALL.normalFadeFrom)) : 1 + LONG_BALL.normalFade * Math.max(0, d - LONG_BALL.normalFadeFrom);
  const strongFoot = (p: RtPlayer) => (LEFT_FOOTED as readonly string[]).includes(p.id) ? 0 : 1;
  const weakFoot = (p: RtPlayer) => (p.action === ACTION.pass || p.action === ACTION.shot) && p.actionParam !== strongFoot(p);
  /** Attribute tendency to take players on (high ÇALIM/HIZ, attacking roles) times the user's style notes. */
  function dribbleTendency(p: RtPlayer) {
    const attacking = p.slot.unit === 'attack' || p.slot.position === 'W' || p.slot.position === 'CAM';
    return clamp(1 + .12 * (p.a.dribbling - 6) + .08 * (p.a.speed - 6) + (attacking ? .15 : -.1), .55, 1.75) * (PLAYER_STYLES[p.id]?.dribble ?? 1);
  }
  function startTakeOn(p: RtPlayer, d: RtPlayer, pBeat: number, nutmeg: boolean, tx: number, tz: number) {
    setTarget(p, tx, tz, 1, 'carry'); p.decideAt = t + .55; takeOn = { carrier: p.idx, defender: d.idx, at: t + .3, pBeat, nutmeg };
  }
  function resolveTakeOn() {
    const k = takeOn;if (!k || t < k.at) return;takeOn = null;
    const p = players[k.carrier]!, d = players[k.defender]!;
    if (ball.owner !== p.idx || dist(p, d) > 2.8 || t < d.lockUntil) return;
    const r = rng.next(), team = p.team, pX = X(team, p.x);
    if (r < k.pBeat) {
      d.lockUntil = t + 1; d.stallUntil = t + T.duel.beatenStall; d.tackleUntil = t + 1.3; act(p, ACTION.touch, .35, .5); p.decideAt = t + .3; p.vx *= .6; p.vz *= .6;
      const prev = beatChain.get(p.idx);beatChain.set(p.idx, { t, count: prev && t - prev.t < 6 ? prev.count + 1 : 1 });
      log('beat', team, p, d, k.nutmeg ? .45 : pX > 20 ? .32 : .18, k.nutmeg ? `${p.name}, ${d.name} oyuncusuna bacak arası attı!` : `${p.name} çalımla ${d.name} oyuncusunu geçti (çalım ${p.a.dribbling}, hız ${p.a.speed})`, { p: k.pBeat, sampled: r, attrs: attrs(p, ['dribbling', 'speed', 'control']) });
      return;
    }
    // Stopped: the defender's tackle (standing, or a slide from further) is decided where his foot meets the ball; a few are fouls.
    if (challenge) return;
    const f = inBox(X(d.team, p.x) * -1, Z(d.team, p.z)) ? .06 : .11;
    startChallenge(d, p, dist(d, p) > T.duel.range, 1 - f, 1);
  }
  function decideCarrier(p: RtPlayer) {
    const team = p.team, pX = X(team, p.x), pZ = Z(team, p.z), press = pressureAt(team, p.x, p.z), options: Option[] = [];
    const see = (d: number) => d < 20 || rng.chance(T.pass.seeBase + T.pass.seePerVision * p.a.vision + (isLongPasser(p) ? .15 : 0));
    const fwd = dir[team], style = PLAYER_STYLES[p.id], tendency = dribbleTendency(p), fromFreeKick = restartPass === p.idx;restartPass = -1;
    // Dribbling on near goal, or for a long stretch, rarely beats a strike or a pass.
    const nearGoal = smoothstep(28, 42, pX), held = Math.exp(-Math.max(0, t - p.lastReceived - 1.5) / K.heldFade);
    // Solo run (Yankı every match, Servan some matches): keeps carrying toward goal until he shoots or loses it.
    if (solo?.player === p.idx && t < solo.until) {
      const est = shotEstimate(p, false), gx = W(team, GOAL_X), weave = Math.sin(t * 1.7 + p.idx) * .45, ang = Math.atan2(-.3 * p.z, gx - p.x) + weave;
      if (est.pGoal > .09 || Math.hypot(GOAL_X - pX, pZ) < 13) { solo = null; windup(p, ACTION.shot, () => shoot(p, false), T.shot.windup, gx, 0); return; }
      setTarget(p, clamp(p.x + Math.cos(ang) * 6, -51, 51), clamp(p.z + Math.sin(ang) * 6, -33, 33), 1, 'carry'); p.decideAt = t + .3; return;
    }
    const passWeight = style?.pass ?? 1;
    for (const q of byTeam[team]) {
      if (q === p) continue;
      const lead = clamp(dist(p, q) / 16, .2, 1.3), lx = q.x + q.vx * lead, lz = q.z + q.vz * lead, d = Math.hypot(lx - p.x, lz - p.z);
      if (q.keeper && (pX > -25 || press < .5)) continue;
      // Never feed a team-mate standing on the own goal line; long balls only go forward or square.
      const qX = X(team, lx);if (!q.keeper && qX < -46) continue;
      if (d <= 38) { const o = passOption(p, q, 'short', lx, lz, false); if (o) options.push(o); }
      if (d >= 24 && qX > pX - 8 && see(d)) { const o = passOption(p, q, 'long', lx, lz, true); if (o) { o.utility -= .008; options.push(o); } }
      if (!q.keeper && (q.role === 'run' || q.slot.unit === 'attack') && X(team, q.x) > pX - 5 && see(30)) {
        const ahead = clamp(lastLine(team) + 3 - X(team, q.x), 3, 14), sx = q.x + fwd * ahead, sz = q.z + q.vz * .4, dd = Math.hypot(sx - p.x, sz - p.z);
        const o = passOption(p, q, 'through', sx, sz, dd > 32);if (o) options.push(o);
      }
    }
    // Shot (user: whoever finds a shooting angle strikes it instead of dribbling on). In the box everyone shoots at a sight of goal;
    // outside it the urge grows with ŞUT/BİTİRİCİLİK, space and angle. Poor shooters shoot too, and miss.
    const sd = Math.hypot(GOAL_X - pX, pZ);
    if (sd < T.shot.range && Math.abs(pZ) < 24) {
      const est = shotEstimate(p, false), ability = (p.a.shooting + p.a.finishing) / 2, want = (p.dayForm === 'mustafa-bad-day' ? 1.25 : 1) * (style?.shoot ?? 1), crowded = Math.max(0, 1 - .3 * est.crowd);
      const selfish = T.decision.shotSelfishness * (1 + .05 * (p.a.finishing - 6)), sight = clamp(goalAngle(pX, pZ) / .5, 0, 1.3), box = inBox(pX, pZ);
      // In the box with a sight of goal and room, the strike comes before the six-yard box rather than a carry into it.
      const urge = (box ? K.boxUrge * (1 + K.urgePerAbility * (ability - 6)) * sight + (sd < 14 && sight > .45 && est.crowd <= 1 ? K.closeUrge : 0) : K.rangeUrge * clamp((ability - 3) / 5, .35, 1.25) * (1 - est.press) * smoothstep(K.rangeMax, 17, sd) * sight * (1 + K.riskShots * risk(team))) * crowded;
      if (box || est.pGoal > T.shot.minimumGoalChance * .5) options.push({ utility: (est.pGoal * selfish + urge) * want + .01, label: 'shot', run: () => windup(p, ACTION.shot, () => shoot(p, false), T.shot.windup, W(team, GOAL_X), 0) });
    }
    // Take-on: a defender in front within reach, beaten with ÇALIM/HIZ/KONTROL against SAVUNMA/HIZ/POZİSYON.
    let front: RtPlayer | null = null, fd = 4.5;
    for (const o of opponents(team)) { if (o.keeper) continue; const dx = X(team, o.x) - pX, dz = Z(team, o.z) - pZ, d = Math.hypot(dx, dz); if (d < fd && dx > 0 && Math.abs(Math.atan2(dz, dx)) < 1.2) { fd = d; front = o; } }
    if (front && !p.keeper) {
      const att = .45 * p.a.dribbling + .3 * p.a.speed + .25 * p.a.control, def = .45 * front.a.defending + .3 * front.a.speed + .25 * front.a.positioning;
      // Mensur: a nutmeg when the man closing him is not a good presser or is weak.
      const nutmeg = !!style?.nutmeg && (front.a.pressing + front.a.defending) / 2 < 6.5;
      // Each extra man beaten within 6 s is harder: the defence has turned and covers.
      const chain = beatChain.get(p.idx), chained = chain && t - chain.t < 6 ? chain.count : 0;
      // A second man close by covers (each beyond the first takes a share), and a man already scoring is closed down harder.
      const crowd = crowdAt(team, p.x, p.z);
      const pBeat = clamp(sigmoid(.38 * (att - def * (1 - .15 * relax(front.team)) * (1 + K.heatDefense * heat(p))) / C.defenseSharpness - K.takeOnBias) + (nutmeg ? .15 : 0) - .12 * chained - K.coverBeat * Math.max(0, crowd - 1), .06, K.beatMax);
      const side = Math.sign(Z(team, front.z) - pZ) || (rng.chance(.5) ? 1 : -1), bX = clamp(X(team, front.x) + 4.5, -50, 50), bZ = clamp(pZ - side * (nutmeg ? 0 : 1.8), -32, 32);
      const tx = W(team, bX), tz = W(team, bZ), raw = (pBeat * threat(bX, bZ) * 1.1 - (1 - pBeat) * lossCost(pX, pZ) * 1.15) * tendency + (nutmeg ? .01 : 0);
      // Hemmed in: a good dribbler takes them on, a poor one looks for another way.
      const able = crowd >= 2 ? (pBeat > .5 ? 1 + .35 * crowd : pBeat < .35 ? .6 : 1) : 1, six = inSix(bX, bZ) ? .3 : 1;
      const u = raw > 0 ? raw * (1 - K.takeOnFadeNearGoal * nearGoal) / (1 + .6 * chained) * held * able * six : raw;
      const def0 = front;options.push({ utility: u, label: 'take-on', run: () => startTakeOn(p, def0, pBeat, nutmeg, tx, tz) });
    }
    // Cross from wide areas into heads in the box.
    if (pX > 18 && Math.abs(pZ) > 12) {
      const targets = byTeam[team].filter(q => q !== p && !q.keeper && X(team, q.x) > 33 && Math.abs(Z(team, q.z)) < 15);
      for (const q of targets) {
        const defenders = opponents(team).filter(o => !o.keeper && Math.hypot(o.x - q.x, o.z - q.z) < 3.5), bestDef = Math.max(0, ...defenders.map(o => o.aerial));
        const pWin = sigmoid((q.aerial - bestDef + .3) / 1.1), pDeliver = clamp(.45 + .055 * p.a.passing, .4, .95);
        const u = pDeliver * pWin * (.26 + (q.headerSpecialist ? .08 : 0)) * C.finishing - (1 - pDeliver * pWin) * .02;
        options.push({ utility: u, label: `cross→${q.name}`, run: () => windup(p, ACTION.pass, () => cross(p, q, false), T.pass.windup, q.x, q.z) });
      }
    }
    // Carry: forward and angled, plus away from pressure.
    for (const deg of [0, 35, -35, 75, -75]) {
      const gx = W(team, GOAL_X), base = Math.atan2(-.25 * p.z, gx - p.x) + deg * Math.PI / 180;
      const cx = clamp(p.x + Math.cos(base) * 5, -51, 51), cz = clamp(p.z + Math.sin(base) * 5, -33, 33);
      let danger = 0;for (const o of opponents(team)) { const d = Math.hypot(o.x - cx, o.z - cz); danger = Math.max(danger, sigmoid((2.6 - d + (o.a.defending + o.a.pressing) / 9 - (p.a.dribbling + p.a.control) / 9) / .9)); }
      const keep = 1 - danger * .7, raw = keep * threat(X(team, cx), Z(team, cz)) - (1 - keep) * lossCost(pX, pZ) + .003, u = raw > 0 ? raw * (.75 + .25 * tendency) * (1 - K.carryFadeNearGoal * nearGoal) * held * (inSix(X(team, cx), Z(team, cz)) ? K.sixCarry : 1) : raw;
      options.push({ utility: u, label: `carry${deg}`, run: () => { setTarget(p, cx, cz, 1, 'carry'); p.decideAt = t + rng.range(T.decision.carryCommit[0], T.decision.carryCommit[1]); } });
    }
    // Passers pass more, ball-keepers less (positive utilities only, so risk aversion is untouched).
    if (passWeight !== 1) for (const o of options) if (o.label.includes('→') && o.utility > 0) o.utility *= passWeight;
    options.push({ utility: (1 - press * .6) * threat(pX, pZ) * .85 - press * lossCost(pX, pZ) * .3, label: 'hold', run: () => { setTarget(p, p.x - fwd * .5, p.z, .3, 'carry'); p.decideAt = t + rng.range(.25, .45); } });
    if (pX < -28 && press > .45) {
      const cx = W(team, clamp(pX + 42, -10, 30)), cz = W(team, pZ * .6);
      options.push({ utility: .5 * threat(X(team, cx), pZ) + .02 - .1 * lossCost(pX, pZ), label: 'clear', run: () => windup(p, ACTION.pass, () => { launchPass(p, null, cx, cz, 'clear', true); log('clearance', team, p, null, .05, `${p.name} topu uzaklaştırdı`); }, T.pass.windup, cx, cz) });
    }
    // A free kick is passed, short or long — never dribbled from the dead ball.
    const passes = fromFreeKick ? options.filter(o => o.label.includes('→') && !o.label.startsWith('cross')) : [], pool = passes.length ? passes : options;
    // Softmax: better vision, sharper choices.
    const tau = T.decision.temperatureBase + T.decision.temperatureVision * (1 - p.a.vision / 10), max = Math.max(...pool.map(o => o.utility));
    const weights = pool.map(o => Math.exp((o.utility - max) / tau)), total = weights.reduce((a, b) => a + b, 0);
    let r = rng.next() * total;for (let i = 0; i < pool.length; i++) { r -= weights[i]!; if (r <= 0) { pool[i]!.run(); return; } }
    pool.at(-1)!.run();
  }

  function cross(p: RtPlayer, q: RtPlayer | null, corner: boolean, o: { tx?: number; tz?: number; setPiece?: boolean } = {}) {
    const team = p.team, tx = o.tx ?? (q ? q.x + q.vx * .8 : W(team, GOAL_X - 8)), tz = o.tz ?? (q ? q.z + q.vz * .8 : 0);
    const d = Math.hypot(tx - p.x, tz - p.z), tf = clamp(d / 17 + .45, 1, 1.7);
    launchPass(p, q, tx, tz, 'cross', true, { yEnd: rng.range(1.6, 2.3), tf, corner });
    log(corner ? 'corner' : 'cross', team, p, q, corner ? .4 : o.setPiece ? .35 : .3, `${p.name} ${corner ? 'korneri kullandı' : o.setPiece ? 'serbest vuruşu ceza sahasına ortaladı' : 'orta yaptı'}${q ? ` · hedef ${q.name}` : ''}`, { distance: d, attrs: attrs(p, ['passing', 'vision']), dx: tx, dz: tz });
    if (corner || o.setPiece) return;
    // The man closing the crosser down can get a leg to it: struck low into his shins, it comes off him (bodyBlock turns it).
    const ux = (tx - p.x) / Math.max(1, d), uz = (tz - p.z) / Math.max(1, d);let blocker: RtPlayer | null = null, bd: number = K.crossBlockReach;
    for (const e of opponents(team)) { if (e.keeper || t < e.groundedUntil || e.lunge) continue; const ex = e.x - p.x, ez = e.z - p.z, ed = Math.hypot(ex, ez); if (ed > .4 && ed < bd && (ex * ux + ez * uz) / ed > .55) { bd = ed; blocker = e; } }
    if (!blocker || !rng.chance(K.crossBlock * (1 - bd / K.crossBlockReach) * clamp(.6 + .05 * (blocker.a.defending - 5), .4, .9))) return;
    const sp = rng.range(13, 17), hit = Math.hypot(blocker.x - ball.x, blocker.z - ball.z) / sp, hx = blocker.x + blocker.vx * hit, hz = blocker.z + blocker.vz * hit, hd = Math.max(.3, Math.hypot(hx - ball.x, hz - ball.z));
    ball.vx = (hx - ball.x) / hd * sp; ball.vz = (hz - ball.z) / hd * sp; ball.vy = rng.range(.8, 2);
    deflectBy = { player: blocker.idx, behind: X(blocker.team, blocker.x) < -GOAL_X + 12 && rng.chance(K.crossBlockBehind), until: t + .4 };
  }
  function keeperDistribute(k: RtPlayer) {
    const team = k.team, options: Option[] = [], dist0 = k.distribution ?? { passing: k.a.passing, vision: k.a.vision };
    for (const q of byTeam[team]) {
      if (q === k) continue;
      const d = dist(k, q), qX = X(team, q.x), qZ = Z(team, q.z);
      if (d < 35 && qX < 5 && qX > X(team, k.x) + 6) { const o = passOption(k, q, 'keeper', q.x, q.z, false, dist0.passing); if (o) options.push(o); }
      // Barkuz in goal: accurate long balls to the wings beyond halfway (user request); others get an ordinary long kick. His skill is the
      // distribution value after chemistry (9, or 8.5 with Arif in his side), never a fixed 9 that skipped the penalty.
      const wide = Math.abs(qZ) >= PI.halfWidth * (1 - 2 * .25) && qX > 0 && d >= 30;
      // A long kick is a lottery he takes when no short option is on (user 2026-11-04: keepers kicked long far too often).
      if (d >= 30) { const o = passOption(k, q, 'long', q.x + q.vx * .8, q.z, true, k.longWide && wide ? dist0.passing : dist0.passing * .9); if (o) { o.utility += (k.longWide && wide ? .03 : 0) - K.keeperLongCost; options.push(o); } }
    }
    ball.hands = false;
    if (!options.length) { const cx = W(team, X(team, k.x) + 45), cz = k.z * .5; windup(k, ACTION.pass, () => launchPass(k, null, cx, cz, 'clear', true, { skill: dist0.passing })); return; }
    // Keepers pick between their two best reads: distribution is less optimised than an outfield decision.
    const best = options.sort((a, b) => b.utility - a.utility)[Math.floor(rng.next() * Math.min(2, options.length))]!;
    best.run();
  }

  // --- duels & fouls ------------------------------------------------------------
  function duels() {
    const carrier = ball.owner >= 0 ? players[ball.owner]! : null;if (!carrier || ball.hands || restart || challenge) return;
    for (const d of opponents(carrier.team)) {
      const gap = dist(d, carrier);
      if (d.keeper || t < d.tackleUntil || t < d.lockUntil || t < d.groundedUntil || d.lunge || gap > T.duel.range + K.slideReach) continue;
      // Beyond standing range the only way to the ball is to go to ground: rarer, chosen more by strong, aggressive defenders.
      const slide = gap > T.duel.range, urgent = K.approachUrgency * smoothstep(26, 40, -X(d.team, carrier.x)) + (inBox(-X(d.team, carrier.x), Z(d.team, carrier.z)) ? .14 : 0);
      const attempt = (T.duel.attemptBase + T.duel.attemptPerPressing * (d.a.pressing - 5) + urgent) * (1 - .5 * relax(d.team)) * (slide ? K.slideAttempt * (.7 + .03 * (d.a.strength + d.a.pressing)) : 1);
      if (!rng.chance(attempt)) continue;
      d.tackleUntil = t + T.duel.cooldown;
      const def = .45 * d.a.defending + .2 * d.a.strength + .2 * d.a.positioning + .15 * d.a.pressing, att = .45 * carrier.a.dribbling + .25 * carrier.a.control + .15 * carrier.a.strength + .15 * carrier.a.speed;
      // Tired legs lose challenges late on (halı saha goals come late), and a relaxed leader goes in softer.
      const fresh = t - carrier.lastReceived < .35 ? .35 : 0, pWin = sigmoid(T.duel.sharpness * (def * (1 - K.tiredDefending * (1 - d.energy)) - att) * C.defenseSharpness + T.duel.bias + fresh) * (slide ? K.slideWin : 1);
      const frustrated = d.mood !== null && t < d.moodUntil;
      // Defenders are more careful inside their own box.
      const careful = inBox(-X(d.team, carrier.x), Z(d.team, carrier.z)) ? .55 : 1;
      const pFoul = clamp((T.foul.base + T.foul.aggression * Math.max(0, d.a.pressing - d.a.defending) + T.foul.fatigue * (1 - d.energy) + (frustrated ? T.foul.frustrated : 0)) * careful * (slide ? K.slideFoul : 1), 0, T.foul.max * (slide ? 1.4 : 1));
      startChallenge(d, carrier, slide, pWin, pFoul);return;
    }
  }
  /** The tackle is launched now and decided at contact: a slide carries the defender along the ground to where the ball will be. */
  function startChallenge(d: RtPlayer, carrier: RtPlayer, slide: boolean, pWin: number, pFoul: number) {
    // A standing tackle from the jockeying distance takes a step: a little longer to arrive than one already at the ball.
    const reachNow = Math.hypot(carrier.x + Math.sin(carrier.heading) * T.ball.carryOffset - d.x, carrier.z + Math.cos(carrier.heading) * T.ball.carryOffset - d.z);
    const lead = slide ? .3 : reachNow > .8 ? .24 : .15, bx = carrier.x + carrier.vx * lead, bz = carrier.z + carrier.vz * lead, dx = bx - d.x, dz = bz - d.z, l = Math.hypot(dx, dz) || 1;
    d.heading = Math.atan2(dx, dz);
    if (slide) {
      const go = clamp(l - .45, 0, 2.6), duration = 1.35;
      d.lunge = { t0: t + .04, t1: t + lead, x0: d.x, z0: d.z, x1: d.x + dx / l * go, z1: d.z + dz / l * go };
      act(d, ACTION.slide, duration, 0); d.actionStart = t + lead - .22 * duration; d.actionEnd = d.actionStart + duration; d.groundedUntil = t + lead + .6; d.lockUntil = t + lead + .95; d.stallUntil = d.lockUntil;
    } else {
      // Standing tackle: from his jockeying distance he steps in to the ball (not through the man), so a won ball is at his foot.
      const fx = bx + Math.sin(carrier.heading) * T.ball.carryOffset, fz = bz + Math.cos(carrier.heading) * T.ball.carryOffset, fl = Math.hypot(fx - d.x, fz - d.z) || 1, go = clamp(fl - .45, 0, .95);
      d.heading = Math.atan2(fx - d.x, fz - d.z);
      if (go > .05) d.lunge = { t0: t, t1: t + lead, x0: d.x, z0: d.z, x1: d.x + (fx - d.x) / fl * go, z1: d.z + (fz - d.z) / fl * go, solid: true };
      act(d, ACTION.tackle, .6, 0); d.actionStart = t + lead - .3 * .6; d.actionEnd = d.actionStart + .6;
    }
    challenge = { d: d.idx, carrier: carrier.idx, at: t + lead, slide, pWin, pFoul };
  }
  function resolveChallenge() {
    const c = challenge;if (!c || t < c.at) return;challenge = null;
    const d = players[c.d]!, carrier = players[c.carrier]!;
    // He may have passed or shot meanwhile: then the challenge simply arrives late.
    if (ball.owner !== carrier.idx || restart || ball.hands) return;
    const team = d.team, reach = Math.hypot(ball.x - d.x, ball.z - d.z);
    if (reach > (c.slide ? 1.05 : 1.3)) {
      d.lockUntil = Math.max(d.lockUntil, t + (c.slide ? .5 : T.duel.beatenLock)); d.stallUntil = Math.max(d.stallUntil, t + (c.slide ? .5 : T.duel.beatenStall));
      if (c.slide) log('beat', carrier.team, carrier, d, .14, `${carrier.name}, ${d.name} oyuncusunun kayarak müdahalesinden sıyrıldı`, { attrs: attrs(carrier, ['dribbling', 'speed']) });
      return;
    }
    const r = rng.next();
    if (r < c.pWin) {
      d.stats.tackles++;
      log('tackle', team, d, carrier, .12, `${d.name} ${c.slide ? 'kayarak ' : ''}topu kaptı (savunma ${d.a.defending}, top sürme ${carrier.a.dribbling})`, { p: c.pWin, sampled: r, attrs: attrs(d, ['defending', 'strength', 'positioning']) });
      // He keeps it only when it is at his foot; from further it is knocked loose (a won ball used to jump 1.3 m onto his foot).
      if (!c.slide && rng.chance(.45) && reach < 1) giveBall(d);
      else { const a = Math.atan2(ball.z - d.z, ball.x - d.x) + rng.range(-.9, .9), sp = c.slide ? rng.range(3, 7) : rng.range(2, 5); looseBall(Math.cos(a) * sp, Math.sin(a) * sp); ball.lastTouch = d.idx; ball.lastTeam = team; possession = -1; }
      carrier.lockUntil = t + .45; carrier.stallUntil = t + T.duel.lostBallStall;return;
    }
    // A foul is body contact: at full stretch he only gets to (or misses) the ball.
    const body = Math.hypot(carrier.x - d.x, carrier.z - d.z);
    if (r < c.pWin + c.pFoul * (1 - c.pWin) && body <= (c.slide ? K.foulBodySlide : K.foulBodyStand)) { foul(d, carrier, c.pFoul);return; }
    d.lockUntil = Math.max(d.lockUntil, t + T.duel.beatenLock); d.stallUntil = Math.max(d.stallUntil, t + T.duel.beatenStall);
    log('beat', carrier.team, carrier, d, .14, `${carrier.name}, ${d.name} karşısında sıyrıldı`, { p: 1 - c.pWin, sampled: r, attrs: attrs(carrier, ['dribbling', 'control']) });
  }
  function foul(d: RtPlayer, victim: RtPlayer, p: number) {
    const team = victim.team, vX = X(team, victim.x), vZ = Z(team, victim.z), penalty = inBox(vX, vZ);
    d.stats.fouls++; stats[d.team].fouls++; act(victim, ACTION.fall, 1.7, .08); victim.groundedUntil = t + 1.25; victim.lockUntil = t + 1.45; victim.stallUntil = victim.lockUntil; victim.lunge = null;
    log('foul', d.team, d, victim, penalty ? .7 : vX > 25 ? .35 : .15, `${d.name}, ${victim.name} oyuncusuna faul yaptı${penalty ? ' · PENALTI' : ''}`, { p, attrs: attrs(d, ['defending', 'pressing']) });
    if (penalty) { stats[team].penalties++; setRestart('penalty', team, W(team, GOAL_X - 11), 0); }
    else {
      // Used like a real free kick (user): close and central at goal over the wall, wide or further out in the final third into the box, else a pass.
      stats[team].freeKicks++; const play: SetPlay = Math.hypot(GOAL_X - vX, vZ) < T.setPiece.directFreeKickRange && Math.abs(vZ) < 16 ? 'shot' : vX > 16 ? 'cross' : 'pass';
      setRestart('free-kick', team, victim.x, victim.z, play === 'shot', 0, play);
    }
  }

  // --- aerial play ----------------------------------------------------------------
  function aerialContest() {
    if (ball.owner >= 0 || ball.shot || ball.aerialDone || ball.y < 1.35 || ball.y > 2.85 || ball.vy > 1) return;
    // Only a man under the ball meets it: a head within 0.95 m up to 2.45 m, a keeper's gloves within 1.25 m up to 2.85 m.
    const contenders = players.filter(p => t >= p.lockUntil && t >= p.touchUntil && t >= p.groundedUntil && !p.lunge && Math.hypot(p.x - ball.x, p.z - ball.z) < (p.keeper ? 1.25 : .95) && ball.y <= (p.keeper ? 2.85 : 2.45));
    if (!contenders.length) return;
    ball.aerialDone = true;
    let best: RtPlayer | null = null, bestScore = -Infinity;
    for (const p of contenders) {
      const d = Math.hypot(p.x - ball.x, p.z - ball.z), own = X(p.team, ball.x) < -GOAL_X + PI.boxDepth && Math.abs(ball.z) < PI.boxHalfWidth;
      // In his own box a defender is goal-side and facing the ball: he attacks it first more often than the man running across him.
      const s = p.keeper ? (own ? 6.6 + (p.gk - 70) / 12 + rng.normal() * .8 - d * .5 + T.aerial.keeperClaim : -99) : p.aerial + rng.normal() * T.aerial.duelNoise - d * T.aerial.distancePenalty + (own ? K.boxAerialEdge : 0);
      if (s > bestScore) { bestScore = s; best = p; }
    }
    if (!best || bestScore < 4) return;
    const p = best, team = p.team, pX = X(team, ball.x), pZ = Z(team, ball.z), pass = ball.pass;
    // Everyone under it goes up; only the winner touches the ball.
    for (const q of contenders) if (q !== p && !q.keeper) { act(q, ACTION.header, .7, .5); q.touchUntil = t + .3; }
    if (p.keeper) {
      const high = ball.y > 2.05 ? 2 : 0;
      if (rng.chance(clamp(.62 + .006 * (p.gk - 70), .4, .9))) { p.x += (ball.x - p.x) * .4; p.z += (ball.z - p.z) * .4; act(p, ACTION.catch, .8, .3, high); giveBall(p, true); log('keeper-claim', team, p, null, .25, `${p.name} topu havada tuttu`); }
      else { act(p, ACTION.catch, .6, .35, 2); looseBall(dir[team] * rng.range(9, 14), rng.range(-8, 8), rng.range(4, 7)); ball.lastTouch = p.idx; ball.lastTeam = team; log('clearance', team, p, null, .2, `${p.name} yumrukla uzaklaştırdı`); }
      return;
    }
    // A short step into the header, facing where the ball goes.
    p.x += (ball.x - p.x) * .5; p.z += (ball.z - p.z) * .5;
    p.stats.headersWon++; act(p, ACTION.header, .7, .5);p.touchUntil = t + .2;
    const attacking = pass?.team === team || possession === team;
    if (attacking && pX > GOAL_X - 17 && Math.abs(pZ) < 12) { p.heading = Math.atan2(W(team, GOAL_X) - p.x, -p.z); shoot(p, true); return; }
    if (!attacking) {
      const bX = X(team, ball.x), bZ = Z(team, ball.z), contested = contenders.some(q => q.team !== team && !q.keeper);
      if (bX < -GOAL_X + PI.boxDepth && Math.abs(bZ) < PI.boxHalfWidth && rng.chance(K.headBehind + (contested ? K.headBehindContested : 0))) {
        // A glancing header under pressure skims on behind: through a point on the line wide of the post (a corner, never into the goal).
        const side = Math.sign(bZ || (rng.chance(.5) ? 1 : -1)), ox = W(team, -GOAL_X - .05), oz = W(team, side * rng.range(PI.goalHalfWidth + 1.5, PI.boxHalfWidth)), d = Math.hypot(ox - ball.x, oz - ball.z), tf = clamp(d / 14, .45, 1.2), v = loftLaunch(d, tf, ball.y, R);
        looseBall((ox - ball.x) / d * v.vh, (oz - ball.z) / d * v.vh, v.vy);ball.lastTouch = p.idx; ball.lastTeam = team; ball.aerialDone = true;
        log('header', team, p, null, .15, `${p.name} kafayla kornere gönderdi`, { attrs: { strength: p.a.strength, positioning: p.a.positioning } });
        return;
      }
      const cx = W(team, clamp(X(team, ball.x) + rng.range(18, 30), -45, 40)), cz = W(team, Z(team, ball.z) + rng.range(-14, 14)), d = Math.hypot(cx - ball.x, cz - ball.z), tf = clamp(d / 18, .7, 1.6), v = loftLaunch(d, tf, ball.y, R);
      p.heading = Math.atan2(cx - p.x, cz - p.z);
      looseBall((cx - ball.x) / d * v.vh, (cz - ball.z) / d * v.vh, v.vy);ball.lastTouch = p.idx; ball.lastTeam = team; ball.aerialDone = true;
      log('header', team, p, null, .12, `${p.name} kafayla uzaklaştırdı (hava gücü ${p.aerial.toFixed(1)})`, { attrs: { strength: p.a.strength, positioning: p.a.positioning } });
      return;
    }
    const mate = byTeam[team].filter(q => q !== p && !q.keeper).sort((a, b) => dist(a, ball) - dist(b, ball))[0];
    if (mate && dist(mate, ball) < 16) { const d = dist(mate, ball); p.heading = Math.atan2(mate.x - p.x, mate.z - p.z); looseBall((mate.x - ball.x) / d * Math.min(9, d * 1.2), (mate.z - ball.z) / d * Math.min(9, d * 1.2), 1.5); ball.pass = { from: p.idx, to: mate.idx, kind: 'header', team, t0: t, tx: mate.x, tz: mate.z, lofted: false, tried: new Map(), corner: false }; }
    // Nobody near: he knocks it down in front of him for the second ball (a blind header on used to roll out for a goal kick ~6 times a match).
    else looseBall(dir[team] * rng.range(1.5, 3.5), rng.range(-2, 2), rng.range(.6, 1.6));
    ball.lastTouch = p.idx; ball.lastTeam = team; ball.aerialDone = true; lastStrike = { player: p.idx, team, t, shot: false }; lastTouchOf[team] = p.idx;
  }

  // --- ball ---------------------------------------------------------------------
  const keeperCatch = (p: RtPlayer, speed: number) => clamp(.94 - .012 * Math.max(0, speed - 10) + .003 * (p.gk - 70), .55, .99);
  /** A fumble goes out in front of the keeper, never back toward his own net. */
  function spillAway(p: RtPlayer) { const a = rng.range(-1.2, 1.2); looseBall(dir[p.team] * Math.cos(a) * 3, Math.sin(a) * 3); ball.lastTouch = p.idx; ball.lastTeam = p.team; }
  /** A defender who stretches for a pass and misses steps off its line as it runs past his planted foot (it used to cannon off him as well,
   * so every pass near a defender was lost twice over). */
  function missedStab(p: RtPlayer) {
    const sp = Math.hypot(ball.vx, ball.vz);if (sp < 1.5 || ball.y > .9) return;
    const ux = ball.vx / sp, uz = ball.vz / sp, rx = p.x - ball.x, rz = p.z - ball.z, along = rx * ux + rz * uz, lat = rx * uz - rz * ux;
    if (along < -.2 || Math.abs(lat) > .46) return;
    act(p, ACTION.tackle, .45, .35);p.lockUntil = Math.max(p.lockUntil, t + .35); p.stallUntil = Math.max(p.stallUntil, t + .35);
    // Already at his feet: no time to get out of the way, it clips his foot as it passes (bodyBlock); otherwise he is clear of its line.
    const arrive = Math.max(0, along) / sp, side = lat >= 0 ? 1 : -1;if (arrive < .1) return;
    const need = .5 - Math.abs(lat);
    p.lunge = { t0: t, t1: t + clamp(arrive * .8, .1, .16), x0: p.x, z0: p.z, x1: p.x + uz * side * need, z1: p.z - ux * side * need };
  }
  /** The man a ground pass is meant for starts his receiving move just before it reaches him, body open to the ball (2026-11-09: the
   * move began at the touch and was dated back, so its first half was never drawn and he met the ball standing square to nothing). */
  function prepareReceiver() {
    const pass = ball.pass;if (!pass || pass.lofted || pass.to < 0 || ball.y > .5) return;
    const q = players[pass.to]!;if (q.team !== pass.team || q.keeper || q.action !== ACTION.none || t < q.groundedUntil || q.lunge) return;
    const sp = Math.hypot(ball.vx, ball.vz);if (sp < 1) return;
    const lead = RECEIVE_CONTACT * RECEIVE_SECONDS, eta = Math.max(0, Math.hypot(ball.x - q.x, ball.z - q.z) - T.intercept.reach) / sp;
    if (eta > lead + DT) return;
    act(q, ACTION.receive, RECEIVE_SECONDS, 0); q.actionStart = t + eta - lead; q.actionEnd = q.actionStart + RECEIVE_SECONDS;
    // Square to the ball, unless he is running on to it from behind (over his shoulder): then he keeps his line.
    const toBall = Math.atan2(ball.x - q.x, ball.z - q.z), v = Math.hypot(q.vx, q.vz), run = Math.atan2(q.vx, q.vz);
    if (v < 3 || Math.abs(Math.atan2(Math.sin(toBall - run), Math.cos(toBall - run))) < 1.75) q.heading = toBall;
  }
  function controlChecks() {
    if (ball.owner >= 0 || ball.dead || ball.y > 1.15) return;
    const speed = Math.hypot(ball.vx, ball.vz), air = ball.y > .55;
    // A pass that has died is just a loose ball again: everyone may go for it.
    if (ball.pass && (t - ball.pass.t0 > 6 || (!ball.pass.lofted && speed < 1.2 && ball.y <= R + .02))) ball.pass = null;
    // Closest eligible player first; an opponent who just missed this pass waits 0.7 s before trying again.
    let best: RtPlayer | null = null, bd = Infinity;
    for (const p of players) {
      // A man on the ground (after a dive, slide or fall) cannot play it; the man a cross is about to strike does not "receive" it.
      if (t < p.touchUntil || t < p.lockUntil || t < p.groundedUntil || (deflectBy?.player === p.idx && t < deflectBy.until)) continue;
      // A keeper in his own box keeps trying for an opponent's ball; outfielders wait 0.7 s after a miss.
      const ownBox = p.keeper && X(p.team, ball.x) < -GOAL_X + PI.boxDepth && Math.abs(ball.z) < PI.boxHalfWidth;
      if (ball.pass && ball.pass.team !== p.team && t - (ball.pass.tried.get(p.idx) ?? -9) < (ownBox ? .25 : .7)) continue;
      // A keeper's long reach is his hands (in his box, not from his own side's pass); with his feet he reaches like anyone.
      const hands = p.keeper && X(p.team, ball.x) < -GOAL_X + PI.boxDepth && Math.abs(ball.z) < PI.boxHalfWidth && !(ball.pass && ball.pass.team === p.team);
      const reach = hands ? T.intercept.keeperReach : T.intercept.reach;
      const d = Math.hypot(p.x - ball.x, p.z - ball.z);if (d < reach && d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    const p = best, pass = ball.pass, team = p.team, press = pressureAt(team, p.x, p.z), fromTeam = pass ? pass.team : ball.lastTeam;
    const keeperHands = p.keeper && X(team, ball.x) < -GOAL_X + PI.boxDepth && Math.abs(ball.z) < PI.boxHalfWidth && !(pass && pass.team === team);
    if (pass && pass.team !== team) {
      pass.tried.set(p.idx, t);
      const c = T.intercept, field = clamp((c.base + c.perDefending * (p.a.defending - 5) + c.perPositioning * (p.a.positioning - 5) - Math.max(0, speed - c.fastBall) * c.perFastBall + c.closeBonus * (1 - bd / c.reach)) * C.defenseSharpness * (1 - .35 * relax(p.team)) * (1 - K.tiredDefending * .6 * (1 - p.energy)), .04, .95);
      // In his box the keeper uses his hands: an opponent's pass is collected like a loose ball, and a miss is pushed away from goal.
      const pi = keeperHands ? Math.max(field, keeperCatch(p, speed)) : field;
      if (!rng.chance(pi)) { p.touchUntil = t + (keeperHands ? .2 : .3); if (keeperHands) spillAway(p); else { if (rng.chance(.25)) { ball.vx *= .7; ball.vz *= .7; } missedStab(p); } return; }
      p.stats.interceptions++;
      if (keeperHands) { p.x += (ball.x - p.x) * .4; p.z += (ball.z - p.z) * .4; giveBall(p, true); act(p, ACTION.catch, .7, .3); }
      else if (X(team, p.x) < -30 && press > .3 && rng.chance(.5)) { const cx = W(team, X(team, p.x) + 35), cz = p.z * .5; ball.owner = -1; launchPass(p, null, cx, cz, 'clear', true); }
      else giveBall(p);
      log('interception', team, p, pass.to >= 0 ? players[pass.to]! : null, .12, `${p.name} pası kesti (savunma ${p.a.defending}, pozisyon ${p.a.positioning})`, { p: pi, attrs: attrs(p, ['defending', 'positioning']) });
      return;
    }
    if (keeperHands) {
      // He steps into the ball as he gathers it.
      if (rng.chance(keeperCatch(p, speed))) { p.x += (ball.x - p.x) * .4; p.z += (ball.z - p.z) * .4; giveBall(p, true); act(p, ACTION.catch, .7, .3); return; }
      spillAway(p); p.touchUntil = t + .4;return;
    }
    const intended = pass?.to === p.idx;
    // Team cohesion (pregame chemistry: named pairs, stabilizers, guests) nudges how well players read each other's passes.
    let pc = controlChance(p, speed, air, press) - (intended ? 0 : .05) + (pass && pass.team === team ? (cohesion[team]! - 72) * .0015 : 0);
    // Named pairs out of sync (Arif–Barkuz): the receiver reads the pass late.
    if (pass && pass.from >= 0 && fromTeam === team) { const from = players[pass.from]!; if ((from.id === 'arif' && p.id === 'barkuz') || (from.id === 'barkuz' && p.id === 'arif')) pc -= .06; }
    if (!rng.chance(pc)) {
      const ox = ball.x - p.x, oz = ball.z - p.z, ol = Math.hypot(ox, oz) || 1, sp0 = Math.hypot(ball.vx, ball.vz) || 1;
      // It bobbles off the foot: mostly away from his body, partly carrying on, never through him.
      const inDir = Math.atan2(.7 * oz / ol + .3 * ball.vz / sp0, .7 * ox / ol + .3 * ball.vx / sp0) + rng.range(-.7, .7), s = rng.range(T.control.badTouchSpeed[0], T.control.badTouchSpeed[1]);
      looseBall(Math.cos(inDir) * s, Math.sin(inDir) * s);ball.lastTouch = p.idx; ball.lastTeam = team; p.touchUntil = t + .45; possession = -1;
      log('bad-touch', team, p, null, .06, `${p.name} topu kontrol edemedi (kontrol ${p.a.control}, baskı ${pct(press)})`, { p: pc, pressure: press, attrs: attrs(p, ['control']) });
      return;
    }
    // A move he already started for this ball (prepareReceiver) runs on; otherwise it starts now, dated back to its touch.
    const prepared = p.action === ACTION.receive && Math.abs(t - p.actionStart - RECEIVE_CONTACT * RECEIVE_SECONDS) < .15;
    const changed = giveBall(p);if (!prepared) act(p, ACTION.receive, RECEIVE_SECONDS, RECEIVE_CONTACT);
    // First touch: on a step the way he was going and toward the goal he attacks, as fast as the pressure allows, not to a dead stop
    // (2026-11-09: receivers fell from ~4 m/s to ~1.4 m/s and a quarter of the passes after a touch were struck from a standstill).
    if (!p.keeper) {
      const v = Math.hypot(p.vx, p.vz), w = clamp(v / 4, 0, 1) * .65, ux = v > .3 ? p.vx / v : 0, uz = v > .3 ? p.vz / v : 0;
      let fx = ux * w + dir[team] * (1 - w), fz = uz * w;const fl = Math.hypot(fx, fz) || 1;fx /= fl; fz /= fl;
      setTarget(p, p.x + fx * T.decision.firstTouch, p.z + fz * T.decision.firstTouch, (.35 + .3 * clamp(v / 5, 0, 1)) * (1 - .5 * press), 'carry');
    }
    if (pass && pass.team === team && pass.from !== p.idx && pass.kind !== 'clear') { const from = players[pass.from]!; if (from.team === team) { from.stats.completed++; stats[team].completed++; } }
    if (changed && fromTeam !== team) log('interception', team, p, null, .06, `${p.name} topu kazandı`);
  }
  /** A player lying on the ground as a line along the pitch: a slide from his hips (he leans back) to his boots, a man fouled face down
   * from his feet to his head. */
  function lyingBody(p: RtPlayer) {
    const hx = Math.sin(p.heading), hz = Math.cos(p.heading), [back, front] = p.action === ACTION.slide ? [.4, .9] : [0, 1.5];
    return { x0: p.x - hx * back, z0: p.z - hz * back, x1: p.x + hx * front, z1: p.z + hz * front };
  }
  /** Down after a slide or a foul he is still a body: a low ball into his legs or back stops on him and runs off slowly (2026-11-09: a pass
   * played just past a sliding defender ran straight through him). A keeper's dive belongs to the save logic. */
  function lyingBlock(p: RtPlayer, ax: number, az: number, sx: number, sz: number, sp: number) {
    if (p.keeper || ball.y > .35 || (p.action !== ACTION.slide && p.action !== ACTION.fall) || (p.idx === ball.lastTouch && t < p.touchUntil + .15)) return false;
    const L = lyingBody(p), lx = L.x1 - L.x0, lz = L.z1 - L.z0, ll = Math.hypot(lx, lz) || 1;
    // Closest approach of this tick's path to the body line (sampled finer than the body's thickness).
    let best = Infinity, cx = 0, cz = 0, first = 0, last = 0;
    for (let k = 0; k <= 4; k++) {
      const qx = ax + sx * k / 4, qz = az + sz * k / 4, w = clamp(((qx - L.x0) * lx + (qz - L.z0) * lz) / (ll * ll), 0, 1), ex = L.x0 + lx * w, ez = L.z0 + lz * w, dd = Math.hypot(qx - ex, qz - ez);
      if (k === 0) first = dd;if (k === 4) last = dd;
      if (dd < best) { best = dd; cx = ex; cz = ez; }
    }
    // Only a ball coming at him: one knocked off his own boots by the slide is leaving his body, not running into it.
    if (best > LYING_RADIUS + R || (last >= first && first <= LYING_RADIUS + R)) return false;
    // Off the side of the body it came from, slower.
    let nx = -lz / ll, nz = lx / ll;if (nx * ball.vx + nz * ball.vz > 0) { nx = -nx; nz = -nz; }
    const dot = ball.vx * nx + ball.vz * nz, keep = rng.range(.25, .45), a = rng.range(-.4, .4);
    let rx = ball.vx - 2 * dot * nx, rz = ball.vz - 2 * dot * nz;[rx, rz] = [(rx * Math.cos(a) - rz * Math.sin(a)) * keep, (rx * Math.sin(a) + rz * Math.cos(a)) * keep];
    ball.x = cx + nx * (LYING_RADIUS + R + .02); ball.z = cz + nz * (LYING_RADIUS + R + .02); keyBall(); ball.vx = rx; ball.vz = rz;
    ball.pass = null; ball.lastTouch = p.idx; ball.lastTeam = p.team; p.touchUntil = Math.max(p.touchUntil, t + .3); possession = -1;
    log('clearance', p.team, p, null, .04, `Top yerdeki ${p.name} oyuncusuna çarptı (${sp.toFixed(0)} m/sn)`, { outcome: 'ricochet' });
    return true;
  }
  /** A low ball does not pass through a body: reaching a player who is not playing it, it cannons off him (shin, knee, back).
   * A body block only ever lengthens a man's no-touch window (2026-11-10: a parry tipped round the post that clipped the keeper's own
   * body cut his 1.6 s down to 0.3 s, and he caught the corner-bound ball). */
  function bodyBlock() {
    if (ball.owner >= 0 || ball.dead || netted || ball.shot || ball.y > 1.2) return;
    const sp = Math.hypot(ball.vx, ball.vz);if (sp < 3) return;
    const ax = ball.x - ball.vx * DT, az = ball.z - ball.vz * DT, sx = ball.vx * DT, sz = ball.vz * DT, len2 = sx * sx + sz * sz;
    for (const p of players) {
      if (t < p.groundedUntil) { if (lyingBlock(p, ax, az, sx, sz, sp)) return; continue; }
      if (p.lunge && !p.lunge.solid) continue;
      // Just after his own touch the ball is his to leave behind; running on into it (a pass he clipped) it hits him again rather than
      // passing through his legs (2026-11-09).
      if (p.idx === ball.lastTouch && t < p.touchUntil + .15 && (ball.x - p.x) * (ball.vx - p.vx) + (ball.z - p.z) * (ball.vz - p.vz) >= 0) continue;
      // Closest approach of this tick's path to his centre.
      const u = clamp(((p.x - ax) * sx + (p.z - az) * sz) / Math.max(1e-9, len2), 0, 1), cx = ax + sx * u, cz = az + sz * u, dx = cx - p.x, dz = cz - p.z, d = Math.hypot(dx, dz);
      if (d > .33) continue;
      const nx = d > .01 ? dx / d : -ball.vx / sp, nz = d > .01 ? dz / d : -ball.vz / sp, dot = ball.vx * nx + ball.vz * nz;
      if (ball.pass && ball.y < .9 && t - (ball.pass.tried.get(p.idx) ?? -9) < .3) {
        // The man who just went for this pass and missed gets a foot to it as it passes: it clips off him and runs on, slower and turned
        // away from him. It used to rebound as if he had blocked it, so every pass near a defender was lost twice over.
        const ux = ball.vx / sp, uz = ball.vz / sp, along = nx * ux + nz * uz;let mx = nx - along * ux, mz = nz - along * uz, ml = Math.hypot(mx, mz);
        if (ml < .2) { const s = rng.chance(.5) ? 1 : -1; mx = uz * s; mz = -ux * s; ml = 1; }
        mx /= ml; mz /= ml;const a = rng.range(.35, .8), s2 = sp * rng.range(.55, .8), vx = (ux * Math.cos(a) + mx * Math.sin(a)) * s2, vz = (uz * Math.cos(a) + mz * Math.sin(a)) * s2;
        ball.x = p.x + mx * .36; ball.z = p.z + mz * .36; keyBall(); ball.vx = vx; ball.vz = vz;
        // It stays the passer's pass (it runs on roughly his way); if it now sits closer to a team-mate than to its target, the astray rule
        // in assignRoles sends him (2026-11-10: making it nobody's pass handed the defence every clipped ball — a goal a match fewer).
        ball.lastTouch = p.idx; ball.lastTeam = p.team; p.touchUntil = Math.max(p.touchUntil, t + .3); possession = -1;
        log('clearance', p.team, p, null, .04, `Top ${p.name} oyuncusunun ayağına değdi`, { outcome: 'touch' });
        return;
      }
      if (deflectBy?.player === p.idx && t < deflectBy.until) {
        // A blocked cross: near his own line it runs on behind wide of the post (a corner), otherwise it loops up off him.
        const behind = deflectBy.behind;deflectBy = null;ball.x = p.x + nx * .36; ball.z = p.z + nz * .36; keyBall();
        if (behind) {
          const zs = Z(p.team, ball.z), side = Math.sign(zs || 1), ox = W(p.team, -GOAL_X - .05), oz = W(p.team, side * clamp(Math.abs(zs) + rng.range(-5, 4), PI.goalHalfWidth + 1.5, PI.halfWidth - 1)), od = Math.max(.5, Math.hypot(ox - ball.x, oz - ball.z)), osp = rng.range(5, 9);
          ball.vx = (ox - ball.x) / od * osp; ball.vz = (oz - ball.z) / od * osp; ball.vy = rng.range(.8, 3);
        } else { const a = rng.range(-Math.PI, Math.PI), osp = rng.range(1.5, 4); ball.vx = Math.cos(a) * osp; ball.vz = Math.sin(a) * osp; ball.vy = rng.range(3.5, 6); }
        if (ball.y < R + .02) ball.y = R + .02;
        ball.pass = null; ball.lastTouch = p.idx; ball.lastTeam = p.team; p.touchUntil = Math.max(p.touchUntil, t + .35); possession = -1;
        log('clearance', p.team, p, null, .15, `Orta ${p.name} oyuncusuna çarptı`, { outcome: 'block' });
        return;
      }
      const a = rng.range(-.5, .5), keep = rng.range(.3, .5);let rx = ball.vx - 2 * Math.min(0, dot) * nx, rz = ball.vz - 2 * Math.min(0, dot) * nz;
      [rx, rz] = [(rx * Math.cos(a) - rz * Math.sin(a)) * keep, (rx * Math.sin(a) + rz * Math.cos(a)) * keep];
      ball.x = p.x + nx * .36; ball.z = p.z + nz * .36; keyBall(); ball.vx = rx; ball.vz = rz; ball.vy = Math.max(ball.vy, rng.range(0, 1.4));if (ball.vy > 0 && ball.y < R + .02) ball.y = R + .02;
      ball.pass = null; ball.lastTouch = p.idx; ball.lastTeam = p.team; p.touchUntil = Math.max(p.touchUntil, t + .3); possession = -1;
      log('clearance', p.team, p, null, .04, `Top ${p.name} oyuncusuna çarpıp sekti`, { outcome: 'ricochet' });
      return;
    }
  }
  function outOfPlay() {
    if (ball.dead || ball.owner >= 0 || netted) return false;
    if (Math.abs(ball.z) > PI.halfWidth + R) { const team = 1 - ball.lastTeam as Team; setRestart('throw-in', team, clamp(ball.x, -51, 51), Math.sign(ball.z) * PI.halfWidth);return true; }
    if (Math.abs(ball.x) > GOAL_X + R) {
      const endSign = Math.sign(ball.x), defending = (dir[0] === -endSign ? 0 : 1) as Team, attacking = 1 - defending as Team;
      if (Math.abs(ball.z) < PI.goalHalfWidth && ball.y < PI.goalHeight) {
        // User decision: no keeper own goals. A strike that a keeper or defender touches on its way in is the striker's goal; an outfield
        // own goal (a clearance or back pass into the own net) stays possible but rare.
        const last = ball.lastTouch >= 0 ? players[ball.lastTouch]! : null, strike = lastStrike && lastStrike.team === attacking && t - lastStrike.t < 4 ? lastStrike : null;
        const fallback = lastTouchOf[attacking] >= 0 ? players[lastTouchOf[attacking]]! : null;
        const scorer = last && last.team === attacking ? last : strike ? players[strike.player]! : last && !last.keeper ? last : fallback;
        // A ball that goes in without a shot of its own (cross, pass, rebound) still counts as an attempt on target: shots never trail goals.
        if (scorer && scorer.team === attacking && !(strike?.shot && strike.player === scorer.idx)) { scorer.stats.shots++; scorer.stats.onTarget++; stats[attacking].shots++; stats[attacking].onTarget++; }
        goal(attacking, scorer, false);return true;
      }
      if (ball.lastTeam === defending) setRestart('corner', attacking, endSign * GOAL_X, Math.sign(ball.z || 1) * PI.halfWidth);
      else setRestart('goal-kick', defending, endSign * (GOAL_X - 5.5), Math.sign(ball.z || 1) * 4);
      return true;
    }
    return false;
  }
  function resolveShot() {
    const s = ball.shot;if (!s || t < s.endT) return;
    const shooter = players[s.shooter]!, k = players[s.keeper]!, team = s.team;
    ball.shot = null;
    // Resolve at the planned contact point: within a tick the ball may already be a few centimetres past it (over the line).
    if (s.outcome !== 'goal' && s.outcome !== 'wide') { ball.x = s.ex; ball.y = Math.max(R, s.ey); ball.z = s.ez; }
    if (s.outcome === 'goal') { goal(team, shooter, s.header); return; }
    // A rare howler: a routine catch slips through the gloves (luck the user asked for).
    if (s.outcome === 'save' && rng.chance(LUCK.keeperHowler)) { log('save', k.team, k, shooter, .7, `${k.name} topu elinden kaçırdı!`, { outcome: 'spill' }); looseBall(dir[team] * rng.range(1.8, 3), rng.range(-1.2, 1.2), .5); ball.lastTouch = k.idx; ball.lastTeam = k.team; k.touchUntil = t + .9; k.lockUntil = t + .6; return; }
    if (s.outcome === 'save') { k.stats.saves++; stats[k.team].saves++; ball.x = s.ex; ball.z = s.ez; giveBall(k, true); log('save', k.team, k, shooter, .74, `${k.name} kurtardı (kalecilik ${k.gk})`, { outcome: 'catch' }); return; }
    if (s.outcome === 'parry') {
      k.stats.saves++; stats[k.team].saves++; ball.lastTouch = k.idx; ball.lastTeam = k.team;
      // He cannot claim his own parry straight back (it used to land back in his gloves while the commentary said corner). One tipped
      // round the post stays his to leave until it is out: now that chasers wait for their touch, he would otherwise run to meet it
      // on the line the moment he may touch again (2026-11-10).
      const out = rng.chance(K.parryWide), side = Math.sign(Z(team, s.ez) || (rng.chance(.5) ? 1 : -1));
      k.touchUntil = t + (out ? 1.6 : .9);
      if (out) {
        // Tipped round the post: aimed through a point on the goal line outside the post, so it always crosses wide of the frame.
        const ox = W(team, GOAL_X + .05), oz = W(team, side * (PI.goalHalfWidth + rng.range(.55, 1.6))), od = Math.max(.5, Math.hypot(ox - ball.x, oz - ball.z)), osp = rng.range(6, 9);
        looseBall((ox - ball.x) / od * osp, (oz - ball.z) / od * osp, rng.range(1, 2.5));
      } else { const a = rng.range(.45, 1.2) * (rng.chance(.5) ? 1 : -1); looseBall(-dir[team] * rng.range(4, 8), W(team, Math.sign(a) * rng.range(4, 9)), rng.range(.5, 3)); }
      log('save', k.team, k, shooter, .76, `${k.name} çeldi${out ? ' · korner' : ' · dönen top'}`, { outcome: 'parry' });return;
    }
    if (s.outcome === 'post') { looseBall(-dir[team] * rng.range(3, 8), W(team, rng.range(-5, 5)), rng.range(0, 2)); log('shot', team, shooter, null, .7, `${shooter.name} direğe nişanladı · direk!`, { outcome: 'post' }); return; }
    if (s.outcome === 'block') {
      const b = players[s.blocker]!;
      // Luck: now and then a block loops over the keeper.
      if (rng.chance(LUCK.deflectionGoal)) {
        log('clearance', b.team, b, shooter, .5, `${shooter.name} şutu ${b.name} oyuncusundan sekti!`, { outcome: 'deflection' });
        // The ball loops off him over the keeper and crosses the line inside the goal mouth; the goal is the shooter's.
        const ez2 = W(team, rng.range(-2.8, 2.8)), ey2 = rng.range(1.1, 2.1), ex2 = W(team, GOAL_X), d2 = Math.hypot(ex2 - ball.x, ez2 - ball.z), dur2 = clamp(d2 / 13, .35, 1.6);
        ball.vx = (ex2 - ball.x) / dur2; ball.vz = (ez2 - ball.z) / dur2; ball.vy = (ey2 - ball.y) / dur2 + T.ball.gravity * dur2 / 2;
        ball.shot = { ...s, outcome: 'goal', endT: t + dur2, ex: ex2, ey: ey2, ez: ez2, blocker: -1 }; ball.lastTouch = b.idx; ball.lastTeam = b.team; return;
      }
      // It comes off his body loose (he does not have it at once): back into play, or on wide of the goal for a corner.
      ball.lastTouch = b.idx; ball.lastTeam = b.team; b.touchUntil = t + .35;
      if (rng.chance(K.blockBehind)) {
        const side = Math.sign(Z(team, ball.z) || (rng.chance(.5) ? 1 : -1)), ox = W(team, GOAL_X + .05), oz = W(team, side * rng.range(PI.goalHalfWidth + .7, 13)), od = Math.max(.5, Math.hypot(ox - ball.x, oz - ball.z)), osp = rng.range(7, 11);
        looseBall((ox - ball.x) / od * osp, (oz - ball.z) / od * osp, rng.range(.3, 2.2));
      } else { const a = rng.range(-1.3, 1.3), sp = rng.range(3, 8); looseBall(-dir[team] * Math.cos(a) * sp, Math.sin(a) * sp, rng.range(0, 3)); }
      log('clearance', b.team, b, shooter, .3, `${b.name} şutu blokladı`, { outcome: 'block' }); return;
    }
    // Wide: the ball keeps flying out over the line.
  }

  function goal(team: Team, scorer: RtPlayer | null, header: boolean) {
    score[team]++; stats[team].goals++; if (header) stats[team].headerGoals++;
    const own = scorer && scorer.team !== team;
    if (scorer && !own) scorer.stats.goals++;
    const assist = lastPass && scorer && !own && lastPass.team === team && lastPass.to === scorer.idx && t - lastPass.t < 12 && lastPass.from !== scorer.idx ? players[lastPass.from]! : null;
    if (assist) assist.stats.assists++;
    log('goal', team, scorer, assist, 1, `GOL! ${scorer ? scorer.name : 'Kendi kalesine'}${own ? ' (kendi kalesine)' : header ? ' · kafa' : ''}${assist ? ` · asist ${assist.name}` : ''} · ${score[0]}–${score[1]}`, { outcome: header ? 'header' : own ? 'own-goal' : 'goal' });
    // The ball keeps travelling into the net during the celebration; play is stopped by the restart.
    ball.owner = -1; ball.pass = null; ball.shot = null; netted = true; netSign = dir[team];
    celebrateUntil = t + T.setPiece.celebration;
    for (const q of players) q.celebrateWith = -1;
    if (scorer && !own) {
      // He runs off toward the corner flag — a short run now, so the team-mates catch him while the celebration is still on screen.
      const cx = W(team, GOAL_X - 10) - scorer.x, cz = W(team, Z(team, scorer.z) > 0 ? 28 : -28) - scorer.z, run = Math.min(1, T.setPiece.celebrateRun / Math.max(1, Math.hypot(cx, cz)));
      act(scorer, ACTION.celebrate, T.setPiece.celebration, 0); setTarget(scorer, scorer.x + cx * run, scorer.z + cz * run, .7, 'celebrate');
      // 2026-11-10 (user: "ortak sevinç"): the nearest outfield team-mates run to him and celebrate together; param 1–3 is each one's
      // place round him. Chosen by distance only, no random draw.
      const mates = byTeam[team].filter(q => q !== scorer && !q.keeper && dist(q, scorer) < T.setPiece.celebrateReach).sort((a, b) => dist(a, scorer) - dist(b, scorer)).slice(0, T.setPiece.celebrateMates);
      mates.forEach((q, i) => { act(q, ACTION.celebrate, T.setPiece.celebration, 0, i + 1); q.celebrateWith = scorer.idx; setTarget(q, scorer.x, scorer.z, 1, 'celebrate'); });
    }
    // Tevfik without M.Emre gets irritated when his team concedes.
    const conceding = 1 - team as Team;
    for (const p of byTeam[conceding]) if (p.id === 'tevfik' && !byTeam[conceding].some(q => q.id === 'm-emre') && rng.chance(T.personality.tevfikTrigger)) mood(p, 'irritated', 'gol sonrası sinirlendi');
    setRestart('kick-off', conceding, 0, 0, false, T.setPiece.celebration);
    ball.dead = false;
  }

  // --- set pieces ---------------------------------------------------------------
  function setRestart(kind: RestartKind, team: Team, x: number, z: number, direct = false, extraDelay = 0, play: SetPlay | null = null) {
    pending = null; challenge = null; ball.owner = -1; ball.hands = false; ball.pass = null; ball.shot = null; ball.dead = true;
    // Out of play the ball carries on over the line for a moment (it does not slide back to the spot); fouls are taken where they happened.
    const out = kind === 'throw-in' || kind === 'corner' || kind === 'goal-kick';
    if (!extraDelay) { if (out) { ball.outUntil = t + .9; ball.spot = { x, z }; } else { ball.spot = null; placeBall(x, z); } }
    possession = team;
    const own = byTeam[team].filter(p => !p.keeper), score1 = (p: RtPlayer, w: Partial<Record<Attribute, number>>) => Object.entries(w).reduce((s, [k, v]) => s + p.a[k as Attribute] * v!, 0);
    const best = (w: Partial<Record<Attribute, number>>) => own.slice().sort((a, b) => score1(b, w) - score1(a, w))[0]!;
    const fk = kind === 'free-kick' ? play ?? (direct ? 'shot' : 'pass') : null;
    let taker: RtPlayer;
    if (kind === 'goal-kick') taker = keeperOf(team);
    else if (kind === 'kick-off') taker = own.slice().sort((a, b) => b.slot.anchor.x - a.slot.anchor.x)[0]!;
    else if (kind === 'corner' || fk === 'cross') taker = best({ passing: .6, vision: .25, shooting: .15 });
    else if (kind === 'penalty') taker = best({ finishing: .55, shooting: .35, control: .1 });
    else if (fk === 'shot') taker = best({ shooting: .6, finishing: .25, passing: .15 });
    else taker = own.slice().sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0]!;
    const delay = kind === 'kick-off' ? T.setPiece.kickoffDelay : kind === 'throw-in' ? rng.range(T.setPiece.throwDelay[0], T.setPiece.throwDelay[1]) : kind === 'corner' ? T.setPiece.cornerDelay : kind === 'goal-kick' ? T.setPiece.goalKickDelay : kind === 'penalty' ? T.setPiece.penaltyDelay
      : fk === 'shot' ? K.fkShotDelay : fk === 'cross' ? K.fkCrossDelay : rng.range(K.fkPassDelay[0], K.fkPassDelay[1]);
    restart = { kind, team, x, z, taker: taker.idx, readyAt: t + delay * rng.range(.85, 1.2) + extraDelay, direct: fk === 'shot', play: kind === 'corner' ? 'cross' : fk, plan: null };
    if (kind === 'corner') { stats[team].corners++; }
    if (kind === 'throw-in' || kind === 'corner' || kind === 'goal-kick') log(kind, team, taker, null, kind === 'corner' ? .3 : .03, `${kind === 'corner' ? 'Korner' : kind === 'throw-in' ? 'Taç' : 'Aut'} · ${taker.name}`);
    if (kind === 'free-kick') log('free-kick', team, taker, null, fk === 'shot' ? .5 : fk === 'cross' ? .35 : .1, `Serbest vuruş · ${taker.name}${fk === 'shot' ? ' kaleye vuracak' : fk === 'cross' ? ' ceza sahasına ortalayacak' : ''}`);
  }
  const goalSideOf = (team: Team, s: { x: number; z: number }, by = .9) => { const gx = W(team, GOAL_X), gl = Math.hypot(gx - s.x, -s.z) || 1; return { x: s.x + (gx - s.x) / gl * by, z: s.z - s.z / gl * by }; };
  /** Corner or crossed free kick: the five best in the air start on their marks and attack the centre, far post, near post, penalty
   * spot and edge; the best defenders mark them goal-side, two more hold the near post and the six-yard box; the keeper stays on his line. */
  function boxPlan(r: Restart): SetPlan {
    const team = r.team, opp = 1 - team as Team, n = Math.sign(Z(team, r.z)) || 1, G = GOAL_X, P = (x: number, z: number) => ({ x: W(team, x), z: W(team, z) }), j = () => rng.range(-.6, .6);
    const zones: [number, number][] = [[G - 7.5, -n * .4], [G - 6.2, -n * 4.2], [G - 5.2, n * 2.6], [G - 11.5, n * .6], [G - 17.5, -n * 3]];
    const starts: [number, number][] = [[G - 12, -n * 1.5], [G - 11, -n * 7], [G - 9.5, n * 5.5], [G - 15, n * 2], [G - 20.5, -n * 4]];
    const box = byTeam[team].filter(p => !p.keeper && p.idx !== r.taker).sort((a, b) => b.aerial - a.aerial);
    const attackers = box.slice(0, 5).map((p, i) => ({ player: p.idx, start: P(starts[i]![0] + j(), starts[i]![1] + j()), zone: P(zones[i]![0] + j() * .5, zones[i]![1] + j() * .5), mark: -1 }));
    const markers = byTeam[opp].filter(p => !p.keeper).sort((a, b) => b.a.defending + b.aerial - a.a.defending - a.aerial), defenders: SetRole[] = [];
    attackers.slice(0, 4).forEach((a, i) => { const d = markers[i]; if (d) defenders.push({ player: d.idx, start: goalSideOf(team, a.start), zone: goalSideOf(team, a.zone), mark: a.player }); });
    const zonal: [number, number][] = [[G - 1.2, n * 3], [G - 5.5, 0], [G - 15.5, -n * 2.5]];
    markers.slice(4, 7).forEach((d, i) => { const z = P(zonal[i]![0], zonal[i]![1]); defenders.push({ player: d.idx, start: z, zone: z, mark: -1 }); });
    return { attackers, defenders, short: r.kind === 'corner' ? box[5]?.idx ?? -1 : -1, keeper: P(G - .45, -n * .5) };
  }
  /** Direct free kick: a wall of 2–4 at 9.15 m on the line to the near half of the goal, the keeper covering the far side, three attackers
   * waiting for the rebound with markers on them. */
  function wallPlan(r: Restart): SetPlan {
    const team = r.team, opp = 1 - team as Team, sX = X(team, r.x), sZ = Z(team, r.z), d = Math.hypot(GOAL_X - sX, sZ), size = d < 20 ? 4 : d < 24 ? 3 : 2, n = Math.sign(sZ) || 1;
    const dx = GOAL_X - sX, dz = n * 1.2 - sZ, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, ball0 = { x: r.x, z: r.z };
    const wall = byTeam[opp].filter(p => !p.keeper).sort((a, b) => dist(a, ball0) - dist(b, ball0)).slice(0, size);
    const defenders: SetRole[] = wall.map((p, i) => { const off = (i - (size - 1) / 2) * .62, s = { x: W(team, sX + ux * 9.3 - uz * off), z: W(team, sZ + uz * 9.3 + ux * off) }; return { player: p.idx, start: s, zone: s, mark: -1 }; });
    const lurk: [number, number][] = [[GOAL_X - 9, -n * 3], [GOAL_X - 8, n * 4], [GOAL_X - 13, 0]];
    const attackers = byTeam[team].filter(p => !p.keeper && p.idx !== r.taker).sort((a, b) => b.aerial - a.aerial).slice(0, 3).map((p, i) => { const s = { x: W(team, lurk[i]![0]), z: W(team, lurk[i]![1]) }; return { player: p.idx, start: s, zone: s, mark: -1 }; });
    const markers = byTeam[opp].filter(p => !p.keeper && !wall.includes(p)).sort((a, b) => b.a.defending - a.a.defending);
    attackers.forEach((a, i) => { const m = markers[i]; if (m) defenders.push({ player: m.idx, start: goalSideOf(team, a.start), zone: goalSideOf(team, a.start), mark: a.player }); });
    return { attackers, defenders, short: -1, keeper: { x: W(team, GOAL_X - .5), z: W(team, -n * 1.1) } };
  }
  function restartTargets() {
    const r = restart!, team = r.team, taker = players[r.taker]!;
    for (const p of players) {
      // Taker stands just behind the ball (inside the line for throws and corners).
      if (p === taker) { const behind = r.kind === 'corner' || r.kind === 'throw-in' ? 0 : .35; setTarget(p, r.x - dir[team] * behind, r.z - Math.sign(r.z) * (r.kind === 'corner' || r.kind === 'throw-in' ? .4 : 0), r.kind === 'throw-in' ? .8 : 1, 'restart'); continue; }
      if (t < celebrateUntil && p.role === 'celebrate') {
        // A team-mate keeps closing on the scorer, to his own place round him (front-left, front-right, behind).
        const s = p.celebrateWith >= 0 ? players[p.celebrateWith]! : null;
        if (s) { const slot = CELEBRATE_SLOTS[(p.actionParam - 1) % CELEBRATE_SLOTS.length]!, h = s.heading; setTarget(p, s.x + Math.sin(h + slot[0]) * slot[1], s.z + Math.cos(h + slot[0]) * slot[1], 1, 'celebrate'); }
        continue;
      }
      const attacking = p.team === team, k = p.keeper;
      let s = shapeTarget(p, attacking, r.x, r.z);
      if (k) s = keeperTarget(p, r.x, r.z);
      if (r.kind === 'kick-off') { const pX = Math.min(-1.2, X(p.team, s.x)); s = { x: W(p.team, pX), z: s.z }; if (!attacking && Math.hypot(s.x, s.z) < 9.2) s = { x: W(p.team, -9.5), z: s.z }; }
      if (r.kind === 'penalty') { if (k && !attacking) s = { x: W(p.team, -GOAL_X + .3), z: 0 }; else if (!k) { const lim = GOAL_X - 19; const pX = X(team, s.x); s = { x: W(team, Math.min(pX, lim)), z: s.z }; } }
      // Back for a kick-off from far away at a run, not a walk.
      setTarget(p, s.x, s.z, r.kind === 'kick-off' && Math.hypot(s.x - p.x, s.z - p.z) > 20 ? .85 : .7, 'restart');
    }
    // Box set pieces: corners, free kicks crossed in or shot over the wall.
    if (r.kind === 'corner' || (r.kind === 'free-kick' && r.play !== 'pass')) {
      const plan = r.plan ??= r.play === 'shot' ? wallPlan(r) : boxPlan(r);
      for (const a of plan.attackers) setTarget(players[a.player]!, a.start.x, a.start.z, .8, 'restart');
      for (const d of plan.defenders) setTarget(players[d.player]!, d.start.x, d.start.z, .85, 'restart');
      if (plan.short >= 0) setTarget(players[plan.short]!, r.x - Math.sign(r.x) * 3, r.z - Math.sign(r.z) * 9.5, .8, 'restart');
      setTarget(keeperOf(1 - team as Team), plan.keeper.x, plan.keeper.z, .7, 'restart');
    }
    if (r.kind === 'throw-in' || r.kind === 'goal-kick' || (r.kind === 'free-kick' && r.play === 'pass')) {
      const mates = byTeam[team].filter(p => p !== taker && !p.keeper).sort((a, b) => Math.hypot(a.x - r.x, a.z - r.z) - Math.hypot(b.x - r.x, b.z - r.z)).slice(0, 2);
      mates.forEach((p, i) => { const ang = (i ? .9 : -.6) + rng.range(-.3, .3), dd = r.kind === 'goal-kick' ? 14 : 9; setTarget(p, r.x + Math.cos(ang) * dd * dir[team], clamp(r.z + Math.sin(ang) * dd * (r.z > 0 ? -1 : 1), -32, 32), .75, 'restart'); });
    }
    // Laws of the game: opponents stand 9.15 m from the ball at free kicks and corners (the wall just beyond it).
    if (r.kind === 'free-kick' || r.kind === 'corner') for (const p of byTeam[1 - team as Team]) {
      const dx = p.tx - r.x, dz = p.tz - r.z, d = Math.hypot(dx, dz);if (d >= K.distance) continue;
      const ux = d > .01 ? dx / d : dir[team], uz = d > .01 ? dz / d : 0;setTarget(p, r.x + ux * (K.distance + .15), r.z + uz * (K.distance + .15), p.pace, p.role);
    }
  }
  function executeRestart() {
    const r = restart!, taker = players[r.taker]!;
    if (t < r.readyAt) return;
    if (Math.hypot(taker.x - r.x, taker.z - r.z) > 1.6) { taker.tx = r.x; taker.tz = r.z; taker.pace = 1; return; }
    // A kick-off waits for both teams in their own halves, the other side outside the centre circle (2026-11-10, user: after a goal
    // the scorer and the team-mates celebrating with him were still deep in the other half and the kick-off caught them out).
    if (r.kind === 'kick-off' && t < r.readyAt + T.setPiece.kickoffWaitMax
      && players.some(p => X(p.team, p.x) > T.setPiece.kickoffHalfSlack || (p.team !== r.team && Math.hypot(p.x, p.z) < 8.8))) return;
    restart = null; ball.dead = false; netted = false; ball.y = R; ball.vx = ball.vy = ball.vz = 0;
    // Throw-ins and corners start just inside the lines so the first touch never re-crosses them.
    const edge = r.kind === 'throw-in' || r.kind === 'corner';
    ball.spot = null; ball.outUntil = -1; placeBall(r.kind === 'corner' ? r.x - Math.sign(r.x) * .5 : r.x, edge ? r.z - Math.sign(r.z) * .6 : r.z);
    taker.x = r.kind === 'corner' ? r.x - Math.sign(r.x) * .3 : r.x - dir[r.team] * .35; taker.z = edge ? r.z - Math.sign(r.z) * .25 : r.z;
    // From a standstill: the run-up momentum used to carry corner takers (and the ball) back over the line during the windup.
    taker.vx = taker.vz = 0;
    if (r.kind === 'penalty') { taker.heading = Math.atan2(dir[r.team], 0); windup(taker, ACTION.shot, () => shoot(taker, false, { penalty: true }), .4); giveBall(taker); return; }
    if (r.kind === 'corner' || (r.kind === 'free-kick' && r.play === 'cross')) {
      giveBall(taker);const team = r.team, plan = r.plan ?? boxPlan(r), corner = r.kind === 'corner';
      if (corner && plan.short >= 0 && rng.chance(K.shortCorner)) {
        const q = players[plan.short]!;windup(taker, ACTION.pass, () => { launchPass(taker, q, q.x, q.z, 'short', false); log('corner', team, taker, q, .3, `${taker.name} korneri kısa kullandı · ${q.name}`); }, .25, q.x, q.z);return;
      }
      // As the ball is struck the attackers run from their marks to their zones, the markers go with them, the zonal men hold.
      for (const a of plan.attackers) { const p = players[a.player]!; setTarget(p, a.zone.x, a.zone.z, 1, 'setpiece'); p.roleUntil = t + 2.6; }
      for (const d of plan.defenders) { const p = players[d.player]!, m = d.mark >= 0 ? plan.attackers.find(a => a.player === d.mark) : null, z = m ? goalSideOf(team, m.zone, K.cornerMarkGap) : d.zone; setTarget(p, z.x, z.z, .95, 'setpiece'); p.roleUntil = t + 2.6; }
      // Delivery: centre, far post, near post or penalty spot.
      const w = [.3, .25, .3, .15], roll = rng.next();let pick = 0, acc = w[0]!;while (pick < 3 && roll > acc) acc += w[++pick]!;
      const a = plan.attackers[pick] ?? plan.attackers[0], q = a ? players[a.player]! : null, zx = a ? a.zone.x : W(team, GOAL_X - 8), zz = a ? a.zone.z : 0;
      windup(taker, ACTION.pass, () => cross(taker, q, corner, { tx: zx + rng.range(-.8, .8), tz: zz + rng.range(-.8, .8), setPiece: true }), .3, zx, zz);return;
    }
    if (r.kind === 'goal-kick') { const k = keeperOf(r.team); placeBall(r.x, r.z); giveBall(k); k.x = r.x - dir[r.team] * .4; k.z = r.z; k.decideAt = t; keeperDistribute(k); return; }
    if (r.kind === 'free-kick' && r.play === 'shot') {
      // The wall and the markers hold until the ball is struck.
      for (const d of r.plan?.defenders ?? []) { const p = players[d.player]!; p.role = 'setpiece'; p.roleUntil = t + .9; }
      giveBall(taker); windup(taker, ACTION.shot, () => shoot(taker, false, { freeKick: true }), .45, W(r.team, GOAL_X), 0); return;
    }
    giveBall(taker);
    if (r.kind === 'throw-in') {
      const mates = byTeam[r.team].filter(p => p !== taker && !p.keeper && dist(p, taker) < 22).sort((a, b) => nearestOpponent(r.team, b.x, b.z).d - nearestOpponent(r.team, a.x, a.z).d);
      const q = mates[0] ?? byTeam[r.team].find(p => p !== taker && !p.keeper)!;
      const qx = q.x, qz = clamp(q.z, -31, 31);
      windup(taker, ACTION.throw, () => { launchPass(taker, q, qx, qz, 'throw', true, { tf: clamp(dist(taker, q) / K.throwSpeed, .8, 1.8), yEnd: K.throwLanding, skill: taker.a.passing }); }, .45, qx, qz);
      return;
    }
    if (r.kind === 'kick-off') { const q = byTeam[r.team].filter(p => p !== taker && !p.keeper).sort((a, b) => dist(a, taker) - dist(b, taker))[0]!; windup(taker, ACTION.pass, () => { launchPass(taker, q, q.x, q.z, 'kickoff', false); }, .2); log('kick-off', r.team, taker, null, .05, 'Santra'); return; }
    if (r.kind === 'free-kick') restartPass = taker.idx;
    taker.decideAt = t;
  }

  // --- personality and in-match rules -------------------------------------------
  function mood(p: RtPlayer, kind: Mood, why: string) {
    if (p.mood && t < p.moodUntil) return;
    // Sulking lasts until the player is brought back into the game (two passes); outbursts fade with time.
    p.mood = kind; p.moodUntil = t + (kind === 'frustrated' || kind === 'disengaged' ? T.halfSeconds * 2 : T.personality.moodSeconds); p.receivedSinceMood = 0;
    const rule = snapshot.rulebook.rules.find(r => r.subjectPlayerIds.includes(p.id) && r.trigger.kind === 'behavior' && r.trigger.predicateId === `${p.id}-negative-behavior` || r.trigger.kind === 'all' && r.subjectPlayerIds.includes(p.id));
    log('mood', p.team, p, null, .25, `${p.name} ${why}${rule?.description ? ` · ${rule.description}` : ''}`);
  }
  function temporal() {
    for (const p of players) {
      if (p.mood && (t >= p.moodUntil || ((p.mood === 'frustrated' || p.mood === 'disengaged') && p.receivedSinceMood >= T.personality.frustrationRecovery))) p.mood = null;
      if (p.id === 'goktug' && !p.mood && t - p.lastReceived > T.personality.frustrationSeconds) mood(p, 'frustrated', 'uzun süredir pas alamadı, küstü');
      if (p.id === 'altug' && !p.mood && t - p.lastReceived > T.personality.disengageSeconds) mood(p, 'disengaged', 'oyundan koptu');
      if (p.id === 'servan' && !p.mood && score[1 - p.team as Team] - score[p.team] >= 2 && rng.chance(.04)) mood(p, 'disruptive', 'takım arkadaşlarına söylendi, pozisyonunu bıraktı');
    }
    for (const team of [0, 1] as Team[]) {
      const a = teamAtmosphere(snapshot, players, team, t);
      if (a.state !== atmosphere[team] && a.state === 'bad') log('mood', team, null, null, .3, `Takımda gerginlik: ${a.negatives.join(', ')} · kötü atmosfer`);
      atmosphere[team] = a.state;
    }
    const attacking: [boolean, boolean] = [possession === 0 && X(0, ball.x) > 0, possession === 1 && X(1, ball.x) > 0];
    // The rules that switch on as the game turns (Utku ahead or behind, Uğur/Mahmut in a bad atmosphere, Batu out of breath) reach the commentary.
    for (const a of updateTemporalModifiers(players, snapshot.rulebook.rules, { t, score, attacking, atmosphere, players })) log('mood', a.player.team, a.player, null, .32, a.text);
  }

  // --- replay -------------------------------------------------------------------
  function writeFrame() {
    if (frameCount >= maxFrames) return;
    // Stopped from the whistle to the restart; after a goal the celebration still counts as play to watch but for its last
    // celebrationTail seconds (2026-11-10: 2.5 → 1, so the team-mates reaching the scorer are seen).
    const stopped = ball.dead || (restart !== null && !(netted && t < celebrateUntil - T.setPiece.celebrationTail));
    const o = frameCount * stride, state = stopped ? BALL_STATE.dead : ball.owner >= 0 ? (ball.hands ? BALL_STATE.hands : BALL_STATE.feet) : ball.y > R + .05 ? BALL_STATE.air : BALL_STATE.ground;
    samples[o] = t; samples[o + 1] = ball.x; samples[o + 2] = ball.y; samples[o + 3] = ball.z; samples[o + 4] = state; samples[o + 5] = possession; samples[o + 6] = score[0]; samples[o + 7] = score[1];
    for (let i = 0; i < players.length; i++) {
      const p = players[i]!, b = o + FRAME_HEADER + i * PLAYER_CHANNELS.length, active = p.action !== ACTION.none && t < p.actionEnd, holding = ball.hands && ball.owner === i;
      samples[b] = p.x; samples[b + 1] = p.z; samples[b + 2] = p.heading; samples[b + 3] = holding ? ACTION.hold : active ? p.action : 0;
      samples[b + 4] = active ? clamp((t - p.actionStart) / Math.max(.01, p.actionEnd - p.actionStart), 0, 1) : 0; samples[b + 5] = p.actionParam;
    }
    frameCount++;
  }

  // --- line-up changes during the half --------------------------------------------------
  /** Same people, new slots: each man keeps where he is, what he is doing and his match so far (energy, mood, stats, rules that switched
   * on during the game); his place in the shape, his position fit and the pregame chemistry follow the new line-up. The feed says what
   * changed. Runtime order (idx) stays as it is, so the replay's player channels are unchanged. */
  let current = lineups, nextChange = 0;
  function changeLineups(next: readonly [Lineup, Lineup]) {
    const fresh = createRuntimePlayers(snapshot, next), before = new Map(players.map(p => [p.id, p.slot.id]));
    for (const p of players) {
      const f = fresh.find(q => q.id === p.id);if (!f) continue;
      const temporal = p.activeRuleIds.filter(id => id !== 'team-chemistry' && !p.pregame.some(m => m.ruleId === id));
      p.slot = f.slot; p.pregame = f.pregame; p.a = f.a; p.aerial = f.aerial; p.distribution = f.distribution;
      (p as { pregameAtmosphere: number }).pregameAtmosphere = f.pregameAtmosphere;
      // Rules already on stay on (no second announcement); NaN makes the next temporal pass rebuild his attributes on the new base.
      p.activeRuleIds = [...new Set([...f.activeRuleIds, ...temporal])]; p.chemistry = Number.NaN;
    }
    const a = pregameAssessment(snapshot, next);cohesion[0] = a.evaluation.teams[0].metrics.cohesion.score;cohesion[1] = a.evaluation.teams[1].metrics.cohesion.score;
    for (const team of [0, 1] as Team[]) {
      const moved = byTeam[team].filter(p => before.get(p.id) !== p.slot.id);
      if (next[team].formationId !== current[team].formationId) log('tactics', team, null, null, .35, `Diziliş değişikliği: ${next[team].formationId}`);
      else if (moved.length === 2) log('tactics', team, moved[0]!, moved[1]!, .35, `Yer değişikliği: ${moved[0]!.name} ↔ ${moved[1]!.name}`);
      else if (moved.length) log('tactics', team, null, null, .35, `Yer değişikliği: ${moved.map(p => p.name).join(', ')}`);
    }
    current = next;
  }

  // --- kickoff and loop -------------------------------------------------------------
  const firstKickoff: Team = carry ? carry.firstKickoff : (rng.chance(.5) ? 0 : 1);
  const kickoffTeam: Team = half === 1 ? firstKickoff : (1 - firstKickoff) as Team;
  if (half === 1) for (const d of drawDayForms(players, rng)) { const rule = snapshot.rulebook.rules.find(r => r.id === d.rule); log('mood', d.player.team, d.player, null, .2, `Günün formu · ${rule?.description ?? d.rule}`); }
  for (const p of players) { const s = p.keeper ? keeperTarget(p, 0, 0) : shapeTarget(p, p.team === kickoffTeam, 0, 0); p.x = s.x; p.z = s.z; if (!p.keeper) p.x = W(p.team, Math.min(-1.5, X(p.team, p.x))); p.heading = Math.atan2(dir[p.team], 0); }
  setRestart('kick-off', kickoffTeam, 0, 0);
  updateTemporalModifiers(players, snapshot.rulebook.rules, { t, score, attacking: [false, false], atmosphere, players });
  const totalTicks = Math.round(T.halfSeconds * T.tickHz);
  for (tick = 0; tick < totalTicks; tick++) {
    t = start + tick * DT;
    while (nextChange < changes.length && t >= changes[nextChange]!.seconds) changeLineups(changes[nextChange++]!.lineups);
    if (tick % T.decisionEvery === 0) {
      if (restart) restartTargets(); else if (t >= celebrateUntil) assignRoles();
      if (t >= celebrateUntil) duels();
    }
    if (restart && t >= celebrateUntil) executeRestart();
    if (pending && t >= pending.at) { const job = pending; pending = null; if (ball.owner === job.player) job.run(); }
    if (takeOn) resolveTakeOn();
    if (challenge) resolveChallenge();
    if (!restart && !pending && ball.owner >= 0 && t >= players[ball.owner]!.decideAt) { const c = players[ball.owner]!; if (ball.hands) keeperDistribute(c); else decideCarrier(c); }
    movePlayers();
    // Ball: attached to the carrier, or two physics substeps.
    if (ball.owner >= 0) {
      const c = players[ball.owner]!, down = ball.hands && c.lunge && t < c.groundedUntil;
      let tx: number, ty: number, tz: number;
      if (down) { const g = c.lunge!, gx = g.x1 - g.x0, gz = g.z1 - g.z0, gl = Math.hypot(gx, gz) || 1; tx = c.x + gx / gl * .55; tz = c.z + gz / gl * .55; ty = .3; }
      else { const off = ball.hands ? .3 : T.ball.carryOffset; tx = c.x + Math.sin(c.heading) * off; tz = c.z + Math.cos(c.heading) * off; ty = ball.hands ? 1.05 : R; }
      // A received ball settles onto the foot (or into the gloves) over a fraction of a second instead of jumping there.
      const k = t < ball.settle ? 1 - Math.exp(-DT / .06) : 1;
      ball.x += (tx - ball.x) * k; ball.y += (ty - ball.y) * k; ball.z += (tz - ball.z) * k; ball.vx = c.vx; ball.vz = c.vz;
    }
    else if (netted) {
      // Goal: the ball always carries on over the line into the net (never stalls in front of it) and stops at the back.
      const over = netSign * ball.x > GOAL_X + R;
      if (!over && netSign * ball.vx < 5) ball.vx = netSign * 5;
      ball.vy -= T.ball.gravity * DT; ball.x += ball.vx * DT; ball.y = Math.max(R, ball.y + ball.vy * DT); ball.z += ball.vz * DT;
      if (netSign * ball.x > GOAL_X) { ball.z = clamp(ball.z, -PI.goalHalfWidth + R, PI.goalHalfWidth - R); ball.y = Math.min(ball.y, PI.goalHeight - R); if (ball.y >= PI.goalHeight - R) ball.vy = Math.min(0, ball.vy); }
      if (netSign * ball.x > GOAL_X + 1.9) { if (ball.vx !== 0) keyBall(); ball.x = netSign * (GOAL_X + 1.9); ball.vx = 0; ball.vz *= .3; }
      if (ball.y <= R && over) { ball.vy = 0; ball.vx *= .92; ball.vz *= .92; }
    }
    else if (ball.dead && ball.spot) {
      if (t < ball.outUntil) { ball.vy -= T.ball.gravity * DT; ball.x += ball.vx * DT; ball.z += ball.vz * DT; ball.y += ball.vy * DT; if (ball.y <= R) { ball.y = R; ball.vy = Math.abs(ball.vy) > 1.2 ? -ball.vy * T.ball.bounce : 0; ball.vx *= .93; ball.vz *= .93; } }
      else { placeBall(ball.spot.x, ball.spot.z); ball.spot = null; }
    }
    else if (!ball.dead) for (let s = 0; s < 2; s++) {
      const h = DT / 2;
      if (ball.y > R + .01 || ball.vy > 0) { ball.vy -= T.ball.gravity * h; ball.x += ball.vx * h; ball.y += ball.vy * h; ball.z += ball.vz * h; if (ball.y <= R) { ball.y = R; if (Math.abs(ball.vy) > 1.2) { keyBall(); ball.vy = -ball.vy * T.ball.bounce; ball.vx *= T.ball.bounceFriction; ball.vz *= T.ball.bounceFriction; } else ball.vy = 0; } }
      else { const sp = Math.hypot(ball.vx, ball.vz); if (sp > 0) { const n = Math.max(0, sp - T.ball.rollDecel * h) / sp; ball.vx *= n; ball.vz *= n; } ball.x += ball.vx * h; ball.z += ball.vz * h; }
      resolveShot();
      if (netted || (!ball.shot && outOfPlay())) break;
    }
    if (!ball.dead && !netted && ball.owner < 0 && !ball.shot) { prepareReceiver(); aerialContest(); controlChecks(); bodyBlock(); }
    if (possession !== -1) stats[possession].possession += DT;
    if (tick % T.tickHz === 0) temporal();
    if (tick % T.snapshotEvery === 0) writeFrame();
    if (onProgress && tick % 3000 === 0) onProgress(tick / totalTicks);
  }
  t = end;writeFrame();
  log(half === 1 ? 'half-time' : 'full-time', -1, null, null, .2, `${half === 1 ? 'Devre arası' : 'Maç sonu'} · ${score[0]}–${score[1]}`);
  const carryOut: HalfCarry = { rngState: rng.state(), score: [score[0], score[1]], firstKickoff, eventSeq: seq, teamStats: [{ ...stats[0] }, { ...stats[1] }],
    players: players.map(p => ({ id: p.id, energy: p.energy, mood: p.mood, moodUntil: p.moodUntil, dayForm: p.dayForm, lastReceived: p.lastReceived, stats: { ...p.stats } })), solo: { ...soloPlan }, keeperDay: { ...keeperDay } };
  return { replay: { half, startSeconds: start, endSeconds: end, playerOrder: players.map(p => p.id), teams: players.map(p => p.team), frameCount, samples: samples.slice(0, frameCount * stride), ballKeys: Float32Array.from(ballKeys), ballCuts: Float32Array.from(ballCuts), events },
    carry: carryOut, score: [score[0], score[1]], teamStats: [{ ...stats[0] }, { ...stats[1] }], players: players.map(p => ({ id: p.id, name: p.name, team: p.team, stats: { ...p.stats }, energy: p.energy })) };
}
