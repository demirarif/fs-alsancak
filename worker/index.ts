/* Alsancak online (user decisions 2026-11-05): one Worker serves the built site and this API on the same address. Only the admin
 * simulates: the admin's browser plays the match ahead of time and uploads it, then prices it (Monte Carlo) and opens the bulletin;
 * everyone else bets Alsancak coin (a game currency, never bought or paid out) until the kick-off and watches the same recording live. The result
 * and everybody's bets are shown once the broadcast has ended; that is also when the bets are paid. */
import { firstPassword, firstPasswordKey, loginKey, usernameFor } from '../src/v1/online/usernames.ts';
import { COIN, COUPON, ODDS, couponPossible, couponQuote, covers, liveOdds, scoreOutcome, settle, unpackSample, wins, type Book, type CouponPosition, type Market, type MatchFacts, type Outcome, type Position, type Sample, type SettleBet } from '../src/v1/online/markets.ts';

interface D1Result<T> { results: T[]; meta: { changes: number } }
interface D1Statement { bind(...values: unknown[]): D1Statement; first<T>(): Promise<T | null>; all<T>(): Promise<D1Result<T>>; run(): Promise<D1Result<unknown>> }
interface D1 { prepare(query: string): D1Statement; batch(statements: D1Statement[]): Promise<D1Result<unknown>[]> }
interface KV {
  get(key: string, options: { type: 'stream' }): Promise<ReadableStream | null>;
  get(key: string, options: { type: 'json' }): Promise<unknown>;
  put(key: string, value: ReadableStream | ArrayBuffer | string, options?: { expiration?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}
interface Env { DB: D1; FILES: KV; ASSETS: { fetch(request: Request): Promise<Response> } }
/** balance and bet_count are kept by triggers from the ledger and the bets (schema.sql); the ledger stays the record. */
interface UserRow { id: number; login: string; username: string; display_name: string; player_id: string | null; kind: string; listed: number; password_hash: string; must_change: number; is_admin: number; balance: number; bet_count: number }
interface MatchRow { id: string; kickoff_at: number; broadcast_ms: number; status: string; odds_status: string; teams: string; result: string; book: string | null; regenerated: number; replaces: string | null; settling_at?: number | null }
/** One bet: a single pick (market_id, code) or a coupon (market_id 'kupon', its picks with their odds of the moment in `legs`). */
interface BetRow { id: string; user_id: number; match_id: string; market_id: string; code: string; label: string; stake: number; odds: number; placed_at: number; status: string; payout: number; legs: string | null }
/** A coupon pick; `won` is written when its match is paid (coupons paid before 2026-11-06 are judged from the book when shown). */
interface LegRow { market: string; code: string; label: string; odds: number; won?: boolean }
interface Teams { names: [string, string]; teams: { name: string; formation: string; players: { id: string; name: string; slot: string; label: string }[] }[] }
interface Result { score: [number, number]; halfTime: [number, number]; facts: MatchFacts }

const SESSION = 'als_session', SESSION_DAYS = 90, RECORDING_DAYS = 3, ITERATIONS = 10_000, LOCK_TRIES = 10, LOCK_MS = 15 * 60_000, DAY = 86_400_000;
// After a match (user, 2026-11-06): the summary three days for everyone, a week for the admin; the results page five matches (the admin's
// panel twelve, its house figures are over them); a match being paid is someone's for 30 s.
const REEL_DAYS = 3, REEL_DAYS_ADMIN = 7, RECENT = 5, RECENT_ADMIN = 12, SETTLE_LOCK_MS = 30_000;
const enc = new TextEncoder();
/** Sent with every answer: no framing by other sites, no type sniffing, no referrer to other sites, no camera, microphone or location. */
const SECURITY: Record<string, string> = { 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'same-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=()' };
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY, ...headers } });
const fail = (status: number, error: string) => json({ error }, status);
class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }

// --- passwords and sessions -------------------------------------------------------------------------------------------------------
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), c => c.charCodeAt(0));
async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
/** Same format as worker/make-seed.mjs writes: pbkdf2-sha256$iterations$salt$hash (base64). */
async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(await derive(password, salt, ITERATIONS))}`;
}
async function verifyPassword(password: string, stored: string) {
  const [scheme, iterations, salt, hash] = stored.split('$');if (scheme !== 'pbkdf2-sha256' || !iterations || !salt || !hash) return false;
  const got = await derive(password, unb64(salt), Number(iterations)), want = unb64(hash);
  let diff = got.length ^ want.length;for (let i = 0; i < Math.min(got.length, want.length); i++) diff |= got[i]! ^ want[i]!;
  return diff === 0;
}
async function sha256(text: string) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)))].map(b => b.toString(16).padStart(2, '0')).join(''); }
const token = (bytes: number) => b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const cookie = (request: Request, name: string) => (request.headers.get('cookie') ?? '').split(/;\s*/).find(c => c.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
const sessionCookie = (value: string, maxAge: number) => `${SESSION}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const publicUser = (u: UserRow) => ({ username: u.username, displayName: u.display_name, playerId: u.player_id, kind: u.kind, isAdmin: !!u.is_admin, mustChangePassword: !!u.must_change });

const whoIs = (env: Env, hash: string, now: number) => env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?').bind(hash, now);
async function currentUser(request: Request, env: Env): Promise<UserRow | null> {
  const t = cookie(request, SESSION);if (!t) return null;
  return whoIs(env, await sha256(t), Date.now()).first<UserRow>();
}
/** The site's files (a page load asks for a couple of dozen): a session seen in the last minute is not looked up again (user, 2026-11-06:
 * "işlemciyi hafiflet"). The API always looks it up. */
const filePass = new Map<string, number>();
async function signedIn(request: Request, env: Env) {
  const t = cookie(request, SESSION);if (!t) return false;
  const hash = await sha256(t), now = Date.now();if ((filePass.get(hash) ?? 0) > now) return true;
  const ok = !!(await env.DB.prepare('SELECT 1 AS ok FROM sessions WHERE token_hash = ? AND expires_at > ?').bind(hash, now).first());
  if (ok) { filePass.set(hash, now + 60_000);if (filePass.size > 200) filePass.delete(filePass.keys().next().value!); }
  return ok;
}
/** The first password (the name and "!") is known to the whole group: until it is changed, a session can only change it. */
async function requireUser(request: Request, env: Env, firstPasswordOk = false) {
  const u = await currentUser(request, env);if (!u) throw new HttpError(401, 'Giriş yapman gerekiyor.');
  if (u.must_change && !firstPasswordOk) throw new HttpError(403, 'Önce kendi şifreni belirle.');
  return u;
}
async function requireAdmin(request: Request, env: Env) { const u = await requireUser(request, env);if (!u.is_admin) throw new HttpError(403, 'Bu işlem yalnız admin hesabında.');return u; }
async function body<T>(request: Request): Promise<T> { try { return await request.json() as T; } catch { throw new HttpError(400, 'İstek okunamadı.'); } }
const balanceOf = async (env: Env, userId: number) => (await env.DB.prepare('SELECT COALESCE(SUM(amount), 0) AS b FROM ledger WHERE user_id = ?').bind(userId).first<{ b: number }>())?.b ?? 0;

