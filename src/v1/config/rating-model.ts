import type { Attribute, OutfieldPosition } from '../domain/players.js';

export const OUTFIELD_POSITIONS = ['CB', 'FB', 'CM', 'CAM', 'W', 'ST'] as const;
export const ALL_POSITIONS = ['GK', ...OUTFIELD_POSITIONS] as const;
export const RATING_MODEL_VERSION = 'source-92-8-two-decimals-v1';
export const RATING_DECIMALS = 2;
export const ABILITY_WEIGHT = .92;
export const SUITABILITY_WEIGHT = .08;

export const SUITABILITY_COEFFICIENTS = [0, .35, .46, .56, .65, .73, .76, .84, .93, .98, 1] as const;

/** Integer percentages, transcribed verbatim from the rulebook; each totals 100. */
export const POSITION_WEIGHTS = {
  CB:  { speed:10, stamina:6, strength:14, passing:8, vision:4, control:5, dribbling:2, shooting:1, finishing:0, defending:25, pressing:10, positioning:15 },
  FB:  { speed:18, stamina:14, strength:6, passing:10, vision:6, control:7, dribbling:8, shooting:2, finishing:2, defending:12, pressing:8, positioning:7 },
  CM:  { speed:5, stamina:12, strength:5, passing:18, vision:16, control:10, dribbling:7, shooting:5, finishing:2, defending:7, pressing:6, positioning:7 },
  CAM: { speed:8, stamina:7, strength:3, passing:16, vision:18, control:12, dribbling:12, shooting:8, finishing:6, defending:1, pressing:3, positioning:6 },
  W:   { speed:20, stamina:10, strength:3, passing:8, vision:8, control:10, dribbling:18, shooting:7, finishing:7, defending:1, pressing:3, positioning:5 },
  ST:  { speed:15, stamina:7, strength:10, passing:4, vision:4, control:8, dribbling:8, shooting:10, finishing:20, defending:0, pressing:4, positioning:10 },
} as const satisfies Readonly<Record<OutfieldPosition, Readonly<Record<Attribute, number>>>>;
