import type { Attribute, BaseAttributes, Player, PlayerCatalog } from '../domain/players.js';
import type { FormationSlot, Lineup, LineupDraft } from '../domain/teams.js';
import type { MatchSnapshot } from '../domain/match.js';
import type { AppliedModifier, RuleDefinition, RuleTrigger } from '../domain/modifiers.js';
import type { TeamId } from '../domain/common.js';
import { ATTRIBUTE_KEYS } from '../domain/players.ts';
import { FORMATIONS } from '../config/formations.ts';
import { assessLineups } from '../domain/lineup-evaluation.ts';
import { ENGINE_TUNING as T, HEADER_SPECIALISTS } from '../config/engine-tuning.ts';
import type { Rng } from './rng.ts';
import { positionFit } from './position-fit.ts';

export type Team = 0 | 1;
export type Role = 'shape' | 'press' | 'cover' | 'mark' | 'support' | 'run' | 'chase' | 'receive' | 'carry' | 'keeper' | 'restart' | 'celebrate' | 'setpiece';
export type Mood = 'frustrated' | 'disengaged' | 'disruptive' | 'irritated';
export const TEAM_IDS: readonly [TeamId, TeamId] = ['team-1', 'team-2'];

export interface PlayerStats { passes: number; completed: number; shots: number; onTarget: number; goals: number; assists: number; tackles: number; interceptions: number; saves: number; fouls: number; headersWon: number }
/** Scripted body motion between two points (a keeper's dive, a sliding tackle): the body travels with the animation, not after it. */
export interface Lunge { t0: number; t1: number; x0: number; z0: number; x1: number; z1: number;
  /** A standing step (a tackle stepping in): he is still on his feet, so a ball played into him hits him. */
  solid?: boolean }
