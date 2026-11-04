import type { PositionRatingBreakdown } from '../domain/ratings.js';

/** Archive ratings display one decimal; v1 stores freshly computed two decimals. */
export function sourceRatingCompatibility(reported: number, calculated: PositionRatingBreakdown): 'exact' | 'display-rounded' | 'mismatch' {
  if (!Number.isFinite(reported) || Math.abs(reported * 100 - Math.round(reported * 100)) > 1e-8) return 'mismatch';
  if (Math.abs(reported - calculated.rating) < 1e-8) return 'exact';
  const oneDecimal = Math.abs(reported * 10 - Math.round(reported * 10)) < 1e-8;
  const tolerance = oneDecimal ? .05 : .005;
  return Math.abs(reported - calculated.rating) <= tolerance + 1e-9 ? 'display-rounded' : 'mismatch';
}
