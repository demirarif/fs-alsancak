/* Alsancak coin betting (user decisions 2026-11-05; first called dinar): a game currency only — never bought, never paid out. Fixed odds against the house with no
 * margin; the house may lose ("kasa da kaybedebilsin"), so a good predictor multiplies his coins. No risk-free play: one side per market
 * per user, odds always rounded down, near-certain outcomes shown but not playable unless the admin opens them, the 30 % bonus only on a
 * match's net loss. The same `wins` decides an outcome in the Monte Carlo (its probability) and at settlement. Shared by the Worker. */
export const COIN = { start: 30_000, minStake: 100, maxStake: 5_000, lossBonus: .3 } as const;
/** Odds bounds; `liquidity` (coins) sets how slowly money moves the odds, `drift` the most they move from the admin's odds. */
export const ODDS = { min: 1.05, max: 200, playableFrom: 1.1, liquidity: 200_000, drift: .3 } as const;
export const SCORE_MAX = 25;

export interface PlayerLine {
  readonly id: string; readonly team: 0 | 1; readonly goals: number; readonly assists: number; readonly shots: number; readonly onTarget: number;
  readonly tackles: number; readonly interceptions: number; readonly saves: number; readonly completed: number; readonly headersWon: number;
}
/** Everything a market is decided on, from one played match. */
export interface MatchFacts {
  readonly ht: readonly [number, number]; readonly ft: readonly [number, number];
  readonly goals: readonly { readonly t: number; readonly team: 0 | 1; readonly player: string | null }[];
  readonly corners: number; readonly penalties: number; readonly headerGoals: number;
  readonly players: readonly PlayerLine[];
  /** Kept with a stored simulation (its players are only the scorers and assisters); worked out from `players` otherwise. */
  readonly motm?: string | null;
}
export type Family = 'ft' | 'ht' | 'sh' | 'htft' | 'margin' | 'half-more' | 'total' | 'team-total' | 'ht-total' | 'sh-total' | 'both-4plus' | 'score'
  | 'player-goals' | 'player-assist' | 'top-scorer' | 'motm' | 'first-team' | 'first-scorer' | 'penalty' | 'header-goal' | 'corners';
export interface Outcome { readonly code: string; readonly label: string; prob: number; odds: number; playable: boolean }
export interface Market {
  readonly id: string; readonly family: Family; readonly group: string; label: string; readonly params: Readonly<Record<string, unknown>>;
  /** Outcomes exclude one another and cover every result (one wins): their odds move together. Top scorer is not (a tie pays all). */
  readonly exclusive: boolean; active: boolean; readonly custom?: boolean; outcomes: Outcome[];
}
/** A match's book: the markets plus what the admin's suggestions need later (player goal ladders, the exact-score model). */
export interface Book {
  markets: Market[];
  readonly meta: { readonly sims: number; readonly playerGoals: Readonly<Record<string, readonly number[]>>; readonly playerAssists: Readonly<Record<string, number>>; readonly score: { readonly mu: readonly [number, number]; readonly v: readonly [number, number] } };
  liquidity: number;
}

const res = (a: number, b: number) => a > b ? '1' : a < b ? '2' : 'X';
const goalsOf = (f: MatchFacts, id: string) => f.players.find(p => p.id === id)?.goals ?? 0;
/** Maçın oyuncusu: goals and assists first, then shots on target, defending, saves, passing, headers; a winning side's man ahead. */
export function rating(p: PlayerLine, won: boolean) {
  return 2.5 * p.goals + 1.5 * p.assists + .3 * p.onTarget + .25 * (p.tackles + p.interceptions) + .4 * p.saves + .015 * p.completed + .1 * p.headersWon + (won ? 1 : 0);
}
export function manOfTheMatch(f: MatchFacts): string | null {
  const winner = f.ft[0] > f.ft[1] ? 0 : f.ft[1] > f.ft[0] ? 1 : -1;
  let best: PlayerLine | null = null, score = -Infinity;
  for (const p of f.players) { const r = rating(p, p.team === winner); if (r > score + 1e-9 || (Math.abs(r - score) <= 1e-9 && best && (p.goals > best.goals || (p.goals === best.goals && p.id < best.id)))) { best = p; score = r; } }
  return best?.id ?? null;
}
export const topScorers = (f: MatchFacts) => { const top = Math.max(0, ...f.players.map(p => p.goals)); return top ? f.players.filter(p => p.goals === top).map(p => p.id) : []; };

