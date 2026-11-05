/* Alsancak online (user decisions 2026-11-05): one Worker serves the built site and this API on the same address. Only the admin
 * simulates: the admin's browser plays the match ahead of time and uploads it, then prices it (Monte Carlo) and opens the bulletin;
 * everyone else bets dinar (a game currency, never bought or paid out) until the kick-off and watches the same recording live. The result
 * and everybody's bets are shown once the broadcast has ended; that is also when the bets are paid. */
import { firstPassword, firstPasswordKey, loginKey, usernameFor } from '../src/v1/online/usernames.ts';
import { DINAR, ODDS, covers, liveOdds, scoreOutcome, settle, type Book, type Market, type MatchFacts } from '../src/v1/online/markets.ts';

interface D1Result<T> { results: T[]; meta: { changes: number } }
interface D1Statement { bind(...values: unknown[]): D1Statement; first<T>(): Promise<T | null>; all<T>(): Promise<D1Result<T>>; run(): Promise<D1Result<unknown>> }
interface D1 { prepare(query: string): D1Statement; batch(statements: D1Statement[]): Promise<D1Result<unknown>[]> }
interface KV {
  get(key: string, options: { type: 'stream' }): Promise<ReadableStream | null>;
  put(key: string, value: ReadableStream | ArrayBuffer | string, options?: { expiration?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}
interface Env { DB: D1; FILES: KV; ASSETS: { fetch(request: Request): Promise<Response> } }
interface UserRow { id: number; login: string; username: string; display_name: string; player_id: string | null; kind: string; listed: number; password_hash: string; must_change: number; is_admin: number }
interface MatchRow { id: string; kickoff_at: number; broadcast_ms: number; status: string; odds_status: string; teams: string; result: string; book: string | null; regenerated: number; replaces: string | null }
interface BetRow { id: string; user_id: number; match_id: string; market_id: string; code: string; label: string; stake: number; odds: number; placed_at: number; status: string; payout: number }
interface Teams { names: [string, string]; teams: { name: string; formation: string; players: { id: string; name: string; slot: string; label: string }[] }[] }
interface Result { score: [number, number]; halfTime: [number, number]; facts: MatchFacts }

const SESSION = 'als_session', SESSION_DAYS = 90, RECORDING_DAYS = 3, ITERATIONS = 10_000, LOCK_TRIES = 10, LOCK_MS = 15 * 60_000;
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

async function currentUser(request: Request, env: Env): Promise<UserRow | null> {
  const t = cookie(request, SESSION);if (!t) return null;
  return env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?').bind(await sha256(t), Date.now()).first<UserRow>();
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
const recordingKey = (id: string) => `rec:${id}`, reelKey = (id: string) => `reel:${id}`;
const bookOf = (m: MatchRow): Book | null => m.book ? JSON.parse(m.book) as Book : null;
async function stakedOn(env: Env, matchId: string) {
  const rows = (await env.DB.prepare("SELECT market_id, code, SUM(stake) AS s, COUNT(*) AS n FROM bets WHERE match_id = ? AND status <> 'void' GROUP BY market_id, code").bind(matchId).all<{ market_id: string; code: string; s: number; n: number }>()).results;
  const out: Record<string, Record<string, number>> = {}, counts: Record<string, Record<string, number>> = {};
  for (const r of rows) { (out[r.market_id] ??= {})[r.code] = r.s;(counts[r.market_id] ??= {})[r.code] = r.n; }
  return { staked: out, counts };
}
/** The book with the odds of the moment (the admin's odds moved by the money staked so far). */
function liveBook(book: Book, staked: Record<string, Record<string, number>>, frozen: boolean) {
  return { ...book, markets: book.markets.map(m => {
    const live = frozen ? m.outcomes.map(o => ({ code: o.code, odds: o.odds })) : liveOdds(m, staked[m.id] ?? {}, book.liquidity);
    return { ...m, outcomes: m.outcomes.map((o, i) => ({ ...o, base: o.odds, odds: live[i]!.odds })) };
  }) };
}
/** What everyone may see of a match: the teams always, the result once the broadcast is over. */
function publicMatch(m: MatchRow, now: number) {
  const over = ended(m, now) || m.status === 'settled';
  return { id: m.id, kickoffAt: m.kickoff_at, broadcastMs: m.broadcast_ms, status: m.status, oddsStatus: m.odds_status, regenerated: m.regenerated, teams: JSON.parse(m.teams) as Teams,
    live: now >= m.kickoff_at && !over, over, result: over ? JSON.parse(m.result) as Result : null, recordingUntil: m.kickoff_at + RECORDING_DAYS * 86_400_000 };
}
async function getMatch(env: Env, id: string) {
  const m = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(id).first<MatchRow>();
  if (!m || m.status === 'draft' || m.status === 'cancelled') throw new HttpError(404, 'Maç bulunamadı.');
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
  const due = (await env.DB.prepare("SELECT * FROM matches WHERE status = 'scheduled' AND kickoff_at + broadcast_ms <= ?").bind(now).all<MatchRow>()).results;
  for (const m of due) {
    const result = JSON.parse(m.result) as Result, book = bookOf(m), bets = (await env.DB.prepare("SELECT * FROM bets WHERE match_id = ? AND status = 'open'").bind(m.id).all<BetRow>()).results;
    const market = new Map((book?.markets ?? []).map(x => [x.id, x]));
    const known = bets.filter(b => market.has(b.market_id)), { results, bonuses } = settle(known.map(b => ({ id: b.id, user: b.user_id, family: market.get(b.market_id)!.family, params: market.get(b.market_id)!.params, code: b.code, stake: b.stake, odds: b.odds })), result.facts);
    const statements = results.map(r => env.DB.prepare("UPDATE bets SET status = ?, payout = ? WHERE id = ? AND status = 'open'").bind(r.won ? 'won' : 'lost', r.payout, r.id));
    statements.push(...ledgerInserts(env, [...results.filter(r => r.payout > 0).map(r => ({ user: r.user, kind: 'win', ref: `win:${r.id}`, amount: r.payout, match: m.id })),
      ...bonuses.filter(b => b.amount > 0).map(b => ({ user: b.user, kind: 'bonus', ref: `bonus:${m.id}:${b.user}`, amount: b.amount, match: m.id }))], now));
    statements.push(env.DB.prepare("UPDATE matches SET status = 'settled' WHERE id = ? AND status = 'scheduled'").bind(m.id));
    await runBatches(env, statements);
  }
}
async function refundAll(env: Env, matchId: string, now: number) {
  const bets = (await env.DB.prepare("SELECT * FROM bets WHERE match_id = ? AND status = 'open'").bind(matchId).all<BetRow>()).results;
  await runBatches(env, [...bets.map(b => env.DB.prepare("UPDATE bets SET status = 'void' WHERE id = ?").bind(b.id)),
    ...ledgerInserts(env, bets.map(b => ({ user: b.user_id, kind: 'refund', ref: `refund:${b.id}`, amount: b.stake, match: matchId })), now)]);
}
async function leaderboard(env: Env) {
  return (await env.DB.prepare(`SELECT u.username, u.display_name AS displayName, u.kind, COALESCE((SELECT SUM(amount) FROM ledger l WHERE l.user_id = u.id), 0) AS balance,
      (SELECT COUNT(*) FROM bets b WHERE b.user_id = u.id AND b.status <> 'void') AS bets
    FROM users u WHERE u.is_admin = 0 AND u.listed = 1 AND EXISTS (SELECT 1 FROM bets b WHERE b.user_id = u.id) ORDER BY balance DESC, u.display_name`).all()).results;
}
async function myBets(env: Env, userId: number, matchIds: string[]) {
  if (!matchIds.length) return [] as BetRow[];
  return (await env.DB.prepare(`SELECT * FROM bets WHERE user_id = ? AND match_id IN (${matchIds.map(() => '?').join(', ')}) ORDER BY placed_at`).bind(userId, ...matchIds).all<BetRow>()).results;
}
/** The house on settled matches (admin only): bets, dinar staked, paid back to winners, loss bonus. */
async function houseOf(env: Env, ids: string[]) {
  const q = ids.map(() => '?').join(', ');
  const bets = (await env.DB.prepare(`SELECT match_id, COUNT(*) AS n, COALESCE(SUM(stake), 0) AS s, COALESCE(SUM(payout), 0) AS p FROM bets WHERE status <> 'void' AND match_id IN (${q}) GROUP BY match_id`).bind(...ids).all<{ match_id: string; n: number; s: number; p: number }>()).results;
  const bonus = (await env.DB.prepare(`SELECT match_id, COALESCE(SUM(amount), 0) AS b FROM ledger WHERE kind = 'bonus' AND match_id IN (${q}) GROUP BY match_id`).bind(...ids).all<{ match_id: string; b: number }>()).results;
  return new Map(ids.map(id => { const x = bets.find(r => r.match_id === id), y = bonus.find(r => r.match_id === id);return [id, { bets: x?.n ?? 0, staked: x?.s ?? 0, paid: x?.p ?? 0, bonus: y?.b ?? 0 }] as const; }));
}
const betView = (b: BetRow) => ({ id: b.id, market: b.market_id, code: b.code, label: b.label, stake: b.stake, odds: b.odds, status: b.status, payout: b.payout, at: b.placed_at });

async function state(request: Request, env: Env) {
  const user = await requireUser(request, env), now = Date.now();await settleDue(env, now);
  // Players see a match once its bulletin is open; the admin sees every planned one (also while pricing it).
  const upcoming = (await env.DB.prepare(`SELECT * FROM matches WHERE status = 'scheduled' AND kickoff_at + broadcast_ms > ? ${user.is_admin ? '' : "AND odds_status = 'open'"} ORDER BY kickoff_at LIMIT 5`).bind(now).all<MatchRow>()).results;
  const recent = (await env.DB.prepare("SELECT * FROM matches WHERE status = 'settled' ORDER BY kickoff_at DESC LIMIT 12").all<MatchRow>()).results;
  const bets = await myBets(env, user.id, [...upcoming, ...recent].map(m => m.id));
  const up = [];
  for (const m of upcoming) { const book = bookOf(m), { staked } = await stakedOn(env, m.id);up.push({ ...publicMatch(m, now), book: book ? liveBook(book, staked, now >= m.kickoff_at) : null, mine: bets.filter(b => b.match_id === m.id).map(betView) }); }
  const bonus = recent.length ? (await env.DB.prepare(`SELECT match_id, amount FROM ledger WHERE user_id = ? AND kind = 'bonus' AND match_id IN (${recent.map(() => '?').join(', ')})`).bind(user.id, ...recent.map(m => m.id)).all<{ match_id: string; amount: number }>()).results : [];
  const incoming = (await env.DB.prepare("SELECT r.id, r.amount, r.created_at AS at, u.username, u.display_name AS displayName FROM requests r JOIN users u ON u.id = r.from_user WHERE r.to_user = ? AND r.status = 'pending' ORDER BY r.created_at DESC").bind(user.id).all()).results;
  const outgoing = (await env.DB.prepare("SELECT r.id, r.amount, r.status, r.created_at AS at, u.username, u.display_name AS displayName FROM requests r JOIN users u ON u.id = r.to_user WHERE r.from_user = ? ORDER BY r.created_at DESC LIMIT 5").bind(user.id).all()).results;
  const house = user.is_admin && recent.length ? await houseOf(env, recent.map(m => m.id)) : null;
  return json({ now, me: publicUser(user), balance: await balanceOf(env, user.id), limits: DINAR, requests: { incoming, outgoing },
    upcoming: up, recent: recent.map(m => { const mine = bets.filter(b => b.match_id === m.id);return { ...publicMatch(m, now), mine: mine.map(betView), net: mine.reduce((s, b) => s + b.payout - (b.status === 'void' ? 0 : b.stake), 0), bonus: bonus.find(x => x.match_id === m.id)?.amount ?? 0, ...(house ? { house: house.get(m.id) } : {}) }; }),
    leaderboard: await leaderboard(env) });
}
/** A match with its live odds; everybody's bets only once the broadcast has ended. */
async function matchDetail(request: Request, env: Env, id: string) {
  const user = await requireUser(request, env), now = Date.now();await settleDue(env, now);
  const m = await getMatch(env, id);if (!user.is_admin && m.odds_status !== 'open') throw new HttpError(404, 'Maç bulunamadı.');
  const book = bookOf(m), { staked, counts } = await stakedOn(env, id), over = ended(m, now) || m.status === 'settled';
  const all = over ? (await env.DB.prepare("SELECT b.*, u.display_name AS name FROM bets b JOIN users u ON u.id = b.user_id WHERE b.match_id = ? ORDER BY u.display_name, b.placed_at").bind(id).all<BetRow & { name: string }>()).results : [];
  return json({ now, match: publicMatch(m, now), book: book ? liveBook(book, staked, now >= m.kickoff_at) : null, mine: (await myBets(env, user.id, [id])).map(betView),
    bets: all.map(b => ({ ...betView(b), name: b.name })), ...(user.is_admin ? { staked, counts } : {}) });
}
async function placeBet(request: Request, env: Env, id: string) {
  const user = await requireUser(request, env), now = Date.now();
  if (user.is_admin) throw new HttpError(403, 'Admin hesabı bahis oynamaz; kendi hesabınla gir.');
  const m = await getMatch(env, id);if (m.status !== 'scheduled' || m.odds_status !== 'open') throw new HttpError(409, 'Bu maçın bülteni açık değil.');
  if (now >= m.kickoff_at) throw new HttpError(409, 'Bahisler maç başlayınca kapandı.');
  const b = await body<{ market?: string; code?: string; stake?: number }>(request), stake = Math.round(Number(b.stake));
  if (!Number.isInteger(stake) || stake < DINAR.minStake || stake > DINAR.maxStake) throw new HttpError(400, `Bahis ${DINAR.minStake} ile ${DINAR.maxStake.toLocaleString('tr-TR')} dinar arasında olmalı.`);
  const book = bookOf(m)!, market = book.markets.find(x => x.id === b.market);if (!market || !market.active) throw new HttpError(409, 'Bu bahis kapalı.');
  // Any exact score may be played: one not among the listed ones gets the model's odds.
  const listed = market.outcomes.find(o => o.code === b.code), outcome = listed ?? (market.family === 'score' ? scoreOutcome(book, String(b.code)) : null);
  if (!outcome) throw new HttpError(400, 'Seçenek bulunamadı.');
  if (!outcome.playable) throw new HttpError(409, 'Bu seçenek oynanamaz: kaybetme ihtimali neredeyse yok.');
  // With what this user already holds on the match, some result must still lose them everything.
  const held = (await env.DB.prepare("SELECT market_id, code FROM bets WHERE user_id = ? AND match_id = ? AND status <> 'void'").bind(user.id, id).all<{ market_id: string; code: string }>()).results;
  const byId = new Map(book.markets.map(x => [x.id, x])), sides = JSON.parse(m.teams) as Teams, teamOf = (p: string) => sides.teams[0]!.players.some(x => x.id === p) ? 0 as const : sides.teams[1]!.players.some(x => x.id === p) ? 1 as const : undefined;
  const positions = [...held.flatMap(h => { const x = byId.get(h.market_id);return x ? [{ family: x.family, params: x.params, code: h.code }] : []; }), { family: market.family, params: market.params, code: outcome.code }];
  if (covers(positions, teamOf)) throw new HttpError(409, 'Bu bahisle birlikte her sonuçta en az bir bahsin kazanıyor; hem kazanan hem kaybeden tarafa oynanmaz.');
  const { staked } = await stakedOn(env, id), priced: Market = listed ? market : { ...market, exclusive: false, outcomes: [outcome] };
  const odds = liveOdds(priced, staked[market.id] ?? {}, book.liquidity).find(o => o.code === outcome.code)!.odds;
  const betId = `b${now.toString(36)}${token(6).toLowerCase().replace(/[^a-z0-9]/g, '')}`, label = `${market.label}: ${outcome.label}`;
  // One transaction: the bet only if the balance covers it and no other side of this market is held; the debit only if the bet went in.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO bets (id, user_id, match_id, market_id, code, label, stake, odds, placed_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE (SELECT COALESCE(SUM(amount), 0) FROM ledger WHERE user_id = ?) >= ? AND NOT EXISTS (SELECT 1 FROM bets WHERE user_id = ? AND match_id = ? AND market_id = ? AND code <> ? AND status <> 'void')`)
      .bind(betId, user.id, id, market.id, outcome.code, label, stake, odds, now, user.id, stake, user.id, id, market.id, outcome.code),
    env.DB.prepare("INSERT OR IGNORE INTO ledger (user_id, kind, ref, amount, match_id, created_at) SELECT ?, 'bet', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM bets WHERE id = ?)")
      .bind(user.id, `bet:${betId}`, -stake, id, now, betId),
  ]);
  if (!(await env.DB.prepare('SELECT 1 AS ok FROM bets WHERE id = ?').bind(betId).first())) {
    const other = await env.DB.prepare("SELECT label FROM bets WHERE user_id = ? AND match_id = ? AND market_id = ? AND code <> ? AND status <> 'void' LIMIT 1").bind(user.id, id, market.id, outcome.code).first<{ label: string }>();
    throw new HttpError(409, other ? `Bu bahiste zaten "${other.label.split(': ').pop()}" tarafındasın; aynı bahiste iki tarafa oynanmaz.` : 'Bakiyen bu bahis için yetmiyor.');
  }
  return json({ ok: true, odds, balance: await balanceOf(env, user.id) });
}
async function file(request: Request, env: Env, id: string, kind: 'recording' | 'reel') {
  const user = await requireUser(request, env), m = await getMatch(env, id), now = Date.now();
  if (now < m.kickoff_at && !user.is_admin) throw new HttpError(403, 'Maç henüz başlamadı.');
  if (kind === 'reel' && !ended(m, now)) throw new HttpError(403, 'Özet maç bitince açılır.');
  const stream = await env.FILES.get(kind === 'recording' ? recordingKey(id) : reelKey(id), { type: 'stream' });
  if (!stream) throw new HttpError(410, kind === 'recording' ? 'Tam kayıt silindi (maçtan 3 gün sonra yalnız skor, goller ve özet kalır).' : 'Özet bulunamadı.');
  return new Response(stream, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'private, max-age=3600' } });
}

