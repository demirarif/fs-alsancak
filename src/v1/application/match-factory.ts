import type { LineupContext } from './services.js';
import type { LineupDraft } from '../domain/teams.js';
import type { MatchSnapshot } from '../domain/match.js';
import { resolveMatchCatalog } from '../domain/match-players.ts';
import { deepFreeze } from '../domain/immutable.ts';
import { GUEST_POLICY, RULEBOOK_DECISIONS } from '../config/defaults.ts';
import { ENGINE_TUNING } from '../config/engine-tuning.ts';

function flatten(value: unknown, prefix = '', out: Record<string, number> = {}) {
  if (typeof value === 'number') out[prefix] = value;
  else if (Array.isArray(value)) value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

/** Immutable match input. A new seed per simulation (user decision): the same lineups replay differently every time. */
export function createMatchSnapshot(draft: LineupDraft, context: LineupContext, seed: number, createdAt = new Date().toISOString()): MatchSnapshot {
  const catalog = resolveMatchCatalog(context.catalog, context.selection), ids = draft.lineups.flatMap(l => l.assignments.map(a => a.playerId));
  const players = ids.map(id => catalog.players.find(p => p.id === id)!).filter(Boolean);
  return deepFreeze({
    id: `match-${createdAt.replace(/\D/g, '').slice(0, 14)}-${(seed >>> 0).toString(16)}`, createdAt,
    versions: { schema: 1, catalog: catalog.version, rules: context.rulebook.version, engine: 'engine-v1', tuning: ENGINE_TUNING.version },
    weekId: context.selection.weekId,
    settings: { lengthSeconds: ENGINE_TUNING.halfSeconds * 2, pitchLengthMeters: ENGINE_TUNING.pitch.halfLength * 2, pitchWidthMeters: ENGINE_TUNING.pitch.halfWidth * 2, seed: seed >>> 0, tuningProfileId: ENGINE_TUNING.version },
    players, lineups: draft.lineups,
    weeklyForms: context.forms.filter(f => ids.includes(f.playerId) && f.weekId === context.selection.weekId),
    rulebook: context.rulebook, rulebookDecisions: RULEBOOK_DECISIONS,
    tuning: { profileId: ENGINE_TUNING.version, version: ENGINE_TUNING.version, tickHz: ENGINE_TUNING.tickHz, decisionHz: ENGINE_TUNING.tickHz / ENGINE_TUNING.decisionEvery, ballSubstepsPerTick: 2,
      snapshotHz: ENGINE_TUNING.tickHz / ENGINE_TUNING.snapshotEvery, guestAdaptation: GUEST_POLICY.adaptation, engineCoefficients: flatten(ENGINE_TUNING) },
  });
}