/** Did `code` win in this market, given the match? */
export function wins(family: Family, params: Readonly<Record<string, unknown>>, code: string, f: MatchFacts): boolean {
  const [a, b] = f.ft, [ha, hb] = f.ht, sa = a - ha, sb = b - hb, line = Number(params.line), over = (n: number) => code === 'over' ? n > line : n < line, yes = (v: boolean) => code === 'yes' ? v : !v;
  switch (family) {
    case 'ft': return code === res(a, b);
    case 'ht': return code === res(ha, hb);
    case 'sh': return code === res(sa, sb);
    case 'htft': return code === `${res(ha, hb)}/${res(a, b)}`;
    case 'margin': { const d = a - b; return code === (d >= 3 ? 'b3' : d >= 1 ? 'b12' : d === 0 ? 'x' : d >= -2 ? 'r12' : 'r3'); }
    case 'half-more': { const h = ha + hb, s = sa + sb; return code === (h > s ? 'first' : h < s ? 'second' : 'equal'); }
    case 'total': return over(a + b);
    case 'team-total': return over(Number(params.team) === 1 ? b : a);
    case 'ht-total': return over(ha + hb);
    case 'sh-total': return over(sa + sb);
    case 'corners': return over(f.corners);
    case 'both-4plus': return yes(a >= 4 && b >= 4);
    case 'score': return code === `${a}-${b}`;
    case 'player-goals': return yes(goalsOf(f, String(params.player)) >= Number(params.k));
    case 'player-assist': return yes((f.players.find(p => p.id === params.player)?.assists ?? 0) >= 1);
    case 'top-scorer': return topScorers(f).includes(code);
    case 'motm': { const m = f.motm !== undefined ? f.motm : manOfTheMatch(f);return code === m || (code === 'other' && !!m && !(params.listed as string[]).includes(m)); }
    case 'first-team': return code === (f.goals[0] ? (f.goals[0].team ? 'red' : 'blue') : 'none');
    case 'first-scorer': { const g = f.goals[0];if (!g) return code === 'none';const p = g.player;return p && (params.listed as string[]).includes(p) ? code === p : code === 'other'; }
    case 'penalty': return yes(f.penalties > 0);
    case 'header-goal': return yes(f.headerGoals > 0);
  }
}

/** Odds steps, always rounded down (so a fair book never adds up to a sure win): 0,05 to 2, 0,1 to 5, 0,25 to 10, 0,5 to 20, 1 to 50, then 5. */
export function floorOdds(o: number, max: number = ODDS.max) {
  if (!Number.isFinite(o)) return max;
  const step = o < 2 ? .05 : o < 5 ? .1 : o < 10 ? .25 : o < 20 ? .5 : o < 50 ? 1 : 5;
  return Math.min(max, Math.max(ODDS.min, Math.round(Math.floor(o / step + 1e-9) * step * 100) / 100));
}
export const fairOdds = (p: number) => floorOdds(1 / Math.max(p, 1e-9));
const outcome = (code: string, label: string, prob: number): Outcome => { const odds = fairOdds(prob);return { code, label, prob, odds, playable: odds >= ODDS.playableFrom }; };

/** Each team's goals as a negative binomial fitted to the simulated mean and variance (a Poisson when not over-dispersed). */
function nb(k: number, mu: number, v: number) {
  if (v <= mu * 1.02) { let p = Math.exp(-mu);for (let j = 1; j <= k; j++) p *= mu / j;return p; }
  const r = mu * mu / (v - mu), q = mu / (r + mu);let lg = 0;for (let j = 0; j < k; j++) lg += Math.log((r + j) / (j + 1));
  return Math.exp(lg + r * Math.log(1 - q) + k * Math.log(q));
}
export function scoreProb(book: Pick<Book, 'meta'>, a: number, b: number) { const s = book.meta.score;return nb(a, s.mu[0], s.v[0]) * nb(b, s.mu[1], s.v[1]); }

