-- Alsancak online (2026-11-05). Apply to a new database: npx wrangler d1 execute alsancak --remote --file worker/schema.sql
-- A database made before 2026-11-06 gets worker/migrations/2026-11-06-state-rev.sql instead (its triggers need the columns it adds).
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
  created_at INTEGER NOT NULL,
  -- Kept by the triggers below from the ledger and the bets (added 2026-11-06; an older database: worker/migrations/2026-11-06-state-rev.sql).
  balance INTEGER NOT NULL DEFAULT 0,
  bet_count INTEGER NOT NULL DEFAULT 0
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
  created_at INTEGER NOT NULL,
  -- When a request took the finished match to pay it (2026-11-06): another may take it again 30 s later.
  settling_at INTEGER
);
CREATE INDEX IF NOT EXISTS matches_kickoff ON matches(kickoff_at);
-- A bet at the odds of the moment it was placed. Any pick may be played again in a later coupon; a set of one user's bets that wins
-- whatever the result is refused on insert (2026-11-10; before, one side per market). status: open | won | lost |
-- void (refunded: the match was called off) | withdrawn (refunded: its owner edited or cancelled it before kick-off; shown nowhere).
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
  payout INTEGER NOT NULL DEFAULT 0,
  -- A coupon (market_id 'kupon'): its picks as JSON [{market, code, label, odds}]; NULL for a single pick. Added 2026-11-05; on an older
  -- database run once: ALTER TABLE bets ADD COLUMN legs TEXT;
  legs TEXT
);
CREATE INDEX IF NOT EXISTS bets_match ON bets(match_id, market_id);
CREATE INDEX IF NOT EXISTS bets_user ON bets(user_id, match_id);
-- Every Alsancak coin movement is one row; a balance is the sum. ref is unique, so a payout, bonus, refund or transfer is written at most once.
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
-- "Para at": a request for coins from one friend to another; the asked one sends or declines.
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

-- A revision every write moves (2026-11-06): /api/state answers "same" while it has not moved. The triggers also keep each user's balance
-- and number of bets (the table reads them); the ledger stays the record and every settlement checks the balances against it.
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
INSERT OR IGNORE INTO meta (k, v) VALUES ('rev', 1);
CREATE TRIGGER IF NOT EXISTS ledger_in AFTER INSERT ON ledger BEGIN
  UPDATE users SET balance = balance + NEW.amount WHERE id = NEW.user_id; UPDATE meta SET v = v + 1 WHERE k = 'rev'; END;
CREATE TRIGGER IF NOT EXISTS ledger_out AFTER DELETE ON ledger BEGIN
  UPDATE users SET balance = balance - OLD.amount WHERE id = OLD.user_id; UPDATE meta SET v = v + 1 WHERE k = 'rev'; END;
CREATE TRIGGER IF NOT EXISTS ledger_edit AFTER UPDATE OF user_id, amount ON ledger BEGIN
  UPDATE users SET balance = balance - OLD.amount WHERE id = OLD.user_id; UPDATE users SET balance = balance + NEW.amount WHERE id = NEW.user_id;
  UPDATE meta SET v = v + 1 WHERE k = 'rev'; END;
CREATE TRIGGER IF NOT EXISTS bets_in AFTER INSERT ON bets BEGIN
  UPDATE users SET bet_count = bet_count + (NEW.status NOT IN ('void', 'withdrawn')) WHERE id = NEW.user_id; UPDATE meta SET v = v + 1 WHERE k = 'rev'; END;
CREATE TRIGGER IF NOT EXISTS bets_out AFTER DELETE ON bets BEGIN
  UPDATE users SET bet_count = bet_count - (OLD.status NOT IN ('void', 'withdrawn')) WHERE id = OLD.user_id; UPDATE meta SET v = v + 1 WHERE k = 'rev'; END;
CREATE TRIGGER IF NOT EXISTS bets_edit AFTER UPDATE ON bets BEGIN
  UPDATE users SET bet_count = bet_count - (OLD.status NOT IN ('void', 'withdrawn')) WHERE id = OLD.user_id;
  UPDATE users SET bet_count = bet_count + (NEW.status NOT IN ('void', 'withdrawn')) WHERE id = NEW.user_id; UPDATE meta SET v = v + 1 WHERE k = 'rev'; END;
CREATE TRIGGER IF NOT EXISTS matches_in AFTER INSERT ON matches BEGIN UPDATE meta SET v = v + 1 WHERE k = 'rev'; END;
CREATE TRIGGER IF NOT EXISTS matches_edit AFTER UPDATE ON matches BEGIN UPDATE meta SET v = v + 1 WHERE k = 'rev'; END;
CREATE TRIGGER IF NOT EXISTS matches_out AFTER DELETE ON matches BEGIN UPDATE meta SET v = v + 1 WHERE k = 'rev'; END;
CREATE TRIGGER IF NOT EXISTS requests_in AFTER INSERT ON requests BEGIN UPDATE meta SET v = v + 1 WHERE k = 'rev'; END;
CREATE TRIGGER IF NOT EXISTS requests_edit AFTER UPDATE ON requests BEGIN UPDATE meta SET v = v + 1 WHERE k = 'rev'; END;
CREATE TRIGGER IF NOT EXISTS requests_out AFTER DELETE ON requests BEGIN UPDATE meta SET v = v + 1 WHERE k = 'rev'; END;
CREATE TRIGGER IF NOT EXISTS users_in AFTER INSERT ON users BEGIN UPDATE meta SET v = v + 1 WHERE k = 'rev'; END;
CREATE TRIGGER IF NOT EXISTS users_edit AFTER UPDATE OF username, display_name, kind, listed, must_change, is_admin, player_id ON users BEGIN UPDATE meta SET v = v + 1 WHERE k = 'rev'; END;
CREATE TRIGGER IF NOT EXISTS users_out AFTER DELETE ON users BEGIN UPDATE meta SET v = v + 1 WHERE k = 'rev'; END;