// --- dinar requests ("para at") ---------------------------------------------------------------------------------------------------
async function requestDinar(request: Request, env: Env) {
  const user = await requireUser(request, env);if (user.is_admin) throw new HttpError(403, 'Admin hesabı dinar istemez.');
  const b = await body<{ to?: string; amount?: number }>(request), amount = Math.round(Number(b.amount));
  if (!Number.isInteger(amount) || amount < DINAR.minStake || amount > DINAR.start) throw new HttpError(400, `İstek ${DINAR.minStake} ile ${DINAR.start.toLocaleString('tr-TR')} dinar arasında olmalı.`);
  const to = await env.DB.prepare('SELECT * FROM users WHERE login = ? AND is_admin = 0').bind(loginKey(String(b.to ?? ''))).first<UserRow>();
  if (!to || to.id === user.id) throw new HttpError(400, 'Kimden istediğini seç.');
  // Only someone whose dinar has run out asks (user decision); one open request to a friend, three in all.
  if (await balanceOf(env, user.id) >= DINAR.minStake) throw new HttpError(409, `Dinar, bakiyen ${DINAR.minStake} dinarın altına inince istenir.`);
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
async function upload(request: Request, env: Env, id: string, kind: 'recording' | 'reel') {
  await requireAdmin(request, env);
  const m = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(id).first<MatchRow>();if (!m || m.status !== 'draft') throw new HttpError(409, 'Yükleme yalnız planlanan maça yapılır.');
  if (!request.body) throw new HttpError(400, 'Dosya boş.');
  // The full recording goes three days after kick-off (user decision); score, goals and the reel stay.
  const expiration = Math.max(Math.floor(m.kickoff_at / 1000) + RECORDING_DAYS * 86_400, Math.floor(Date.now() / 1000) + 3_600);
  await env.FILES.put(kind === 'recording' ? recordingKey(id) : reelKey(id), request.body, kind === 'recording' ? { expiration } : {});
  return json({ ok: true });
}
/** The upload is complete: the match is scheduled (players still do not see it until its bulletin is opened). */
async function publish(request: Request, env: Env, id: string) {
  await requireAdmin(request, env);const now = Date.now();
  const m = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(id).first<MatchRow>();if (!m || m.status !== 'draft') throw new HttpError(409, 'Maç yayına hazır değil.');
  // Re-generated (new squads before kick-off): the old match's bets are refunded (its markets belong to other lineups) and a note shows.
  if (m.replaces) { await refundAll(env, m.replaces, now);await env.DB.batch([env.DB.prepare('UPDATE matches SET regenerated = (SELECT regenerated + 1 FROM matches WHERE id = ?) WHERE id = ?').bind(m.replaces, id), env.DB.prepare("UPDATE matches SET status = 'cancelled' WHERE id = ? AND status = 'scheduled'").bind(m.replaces)]);await Promise.all([env.FILES.delete(recordingKey(m.replaces)), env.FILES.delete(reelKey(m.replaces))]); }
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
  const { staked } = await stakedOn(env, id), kept = new Set(book.markets.map(x => x.id)), lost = Object.keys(staked).filter(x => !kept.has(x));
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
async function cancel(request: Request, env: Env, id: string) {
  await requireAdmin(request, env);const now = Date.now();
  const m = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(id).first<MatchRow>();if (!m) throw new HttpError(404, 'Maç bulunamadı.');
  if (m.status === 'settled') throw new HttpError(409, 'Biten maç silinemez.');
  await refundAll(env, id, now);await env.DB.prepare("UPDATE matches SET status = 'cancelled' WHERE id = ?").bind(id).run();
  await Promise.all([env.FILES.delete(recordingKey(id)), env.FILES.delete(reelKey(id))]);
  return json({ ok: true });
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
  await env.DB.prepare("INSERT OR IGNORE INTO ledger (user_id, kind, ref, amount, created_at) SELECT id, 'start', 'start:' || id, ?, ? FROM users WHERE login = ?").bind(DINAR.start, now, login).run();
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
  if (path === '/api/state' && method === 'GET') return state(request, env);
  if (path === '/api/people' && method === 'GET') {
    const u = await requireUser(request, env);
    return json({ people: (await env.DB.prepare('SELECT username, display_name AS displayName FROM users WHERE is_admin = 0 AND id <> ? ORDER BY display_name').bind(u.id).all()).results });
  }
  if (path === '/api/requests' && method === 'POST') return requestDinar(request, env);
  let m = path.match(/^\/api\/requests\/(\d+)\/(send|decline)$/);
  if (m && method === 'POST') return answerRequest(request, env, Number(m[1]), m[2] === 'send');
  m = path.match(/^\/api\/matches\/([a-z0-9]+)(?:\/(bets|recording|reel))?$/);
  if (m) {
    const [, id, sub] = m as unknown as [string, string, string | undefined];
    if (!sub && method === 'GET') return matchDetail(request, env, id);
    if (sub === 'bets' && method === 'POST') return placeBet(request, env, id);
    if ((sub === 'recording' || sub === 'reel') && method === 'GET') return file(request, env, id, sub);
  }
  if (path === '/api/admin/matches' && method === 'POST') return createMatch(request, env);
  m = path.match(/^\/api\/admin\/matches\/([a-z0-9]+)(?:\/(recording|reel|publish|result|book|open))?$/);
  if (m) {
    const [, id, sub] = m as unknown as [string, string, string | undefined];
    if ((sub === 'recording' || sub === 'reel') && method === 'PUT') return upload(request, env, id, sub);
    if (sub === 'publish' && method === 'POST') return publish(request, env, id);
    if (sub === 'book' && method === 'PUT') return saveBook(request, env, id);
    if (sub === 'open' && method === 'POST') return openBulletin(request, env, id);
    if (sub === 'result' && method === 'GET') { await requireAdmin(request, env);const row = await getMatch(env, id);return json({ result: JSON.parse(row.result) }); }
    if (!sub && method === 'DELETE') return cancel(request, env, id);
  }
  if (path === '/api/admin/users' && method === 'GET') {
    await requireAdmin(request, env);
    return json({ users: (await env.DB.prepare(`SELECT username, display_name AS displayName, kind, listed, must_change AS mustChange, is_admin AS isAdmin,
      COALESCE((SELECT SUM(amount) FROM ledger l WHERE l.user_id = users.id), 0) AS balance FROM users ORDER BY is_admin DESC, kind DESC, display_name`).all()).results });
  }
  if (path === '/api/admin/observers' && method === 'POST') return addObserver(request, env);
  m = path.match(/^\/api\/admin\/users\/([^/]+)\/(reset|listed)$/);
  if (m && method === 'POST') {
    await requireAdmin(request, env);
    const u = await env.DB.prepare('SELECT * FROM users WHERE login = ?').bind(loginKey(decodeURIComponent(m[1]!))).first<UserRow>();
    if (!u || u.is_admin) throw new HttpError(404, 'Kullanıcı bulunamadı.');
    if (m[2] === 'listed') { const listed = !!(await body<{ listed?: boolean }>(request)).listed;await env.DB.prepare('UPDATE users SET listed = ? WHERE id = ?').bind(listed ? 1 : 0, u.id).run();return json({ ok: true, listed }); }
    await env.DB.batch([env.DB.prepare('UPDATE users SET password_hash = ?, must_change = 1 WHERE id = ?').bind(await hashPassword(firstPassword(u.username)), u.id), env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id)]);
    return json({ ok: true, password: `${u.username}!` });
  }
  return fail(404, 'Bulunamadı.');
}

/** The page anyone without a session gets: the site's code, the player data and the pictures go to signed-in users only. */
const LOGIN_PAGE = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#121a19"><meta name="robots" content="noindex, nofollow"><title>Alsancak · Giriş</title>
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
      if (!(await currentUser(request, env))) return url.pathname === '/' || url.pathname === '/index.html' ? page(LOGIN_PAGE, 200, 'text/html; charset=utf-8') : page('Giriş yapman gerekiyor.', 401, 'text/plain; charset=utf-8');
      const res = await env.ASSETS.fetch(request), out = new Response(res.body, res);
      for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
      // Never in a shared cache: hashed files stay in the user's own browser, the page is checked every time.
      out.headers.set('cache-control', url.pathname.startsWith('/assets/') ? 'private, max-age=31536000, immutable' : 'private, no-cache');
      return out;
    } catch (error) { if (error instanceof HttpError) return fail(error.status, error.message);console.error(error);return fail(500, 'Sunucuda bir hata oldu. Tekrar dene.'); }
  },
};