export interface TeamSheet { readonly name: string; readonly players: readonly { readonly id: string; readonly name: string }[] }
const half = (x: number) => Math.floor(x) + .5, fmt = (n: number) => String(n).replace('.', ',');
/** The suggested book from N simulated matches with the planned lineups (fresh seeds, never the real one). */
export function buildBook(sims: readonly MatchFacts[], teams: readonly [TeamSheet, TeamSheet]): Book {
  const N = sims.length, names = new Map(teams.flatMap(t => t.players.map(p => [p.id, p.name] as const))), [blue, red] = [teams[0].name, teams[1].name];
  const count = (family: Family, params: Record<string, unknown>, code: string) => sims.filter(f => wins(family, params, code, f)).length;
  const markets: Market[] = [];
  /** Exclusive market: frequencies with half a match added to each outcome (no zero, sums to one). */
  const add = (id: string, family: Family, group: string, label: string, params: Record<string, unknown>, list: [string, string][], exclusive = true) => {
    const c = list.map(([code]) => count(family, params, code)), k = list.length;
    markets.push({ id, family, group, label, params, exclusive, active: true, outcomes: list.map(([code, l], i) => outcome(code, l, exclusive ? (c[i]! + .5) / (N + .5 * k) : (c[i]! + .5) / (N + 1))) });
  };
  const mean = (f: (x: MatchFacts) => number) => sims.reduce((s, x) => s + f(x), 0) / N, variance = (f: (x: MatchFacts) => number) => { const m = mean(f);return sims.reduce((s, x) => s + (f(x) - m) ** 2, 0) / N; };
  const R = [['1', blue], ['X', 'Beraberlik'], ['2', red]] as [string, string][];
  add('ft', 'ft', 'Maç', 'Maç sonucu', {}, R);
  add('margin', 'margin', 'Maç', 'Fark', {}, [['b3', `${blue} 3+ farkla`], ['b12', `${blue} 1–2 farkla`], ['x', 'Beraberlik'], ['r12', `${red} 1–2 farkla`], ['r3', `${red} 3+ farkla`]]);
  const short = { '1': blue, 'X': 'Beraberlik', '2': red } as Record<string, string>;
  add('htft', 'htft', 'Maç', 'İlk yarı / Maç sonu', {}, ['1', 'X', '2'].flatMap(h => ['1', 'X', '2'].map(f => [`${h}/${f}`, `${short[h]} / ${short[f]}`] as [string, string])));
  add('ht', 'ht', 'Yarılar', 'İlk yarı sonucu', {}, R);
  add('sh', 'sh', 'Yarılar', 'İkinci yarı sonucu (yalnız 2. yarının golleri)', {}, R);
  add('half-more', 'half-more', 'Yarılar', 'Hangi yarı daha gollü', {}, [['first', 'İlk yarı'], ['equal', 'Eşit'], ['second', 'İkinci yarı']]);
  const htLine = half(mean(f => f.ht[0] + f.ht[1]) - .5), shLine = half(mean(f => f.ft[0] + f.ft[1] - f.ht[0] - f.ht[1]) - .5);
  add('ht-total', 'ht-total', 'Yarılar', `İlk yarı toplam gol ${fmt(htLine)}`, { line: htLine }, [['over', `${fmt(htLine)} üst`], ['under', `${fmt(htLine)} alt`]]);
  add('sh-total', 'sh-total', 'Yarılar', `İkinci yarı toplam gol ${fmt(shLine)}`, { line: shLine }, [['over', `${fmt(shLine)} üst`], ['under', `${fmt(shLine)} alt`]]);
  const centre = half(mean(f => f.ft[0] + f.ft[1]) - .5);
  for (const line of [centre - 4, centre - 2, centre, centre + 2, centre + 4].filter(l => l > 0))
    add(`total-${line}`, 'total', 'Goller', `Toplam gol ${fmt(line)}`, { line }, [['over', `${fmt(line)} üst`], ['under', `${fmt(line)} alt`]]);
  for (const team of [0, 1] as const) {
    const m = half(mean(f => f.ft[team]) - .5);
    for (const line of [m - 1, m + 1].filter(l => l > 0))
      add(`team-${team}-${line}`, 'team-total', 'Goller', `${teams[team].name} gol ${fmt(line)}`, { team, line }, [['over', `${fmt(line)} üst`], ['under', `${fmt(line)} alt`]]);
  }
  add('both-4plus', 'both-4plus', 'Goller', 'İki takım da 4+ gol atar', {}, [['yes', 'Evet'], ['no', 'Hayır']]);
  // Exact score: every score is playable (any one may be typed); the 16 likeliest are listed. The model, not the thin counts, prices them.
  const score = { mu: [mean(f => f.ft[0]), mean(f => f.ft[1])] as [number, number], v: [variance(f => f.ft[0]), variance(f => f.ft[1])] as [number, number] };
  const all: { a: number; b: number; p: number }[] = [];for (let a = 0; a <= SCORE_MAX; a++) for (let b = 0; b <= SCORE_MAX; b++) all.push({ a, b, p: nb(a, score.mu[0], score.v[0]) * nb(b, score.mu[1], score.v[1]) });
  markets.push({ id: 'score', family: 'score', group: 'Skor', label: 'Doğru skor', params: {}, exclusive: true, active: true, outcomes: all.sort((x, y) => y.p - x.p).slice(0, 16).map(s => outcome(`${s.a}-${s.b}`, `${s.a}–${s.b}`, s.p)) });
  // Players: each one's goal ladder and assists from the simulations (also for the admin's own markets later).
  const ids = teams.flatMap(t => t.players.map(p => p.id)), playerGoals: Record<string, number[]> = {}, playerAssists: Record<string, number> = {};
  for (const id of ids) { playerGoals[id] = [1, 2, 3, 4, 5, 6].map(k => (sims.filter(f => goalsOf(f, id) >= k).length + .5) / (N + 1));playerAssists[id] = (sims.filter(f => (f.players.find(p => p.id === id)?.assists ?? 0) >= 1).length + .5) / (N + 1); }
  const scorers = ids.filter(id => playerGoals[id]![0]! > .05).sort((x, y) => playerGoals[y]![0]! - playerGoals[x]![0]!).slice(0, 8);
  for (const id of scorers) for (const k of [1, 2, 3]) {
    const p = playerGoals[id]![k - 1]!;if (k > 1 && p < .01) continue;
    markets.push(playerMarket(id, names.get(id) ?? id, k, p));
  }
  const listedTop = ids.map(id => ({ id, c: sims.filter(f => topScorers(f).includes(id)).length })).filter(x => x.c > 0).sort((x, y) => y.c - x.c).slice(0, 8);
  markets.push({ id: 'top-scorer', family: 'top-scorer', group: 'Oyuncular', label: 'Maçın golcüsü (eşitlikte hepsi kazanır)', params: {}, exclusive: false, active: true, outcomes: listedTop.map(x => outcome(x.id, names.get(x.id) ?? x.id, (x.c + .5) / (N + 1))) });
  const motm = ids.map(id => ({ id, c: sims.filter(f => manOfTheMatch(f) === id).length })).sort((x, y) => y.c - x.c).filter(x => x.c > 0).slice(0, 10).map(x => x.id);
  add('motm', 'motm', 'Oyuncular', 'Maçın oyuncusu', { listed: motm }, [...motm.map(id => [id, names.get(id) ?? id] as [string, string]), ['other', 'Başka bir oyuncu']]);
  const firsts = ids.map(id => ({ id, c: sims.filter(f => f.goals[0]?.player === id).length })).sort((x, y) => y.c - x.c).filter(x => x.c > 0).slice(0, 8).map(x => x.id);
  add('first-scorer', 'first-scorer', 'Oyuncular', 'İlk golü atan', { listed: firsts }, [...firsts.map(id => [id, names.get(id) ?? id] as [string, string]), ['other', 'Başka bir oyuncu'], ['none', 'Gol olmaz']]);
  for (const id of ids.filter(id => playerAssists[id]! > .15).sort((x, y) => playerAssists[y]! - playerAssists[x]!).slice(0, 6))
    markets.push(assistMarket(id, names.get(id) ?? id, playerAssists[id]!));
  add('first-team', 'first-team', 'Diğer', 'İlk golü atan takım', {}, [['blue', blue], ['red', red], ['none', 'Gol olmaz']]);
  add('penalty', 'penalty', 'Diğer', 'Penaltı olur', {}, [['yes', 'Evet'], ['no', 'Hayır']]);
  add('header-goal', 'header-goal', 'Diğer', 'Kafa golü olur', {}, [['yes', 'Evet'], ['no', 'Hayır']]);
  const cl = half(mean(f => f.corners) - .5);add(`corners-${cl}`, 'corners', 'Diğer', `Korner ${fmt(cl)}`, { line: cl }, [['over', `${fmt(cl)} üst`], ['under', `${fmt(cl)} alt`]]);
  return { markets, liquidity: ODDS.liquidity, meta: { sims: N, playerGoals, playerAssists, score } };
}
/** "X k+ gol atar", from the player's simulated goal ladder (the admin's own markets too). */
export function playerMarket(id: string, name: string, k: number, p: number, custom = false): Market {
  const label = k === 1 ? `${name} gol atar` : k === 3 ? `${name} hat-trick yapar` : `${name} ${k}+ gol atar`;
  return { id: `goals-${id}-${k}`, family: 'player-goals', group: custom ? 'Özel' : 'Oyuncular', label, params: { player: id, k }, exclusive: true, active: true, ...(custom ? { custom: true } : {}),
    outcomes: [outcome('yes', 'Evet', p), outcome('no', 'Hayır', 1 - p)] };
}
/** "X asist yapar", from the player's simulated assists (the admin may add it for anyone). */
export function assistMarket(id: string, name: string, p: number, custom = false): Market {
  return { id: `assist-${id}`, family: 'player-assist', group: custom ? 'Özel' : 'Oyuncular', label: `${name} asist yapar`, params: { player: id }, exclusive: true, active: true, ...(custom ? { custom: true } : {}),
    outcomes: [outcome('yes', 'Evet', p), outcome('no', 'Hayır', 1 - p)] };
}

