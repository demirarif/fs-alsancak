import { createBrowserDatabase, requestValue, transactionComplete, type DatabaseOptions } from './browser-database.ts';
import { STORAGE_STORES } from './persistence.ts';

/** A finished match kept on this device. The snapshot (seed, tuning, rules, players) and the second-half lineups are enough to replay it
 * exactly with the same engine version; replay frames are not stored. */
export interface ArchivedMatch {
  readonly id: string; readonly kind: 'archived-match'; readonly savedAt: string; readonly weekId: string; readonly engineVersion: string;
  readonly teamNames: readonly [string, string]; readonly score: readonly [number, number]; readonly halfTime: readonly [number, number];
  readonly scorers: readonly { readonly name: string; readonly team: 0 | 1; readonly minute: number }[];
  readonly snapshot: unknown; readonly secondHalfLineups: unknown;
}
const FORMAT = 'alsancak-yedek';
/** Everything but replay frames, which are rebuilt from the snapshot. */
const BACKUP_STORES = STORAGE_STORES.filter(s => s !== 'replay-chunks' && s !== 'replay-manifests');

export function createMatchArchive(options: DatabaseOptions = {}) {
  const database = createBrowserDatabase(options);
  return {
    async save(match: ArchivedMatch): Promise<void> {
      const db = await database.open(), tx = db.transaction('match-snapshots', 'readwrite'), done = transactionComplete(tx);
      tx.objectStore('match-snapshots').put(structuredClone(match));await done;
    },
    async list(): Promise<ArchivedMatch[]> {
      const db = await database.open(), tx = db.transaction('match-snapshots', 'readonly'), done = transactionComplete(tx);
      const all = await requestValue<unknown[]>(tx.objectStore('match-snapshots').getAll());await done;
      return (all as ArchivedMatch[]).filter(m => m?.kind === 'archived-match').sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    },
    async remove(id: string): Promise<void> {
      const db = await database.open(), tx = db.transaction('match-snapshots', 'readwrite'), done = transactionComplete(tx);
      tx.objectStore('match-snapshots').delete(id);await done;
    },
    /** One JSON file with what this browser keeps: squad and lineup drafts, guests, weekly forms, preferences, the match archive. */
    async backup(): Promise<string> {
      const db = await database.open(), tx = db.transaction([...BACKUP_STORES], 'readonly'), done = transactionComplete(tx);
      const values = await Promise.all(BACKUP_STORES.map(s => requestValue<unknown[]>(tx.objectStore(s).getAll())));await done;
      return JSON.stringify({ format: FORMAT, version: 1, createdAt: new Date().toISOString(), stores: Object.fromEntries(BACKUP_STORES.map((s, i) => [s, values[i]])) });
    },
    /** Puts a backup's records back (same keys are replaced, others kept). Returns how many records were written. */
    async restore(json: string): Promise<number> {
      const data = JSON.parse(json) as { format?: string; stores?: Record<string, unknown[]> };
      if (data?.format !== FORMAT || !data.stores || typeof data.stores !== 'object') throw new Error('Bu dosya bir Alsancak yedeği değil.');
      const stores = BACKUP_STORES.filter(s => Array.isArray(data.stores![s]));
      if (!stores.length) return 0;
      const db = await database.open(), tx = db.transaction([...stores], 'readwrite'), done = transactionComplete(tx);let n = 0;
      for (const s of stores) for (const record of data.stores[s]!) { tx.objectStore(s).put(record);n++; }
      await done;return n;
    },
    close() { database.close(); },
  };
}