export interface RtPlayer {
  readonly idx: number; readonly id: string; readonly name: string; readonly team: Team; readonly keeper: boolean; readonly guest: boolean;
  slot: FormationSlot;
  readonly base: BaseAttributes;
  /** Effective attributes: base + pregame chemistry + in-match rules (caps per RULEBOOK_DECISIONS). */
  a: Record<Attribute, number>;
  pregame: readonly AppliedModifier[]; activeRuleIds: string[];
  /** Team chemistry this man brings before kick-off (leaders), and the share of the team's chemistry now on his passing/vision/positioning. */
  readonly pregameAtmosphere: number; chemistry: number;
  readonly gk: number; distribution: { passing: number; vision: number } | null; readonly longWide: boolean;
  aerial: number; readonly headerSpecialist: boolean;
  x: number; z: number; vx: number; vz: number; heading: number;
  tx: number; tz: number; pace: number; role: Role; roleUntil: number;
  energy: number;
  action: number; actionStart: number; actionEnd: number; actionParam: number;
  lockUntil: number; touchUntil: number; tackleUntil: number; decideAt: number; supportAt: number;
  /** Wrong-footed or getting up: runs at a quarter of his speed until then. Shorter than lockUntil (no tackle, no touch), so a beaten
   * man turns and chases instead of standing (2026-11-09). */
  stallUntil: number;
  /** On the ground after a dive, a slide or a foul: no running until he is up. */
  groundedUntil: number; lunge: Lunge | null;
  /** After a goal: the scorer this team-mate runs to and celebrates with (-1 otherwise). */
  celebrateWith: number;
  lastReceived: number; receivedSinceMood: number;
  mood: Mood | null; moodUntil: number;
  dayForm: string | null;
  stats: PlayerStats;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Same cap logic as the pregame evaluator: normal ±1 per attribute, locked rules after, phase "attribute-set" wins. */
export function effectiveValues(base: BaseAttributes, effects: readonly AppliedModifier[]): Record<Attribute, number> {
  const out = {} as Record<Attribute, number>;
  for (const key of ATTRIBUTE_KEYS) {
    let pos = 0, neg = 0, locked = 0, set: number | null = null;
    for (const e of effects) {
      const f = e.effect;
      if (f.kind === 'attribute-set' && f.attribute === key) set = f.value;
      else if (f.kind === 'attribute-delta' && f.attribute === key) { if (e.capGroup === 'locked') locked += f.delta; else if (f.delta > 0) pos += f.delta; else neg += f.delta; }
    }
    out[key] = set ?? Math.max(1, clamp(base[key] + Math.min(1, pos) + Math.max(-1, neg), 1, 10) + locked);
  }
  return out;
}

/** Keepers have no 12-attribute breakdown in the source; these are engine-only proxies, never shown or stored. */
export function keeperProxy(rating: number): BaseAttributes {
  const r = clamp((rating - 60) / 25, 0, 1);
  return { speed: 6, stamina: 7, strength: 7, passing: 5.5 + r * 1.6, vision: 5.5 + r * 1.6, control: 6.5 + r, dribbling: 3, shooting: 4, finishing: 2, defending: 5, pressing: 4, positioning: 6 + r * 2 };
}

export function aerialScore(a: Record<Attribute, number>, specialist: boolean) {
  const w = T.aerial;
  return w.strength * a.strength + w.positioning * a.positioning + w.finishing * a.finishing + w.control * a.control + w.speed * a.speed + (specialist ? w.specialistBonus : 0);
}

/** Pregame chemistry for the current lineups (recomputed after a half-time change). */
export function pregameAssessment(snapshot: MatchSnapshot, lineups: readonly [Lineup, Lineup]) {
  const catalog: PlayerCatalog = { schemaVersion: 1, version: snapshot.versions.catalog, players: snapshot.players, source: { file: 'match-snapshot', section: snapshot.id }, importedAt: snapshot.createdAt };
  const selection = { id: snapshot.id, weekId: snapshot.weekId, revision: 0, activeTeamId: 'team-1' as const, barkuzGoalkeeper: false,
    teams: lineups.map((l, i) => ({ teamId: TEAM_IDS[i]!, name: TEAM_IDS[i]!, playerIds: l.assignments.map(a => a.playerId) })) as never };
  const draft: LineupDraft = { selectionId: snapshot.id, selectionRevision: 0, revision: 0, lineups };
  return assessLineups(draft, { selection, catalog, rulebook: snapshot.rulebook, forms: snapshot.weeklyForms });
}

export function createRuntimePlayers(snapshot: MatchSnapshot, lineups: readonly [Lineup, Lineup]): RtPlayer[] {
  const assessment = pregameAssessment(snapshot, lineups);
  const out: RtPlayer[] = [];
  lineups.forEach((lineup, team) => {
    const formation = FORMATIONS[lineup.formationId];
    for (const slot of formation.slots) {
      const assignment = lineup.assignments.find(a => a.slotId === slot.id)!, player = snapshot.players.find(p => p.id === assignment.playerId)! as Player;
      // A keeper's weekly form reaches the match as it reaches the tactics room (2026-11-04: the engine used the bare rating).
      const keeper = player.kind === 'goalkeeper', rating = keeper ? Math.min(99, Math.max(1, player.goalkeeperRating + (snapshot.weeklyForms.find(f => f.playerId === player.id)?.goalkeeperDelta ?? 0))) : 0;
      const base = keeper ? keeperProxy(rating) : player.attributes;
      const fit = keeper ? null : positionFit(player.name, player.positionRatings, slot.position);
      const pregame = [...assessment.applied.filter(a => a.playerIds.includes(player.id) && (a.effect.kind === 'attribute-delta' || a.effect.kind === 'attribute-set')), ...(fit ?? []).map(m => ({ ...m, playerIds: [player.id] }))];
      const a = keeper ? { ...base } : effectiveValues(base, pregame), specialist = (HEADER_SPECIALISTS as readonly string[]).includes(player.id);
      const kd = assessment.keeperDistribution[player.id];
      out.push({ idx: out.length, id: player.id, name: player.name, team: team as Team, keeper, guest: player.origin.kind === 'guest', slot, base, a, pregame, activeRuleIds: [...new Set(pregame.map(m => m.ruleId))],
        pregameAtmosphere: assessment.applied.reduce((s, m) => s + (m.effect.kind === 'team-atmosphere' && m.playerIds[0] === player.id ? m.effect.delta : 0), 0), chemistry: 0,
        gk: rating, distribution: kd ? { ...kd.values } : keeper ? { passing: base.passing, vision: base.vision } : null,
        longWide: keeper && !!player.specialAbilities?.some(s => s.id === 'accurate-long-wide-distribution'),
        aerial: aerialScore(a, specialist), headerSpecialist: specialist,
        x: 0, z: 0, vx: 0, vz: 0, heading: 0, tx: 0, tz: 0, pace: 0, role: 'shape', roleUntil: 0, energy: 1,
        action: 0, actionStart: 0, actionEnd: 0, actionParam: 0, lockUntil: 0, stallUntil: 0, touchUntil: 0, tackleUntil: 0, decideAt: 0, supportAt: 0, groundedUntil: 0, lunge: null, celebrateWith: -1,
        lastReceived: 0, receivedSinceMood: 0, mood: null, moodUntil: 0, dayForm: null,
        stats: { passes: 0, completed: 0, shots: 0, onTarget: 0, goals: 0, assists: 0, tackles: 0, interceptions: 0, saves: 0, fouls: 0, headersWon: 0 } });
    }
  });
  return out;
}

/** Re-apply a new lineup at half-time: same people, new slots, fresh pregame chemistry; energy, moods and day form carry over. */
export function applyLineups(snapshot: MatchSnapshot, players: RtPlayer[], lineups: readonly [Lineup, Lineup]) {
  const fresh = createRuntimePlayers(snapshot, lineups);
  return fresh.map(f => { const old = players.find(p => p.id === f.id); return old ? { ...f, energy: old.energy, mood: old.mood, moodUntil: old.moodUntil, dayForm: old.dayForm, lastReceived: old.lastReceived, stats: old.stats } : f; });
}

const DAY_FORMS: Readonly<Record<string, readonly string[]>> = {
  'ali-efe': ['', 'ali-efe-bad-day'], 'arda-barin': ['arda-barin-clutch', 'arda-barin-bad-day'], barkuz: ['barkuz-good-day', 'barkuz-bad-day'],
  direnc: ['', 'direnc-bad-day'], eren: ['eren-good-day', 'eren-bad-day'], goktug: ['goktug-good-day', ''], mensur: ['mensur-good-day', 'mensur-bad-day'],
  mustafa: ['mustafa-good-day', 'mustafa-bad-day'], fuat: ['fuat-overconfident', 'fuat-reckless'],
};
/** Source §5 "iyi gün / kötü gün": one seeded draw per player per match. */
export function drawDayForms(players: RtPlayer[], rng: Rng) {
  const drawn: { player: RtPlayer; rule: string }[] = [];
  for (const p of players) {
    const forms = DAY_FORMS[p.id];if (!forms) continue;
    const r = rng.next(), good = forms[0] ? T.personality.dayFormGood : 0, bad = forms[1] ? T.personality.dayFormBad : 0;
    p.dayForm = r < good ? forms[0]! : r < good + bad ? forms[1]! : null;
    if (p.dayForm) drawn.push({ player: p, rule: p.dayForm });
  }
  return drawn;
}

export interface TemporalContext { t: number; score: readonly [number, number]; attacking: readonly [boolean, boolean]; atmosphere: readonly ['good' | 'neutral' | 'bad', 'good' | 'neutral' | 'bad']; players: readonly RtPlayer[] }
const TEMPORAL_PREDICATES = new Set(['goktug-negative-behavior', 'servan-negative-behavior', 'altug-negative-behavior', 'tevfik-negative-behavior', 'erhan-clash', 'batu-breath', ...Object.values(DAY_FORMS).flat().filter(Boolean)]);
export function isTemporal(trigger: RuleTrigger): boolean {
  return trigger.kind === 'phase' || trigger.kind === 'score' || trigger.kind === 'atmosphere' || (trigger.kind === 'behavior' && TEMPORAL_PREDICATES.has(trigger.predicateId)) || (trigger.kind === 'all' && trigger.triggers.some(isTemporal));
}
function holds(trigger: RuleTrigger, p: RtPlayer, c: TemporalContext): boolean {
  const diff = c.score[p.team] - c.score[1 - p.team as Team];
  switch (trigger.kind) {
    case 'phase': return trigger.phase === 'attack' && c.attacking[p.team];
    case 'score': return trigger.state === 'leading' ? diff > 0 : trigger.state === 'trailing' ? diff < 0 : c.t >= 50 * 60 && Math.abs(diff) <= 1;
    case 'atmosphere': return c.atmosphere[p.team] === trigger.state;
    case 'all': return trigger.triggers.every(x => holds(x, p, c));
    case 'behavior': {
      const id = trigger.predicateId;
      if (id === 'tevfik-without-emre') return !c.players.some(q => q.id === 'm-emre' && q.team === p.team);
      if (id.endsWith('-negative-behavior')) return p.mood !== null && c.t < p.moodUntil;
      if (id === 'erhan-clash') return c.players.some(q => q.team === p.team && q.mood !== null && c.t < q.moodUntil && (q.id === 'goktug' || q.id === 'servan')) || c.players.some(q => q.team === p.team && q.dayForm === 'mustafa-bad-day');
      if (id === 'batu-breath') return p.energy < .45;
      return p.dayForm === id;
    }
    default: return false;
  }
}
/** Team chemistry on the pitch (user 2026-11-04: Kamil/Süleyman +0,5, Uğur/Mahmut −0,5 in a bad atmosphere, Servan −1 were in the book
 * but the match ignored them): the team's sum, within ±1, times `chemistryShare` on every other team-mate's passing, vision, positioning. */
const CHEMISTRY_ATTRIBUTES: readonly Attribute[] = ['passing', 'vision', 'positioning'];
const signed = (v: number) => `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2).replace(/0$/, '').replace('.', ',')}`;
/** Rules the commentary announces when they switch on mid-match: score state, atmosphere, Batu's breath, Erhan's clash (moods have their own lines). */
const announced = (r: RuleDefinition) => r.trigger.kind === 'score' || r.trigger.kind === 'atmosphere' || (r.trigger.kind === 'behavior' && (r.trigger.predicateId === 'batu-breath' || r.trigger.predicateId === 'erhan-clash'));
export interface RuleActivation { readonly player: RtPlayer; readonly text: string }
/** In-match layer on top of pregame chemistry. Returns the announced rules that have just switched on. */
export function updateTemporalModifiers(players: RtPlayer[], rules: readonly RuleDefinition[], c: TemporalContext): RuleActivation[] {
  const started: RuleActivation[] = [], on = new Map(players.map(p => [p, p.keeper ? [] : rules.filter(r => r.subjectPlayerIds.includes(p.id) && isTemporal(r.trigger) && holds(r.trigger, p, c))]));
  const teamDelta = (r: RuleDefinition) => r.effects.reduce((s, e) => s + (e.kind === 'team-atmosphere' ? e.delta : 0), 0);
  // Its sources keep their own form ("kendi performansı sabit").
  const chem = ([0, 1] as const).map(team => { let d = 0; const from = new Set<string>(); for (const p of players) { if (p.team !== team) continue; const own = p.pregameAtmosphere + on.get(p)!.reduce((s, r) => s + teamDelta(r), 0); if (own) { d += own; from.add(p.id); } } return { d: clamp(d, -1, 1), from }; });
  for (const p of players) {
    if (p.keeper) continue;
    const active = on.get(p)!, team = chem[p.team]!, d = team.from.has(p.id) ? 0 : Math.round(team.d * T.personality.chemistryShare * 100) / 100;
    const ids = [...new Set([...p.pregame.map(m => m.ruleId), ...active.map(r => r.id), ...(d ? ['team-chemistry'] : [])])];
    if (d === p.chemistry && ids.length === p.activeRuleIds.length && ids.every(id => p.activeRuleIds.includes(id))) continue;
    for (const r of active) if (!p.activeRuleIds.includes(r.id) && announced(r)) {
      const td = teamDelta(r), share = Math.round(td * T.personality.chemistryShare * 100) / 100;
      started.push({ player: p, text: `${r.description ?? r.id}${td ? ` Sahada: takım arkadaşlarının pas/görüş/pozisyonu ${signed(share)}.` : ''}` });
    }
    const temporal: AppliedModifier[] = active.flatMap(r => r.effects.filter(e => e.kind === 'attribute-delta' || e.kind === 'attribute-set').map(effect => ({ ruleId: r.id, layer: 'pair' as const, playerIds: [p.id], explanation: r.description ?? r.id, effect, precedence: r.capGroup === 'locked' ? 100 : 10, capGroup: r.capGroup })));
    const chemistry: AppliedModifier[] = d ? CHEMISTRY_ATTRIBUTES.map(attribute => ({ ruleId: 'team-chemistry', layer: 'atmosphere' as const, playerIds: [p.id], explanation: `Takım kimyası: pas/görüş/pozisyon ${signed(d)}`, effect: { kind: 'attribute-delta' as const, attribute, delta: d }, precedence: 10, capGroup: 'normal' as const })) : [];
    p.a = effectiveValues(p.base, [...p.pregame, ...temporal, ...chemistry]);p.activeRuleIds = ids;p.chemistry = d;p.aerial = aerialScore(p.a, p.headerSpecialist);
  }
  return started;
}

/** Source §3 thresholds with names: ≥2 stabilizers and ≤1 active negative = good; ≥2 active negatives = bad. One strong stabilizer offsets one mild source. */
export function teamAtmosphere(snapshot: MatchSnapshot, players: readonly RtPlayer[], team: Team, t: number) {
  const own = players.filter(p => p.team === team), profiles = snapshot.rulebook.profiles;
  const prof = (id: string) => profiles.find(p => p.playerId === id);
  const barkuzWithArif = own.some(p => p.id === 'barkuz') && own.some(p => p.id === 'arif');
  const stabilizers = own.filter(p => prof(p.id)?.stabilizer !== undefined && prof(p.id)!.stabilizer !== 'none' && !(p.id === 'arif' && barkuzWithArif));
  const active = own.filter(p => p.mood !== null && t < p.moodUntil);
  const strongNeg = active.filter(p => prof(p.id)?.negativeRisk === 'strong').length, mildNeg = active.length - strongNeg;
  const offset = stabilizers.some(p => prof(p.id)?.stabilizer === 'strong') ? Math.min(1, mildNeg) : 0, negatives = strongNeg + mildNeg - offset;
  return { state: negatives >= 2 ? 'bad' as const : stabilizers.length >= 2 && negatives <= 1 ? 'good' as const : 'neutral' as const, stabilizers: stabilizers.map(p => p.name), negatives: active.map(p => p.name) };
}