/** Odds now: money staked on an outcome pulls its price down and pushes the others up, slowly (`liquidity`) and never more than `drift`
 * from the admin's odds. An exclusive market keeps its total implied probability; a non-exclusive one moves each outcome alone. */
export function liveOdds(market: Market, staked: Readonly<Record<string, number>>, liquidity: number) {
  // Exact scores move one by one (hundreds of them may be played; money on 6–4 says nothing about 5–5).
  const independent = !market.exclusive || market.family === 'score';
  const q = market.outcomes.map(o => 1 / o.odds), total = market.outcomes.reduce((s, o) => s + (staked[o.code] ?? 0), 0), Q = q.reduce((s, x) => s + x, 0);
  return market.outcomes.map((o, i) => {
    const s = staked[o.code] ?? 0, moved = independent ? q[i]! + (1 - q[i]!) * s / (liquidity + s) : (q[i]! * liquidity + s * Q) / (liquidity + total);
    const odds = floorOdds(Math.min(o.odds * (1 + ODDS.drift), Math.max(o.odds * (1 - ODDS.drift), 1 / Math.max(moved, 1e-9))));
    return { code: o.code, odds: Math.max(ODDS.min, odds) };
  });
}
/** An exact score not in the listed sixteen: its odds from the model (any 0–25 score may be played). */
export function scoreOutcome(book: Pick<Book, 'meta'>, code: string): Outcome | null {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(code);if (!m) return null;const a = Number(m[1]), b = Number(m[2]);if (a > SCORE_MAX || b > SCORE_MAX) return null;
  return outcome(code, `${a}–${b}`, scoreProb(book, a, b));
}