// --- matches and the book ---------------------------------------------------------------------------------------------------------
const ended = (m: MatchRow, now: number) => now >= m.kickoff_at + m.broadcast_ms;
const shownOdds = (o: number) => o.toFixed(2).replace('.', ',');
const recordingKey = (id: string) => `rec:${id}`, reelKey = (id: string) => `reel:${id}`, samplesKey = (id: string) => `samples:${id}`, liveKey = (id: string) => `live:${id}`;
type FileKind = 'recording' | 'reel' | 'live';
const fileKey = (kind: FileKind, id: string) => kind === 'recording' ? recordingKey(id) : kind === 'live' ? liveKey(id) : reelKey(id);
const teamsOf = (m: MatchRow) => { const t = JSON.parse(m.teams) as Teams;return (p: string) => t.teams[0]!.players.some(x => x.id === p) ? 0 as const : t.teams[1]!.players.some(x => x.id === p) ? 1 as const : undefined; };
/** A match's book, read once per isolate while it stays the same (it is ~27 kB). Nothing changes the object it returns. */
const bookCache = new Map<string, { raw: string; book: Book }>();
function bookOf(m: MatchRow): Book | null {
  if (!m.book) return null;const hit = bookCache.get(m.id);if (hit && hit.raw === m.book) return hit.book;
  const book = JSON.parse(m.book) as Book;bookCache.set(m.id, { raw: m.book, book });if (bookCache.size > 8) bookCache.delete(bookCache.keys().next().value!);
  return book;
}
async function stakedOn(env: Env, matchId: string) {
  // Single picks only: a coupon's money does not move one market's odds (it is on all its picks together).
  const rows = (await env.DB.prepare("SELECT market_id, code, SUM(stake) AS s, COUNT(*) AS n FROM bets WHERE match_id = ? AND status NOT IN ('void', 'withdrawn') AND market_id <> 'kupon' GROUP BY market_id, code").bind(matchId).all<{ market_id: string; code: string; s: number; n: number }>()).results;
  const out: Record<string, Record<string, number>> = {}, counts: Record<string, Record<string, number>> = {};
  for (const r of rows) { (out[r.market_id] ??= {})[r.code] = r.s;(counts[r.market_id] ??= {})[r.code] = r.n; }
  return { staked: out, counts };
}
/** Coupons on a match: how many, how much, and which picks they hold (those markets are played too: their options stay as they are). */
async function couponLegs(env: Env, matchId: string) {
  const rows = (await env.DB.prepare("SELECT legs, stake FROM bets WHERE match_id = ? AND market_id = 'kupon' AND status NOT IN ('void', 'withdrawn')").bind(matchId).all<{ legs: string; stake: number }>()).results;
  const markets: Record<string, Record<string, number>> = {};let staked = 0;
  for (const r of rows) { staked += r.stake;for (const l of JSON.parse(r.legs) as LegRow[]) { const m = markets[l.market] ??= {};m[l.code] = (m[l.code] ?? 0) + 1; } }
  return { count: rows.length, staked, markets };
}
/** The simulated matches a match's odds were made from (kept for pricing coupons), read once per isolate for five minutes. */
const sampleCache = new Map<string, { at: number; list: MatchFacts[] }>();
async function samplesOf(env: Env, id: string) {
  const hit = sampleCache.get(id);if (hit && Date.now() - hit.at < 300_000) return hit.list;
  const raw = await env.FILES.get(samplesKey(id), { type: 'json' }) as Sample[] | null;if (!raw) return null;
  const list = raw.map(unpackSample);sampleCache.set(id, { at: Date.now(), list });if (sampleCache.size > 8) sampleCache.delete(sampleCache.keys().next().value!);
  return list;
}
type Pick = { market: Market; outcome: Outcome; listed: boolean };
/** A bet's picks as sent ({market, code} each): every market open, one pick per market, each pick playable (any exact score may be typed). */
function resolvePicks(book: Book, raw: unknown): Pick[] {
  const list = Array.isArray(raw) ? raw as { market?: unknown; code?: unknown }[] : [];
  if (!list.length || list.length > COUPON.maxLegs) throw new HttpError(400, `Kuponda 1 ile ${COUPON.maxLegs} arasında seçim olur.`);
  const seen = new Set<string>();
  return list.map(x => {
    const market = book.markets.find(m => m.id === String(x.market));if (!market) throw new HttpError(409, 'Kupondaki bir bahis bültende yok; çıkarıp yeniden dene.');
    if (!market.active) throw new HttpError(409, `${market.label} bahsi şu an kapalı; ${list.length > 1 ? 'kupondan çıkar' : 'başka bir bahis seç'}.`);
    if (seen.has(market.id)) throw new HttpError(400, 'Bir kupona aynı bahisten iki seçim konmaz.');seen.add(market.id);
    const listed = market.outcomes.find(o => o.code === String(x.code)), outcome = listed ?? (market.family === 'score' ? scoreOutcome(book, String(x.code)) : null);
    if (!outcome) throw new HttpError(400, 'Seçenek bulunamadı.');
    if (!outcome.playable) throw new HttpError(409, `${market.label}: ${outcome.label} oynanamaz; kaybetme ihtimali neredeyse yok.`);
    return { market, outcome, listed: !!listed };
  });
}
/** Odds of the moment for a bet: one pick's live odds, or a coupon's (the picks' live odds multiplied, lowered for picks that come
 * together, refused when they cannot). */
async function priceBet(env: Env, m: MatchRow, book: Book, picks: Pick[]) {
  const { staked } = await stakedOn(env, m.id);
  const legs = picks.map(p => ({ family: p.market.family, params: p.market.params, code: p.outcome.code,
    odds: liveOdds(p.listed ? p.market : { ...p.market, exclusive: false, outcomes: [p.outcome] }, staked[p.market.id] ?? {}, book.liquidity).find(o => o.code === p.outcome.code)!.odds }));
  if (legs.length === 1) return { legs, odds: legs[0]!.odds, product: legs[0]!.odds, factor: 1 };
  if (!couponPossible(legs, teamsOf(m))) throw new HttpError(409, 'Bu seçimler aynı maçta birlikte gerçekleşemez.');
  const samples = await samplesOf(env, m.id);if (!samples) throw new HttpError(409, 'Bu maçta kupon kapalı; admin oranları yeniden hesaplayınca açılır.');
  const q = couponQuote(legs, samples);if (q.odds < ODDS.playableFrom) throw new HttpError(409, 'Bu kupon kesine yakın; oynanamaz.');
  return { legs, ...q };
}
/** The book with the odds of the moment (the admin's odds moved by the money staked so far). */
function liveBook(book: Book, staked: Record<string, Record<string, number>>, frozen: boolean) {
  return { ...book, markets: book.markets.map(m => {
    const live = frozen ? m.outcomes.map(o => ({ code: o.code, odds: o.odds })) : liveOdds(m, staked[m.id] ?? {}, book.liquidity);
    return { ...m, outcomes: m.outcomes.map((o, i) => ({ ...o, base: o.odds, odds: live[i]!.odds })) };
  }) };
}
/** The live odds of a book for the money on it, worked out again only when that money (or the kick-off) changes. */
const liveCache = new Map<string, { book: Book; key: string; out: ReturnType<typeof liveBook> }>();
function liveBookOf(id: string, book: Book, staked: Record<string, Record<string, number>>, frozen: boolean) {
  const key = `${frozen ? 1 : 0}${JSON.stringify(staked)}`, hit = liveCache.get(id);if (hit && hit.book === book && hit.key === key) return hit.out;
  const out = liveBook(book, staked, frozen);liveCache.set(id, { book, key, out });if (liveCache.size > 8) liveCache.delete(liveCache.keys().next().value!);
  return out;
}
/** What the pages show of a result: score, half time, goals, top scorers, the man of the match. The facts the bets are decided on stay here. */
function shownResult(raw: string) { const { facts: _facts, ...shown } = JSON.parse(raw) as Result & Record<string, unknown>;return shown; }
interface MatchHead { id: string; kickoff_at: number; broadcast_ms: number; status: string; odds_status: string; regenerated: number; teams: string; result: string }
/** What everyone may see of a match: the teams always, the result once the broadcast is over. After it (user, 2026-11-06) the admin may
 * replay it while the full recording is kept (three days); the summary is there for three days, for the admin a week. */
function publicMatch(m: MatchHead, now: number, admin = false) {
  const over = now >= m.kickoff_at + m.broadcast_ms || m.status === 'settled', end = m.kickoff_at + m.broadcast_ms;
  return { id: m.id, kickoffAt: m.kickoff_at, broadcastMs: m.broadcast_ms, status: m.status, oddsStatus: m.odds_status, regenerated: m.regenerated, teams: JSON.parse(m.teams) as Teams,
    live: now >= m.kickoff_at && !over, over, result: over ? shownResult(m.result) : null,
    replayUntil: admin ? m.kickoff_at + RECORDING_DAYS * DAY : 0, reelUntil: end + (admin ? REEL_DAYS_ADMIN : REEL_DAYS) * DAY };
}
async function getMatch(env: Env, id: string) {
  const m = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(id).first<MatchRow>();
  if (!m || m.status === 'draft' || m.status === 'cancelled' || m.status === 'deleted') throw new HttpError(404, 'Maç bulunamadı.');
  return m;
}
/** A list of ledger rows in statements of at most 16 rows (D1 takes at most 100 bound values a statement). */
function ledgerInserts(env: Env, rows: { user: number; kind: string; ref: string; amount: number; match: string | null }[], now: number) {
  const out: D1Statement[] = [];
  for (let i = 0; i < rows.length; i += 16) {
    const part = rows.slice(i, i + 16);
    out.push(env.DB.prepare(`INSERT OR IGNORE INTO ledger (user_id, kind, ref, amount, match_id, created_at) VALUES ${part.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}`)
      .bind(...part.flatMap(r => [r.user, r.kind, r.ref, r.amount, r.match, now])));
  }
  return out;
}
async function runBatches(env: Env, statements: D1Statement[]) { for (let i = 0; i < statements.length; i += 40) await env.DB.batch(statements.slice(i, i + 40)); }
/** Bets are paid once, by whichever request first sees a broadcast that has ended: winners stake × odds, and 30 % of a match's net loss
 * back to whoever lost on it. The ledger's unique refs make a second pass harmless. */
