import { ATTRIBUTE_KEYS } from './players.ts';
import type { BaseAttributes, OutfieldPosition, PositionSuitability } from './players.js';
import { ABILITY_WEIGHT, OUTFIELD_POSITIONS, POSITION_WEIGHTS, SUITABILITY_COEFFICIENTS, SUITABILITY_WEIGHT } from '../config/rating-model.ts';

export interface PositionRatingBreakdown {
  readonly position: OutfieldPosition;
  readonly rawAbility: number;
  readonly suitabilityCoefficient: number;
  readonly abilityContribution: number;
  readonly suitabilityContribution: number;
  readonly exact: number;
  readonly rating: number;
}

function bounded(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 1 || value > 10) {
    throw new RangeError(`${field}: 1–10 aralığında sonlu bir değer gerekli.`);
  }
  return value;
}

/** User preference: two decimals; epsilon only absorbs float noise at a tie. */
export function roundRating(value: number): number {
  return Math.round((value + 1e-10) * 100) / 100;
}

export function suitabilityCoefficient(value: number): number {
  bounded(value, 'Mevki uygunluğu');
  const floor = Math.floor(value), ceiling = Math.ceil(value);
  const low = SUITABILITY_COEFFICIENTS[floor], high = SUITABILITY_COEFFICIENTS[ceiling];
  if (low === undefined || high === undefined) throw new RangeError('Uygunluk katsayısı bulunamadı.');
  return low + (high - low) * (value - floor);
}

/** Base ratings only. Match/chemistry/form modifiers never mutate this function. */
export function calculatePositionRating(attributes: BaseAttributes, position: OutfieldPosition, suitability: number): PositionRatingBreakdown {
  const weights = POSITION_WEIGHTS[position];
  if (!weights) throw new RangeError(`Desteklenmeyen saha mevkisi: ${String(position)}`);
  const rawAbility = ATTRIBUTE_KEYS.reduce((sum, key) => sum + bounded(attributes[key], key) * weights[key] / 100, 0);
  const coefficient = suitabilityCoefficient(suitability);
  const abilityContribution = ABILITY_WEIGHT * rawAbility * 10;
  const suitabilityContribution = SUITABILITY_WEIGHT * (10 * coefficient) * 10;
  const exact = abilityContribution + suitabilityContribution;
  return Object.freeze({ position, rawAbility, suitabilityCoefficient: coefficient, abilityContribution, suitabilityContribution, exact, rating: roundRating(exact) });
}

export function calculatePositionRatings(attributes: BaseAttributes, suitability: PositionSuitability): Readonly<Record<OutfieldPosition, number>> {
  return Object.freeze(Object.fromEntries(OUTFIELD_POSITIONS.map(position => [position, calculatePositionRating(attributes, position, suitability[position]).rating])) as Record<OutfieldPosition, number>);
}