/** Odds above what is fair, for the admin to look at before the book goes out (an edit, or a near-certain pick opened on purpose). No one
 * bettor can use them (`covers` refuses bets that win whatever happens); several people on different sides together could. Closed picks
 * do not count: nobody can play them. */
export function bookWarnings(book: Book): string[] {
  const out: string[] = [];
  for (const m of book.markets) if (m.active && m.exclusive && m.family !== 'score' && m.outcomes.every(o => o.playable)) { const s = m.outcomes.reduce((t, o) => t + 1 / o.odds, 0);if (s < 1 - 1e-9) out.push(`${m.label}: oranların toplamı %${(s * 100).toFixed(0)}; her seçeneğe ayrı kişiler oynarsa birlikte her durumda kazanırlar.`); }
  const ladders = new Map<string, Market[]>();
  for (const m of book.markets) if (m.active && ['total', 'team-total', 'ht-total', 'sh-total', 'corners'].includes(m.family)) { const key = `${m.family}:${m.params.team ?? ''}`;ladders.set(key, [...(ladders.get(key) ?? []), m]); }
  for (const list of ladders.values()) for (const lo of list) for (const hi of list) if (Number(lo.params.line) < Number(hi.params.line)) {
    const over = lo.outcomes.find(o => o.code === 'over')!, under = hi.outcomes.find(o => o.code === 'under')!;
    if (over.playable && under.playable && 1 / over.odds + 1 / under.odds < 1 - 1e-9) out.push(`${lo.label} üst ile ${hi.label} alt birlikte her durumda kazandırıyor.`);
  }
  const ladder = new Map<string, Market[]>();for (const m of book.markets) if (m.active && m.family === 'player-goals') ladder.set(String(m.params.player), [...(ladder.get(String(m.params.player)) ?? []), m]);
  for (const list of ladder.values()) for (const lo of list) for (const hi of list) if (Number(lo.params.k) < Number(hi.params.k)) {
    const yes = lo.outcomes[0]!, no = hi.outcomes[1]!;
    if (yes.playable && no.playable && 1 / yes.odds + 1 / no.odds < 1 - 1e-9) out.push(`${lo.label} "Evet" ile ${hi.label} "Hayır" birlikte her durumda kazandırıyor.`);
  }
  return out;
}