async function settleDue(env: Env, now: number) {
  const due = (await env.DB.prepare("SELECT id FROM matches WHERE status = 'scheduled' AND kickoff_at + broadcast_ms <= ? AND (settling_at IS NULL OR settling_at < ?)").bind(now, now - SETTLE_LOCK_MS).all<{ id: string }>()).results;
  for (const { id } of due) {
    // Whichever request takes the match first pays it; the others go on at once (user, 2026-11-06: twenty people at the final whistle).
    // One that stopped half way is taken again after 30 s; the unique refs keep a second pass harmless.
    const took = await env.DB.prepare("UPDATE matches SET settling_at = ? WHERE id = ? AND status = 'scheduled' AND (settling_at IS NULL OR settling_at < ?)").bind(now, id, now - SETTLE_LOCK_MS).run();
    if (!took.meta.changes) continue;
    const m = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(id).first<MatchRow>();if (!m) continue;
    const result = JSON.parse(m.result) as Result, book = bookOf(m), bets = (await env.DB.prepare("SELECT * FROM bets WHERE match_id = ? AND status = 'open'").bind(m.id).all<BetRow>()).results;
    const market = new Map((book?.markets ?? []).map(x => [x.id, x]));
    const position = (id: string, code: string): Position | null => { const x = market.get(id);return x ? { family: x.family, params: x.params, code } : null; };
    const known = bets.flatMap((b): SettleBet[] => {
      if (b.legs) { const legs = (JSON.parse(b.legs) as LegRow[]).map(l => position(l.market, l.code));return legs.every(Boolean) ? [{ id: b.id, user: b.user_id, stake: b.stake, odds: b.odds, legs: legs as Position[] }] : []; }
      const x = position(b.market_id, b.code);return x ? [{ id: b.id, user: b.user_id, stake: b.stake, odds: b.odds, ...x }] : [];
    }), { results, bonuses } = settle(known, result.facts);
    // A coupon's picks keep whether each came in (✓ / ✗ without reading the book again).
    const judged = new Map(bets.filter(b => b.legs).map(b => [b.id, JSON.stringify((JSON.parse(b.legs!) as LegRow[]).map(l => { const x = market.get(l.market);return { ...l, won: x ? wins(x.family, x.params, l.code, result.facts) : false }; }))]));
    const statements = results.map(r => env.DB.prepare("UPDATE bets SET status = ?, payout = ?, legs = COALESCE(?, legs) WHERE id = ? AND status = 'open'").bind(r.won ? 'won' : 'lost', r.payout, judged.get(r.id) ?? null, r.id));
    statements.push(...ledgerInserts(env, [...results.filter(r => r.payout > 0).map(r => ({ user: r.user, kind: 'win', ref: `win:${r.id}`, amount: r.payout, match: m.id })),
      ...bonuses.filter(b => b.amount > 0).map(b => ({ user: b.user, kind: 'bonus', ref: `bonus:${m.id}:${b.user}`, amount: b.amount, match: m.id }))], now));
    statements.push(env.DB.prepare("UPDATE matches SET status = 'settled' WHERE id = ? AND status = 'scheduled'").bind(m.id));
    // The table's balances are sums the triggers keep; once a match they are checked against the ledger (only a wrong one is written).
    statements.push(env.DB.prepare('UPDATE users SET balance = (SELECT COALESCE(SUM(amount), 0) FROM ledger l WHERE l.user_id = users.id) WHERE balance <> (SELECT COALESCE(SUM(amount), 0) FROM ledger l WHERE l.user_id = users.id)'));
    await runBatches(env, statements);
  }
}
async function refundAll(env: Env, matchId: string, now: number) {
  const bets = (await env.DB.prepare("SELECT * FROM bets WHERE match_id = ? AND status = 'open'").bind(matchId).all<BetRow>()).results;
  await runBatches(env, [...bets.map(b => env.DB.prepare("UPDATE bets SET status = 'void' WHERE id = ?").bind(b.id)),
    ...ledgerInserts(env, bets.map(b => ({ user: b.user_id, kind: 'refund', ref: `refund:${b.id}`, amount: b.stake, match: matchId })), now)]);
}
/** The table: listed players and observers with a bet, by balance (both kept on the user row, so this reads one row each). */
async function leaderboard(env: Env) {
  return (await env.DB.prepare("SELECT username, display_name AS displayName, kind, balance, bet_count AS bets FROM users WHERE is_admin = 0 AND listed = 1 AND bet_count > 0 ORDER BY balance DESC, display_name").all()).results;
}
/** One's bets on these matches (one edited or cancelled before kick-off is 'withdrawn' and left out; its refund stays in the ledger). */
async function myBets(env: Env, userId: number, matchIds: string[]) {
  if (!matchIds.length) return [] as BetRow[];
  return (await env.DB.prepare(`SELECT * FROM bets WHERE user_id = ? AND status NOT IN ('void', 'withdrawn') AND match_id IN (${matchIds.map(() => '?').join(', ')}) ORDER BY placed_at`).bind(userId, ...matchIds).all<BetRow>()).results;
}
/** The house on settled matches (admin only): bets, coins staked, paid back to winners, loss bonus. */
async function houseOf(env: Env, ids: string[]) {
  const q = ids.map(() => '?').join(', ');
  const bets = (await env.DB.prepare(`SELECT match_id, COUNT(*) AS n, COALESCE(SUM(stake), 0) AS s, COALESCE(SUM(payout), 0) AS p FROM bets WHERE status NOT IN ('void', 'withdrawn') AND match_id IN (${q}) GROUP BY match_id`).bind(...ids).all<{ match_id: string; n: number; s: number; p: number }>()).results;
  const bonus = (await env.DB.prepare(`SELECT match_id, COALESCE(SUM(amount), 0) AS b FROM ledger WHERE kind = 'bonus' AND match_id IN (${q}) GROUP BY match_id`).bind(...ids).all<{ match_id: string; b: number }>()).results;
  return new Map(ids.map(id => { const x = bets.find(r => r.match_id === id), y = bonus.find(r => r.match_id === id);return [id, { bets: x?.n ?? 0, staked: x?.s ?? 0, paid: x?.p ?? 0, bonus: y?.b ?? 0 }] as const; }));
}
/** Whether a pick of a paid match came in (its market's rule on the match's facts); null while the match is not paid. */
type Judge = ((market: string, code: string) => boolean | undefined) | null;
/** Read only for a coupon paid before its picks kept the answer: the book and facts are opened on its first such pick. */
function judgeOf(m: { status: string; book: string | null; result: string }): Judge {
  if (m.status !== 'settled' || !m.book) return null;
  let byId: Map<string, Market> | null = null, facts: MatchFacts | null = null;
  return (market, code) => {
    if (!byId) { facts = (JSON.parse(m.result) as Result).facts;byId = new Map((JSON.parse(m.book!) as Book).markets.map(x => [x.id, x])); }
    const x = byId.get(market);return x ? wins(x.family, x.params, code, facts!) : undefined;
  };
}
const legsJudged = (raw: string) => raw.includes('"won":');
const betView = (b: BetRow, judge: Judge = null) => ({ id: b.id, market: b.market_id, code: b.code, label: b.label, stake: b.stake, odds: b.odds, status: b.status, payout: b.payout, at: b.placed_at,
  legs: b.legs ? (JSON.parse(b.legs) as LegRow[]).map(l => l.won !== undefined || !judge ? l : { ...l, won: judge(l.market, l.code) }) : null });
/** Coupons paid before 2026-11-06 among these bets: their matches' books and facts, to judge their picks. */
async function legacyJudges(env: Env, bets: BetRow[]) {
  const ids = [...new Set(bets.filter(b => b.legs && b.status !== 'open' && !legsJudged(b.legs)).map(b => b.match_id))], out = new Map<string, Judge>();
  if (ids.length) for (const x of (await env.DB.prepare(`SELECT id, status, book, result FROM matches WHERE id IN (${ids.map(() => '?').join(', ')})`).bind(...ids).all<{ id: string; status: string; book: string | null; result: string }>()).results) out.set(x.id, judgeOf(x));
  return out;
}
/** Paid matches, newest first, `before` a kick-off time for older ones: the score, one's bets, net and loss bonus (the admin: the house). */
async function recentMatches(env: Env, user: UserRow, now: number, before: number | null) {
  const limit = user.is_admin ? RECENT_ADMIN : RECENT;
  const rows = (await env.DB.prepare(`SELECT id, kickoff_at, broadcast_ms, status, odds_status, regenerated, teams, result FROM matches WHERE status = 'settled' ${before ? 'AND kickoff_at < ?' : ''} ORDER BY kickoff_at DESC LIMIT ?`)
    .bind(...(before ? [before] : []), limit + 1).all<MatchHead>()).results;
  const list = rows.slice(0, limit), ids = list.map(m => m.id), bets = await myBets(env, user.id, ids), judges = await legacyJudges(env, bets);
  const bonus = ids.length ? (await env.DB.prepare(`SELECT match_id, amount FROM ledger WHERE user_id = ? AND kind = 'bonus' AND match_id IN (${ids.map(() => '?').join(', ')})`).bind(user.id, ...ids).all<{ match_id: string; amount: number }>()).results : [];
  const house = user.is_admin && ids.length ? await houseOf(env, ids) : null;
  return { more: rows.length > limit, recent: list.map(m => { const mine = bets.filter(b => b.match_id === m.id);return { ...publicMatch(m, now, !!user.is_admin), mine: mine.map(b => betView(b, judges.get(m.id) ?? null)),
    net: mine.reduce((s, b) => s + b.payout - (b.status === 'void' ? 0 : b.stake), 0), bonus: bonus.find(x => x.match_id === m.id)?.amount ?? 0, ...(house ? { house: house.get(m.id) } : {}) }; }) };
}

