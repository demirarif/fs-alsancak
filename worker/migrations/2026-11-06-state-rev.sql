-- 2026-11-06 (user: "işlemciyi inanılmaz hafiflet … mevcut database'i bozmadan"). Additive only: two columns on users, one on matches,
-- a one-row table and triggers; no existing row or column changes meaning. Apply once to a database made before this date:
--   npx wrangler d1 execute alsancak --remote --file worker/migrations/2026-11-06-state-rev.sql
-- (worker/schema.sql already has all of it for a new database.)

-- 1) A revision every write moves (the triggers below): /api/state answers "same" while it has not moved.
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
INSERT OR IGNORE INTO meta (k, v) VALUES ('rev', 1);

-- 2) Each user's balance and number of bets on the user row, for the table (one row read per user instead of the whole ledger). The
--    ledger stays the record: triggers keep these sums, and every settlement checks them against it.
ALTER TABLE users ADD COLUMN balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN bet_count INTEGER NOT NULL DEFAULT 0;
UPDATE users SET balance = COALESCE((SELECT SUM(amount) FROM ledger l WHERE l.user_id = users.id), 0),
  bet_count = (SELECT COUNT(*) FROM bets b WHERE b.user_id = users.id AND b.status NOT IN ('void', 'withdrawn'));

-- 3) Paying a finished match: whichever request takes it first (settling_at) pays it; another may take it again after 30 s.
ALTER TABLE matches ADD COLUMN settling_at INTEGER;

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
