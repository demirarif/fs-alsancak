/** sfc32 seeded by splitmix32. The engine never touches Math.random: one stream per match, serializable at half-time. */
export interface Rng {
  next(): number;
  /** Standard normal (Box–Muller). */
  normal(): number;
  range(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Where the stream stands: four words, plus a pending normal draw when there is one. createRng(seed, state) resumes exactly here;
   * reading it changes nothing. */
  state(): number[];
}

function splitmix(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x9e3779b9) >>> 0; let z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35); return (z ^ (z >>> 16)) >>> 0; };
}

export function createRng(seed: number, saved?: readonly number[]): Rng {
  const restored = !!saved && (saved.length === 4 || saved.length === 5);
  let [a, b, c, d] = restored ? saved!.slice(0, 4).map(v => v >>> 0) as [number, number, number, number] : (() => { const m = splitmix(seed); return [m(), m(), m(), m()] as [number, number, number, number]; })();
  let spare: number | null = restored && saved!.length === 5 ? saved![4]! : null;
  const next = () => {
    const t = (((a + b) >>> 0) + d) >>> 0; d = (d + 1) >>> 0; a = b ^ (b >>> 9); b = (c + (c << 3)) >>> 0; c = ((c << 21) | (c >>> 11)) >>> 0; c = (c + t) >>> 0;
    return t / 4294967296;
  };
  // Warm-up so nearby seeds diverge immediately; a restored stream continues where it was saved (it used to skip 12 draws).
  if (!restored) for (let i = 0; i < 12; i++) next();
  return {
    next,
    normal() { if (spare !== null) { const s = spare; spare = null; return s; } let u = 0; while (u <= 1e-12) u = next(); const v = next(), r = Math.sqrt(-2 * Math.log(u)); spare = r * Math.sin(2 * Math.PI * v); return r * Math.cos(2 * Math.PI * v); },
    range(min, max) { return min + (max - min) * next(); },
    chance(p) { return next() < p; },
    pick(items) { return items[Math.min(items.length - 1, Math.floor(next() * items.length))]!; },
    state() { return spare === null ? [a, b, c, d] : [a, b, c, d, spare]; },
  };
}

/** A fresh seed for every "Simüle et" (user decision: every simulation differs). Uses crypto when available. */
export function freshSeed(): number {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0]!;
  return (Date.now() ^ (performance.now() * 1000)) >>> 0;
}