async function state(request: Request, env: Env, url: URL) {
  const now = Date.now(), t = cookie(request, SESSION);if (!t) throw new HttpError(401, 'Giriş yapman gerekiyor.');
  // One round trip for the session and the revision every write moves (triggers, schema.sql). A page that sends the version of its last full
  // answer gets {same: true} while nothing has been written and no kick-off or final whistle has passed (user, 2026-11-06: "işlemciyi hafiflet").
  const [who, meta] = await env.DB.batch([whoIs(env, await sha256(t), now), env.DB.prepare("SELECT v FROM meta WHERE k = 'rev'")]);
  const user = (who!.results[0] as UserRow | undefined) ?? null;if (!user) throw new HttpError(401, 'Giriş yapman gerekiyor.');if (user.must_change) throw new HttpError(403, 'Önce kendi şifreni belirle.');
  const rev = (meta!.results[0] as { v: number } | undefined)?.v ?? 0, [seenRev, seenUntil] = (url.searchParams.get('v') ?? '').split('.').map(Number);
  if (seenRev === rev && now < (seenUntil ?? 0)) return json({ now, same: true });
  await settleDue(env, now);
  // Players see a match once its bulletin is open; the admin sees every planned one (also while pricing it).
  const upcoming = (await env.DB.prepare(`SELECT * FROM matches WHERE status = 'scheduled' AND kickoff_at + broadcast_ms > ? ${user.is_admin ? '' : "AND odds_status = 'open'"} ORDER BY kickoff_at LIMIT 5`).bind(now).all<MatchRow>()).results;
  const bets = await myBets(env, user.id, upcoming.map(m => m.id)), up = [];
  for (const m of upcoming) { const book = bookOf(m), { staked } = await stakedOn(env, m.id);up.push({ ...publicMatch(m, now, !!user.is_admin), book: book ? liveBookOf(m.id, book, staked, now >= m.kickoff_at) : null, mine: bets.filter(b => b.match_id === m.id).map(b => betView(b)) }); }
  const incoming = (await env.DB.prepare("SELECT r.id, r.amount, r.created_at AS at, u.username, u.display_name AS displayName FROM requests r JOIN users u ON u.id = r.from_user WHERE r.to_user = ? AND r.status = 'pending' ORDER BY r.created_at DESC").bind(user.id).all()).results;
  const outgoing = (await env.DB.prepare("SELECT r.id, r.amount, r.status, r.created_at AS at, u.username, u.display_name AS displayName FROM requests r JOIN users u ON u.id = r.to_user WHERE r.from_user = ? ORDER BY r.created_at DESC LIMIT 5").bind(user.id).all()).results;
  const { recent, more } = await recentMatches(env, user, now, null);
  // The answer holds until the next kick-off or final whistle of what it shows (five minutes at most).
  let until = now + 300_000;for (const m of upcoming) for (const x of [m.kickoff_at, m.kickoff_at + m.broadcast_ms]) if (x > now && x < until) until = x;
  return json({ now, v: `${rev}.${until}`, me: publicUser(user), balance: await balanceOf(env, user.id), limits: COIN, requests: { incoming, outgoing },
    upcoming: up, recent, recentMore: more, leaderboard: await leaderboard(env) });
}
/** A match with its live odds; everybody's bets only once the broadcast has ended. */
async function matchDetail(request: Request, env: Env, id: string) {
  const user = await requireUser(request, env), now = Date.now();await settleDue(env, now);
  const m = await getMatch(env, id);if (!user.is_admin && m.odds_status !== 'open') throw new HttpError(404, 'Maç bulunamadı.');
  const book = bookOf(m), { staked, counts } = await stakedOn(env, id), over = ended(m, now) || m.status === 'settled';
  const all = over ? (await env.DB.prepare("SELECT b.*, u.display_name AS name FROM bets b JOIN users u ON u.id = b.user_id WHERE b.match_id = ? AND b.status NOT IN ('void', 'withdrawn') ORDER BY u.display_name, b.placed_at").bind(id).all<BetRow & { name: string }>()).results : [];
  const judge = judgeOf(m);
  return json({ now, match: publicMatch(m, now, !!user.is_admin), book: book ? liveBookOf(m.id, book, staked, now >= m.kickoff_at) : null, mine: (await myBets(env, user.id, [id])).map(b => betView(b, judge)),
    bets: all.map(b => ({ ...betView(b, judge), name: b.name })), ...(user.is_admin ? { staked, counts, coupons: await couponLegs(env, id) } : {}) });
}
async function placeBet(request: Request, env: Env, id: string) {
  const user = await requireUser(request, env), now = Date.now();
  if (user.is_admin) throw new HttpError(403, 'Admin hesabı bahis oynamaz; kendi hesabınla gir.');
  const m = await getMatch(env, id);if (m.status !== 'scheduled' || m.odds_status !== 'open') throw new HttpError(409, 'Bu maçın bülteni açık değil.');
  if (now >= m.kickoff_at) throw new HttpError(409, 'Bahisler maç başlayınca kapandı.');
  const b = await body<{ market?: string; code?: string; legs?: unknown; stake?: number; replaces?: string; seen?: number }>(request), stake = Math.round(Number(b.stake));
  if (!Number.isInteger(stake) || stake < COIN.minStake || stake > COIN.maxStake) throw new HttpError(400, `Bahis ${COIN.minStake} ile ${COIN.maxStake.toLocaleString('tr-TR')} Alsancak coin arasında olmalı.`);
  const book = bookOf(m)!, picks = resolvePicks(book, b.legs ?? [{ market: b.market, code: b.code }]);
  // One side per market across one's bets, single picks and coupons alike: no backing the winner and the loser.
  // Editing (user, 2026-11-05: "maça kadar düzenleyebilsin"): the bet being replaced must be one's own, still open, on this match.
  const old = b.replaces ? await env.DB.prepare("SELECT * FROM bets WHERE id = ? AND user_id = ? AND match_id = ? AND status = 'open'").bind(String(b.replaces), user.id, id).first<BetRow>() : null;
  if (b.replaces && !old) throw new HttpError(409, 'Düzenlenen kupon bulunamadı ya da artık değiştirilemez.');
  const held = (await env.DB.prepare("SELECT id, market_id, code, label, legs FROM bets WHERE user_id = ? AND match_id = ? AND status NOT IN ('void', 'withdrawn')").bind(user.id, id).all<{ id: string; market_id: string; code: string; label: string; legs: string | null }>()).results.filter(h => h.id !== old?.id);
  const sides = new Map<string, { code: string; label: string }>();
  for (const h of held) if (h.legs) for (const l of JSON.parse(h.legs) as LegRow[]) sides.set(l.market, { code: l.code, label: l.label });else sides.set(h.market_id, { code: h.code, label: h.label });
  for (const p of picks) { const side = sides.get(p.market.id);if (side && side.code !== p.outcome.code) throw new HttpError(409, `${p.market.label}: zaten "${side.label.split(': ').pop()}" tarafındasın; aynı bahiste iki tarafa oynanmaz.`); }
  // With what this user already holds on the match, some result must still lose them everything.
  const byId = new Map(book.markets.map(x => [x.id, x])), position = (market: string, code: string): Position | null => { const x = byId.get(market);return x ? { family: x.family, params: x.params, code } : null; };
  const positions: (Position | CouponPosition)[] = held.flatMap((h): (Position | CouponPosition)[] => {
    if (h.legs) { const legs = (JSON.parse(h.legs) as LegRow[]).map(l => position(l.market, l.code));return legs.every(Boolean) ? [{ legs: legs as Position[] }] : []; }
    const x = position(h.market_id, h.code);return x ? [x] : [];
  });
  const mine = picks.map(p => ({ family: p.market.family, params: p.market.params, code: p.outcome.code }));positions.push(mine.length === 1 ? mine[0]! : { legs: mine });
  if (covers(positions, teamsOf(m))) throw new HttpError(409, 'Bu bahisle birlikte her sonuçta en az bir bahsin kazanıyor; hem kazanan hem kaybeden tarafa oynanmaz.');
  const q = await priceBet(env, m, book, picks), single = picks.length === 1, seen = Number(b.seen);
  // The odds on the player's screen (user, 2026-11-06): if they have dropped since, nothing is played and the new ones go back to the slip.
  if (Number.isFinite(seen) && seen > 0 && q.odds < seen - 0.005)
    return json({ error: `Oran değişti: ${shownOdds(seen)} → ${shownOdds(q.odds)}. Yeni oranla oynamak için tekrar bas.`, changed: true, odds: q.odds, product: Math.round(q.product * 100) / 100, factor: q.factor, legs: q.legs.map(l => l.odds) }, 409);
  const label = single ? `${picks[0]!.market.label}: ${picks[0]!.outcome.label}` : `Kupon · ${picks.length} seçim`;
  const legs = single ? null : JSON.stringify(picks.map((p, i) => ({ market: p.market.id, code: p.outcome.code, label: `${p.market.label}: ${p.outcome.label}`, odds: q.legs[i]!.odds })));
  const betId = `b${now.toString(36)}${token(6).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  // One transaction: the bet only if the balance covers it (with the replaced bet's stake back); the debit only if the bet went in; the
  // replaced bet is refunded only if the new one went in.
  const statements = [
    env.DB.prepare(`INSERT INTO bets (id, user_id, match_id, market_id, code, label, stake, odds, placed_at, legs) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COALESCE(SUM(amount), 0) FROM ledger WHERE user_id = ?) + ? >= ?
      ${old ? "AND EXISTS (SELECT 1 FROM bets WHERE id = ? AND status = 'open')" : ''}`)
      .bind(betId, user.id, id, single ? picks[0]!.market.id : 'kupon', single ? picks[0]!.outcome.code : picks.map(p => `${p.market.id}=${p.outcome.code}`).join('|'), label, stake, q.odds, now, legs, user.id, old?.stake ?? 0, stake, ...(old ? [old.id] : [])),
    env.DB.prepare("INSERT OR IGNORE INTO ledger (user_id, kind, ref, amount, match_id, created_at) SELECT ?, 'bet', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM bets WHERE id = ?)")
      .bind(user.id, `bet:${betId}`, -stake, id, now, betId),
  ];
  if (old) statements.push(
    env.DB.prepare("UPDATE bets SET status = 'withdrawn' WHERE id = ? AND status = 'open' AND EXISTS (SELECT 1 FROM bets WHERE id = ?)").bind(old.id, betId),
    env.DB.prepare("INSERT OR IGNORE INTO ledger (user_id, kind, ref, amount, match_id, created_at) SELECT ?, 'refund', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM bets WHERE id = ?)")
      .bind(user.id, `refund:${old.id}`, old.stake, id, now, betId));
  await env.DB.batch(statements);
  if (!(await env.DB.prepare('SELECT 1 AS ok FROM bets WHERE id = ?').bind(betId).first())) throw new HttpError(409, old ? 'Kupon değiştirilemedi: bakiyen yetmiyor ya da kupon artık açık değil.' : 'Bakiyen bu bahis için yetmiyor.');
  return json({ ok: true, odds: q.odds, balance: await balanceOf(env, user.id) });
}
/** Cancelling one's own bet before kick-off: the stake comes back (the odds it moved move back). */
async function cancelBet(request: Request, env: Env, betId: string) {
  const user = await requireUser(request, env), now = Date.now();
  const b = await env.DB.prepare("SELECT b.*, m.kickoff_at AS kickoff FROM bets b JOIN matches m ON m.id = b.match_id WHERE b.id = ? AND b.user_id = ?").bind(betId, user.id).first<BetRow & { kickoff: number }>();
  if (!b || b.status !== 'open') throw new HttpError(404, 'Kupon bulunamadı.');if (now >= b.kickoff) throw new HttpError(409, 'Maç başladı; kupon artık değişmez.');
  await env.DB.batch([env.DB.prepare("UPDATE bets SET status = 'withdrawn' WHERE id = ? AND status = 'open'").bind(b.id),
    env.DB.prepare("INSERT OR IGNORE INTO ledger (user_id, kind, ref, amount, match_id, created_at) VALUES (?, 'refund', ?, ?, ?, ?)").bind(user.id, `refund:${b.id}`, b.stake, b.match_id, now)]);
  return json({ ok: true, balance: await balanceOf(env, user.id) });
}
/** A coupon's odds before it is placed (the slip asks on every change); a coupon that cannot be played says why, without an error. */
async function quote(request: Request, env: Env, id: string) {
  const user = await requireUser(request, env), m = await getMatch(env, id);if (!user.is_admin && m.odds_status !== 'open') throw new HttpError(404, 'Maç bulunamadı.');
  const book = bookOf(m);if (!book) throw new HttpError(409, 'Bu maçın oranı yok.');
  try { const q = await priceBet(env, m, book, resolvePicks(book, (await body<{ legs?: unknown }>(request)).legs));return json({ ok: true, odds: q.odds, product: Math.round(q.product * 100) / 100, factor: q.factor, legs: q.legs.map(l => l.odds) }); }
  catch (error) { if (error instanceof HttpError) return json({ ok: false, error: error.message });throw error; }
}
/** The simulated matches behind a match's odds (packed), kept until a day after the kick-off for pricing coupons. */
async function uploadSamples(request: Request, env: Env, id: string) {
  await requireAdmin(request, env);
  const m = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(id).first<MatchRow>();if (!m || m.status === 'cancelled' || m.status === 'deleted') throw new HttpError(404, 'Maç bulunamadı.');
  const list = (await body<{ samples?: unknown }>(request)).samples;if (!Array.isArray(list) || list.length < 20 || list.length > 1000 || !list.every(x => Array.isArray(x) && x.length === 10)) throw new HttpError(400, 'Simülasyonlar okunamadı.');
  await env.FILES.put(samplesKey(id), JSON.stringify(list), { expiration: Math.max(Math.floor(m.kickoff_at / 1000) + 86_400, Math.floor(Date.now() / 1000) + 3_600) });sampleCache.delete(id);
  return json({ ok: true, count: list.length });
}
/** A match's files (user, 2026-11-06): the live copy while the broadcast is on (and a minute after); afterwards the players have the summary
 * (three days), the admin also the full recording (three days) and the summary (a week). */
async function file(request: Request, env: Env, id: string, kind: FileKind) {
  const user = await requireUser(request, env), m = await getMatch(env, id), now = Date.now(), end = m.kickoff_at + m.broadcast_ms, admin = !!user.is_admin;
  if (now < m.kickoff_at && !admin) throw new HttpError(403, 'Maç henüz başlamadı.');
  if (!admin && (kind === 'recording' || (kind === 'live' && now > end + 60_000))) throw new HttpError(403, 'Yayın bitti. Maçın özetini Sonuçlar\'daki "Özeti izle"den izleyebilirsin.');
  if (kind === 'reel') {
    if (!ended(m, now) && m.status !== 'settled') throw new HttpError(403, 'Özet maç bitince açılır.');
    if (now > end + (admin ? REEL_DAYS_ADMIN : REEL_DAYS) * DAY) throw new HttpError(410, 'Bu maçın özetinin süresi doldu.');
  }
  // A match planned before the live copy existed is watched from its full recording.
  const stream = await env.FILES.get(fileKey(kind, id), { type: 'stream' }) ?? (kind === 'live' ? await env.FILES.get(recordingKey(id), { type: 'stream' }) : null);
  if (!stream) throw new HttpError(410, kind === 'reel' ? 'Özet bulunamadı.' : 'Tam kayıt silindi (maçtan 3 gün sonra yalnız skor, goller ve özet kalır).');
  return new Response(stream, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'private, max-age=3600' } });
}

// --- coin requests ("para at") ----------------------------------------------------------------------------------------------------
async function requestCoins(request: Request, env: Env) {
  const user = await requireUser(request, env);if (user.is_admin) throw new HttpError(403, 'Admin hesabı Alsancak coin istemez.');
  const b = await body<{ to?: string; amount?: number }>(request), amount = Math.round(Number(b.amount));
  if (!Number.isInteger(amount) || amount < COIN.minStake || amount > COIN.start) throw new HttpError(400, `İstek ${COIN.minStake} ile ${COIN.start.toLocaleString('tr-TR')} Alsancak coin arasında olmalı.`);
  const to = await env.DB.prepare('SELECT * FROM users WHERE login = ? AND is_admin = 0').bind(loginKey(String(b.to ?? ''))).first<UserRow>();
  if (!to || to.id === user.id) throw new HttpError(400, 'Kimden istediğini seç.');
  // Only someone whose coins have run out asks (user decision); one open request to a friend, three in all.
  if (await balanceOf(env, user.id) >= COIN.minStake) throw new HttpError(409, `Bakiyen ${COIN.minStake} Alsancak coin'in altına inince arkadaşından isteyebilirsin.`);
  const open = (await env.DB.prepare("SELECT to_user FROM requests WHERE from_user = ? AND status = 'pending'").bind(user.id).all<{ to_user: number }>()).results;
  if (open.some(r => r.to_user === to.id)) throw new HttpError(409, `${to.display_name} kişisine bekleyen bir isteğin var.`);
  if (open.length >= 3) throw new HttpError(409, 'Aynı anda en çok üç istek bekleyebilir.');
  await env.DB.prepare('INSERT INTO requests (from_user, to_user, amount, created_at) VALUES (?, ?, ?, ?)').bind(user.id, to.id, amount, Date.now()).run();
  return json({ ok: true });
}
async function answerRequest(request: Request, env: Env, id: number, send: boolean) {
  const user = await requireUser(request, env), now = Date.now();
  const r = await env.DB.prepare("SELECT * FROM requests WHERE id = ? AND to_user = ? AND status = 'pending'").bind(id, user.id).first<{ id: number; from_user: number; amount: number }>();
  if (!r) throw new HttpError(404, 'İstek bulunamadı.');
  if (!send) { await env.DB.prepare("UPDATE requests SET status = 'declined', resolved_at = ? WHERE id = ?").bind(now, id).run();return json({ ok: true }); }
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO ledger (user_id, kind, ref, amount, created_at) SELECT ?, 'transfer', ?, ?, ? WHERE (SELECT COALESCE(SUM(amount), 0) FROM ledger WHERE user_id = ?) >= ?")
      .bind(user.id, `req:${id}:out`, -r.amount, now, user.id, r.amount),
    env.DB.prepare("INSERT OR IGNORE INTO ledger (user_id, kind, ref, amount, created_at) SELECT ?, 'transfer', ?, ?, ? WHERE EXISTS (SELECT 1 FROM ledger WHERE ref = ?)")
      .bind(r.from_user, `req:${id}:in`, r.amount, now, `req:${id}:out`),
    env.DB.prepare("UPDATE requests SET status = 'sent', resolved_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM ledger WHERE ref = ?)").bind(now, id, `req:${id}:out`),
  ]);
  if (!(await env.DB.prepare('SELECT 1 AS ok FROM ledger WHERE ref = ?').bind(`req:${id}:out`).first())) throw new HttpError(409, 'Bakiyen bu isteği karşılamaya yetmiyor.');
  return json({ ok: true, balance: await balanceOf(env, user.id) });
}

