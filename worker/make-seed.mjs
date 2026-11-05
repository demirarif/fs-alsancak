// Writes worker/seed.local.sql (git-ignored: it holds password hashes): the admin, one account per player in the catalog and the first
// observers (betting friends who play no football, off the table until the admin lists them), each non-admin with 30 000 dinar to start.
// ADMIN_PASSWORD=... node --experimental-strip-types worker/make-seed.mjs   then   npx wrangler d1 execute alsancak --remote --file worker/seed.local.sql
// Existing accounts are left alone (ON CONFLICT DO NOTHING; the opening dinar has a unique ref), so running it again only adds new people.
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const { getBundledCatalog } = await import('../src/v1/data/bundled-catalog.ts');
const { usernameFor, loginKey, firstPassword } = await import('../src/v1/online/usernames.ts');
const { DINAR } = await import('../src/v1/online/markets.ts');
const ITERATIONS = 10_000, OBSERVERS = ['Ece', 'Zeynep'];
const hash = password => { const salt = randomBytes(16);return `pbkdf2-sha256$${ITERATIONS}$${salt.toString('base64')}$${pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256').toString('base64')}`; };
const q = v => v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const admin = process.env.ADMIN_PASSWORD;if (!admin) { console.error('ADMIN_PASSWORD gerekli.');process.exit(1); }
const now = Date.now(), rows = [{ login: 'admin', username: 'admin', display: 'Admin', player: null, kind: 'admin', listed: 0, hash: hash(admin), must: 0, isAdmin: 1 }];
const person = (name, player, kind) => { const username = usernameFor({ id: player ?? '', name });return { login: loginKey(username), username, display: name, player, kind, listed: kind === 'player' ? 1 : 0, hash: hash(firstPassword(username)), must: 1, isAdmin: 0 }; };
for (const p of getBundledCatalog().players) rows.push(person(p.name, p.id, 'player'));
for (const name of OBSERVERS) rows.push(person(name, null, 'observer'));
const logins = rows.map(r => r.login);if (new Set(logins).size !== logins.length) { console.error('Aynı kullanıcı adı iki kez:', logins.filter((l, i) => logins.indexOf(l) !== i));process.exit(1); }
writeFileSync(new URL('./seed.local.sql', import.meta.url), [
  ...rows.map(r => `INSERT INTO users (login, username, display_name, player_id, kind, listed, password_hash, must_change, is_admin, created_at) VALUES (${[r.login, r.username, r.display, r.player, r.kind, r.listed, r.hash, r.must, r.isAdmin, now].map(q).join(', ')}) ON CONFLICT (login) DO NOTHING;`),
  `INSERT OR IGNORE INTO ledger (user_id, kind, ref, amount, created_at) SELECT id, 'start', 'start:' || id, ${DINAR.start}, ${now} FROM users WHERE is_admin = 0;`,
].join('\n') + '\n');
console.log(rows.map(r => `${r.display} → ${r.username}${r.kind === 'observer' ? ' (gözlemci)' : ''}`).join('\n'));