/** One bettor's bets on a match must leave a result in which all of them lose: no playing the winner and the loser together ("hem kazanan
 * hem kaybeden"), whatever the odds (moved by the money or edited). True when the bets cover every result, e.g. 7,5 üst with 9,5 alt, a
 * player's "1+ evet" with his "2+ hayır", "iki takım 4+" with both teams' 3,5 alt. Scores are searched exactly (to 8 goals a team in a half,
 * 16 in a match); everything else is set against the bettor wherever the score allows it. */
export interface Position { readonly family: Family; readonly params: Readonly<Record<string, unknown>>; readonly code: string }
/** A coupon among one's bets: it wins only when every pick does. */
export interface CouponPosition { readonly legs: readonly Position[] }
const isCoupon = (b: Position | CouponPosition): b is CouponPosition => 'legs' in b;
const SCORE_FAMILIES = new Set<Family>(['ft', 'ht', 'sh', 'htft', 'margin', 'half-more', 'total', 'team-total', 'ht-total', 'sh-total', 'both-4plus', 'score']);
const HALF_FAMILIES = new Set<Family>(['ht', 'sh', 'htft', 'half-more', 'ht-total', 'sh-total']);
export function covers(all: readonly (Position | CouponPosition)[], teamOf: (player: string) => 0 | 1 | undefined): boolean {
  const bets = all.filter((b): b is Position => !isCoupon(b)), coupons = all.filter(isCoupon);
  const byScore = bets.filter(b => SCORE_FAMILIES.has(b.family)), rest = bets.filter(b => !SCORE_FAMILIES.has(b.family) && b.family !== 'player-goals');
  // A player's goal bets all lose with g goals when every "evet" needs more and every "hayır" fewer: g < min k(evet), g ≥ max k(hayır).
  const ladders = new Map<string, { yes: number; no: number }>();
  for (const b of bets) if (b.family === 'player-goals') { const p = String(b.params.player), l = ladders.get(p) ?? { yes: Infinity, no: 0 }, k = Number(b.params.k);if (b.code === 'yes') l.yes = Math.min(l.yes, k);else l.no = Math.max(l.no, k);ladders.set(p, l); }
  // What must win once the score is known (the rest can be made to lose: another first scorer, a penalty, no corners…).
  const forced = (b: Position, a: number, c: number) => {
    const goals = a + c, team = b.family === 'player-assist' ? teamOf(String(b.params.player)) : undefined;
    switch (b.family) {
      case 'first-team': return b.code === 'none' ? goals === 0 : b.code === 'blue' ? a > 0 && c === 0 : c > 0 && a === 0;
      case 'first-scorer': case 'header-goal': return b.code === (b.family === 'header-goal' ? 'no' : 'none') && goals === 0;
      case 'player-assist': return b.code === 'no' && (team === 1 ? c : team === 0 ? a : goals) === 0;
      default: return false;
    }
  };
  // A coupon must win only if each of its picks must (a player's goals are left free, so a coupon with one never must).
  const mustWin = (l: Position, a: number, c: number, f: MatchFacts) => SCORE_FAMILIES.has(l.family) ? wins(l.family, l.params, l.code, f) : l.family !== 'player-goals' && forced(l, a, c);
  const [H, S] = [...bets, ...coupons.flatMap(x => x.legs)].some(b => HALF_FAMILIES.has(b.family)) ? [8, 8] : [0, SCORE_MAX];
  for (let ha = 0; ha <= H; ha++) for (let hb = 0; hb <= H; hb++) for (let sa = 0; sa <= S; sa++) for (let sb = 0; sb <= S; sb++) {
    const a = ha + sa, c = hb + sb, f: MatchFacts = { ht: [ha, hb], ft: [a, c], goals: [], corners: 0, penalties: 0, headerGoals: 0, players: [] };
    if (byScore.some(b => wins(b.family, b.params, b.code, f)) || rest.some(b => forced(b, a, c)) || coupons.some(x => x.legs.every(l => mustWin(l, a, c, f)))) continue;
    let lost = true;
    for (const [p, l] of ladders) { const team = teamOf(p), max = team === 1 ? c : team === 0 ? a : a + c;if (l.no > Math.min(max, l.yes - 1)) { lost = false;break; } }
    if (lost) return false;
  }
  return true;
}

