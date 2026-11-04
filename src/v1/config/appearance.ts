/** 3D look only. Never part of ratings, chemistry or the source catalog. */
export const SKIN_TONES = [
  { id: 'acik', label: 'Açık', color: '#efc8a3' },
  { id: 'acik-bugday', label: 'Açık buğday', color: '#e0b189' },
  { id: 'bugday', label: 'Buğday', color: '#cf9d74' },
  { id: 'esmer', label: 'Esmer', color: '#b9845d' },
  { id: 'koyu-esmer', label: 'Koyu esmer', color: '#a06f4a' },
] as const;
/** User decision: Mamadou is Black; everyone else sits between fair and dark olive, evenly spread. */
export const SKIN_OVERRIDES: Readonly<Record<string, { readonly id: string; readonly label: string; readonly color: string }>> = {
  mamadou: { id: 'siyahi', label: 'Siyahi', color: '#4c2f20' },
};
export const HAIR_COLORS = ['#17110d', '#261a12', '#35241a', '#4a3322', '#6b3f22', '#8a8882'] as const;
/** User decision: some players long-haired, some short. Weighted: short 4, medium 2, long 2, buzz 2 of 10. */
export const HAIR_STYLES = ['short', 'medium', 'long', 'buzz', 'short', 'long', 'short', 'medium', 'buzz', 'short'] as const;
export type HairStyle = typeof HAIR_STYLES[number];
/** Bright, varied boots make foot movement readable from the broadcast camera. */
export const BOOT_COLORS = ['#ec4f86', '#f2d33f', '#3d8ef2', '#f3f3ec', '#1d1f22', '#2ec6a8', '#f18b2e'] as const;

export interface PlayerAppearance { readonly skin: string; readonly skinId: string; readonly hair: string; readonly hairStyle: HairStyle; readonly boots: string }

function hash(id: string) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Stable per player; a guest gets its own look from its own ID. Options pin a tone or style (balancing, samples). */
export function appearanceFor(playerId: string, options: { readonly skinIndex?: number; readonly hairStyle?: HairStyle } = {}): PlayerAppearance {
  const h = hash(playerId), override = SKIN_OVERRIDES[playerId];
  const tone = override ?? SKIN_TONES[(options.skinIndex ?? h) % SKIN_TONES.length]!;
  return { skin: tone.color, skinId: tone.id, hair: override ? HAIR_COLORS[0] : HAIR_COLORS[(h >>> 3) % HAIR_COLORS.length]!,
    hairStyle: options.hairStyle ?? (override ? 'buzz' : HAIR_STYLES[(h >>> 11) % HAIR_STYLES.length]!), boots: BOOT_COLORS[(h >>> 7) % BOOT_COLORS.length]! };
}

/** Round-robin over a hash-shuffled roster keeps tones balanced for any set of players. */
export function assignAppearances(playerIds: readonly string[]): ReadonlyMap<string, PlayerAppearance> {
  const ordered = [...new Set(playerIds)].sort((a, b) => hash(a) - hash(b) || a.localeCompare(b));
  let slot = 0;
  return new Map(ordered.map(id => [id, SKIN_OVERRIDES[id] ? appearanceFor(id) : appearanceFor(id, { skinIndex: slot++ })]));
}
