import type { Attribute } from '../domain/players.js';
import type { AppliedModifier } from '../domain/modifiers.js';
import { ENGINE_TUNING as T } from '../config/engine-tuning.ts';

/** The role's own skill that suffers with positioning when a man plays out of position. */
const KEY: Readonly<Record<string, Attribute>> = { CB: 'defending', FB: 'defending', CM: 'passing', CAM: 'vision', W: 'dribbling', ST: 'finishing' };
const LABEL: Readonly<Record<string, string>> = { CB: 'stoper', FB: 'bek', CM: 'orta saha', CAM: 'hücumcu orta saha', W: 'kanat', ST: 'forvet' };
const ATTR: Readonly<Partial<Record<Attribute, string>>> = { defending: 'savunma', passing: 'pas', vision: 'görüş', dribbling: 'top sürme', finishing: 'bitiricilik' };
const num = (v: number) => v.toFixed(1).replace('.', ',');

/** Out of position, a small engine penalty (user 2026-11-04: no per-player indicator in the tactics room, the team metrics already drop):
 * past `tolerance` rating points below his best position, positioning loses `perPoint` per point (at most `max`), the role's key skill half
 * of that. Locked, so chemistry caps do not absorb it. Null when he fits. */
export function positionFit(name: string, ratings: Readonly<Record<string, number>>, position: string): AppliedModifier[] | null {
  const f = T.positionFit, here = ratings[position];if (here === undefined) return null;
  const [bestPos, best] = Object.entries(ratings).reduce((m, e) => e[1] > m[1] ? e : m), gap = best - here;
  const delta = Math.round(Math.min(f.max, Math.max(0, gap - f.tolerance) * f.perPoint) * 10) / 10;
  if (delta <= 0) return null;
  const key = KEY[position]!, keyDelta = Math.round(delta * f.key * 10) / 10;
  const explanation = `${name} ${LABEL[position] ?? position} oynuyor (en iyi yeri ${LABEL[bestPos] ?? bestPos}): pozisyon −${num(delta)}${keyDelta > 0 ? `, ${ATTR[key]} −${num(keyDelta)}` : ''}.`;
  const mod = (attribute: Attribute, d: number): AppliedModifier => ({ ruleId: 'position-fit', layer: 'position-fit', playerIds: [], explanation, effect: { kind: 'attribute-delta', attribute, delta: -d }, precedence: 0, capGroup: 'locked' });
  return keyDelta > 0 ? [mod('positioning', delta), mod(key, keyDelta)] : [mod('positioning', delta)];
}