/** Coupons (user, 2026-11-05: "seçilen hepsi birlikte olup oranlar çarpılmalı"): several picks of one match in one bet, paid only if all
 * of them win, at the picks' odds multiplied. Picks of one match are seldom independent (Mavi kazanır and Mavi 3+ farkla, 7,5 üst and 9,5
 * üst, a striker's goal and his team's win), and a plain product would pay far more than they are worth together; so the simulated
 * matches the odds were made from are kept, and the product is divided by how much more often the picks came together in them than
 * chance would have it. Picks that cannot happen together are refused. */
export const COUPON = { maxLegs: 10, maxOdds: 500 } as const;
/** A stored simulation: half-time and final score, corners, penalties, header goals, the man of the match, the goals in order (time,
 * team, scorer), and who scored or assisted (id, team, goals, assists). About 300 bytes a match. */
export type Sample = [number, number, number, number, number, number, number, string | null, [number, 0 | 1, string | null][], [string, 0 | 1, number, number][]];
export const packSample = (f: MatchFacts): Sample => [f.ht[0], f.ht[1], f.ft[0], f.ft[1], f.corners, f.penalties, f.headerGoals, manOfTheMatch(f),
  f.goals.map(g => [Math.round(g.t), g.team, g.player]), f.players.filter(p => p.goals || p.assists).map(p => [p.id, p.team, p.goals, p.assists])];
export const unpackSample = (s: Sample): MatchFacts => ({ ht: [s[0], s[1]], ft: [s[2], s[3]], corners: s[4], penalties: s[5], headerGoals: s[6], motm: s[7],
  goals: s[8].map(([t, team, player]) => ({ t, team, player })),
  players: s[9].map(([id, team, goals, assists]) => ({ id, team, goals, assists, shots: 0, onTarget: 0, tackles: 0, interceptions: 0, saves: 0, completed: 0, headersWon: 0 })) });
/** Can every pick win in the same match? Scores searched as in `covers`; the rest only needs the score to allow it (a first scorer
 * needs a goal, "gol olmaz" none, a player's k+ goals his team's k goals, his 1+ and 2+ "hayır" cannot both win and so on). */
export function couponPossible(legs: readonly Position[], teamOf: (player: string) => 0 | 1 | undefined): boolean {
  const byScore = legs.filter(l => SCORE_FAMILIES.has(l.family)), rest = legs.filter(l => !SCORE_FAMILIES.has(l.family) && l.family !== 'player-goals');
  const ladders = new Map<string, { atLeast: number; below: number }>();
  for (const l of legs) if (l.family === 'player-goals') { const p = String(l.params.player), x = ladders.get(p) ?? { atLeast: 0, below: Infinity }, k = Number(l.params.k);if (l.code === 'yes') x.atLeast = Math.max(x.atLeast, k);else x.below = Math.min(x.below, k);ladders.set(p, x); }
  const goalsOf = (p: string, a: number, c: number) => { const t = teamOf(p);return t === 1 ? c : t === 0 ? a : a + c; };
  const canWin = (l: Position, a: number, c: number) => {
    const goals = a + c;
    switch (l.family) {
      case 'first-team': return l.code === 'none' ? goals === 0 : l.code === 'blue' ? a > 0 : c > 0;
      case 'first-scorer': return l.code === 'none' ? goals === 0 : l.code === 'other' ? goals > 0 : goalsOf(l.code, a, c) > 0;
      case 'header-goal': return l.code === 'no' || goals > 0;
      case 'top-scorer': return goalsOf(l.code, a, c) > 0;
      case 'player-assist': return l.code === 'no' || goalsOf(String(l.params.player), a, c) > 0;
      default: return true;
    }
  };
  const [H, S] = legs.some(l => HALF_FAMILIES.has(l.family)) ? [8, 8] : [0, SCORE_MAX];
  for (let ha = 0; ha <= H; ha++) for (let hb = 0; hb <= H; hb++) for (let sa = 0; sa <= S; sa++) for (let sb = 0; sb <= S; sb++) {
    const a = ha + sa, c = hb + sb, f: MatchFacts = { ht: [ha, hb], ft: [a, c], goals: [], corners: 0, penalties: 0, headerGoals: 0, players: [] };
    if (!byScore.every(l => wins(l.family, l.params, l.code, f)) || !rest.every(l => canWin(l, a, c))) continue;
    if ([...ladders].every(([p, x]) => x.atLeast < x.below && x.atLeast <= goalsOf(p, a, c))) return true;
  }
  return false;
}
/** A coupon's odds from its picks' odds of the moment and the stored simulations (none kept: no coupon). `factor` is how much more often
 * the picks came together than chance would have it (shrunk towards 1 by two matches either way); under 1,1 it is the noise of a few
 * hundred matches and the plain product stands, above that the product is divided by it. */