// --- admin ------------------------------------------------------------------------------------------------------------------------
async function createMatch(request: Request, env: Env) {
  await requireAdmin(request, env);
  const b = await body<{ kickoffAt: number; broadcastMs: number; teams: Teams; result: Result; engineVersion: string; replaces?: string | null }>(request);
  if (!Number.isFinite(b.kickoffAt) || !Number.isFinite(b.broadcastMs) || b.broadcastMs < 60_000 || b.broadcastMs > 3 * 3_600_000 || !b.teams?.teams?.length || !b.result?.facts) throw new HttpError(400, 'Maç bilgisi eksik.');
  if (b.replaces) { const old = await getMatch(env, b.replaces);if (old.status !== 'scheduled' || Date.now() >= old.kickoff_at) throw new HttpError(409, 'Başlamış ya da bitmiş maç yeniden üretilemez.'); }
  const id = `m${Date.now().toString(36)}${token(6).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  await env.DB.prepare("INSERT INTO matches (id, kickoff_at, broadcast_ms, status, teams, result, engine_version, replaces, created_at) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?)")
    .bind(id, Math.round(b.kickoffAt), Math.round(b.broadcastMs), JSON.stringify(b.teams), JSON.stringify(b.result), String(b.engineVersion ?? ''), b.replaces ?? null, Date.now()).run();
  return json({ id });
}
/** How long a match's files are kept (user decisions): the full recording three days after kick-off, the live copy a day after the
 * broadcast, the summary a week and a day (players see it three days, the admin a week). */
const keptUntil = (kind: FileKind, kickoff: number, broadcastMs: number) => kind === 'recording' ? kickoff + RECORDING_DAYS * DAY : kind === 'live' ? kickoff + broadcastMs + DAY : kickoff + broadcastMs + (REEL_DAYS_ADMIN + 1) * DAY;
async function upload(request: Request, env: Env, id: string, kind: FileKind) {
  await requireAdmin(request, env);
  const m = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(id).first<MatchRow>();if (!m || m.status !== 'draft') throw new HttpError(409, 'Yükleme yalnız planlanan maça yapılır.');
  if (!request.body) throw new HttpError(400, 'Dosya boş.');
  const expiration = Math.max(Math.floor(keptUntil(kind, m.kickoff_at, m.broadcast_ms) / 1000), Math.floor(Date.now() / 1000) + 3_600);
  await env.FILES.put(fileKey(kind, id), request.body, { expiration });
  return json({ ok: true });
}
/** The upload is complete: the match is scheduled (players still do not see it until its bulletin is opened). */
async function publish(request: Request, env: Env, id: string) {
  await requireAdmin(request, env);const now = Date.now();
  const m = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(id).first<MatchRow>();if (!m || m.status !== 'draft') throw new HttpError(409, 'Maç yayına hazır değil.');
  // Re-generated (new squads before kick-off): the old match's bets are refunded (its markets belong to other lineups) and a note shows.
  if (m.replaces) { await refundAll(env, m.replaces, now);await env.DB.batch([env.DB.prepare('UPDATE matches SET regenerated = (SELECT regenerated + 1 FROM matches WHERE id = ?) WHERE id = ?').bind(m.replaces, id), env.DB.prepare("UPDATE matches SET status = 'cancelled' WHERE id = ? AND status = 'scheduled'").bind(m.replaces)]);await Promise.all([env.FILES.delete(recordingKey(m.replaces)), env.FILES.delete(liveKey(m.replaces)), env.FILES.delete(reelKey(m.replaces)), env.FILES.delete(samplesKey(m.replaces))]); }
  await env.DB.prepare("UPDATE matches SET status = 'scheduled' WHERE id = ? AND status = 'draft'").bind(id).run();
  return json({ ok: true });
}
/** The admin's odds (suggested, then edited) until the kick-off; bets already placed keep their own odds. A market with bets on it can be
 * closed but not removed. Odds stay within the global bounds. */
async function saveBook(request: Request, env: Env, id: string) {
  await requireAdmin(request, env);const m = await getMatch(env, id);
  if (m.status !== 'scheduled' || Date.now() >= m.kickoff_at) throw new HttpError(409, 'Oranlar maç başlamadan önce değişir.');
  const book = (await body<{ book?: Book }>(request)).book;if (!book || !Array.isArray(book.markets)) throw new HttpError(400, 'Bülten okunamadı.');
  for (const market of book.markets) for (const o of market.outcomes) o.odds = Math.min(ODDS.max, Math.max(ODDS.min, Math.round(Number(o.odds) * 100) / 100));
  const { staked } = await stakedOn(env, id), kept = new Set(book.markets.map(x => x.id));
  for (const [market, codes] of Object.entries((await couponLegs(env, id)).markets)) Object.assign(staked[market] ??= {}, codes);
  const lost = Object.keys(staked).filter(x => !kept.has(x));
  if (lost.length) throw new HttpError(409, 'Oynanmış bir bahis bültenden çıkarılamaz; kapatabilirsin.');
  // A played market keeps what its bets mean ("başka bir oyuncu" depends on who is listed); only its odds change, or it closes.
  const before = new Map((bookOf(m)?.markets ?? []).map(x => [x.id, x]));
  for (const [marketId, codes] of Object.entries(staked)) {
    const now = book.markets.find(x => x.id === marketId)!, was = before.get(marketId);
    if (was && (now.family !== was.family || JSON.stringify(now.params) !== JSON.stringify(was.params) || (now.family !== 'score' && Object.keys(codes).some(c => !now.outcomes.some(o => o.code === c)))))
      throw new HttpError(409, `"${was.label}" bahsine oynandı: seçenekleri değişmez, yalnız oranı değişir ya da kapanır.`);
  }
  book.liquidity = Math.min(2_000_000, Math.max(20_000, Math.round(Number(book.liquidity) || ODDS.liquidity)));
  await env.DB.prepare("UPDATE matches SET book = ?, odds_status = CASE WHEN odds_status = 'none' THEN 'draft' ELSE odds_status END WHERE id = ?").bind(JSON.stringify(book), id).run();
  return json({ ok: true });
}
async function openBulletin(request: Request, env: Env, id: string) {
  await requireAdmin(request, env);const m = await getMatch(env, id);
  if (!m.book) throw new HttpError(409, 'Önce oranları hesapla ve kaydet.');if (Date.now() >= m.kickoff_at) throw new HttpError(409, 'Maç başladı.');
  await env.DB.prepare("UPDATE matches SET odds_status = 'open' WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
/** Moves a planned match's kick-off (user: "maçlar düzenlenebilir olsun"): only before it starts, never into the past. Bets stay as they
 * are; the recording, the reel and the coupon simulations are written again so they are kept as long after the new time as before. */
async function moveMatch(request: Request, env: Env, id: string) {
  await requireAdmin(request, env);const now = Date.now(), m = await getMatch(env, id);
  if (m.status !== 'scheduled' || now >= m.kickoff_at) throw new HttpError(409, 'Başlamış ya da bitmiş maçın saati değişmez.');
  const at = Math.round(Number((await body<{ kickoffAt?: number }>(request)).kickoffAt));
  if (!Number.isFinite(at) || at < now + 60_000 || at > now + 30 * 86_400_000) throw new HttpError(400, 'Yeni saat en az bir dakika sonra, en çok 30 gün içinde olmalı.');
  await env.DB.prepare('UPDATE matches SET kickoff_at = ? WHERE id = ?').bind(at, id).run();
  const keep = async (key: string, until: number) => { const body = await env.FILES.get(key, { type: 'stream' });if (body) await env.FILES.put(key, body, { expiration: Math.floor(until / 1000) }); };
  for (const kind of ['recording', 'live', 'reel'] as const) await keep(fileKey(kind, id), keptUntil(kind, at, m.broadcast_ms));
  await keep(samplesKey(id), at + DAY);
  return json({ ok: true, kickoffAt: at });
}
/** Deletes a match (user decision: the admin deletes any match). Not yet paid: its bets are refunded and it is cancelled. Paid: it leaves
 * every list; with undo what it moved is taken back (stakes refunded, winnings and loss bonus withdrawn) as if it had never been played.
 * The ledger keeps every entry (undo adds the opposite ones), so balances stay a plain sum. The recording goes either way. */
async function removeMatch(request: Request, env: Env, id: string, undo: boolean) {
  await requireAdmin(request, env);const now = Date.now();
  const m = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(id).first<MatchRow>();if (!m || m.status === 'deleted') throw new HttpError(404, 'Maç bulunamadı.');
  let reverted = 0;
  if (m.status !== 'settled') { await refundAll(env, id, now);await env.DB.prepare("UPDATE matches SET status = 'cancelled' WHERE id = ?").bind(id).run(); }
  else {
    if (undo) {
      const bets = (await env.DB.prepare("SELECT * FROM bets WHERE match_id = ? AND status IN ('won', 'lost')").bind(id).all<BetRow>()).results;
      const bonus = (await env.DB.prepare("SELECT user_id, amount FROM ledger WHERE match_id = ? AND kind = 'bonus'").bind(id).all<{ user_id: number; amount: number }>()).results;
      await runBatches(env, [...bets.map(b => env.DB.prepare("UPDATE bets SET status = 'void' WHERE id = ?").bind(b.id)),
        ...ledgerInserts(env, [...bets.map(b => ({ user: b.user_id, kind: 'undo', ref: `undo-stake:${b.id}`, amount: b.stake, match: id })),
          ...bets.filter(b => b.payout > 0).map(b => ({ user: b.user_id, kind: 'undo', ref: `undo-win:${b.id}`, amount: -b.payout, match: id })),
          ...bonus.map(x => ({ user: x.user_id, kind: 'undo', ref: `undo-bonus:${id}:${x.user_id}`, amount: -x.amount, match: id }))], now)]);
      reverted = bets.length;
    }
    await env.DB.prepare("UPDATE matches SET status = 'deleted' WHERE id = ?").bind(id).run();
  }
  await Promise.all([env.FILES.delete(recordingKey(id)), env.FILES.delete(liveKey(id)), env.FILES.delete(reelKey(id)), env.FILES.delete(samplesKey(id))]);
  return json({ ok: true, reverted });
}
/** Every bet of the signed-in user, match by match, newest first ("Kuponlarım"); a score only once that broadcast has ended. */
async function coupons(request: Request, env: Env) {
  const user = await requireUser(request, env), now = Date.now();await settleDue(env, now);
  type Row = BetRow & { m_kickoff: number; m_broadcast: number; m_status: string; m_teams: string; m_result: string };
  const rows = (await env.DB.prepare(`SELECT b.*, m.kickoff_at AS m_kickoff, m.broadcast_ms AS m_broadcast, m.status AS m_status, m.teams AS m_teams, m.result AS m_result
    FROM bets b JOIN matches m ON m.id = b.match_id WHERE b.user_id = ? AND m.status IN ('scheduled', 'settled', 'cancelled') ORDER BY m.kickoff_at DESC, b.placed_at LIMIT 500`).bind(user.id).all<Row>()).results;
  const bonus = (await env.DB.prepare("SELECT match_id, amount FROM ledger WHERE user_id = ? AND kind = 'bonus'").bind(user.id).all<{ match_id: string; amount: number }>()).results;
  const paid = [...new Set(rows.filter(r => r.legs && r.m_status === 'settled' && !legsJudged(r.legs)).map(r => r.match_id))], judges = new Map<string, Judge>();
  if (paid.length) for (const x of (await env.DB.prepare(`SELECT id, status, book, result FROM matches WHERE id IN (${paid.map(() => '?').join(', ')})`).bind(...paid).all<{ id: string; status: string; book: string | null; result: string }>()).results) judges.set(x.id, judgeOf(x));
  const matches = new Map<string, { id: string; kickoffAt: number; names: [string, string]; status: string; live: boolean; over: boolean; score: [number, number] | null; bonus: number; bets: ReturnType<typeof betView>[] }>();
  for (const r of rows) {
    if (r.status === 'withdrawn' || (r.status === 'void' && r.m_status !== 'cancelled')) continue;
    let m = matches.get(r.match_id);
    if (!m) {
      const played = r.m_status !== 'cancelled', over = played && (r.m_status === 'settled' || now >= r.m_kickoff + r.m_broadcast);
      m = { id: r.match_id, kickoffAt: r.m_kickoff, names: (JSON.parse(r.m_teams) as Teams).names, status: r.m_status, live: played && !over && now >= r.m_kickoff, over,
        score: over ? (JSON.parse(r.m_result) as Result).score : null, bonus: bonus.find(x => x.match_id === r.match_id)?.amount ?? 0, bets: [] };
      matches.set(r.match_id, m);
    }
    m.bets.push(betView(r, judges.get(r.match_id) ?? null));
  }
  return json({ now, matches: [...matches.values()] });
}
/** Observers bet like everyone but play no football (no player card, never in a squad) and are off the table until the admin lists them. */
async function addObserver(request: Request, env: Env) {
  await requireAdmin(request, env);
  const name = String((await body<{ name?: string }>(request)).name ?? '').trim().replace(/\s+/g, ' ');if (name.length < 2 || name.length > 30) throw new HttpError(400, 'Ad 2–30 karakter olmalı.');
  const username = usernameFor({ id: '', name }), login = loginKey(username);
  if (!login) throw new HttpError(400, 'Ad harf içermeli.');
  if (await env.DB.prepare('SELECT 1 AS x FROM users WHERE login = ?').bind(login).first()) throw new HttpError(409, `"${username}" kullanıcı adı zaten var.`);
  const now = Date.now();
  await env.DB.prepare("INSERT INTO users (login, username, display_name, player_id, kind, listed, password_hash, must_change, is_admin, created_at) VALUES (?, ?, ?, NULL, 'observer', 0, ?, 1, 0, ?)")
    .bind(login, username, name, await hashPassword(firstPassword(username)), now).run();
  await env.DB.prepare("INSERT OR IGNORE INTO ledger (user_id, kind, ref, amount, created_at) SELECT id, 'start', 'start:' || id, ?, ? FROM users WHERE login = ?").bind(COIN.start, now, login).run();
  return json({ ok: true, username, password: `${username}!` });
}

// --- router -----------------------------------------------------------------------------------------------------------------------
async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname, method = request.method, now = Date.now();
  if (path === '/api/time') return json({ now });
  if (path === '/api/login' && method === 'POST') {
    const b = await body<{ username?: string; password?: string }>(request), typed = String(b.password ?? ''), login = loginKey(String(b.username ?? '')) || '?';
    // Ten wrong passwords for a user name in 15 minutes close it for the rest of those 15 minutes (no guessing at the admin).
    const misses = (await env.DB.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE login = ? AND at > ?').bind(login, now - LOCK_MS).first<{ n: number }>())?.n ?? 0;
    if (misses >= LOCK_TRIES) return fail(429, 'Çok fazla yanlış deneme. 15 dakika sonra tekrar dene.');
    const u = await env.DB.prepare('SELECT * FROM users WHERE login = ?').bind(login).first<UserRow>();
    // The first password is matched however it was typed (capitals, Turkish letters); a chosen one exactly.
    if (!u || !(await verifyPassword(u.must_change ? firstPasswordKey(typed) : typed, u.password_hash))) {
      await env.DB.batch([env.DB.prepare('INSERT INTO login_failures (login, at) VALUES (?, ?)').bind(login, now), env.DB.prepare('DELETE FROM login_failures WHERE at < ?').bind(now - 86_400_000)]);
      return fail(401, 'Kullanıcı adı ya da şifre yanlış.');
    }
    const t = token(32);
    await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now), env.DB.prepare('DELETE FROM login_failures WHERE login = ?').bind(login),
      env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(t), u.id, now + SESSION_DAYS * 86_400_000)]);
    return json({ now, user: publicUser(u) }, 200, { 'set-cookie': sessionCookie(t, SESSION_DAYS * 86_400) });
  }
  if (path === '/api/logout' && method === 'POST') {
    const t = cookie(request, SESSION);if (t) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(t)).run();
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
  }
  if (path === '/api/me') { const u = await currentUser(request, env);return u ? json({ now, user: publicUser(u) }) : fail(401, 'Giriş yapman gerekiyor.'); }
  if (path === '/api/password' && method === 'POST') {
    const u = await requireUser(request, env, true), next = String((await body<{ next?: string }>(request)).next ?? '');
    if (next.trim().length < 4 || next.length > 64) throw new HttpError(400, 'Şifre en az 4 karakter olmalı.');
    if (firstPasswordKey(next) === firstPassword(u.username) || next === firstPassword(u.username)) throw new HttpError(400, 'İlk şifreden farklı bir şifre seç.');
    await env.DB.prepare('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?').bind(await hashPassword(next), u.id).run();
    return json({ ok: true, user: { ...publicUser(u), mustChangePassword: false } });
  }
  if (path === '/api/state' && method === 'GET') return state(request, env, url);
  if (path === '/api/recent' && method === 'GET') {
    const user = await requireUser(request, env), before = Math.round(Number(url.searchParams.get('before')));
    return json({ now, ...(await recentMatches(env, user, now, Number.isFinite(before) && before > 0 ? before : null)) });
  }
  if (path === '/api/people' && method === 'GET') {
    const u = await requireUser(request, env);
    return json({ people: (await env.DB.prepare('SELECT username, display_name AS displayName FROM users WHERE is_admin = 0 AND id <> ? ORDER BY display_name').bind(u.id).all()).results });
  }
  if (path === '/api/coupons' && method === 'GET') return coupons(request, env);
  const cancel = path.match(/^\/api\/bets\/([a-z0-9]+)\/cancel$/);
  if (cancel && method === 'POST') return cancelBet(request, env, cancel[1]!);
  if (path === '/api/requests' && method === 'POST') return requestCoins(request, env);
  let m = path.match(/^\/api\/requests\/(\d+)\/(send|decline)$/);
  if (m && method === 'POST') return answerRequest(request, env, Number(m[1]), m[2] === 'send');
  m = path.match(/^\/api\/matches\/([a-z0-9]+)(?:\/(bets|quote|recording|reel|live))?$/);
  if (m) {
    const [, id, sub] = m as unknown as [string, string, string | undefined];
    if (!sub && method === 'GET') return matchDetail(request, env, id);
    if (sub === 'bets' && method === 'POST') return placeBet(request, env, id);
    if (sub === 'quote' && method === 'POST') return quote(request, env, id);
    if ((sub === 'recording' || sub === 'reel' || sub === 'live') && method === 'GET') return file(request, env, id, sub);
  }
  if (path === '/api/admin/matches' && method === 'POST') return createMatch(request, env);
  m = path.match(/^\/api\/admin\/matches\/([a-z0-9]+)(?:\/(recording|reel|live|samples|publish|result|book|open|time))?$/);
  if (m) {
    const [, id, sub] = m as unknown as [string, string, string | undefined];
    if ((sub === 'recording' || sub === 'reel' || sub === 'live') && method === 'PUT') return upload(request, env, id, sub);
    if (sub === 'publish' && method === 'POST') return publish(request, env, id);
    if (sub === 'book' && method === 'PUT') return saveBook(request, env, id);
    if (sub === 'samples' && method === 'PUT') return uploadSamples(request, env, id);
    if (sub === 'open' && method === 'POST') return openBulletin(request, env, id);
    if (sub === 'time' && method === 'POST') return moveMatch(request, env, id);
    if (sub === 'result' && method === 'GET') { await requireAdmin(request, env);const row = await getMatch(env, id);return json({ result: JSON.parse(row.result) }); }
    if (!sub && method === 'DELETE') return removeMatch(request, env, id, url.searchParams.get('undo') === '1');
  }
  if (path === '/api/admin/users' && method === 'GET') {
    await requireAdmin(request, env);
    return json({ users: (await env.DB.prepare(`SELECT username, display_name AS displayName, kind, listed, must_change AS mustChange, is_admin AS isAdmin,
      COALESCE((SELECT SUM(amount) FROM ledger l WHERE l.user_id = users.id), 0) AS balance FROM users ORDER BY is_admin DESC, kind DESC, display_name`).all()).results });
  }
  if (path === '/api/admin/observers' && method === 'POST') return addObserver(request, env);
  // Coins for everybody at once (players, observers or both); one admin entry each, nobody under zero.
  if (path === '/api/admin/balances' && method === 'POST') {
    await requireAdmin(request, env);
    const b = await body<{ add?: number; who?: string }>(request), add = Math.round(Number(b.add)), kind = b.who === 'player' || b.who === 'observer' ? b.who : null;
    if (!Number.isInteger(add) || !add || Math.abs(add) > 1_000_000) throw new HttpError(400, 'Tutar 1 ile 1.000.000 Alsancak coin arasında olmalı (eksi alır).');
    const users = (await env.DB.prepare(`SELECT u.id, COALESCE((SELECT SUM(amount) FROM ledger l WHERE l.user_id = u.id), 0) AS balance FROM users u WHERE u.is_admin = 0 ${kind ? 'AND u.kind = ?' : ''}`).bind(...(kind ? [kind] : [])).all<{ id: number; balance: number }>()).results;
    const rows = users.map(u => ({ user: u.id, kind: 'admin', ref: `admin-all:${now}:${u.id}`, amount: add > 0 ? add : Math.max(add, -Math.max(0, u.balance)), match: null })).filter(r => r.amount);
    await runBatches(env, ledgerInserts(env, rows, now));
    return json({ ok: true, users: rows.length, add });
  }
  m = path.match(/^\/api\/admin\/users\/([^/]+)\/(reset|listed|balance)$/);
  if (m && method === 'POST') {
    await requireAdmin(request, env);
    const u = await env.DB.prepare('SELECT * FROM users WHERE login = ?').bind(loginKey(decodeURIComponent(m[1]!))).first<UserRow>();
    if (!u || u.is_admin) throw new HttpError(404, 'Kullanıcı bulunamadı.');
    if (m[2] === 'listed') { const listed = !!(await body<{ listed?: boolean }>(request)).listed;await env.DB.prepare('UPDATE users SET listed = ? WHERE id = ?').bind(listed ? 1 : 0, u.id).run();return json({ ok: true, listed }); }
    // The admin sets a balance or adds to it (a minus takes away): the difference is an admin entry, so every coin stays in the ledger.
    if (m[2] === 'balance') {
      const b = await body<{ balance?: number; add?: number }>(request), from = await balanceOf(env, u.id);
      const target = b.add !== undefined ? from + Math.round(Number(b.add)) : Math.round(Number(b.balance));
      if (!Number.isInteger(target) || target < 0 || target > 10_000_000) throw new HttpError(400, 'Bakiye 0 ile 10.000.000 Alsancak coin arasında olmalı.');
      const delta = target - from;
      if (delta) await env.DB.prepare("INSERT INTO ledger (user_id, kind, ref, amount, created_at) VALUES (?, 'admin', ?, ?, ?)").bind(u.id, `admin:${u.id}:${now}:${token(6)}`, delta, now).run();
      return json({ ok: true, from, balance: target });
    }
    await env.DB.batch([env.DB.prepare('UPDATE users SET password_hash = ?, must_change = 1 WHERE id = ?').bind(await hashPassword(firstPassword(u.username)), u.id), env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id)]);
    return json({ ok: true, password: `${u.username}!` });
  }
  return fail(404, 'Bulunamadı.');
}

/** The page anyone without a session gets: the site's code, the player data and the pictures go to signed-in users only. */
const LOGIN_PAGE = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#121a19"><meta name="robots" content="noindex, nofollow"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='10' fill='%23121a19'/%3E%3Cpath d='M9 30 18 10h5l8 20h-6l-2-5h-8l-2 5zm8-10h4l-2-6z' fill='%23d5ee90'/%3E%3C/svg%3E" /><title>Alsancak · Giriş</title>
<style>*{box-sizing:border-box}html,body{margin:0;min-height:100%}body{display:grid;place-items:center;min-height:100vh;padding:16px;background:radial-gradient(120% 90% at 50% 0%,#24324a 0%,#121a19 70%);font-family:Manrope,system-ui,-apple-system,'Segoe UI',sans-serif;color:#edf1f7}
.auth-card{width:min(380px,100%);display:grid;gap:14px;padding:26px 24px 22px;border:1px solid #d5b27840;border-radius:12px;background:#1b2433f2;box-shadow:0 24px 60px #0009}
.auth-brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:3px;font-size:12px;color:#e7c181}.auth-mark{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:#121a19;color:#d5ee90;font-size:17px;letter-spacing:0}
h1{margin:4px 0 0;font-size:22px}p{margin:0;color:#9caec4;font-size:13px;line-height:1.5}label{display:grid;gap:6px;font-size:12px;font-weight:700;color:#9caec4}
input{font:inherit;font-size:16px;font-weight:600;padding:11px 12px;border:1px solid #ffffff22;border-radius:8px;background:#111a26;color:#edf1f7}input:focus{outline:2px solid #e7c18199;outline-offset:1px;border-color:transparent}
button{font:inherit;font-weight:800;font-size:14px;padding:12px 16px;border:0;border-radius:8px;background:#e7c181;color:#171f2b;cursor:pointer}button:disabled{opacity:.5;cursor:default}.auth-error{min-height:1.2em;color:#f0a7a7}</style></head>
<body><form class="auth-card" novalidate><div class="auth-brand"><span class="auth-mark">A</span>ALSANCAK</div><h1>Giriş yap</h1><p>Kullanıcı adın ve ilk şifren gruba atıldı.</p>
<label>Kullanıcı adı<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></label><label>Şifre<input name="password" type="password" autocomplete="current-password" required></label>
<p class="auth-error" role="alert"></p><button type="submit">Giriş yap</button></form>
<script>const f=document.querySelector('form'),e=f.querySelector('.auth-error'),b=f.querySelector('button');
f.addEventListener('submit',async ev=>{ev.preventDefault();e.textContent='';b.disabled=true;
try{const r=await fetch('/api/login',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({username:f.username.value,password:f.password.value})});
if(r.ok){location.reload();return;}const d=await r.json().catch(()=>({}));e.textContent=d.error||'Giriş olmadı, tekrar dene.';}catch{e.textContent='Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.';}b.disabled=false;});</script></body></html>`;
const page = (body: string, status: number, type: string) => new Response(body, { status, headers: { 'content-type': type, 'cache-control': 'no-store', ...SECURITY } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await route(request, env, url);
      // Every file of the site goes through here (run_worker_first): the sign-in page without a session, the file itself with one.
      if (!(await signedIn(request, env))) return url.pathname === '/' || url.pathname === '/index.html' ? page(LOGIN_PAGE, 200, 'text/html; charset=utf-8') : page('Giriş yapman gerekiyor.', 401, 'text/plain; charset=utf-8');
      const res = await env.ASSETS.fetch(request), out = new Response(res.body, res);
      for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
      // Never in a shared cache: hashed files stay in the user's own browser, the page is checked every time.
      out.headers.set('cache-control', url.pathname.startsWith('/assets/') ? 'private, max-age=31536000, immutable' : 'private, no-cache');
      return out;
    } catch (error) { if (error instanceof HttpError) return fail(error.status, error.message);console.error(error);return fail(500, 'Sunucuda bir hata oldu. Tekrar dene.'); }
  },
};
