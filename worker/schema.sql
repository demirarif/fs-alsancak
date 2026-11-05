-- Alsancak online (2026-11-05). Apply: npx wrangler d1 execute alsancak --remote --file worker/schema.sql
-- Users log in with their name (login = the name without capitals, Turkish letters or spaces); the first password is name + "!".
-- kind: player (in the squads), observer (bets only; on the table once the admin lists him), admin (plans matches, never bets).
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  player_id TEXT,
  kind TEXT NOT NULL DEFAULT 'player',
  listed INTEGER NOT NULL DEFAULT 1,
  password_hash TEXT NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 1,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
-- A planned match. status: draft (uploading) | scheduled | settled (bets paid) | cancelled. odds_status: none | draft (the admin is
-- pricing it; players do not see the match) | open (on the bulletin until kick-off). result stays hidden until the broadcast ends.
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  kickoff_at INTEGER NOT NULL,
  broadcast_ms INTEGER NOT NULL,
  status TEXT NOT NULL,
  odds_status TEXT NOT NULL DEFAULT 'none',
  teams TEXT NOT NULL,
  result TEXT NOT NULL,
  book TEXT,
  engine_version TEXT NOT NULL,
  regenerated INTEGER NOT NULL DEFAULT 0,
  replaces TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS matches_kickoff ON matches(kickoff_at);
-- A bet at the odds of the moment it was placed. One side per market per user (enforced on insert).
CREATE TABLE IF NOT EXISTS bets (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL,
  market_id TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  stake INTEGER NOT NULL,
  odds REAL NOT NULL,
  placed_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  payout INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS bets_match ON bets(match_id, market_id);
CREATE INDEX IF NOT EXISTS bets_user ON bets(user_id, match_id);
-- Every dinar movement is one row; a balance is the sum. ref is unique, so a payout, bonus, refund or transfer is written at most once.
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  match_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id);
-- "Para at": a request for dinar from one friend to another; the asked one sends or declines.
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS requests_to ON requests(to_user, status);

-- Wrong passwords per user name (ten in 15 minutes close it for a while); a day's worth is kept.
CREATE TABLE IF NOT EXISTS login_failures (
  login TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_failures_login ON login_failures(login, at);