export function couponQuote(legs: readonly (Position & { readonly odds: number })[], samples: readonly MatchFacts[]) {
  const product = legs.reduce((x, l) => x * l.odds, 1), N = samples.length;
  if (legs.length < 2) return { odds: floorOdds(product, COUPON.maxOdds), product, factor: 1 };
  let joint = 0;const each = legs.map(() => 0);
  for (const f of samples) { let all = true;legs.forEach((l, i) => { if (wins(l.family, l.params, l.code, f)) each[i]!++;else all = false; });if (all) joint++; }
  const expected = N * each.reduce((x, c) => x * (c + .5) / (N + 1), 1), raw = (joint + 2) / (expected + 2), factor = raw < 1.1 ? 1 : raw;
  return { odds: floorOdds(product / factor, COUPON.maxOdds), product, factor };
}

/** Facts of a played match from its two halves (simulation output): the planner's result and each Monte Carlo run. */
export interface HalfLike {
  readonly score: readonly [number, number];
  readonly teamStats: readonly { readonly corners: number; readonly penalties: number; readonly headerGoals: number }[];
  readonly players: readonly { readonly id: string; readonly team: 0 | 1; readonly stats: Omit<PlayerLine, 'id' | 'team'> }[];
  readonly replay: { readonly events: readonly { readonly kind: string; readonly seconds: number; readonly teamId: string | null; readonly actorId: string | null; readonly outcome?: string }[] };
}
export function factsOf(first: HalfLike, second: HalfLike): MatchFacts {
  const s = second.teamStats;
  return { ht: [first.score[0], first.score[1]], ft: [second.score[0], second.score[1]],
    goals: [...first.replay.events, ...second.replay.events].filter(e => e.kind === 'goal').map(e => ({ t: e.seconds, team: e.teamId === 'team-2' ? 1 : 0, player: e.outcome === 'own-goal' ? null : e.actorId })),
    corners: s[0]!.corners + s[1]!.corners, penalties: s[0]!.penalties + s[1]!.penalties, headerGoals: s[0]!.headerGoals + s[1]!.headerGoals,
    players: second.players.map(p => ({ id: p.id, team: p.team, goals: p.stats.goals, assists: p.stats.assists, shots: p.stats.shots, onTarget: p.stats.onTarget, tackles: p.stats.tackles,
      interceptions: p.stats.interceptions, saves: p.stats.saves, completed: p.stats.completed, headersWon: p.stats.headersWon })) };
}
/** What a winning bet pays: stake × odds in whole coins, worked in hundredths of the odds (2026-11-10: the float product paid 100 @ 1,15
 * as 114, 200 @ 2,30 as 459). Odds are kept to two decimals, so this is exact. */
export const payoutOf = (stake: number, odds: number) => Math.floor(stake * Math.round(odds * 100) / 100);
/** A bet's payout and each user's loss bonus for a settled match. */
export type SettleBet = { readonly id: string; readonly user: number; readonly stake: number; readonly odds: number } & (Position | CouponPosition);
export function settle(bets: readonly SettleBet[], f: MatchFacts) {
  const results = bets.map(b => { const won = isCoupon(b) ? b.legs.every(l => wins(l.family, l.params, l.code, f)) : wins(b.family, b.params, b.code, f);
    return { id: b.id, user: b.user, won, payout: won ? payoutOf(b.stake, b.odds) : 0, stake: b.stake }; });
  const net = new Map<number, number>();for (const r of results) net.set(r.user, (net.get(r.user) ?? 0) + r.payout - r.stake);
  return { results, bonuses: [...net].filter(([, n]) => n < 0).map(([user, n]) => ({ user, amount: Math.floor(-n * COIN.lossBonus) })) };
}
