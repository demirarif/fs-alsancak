import type { MatchId, Result } from '../domain/common.js';
import type { SelectionDraft, LineupDraft } from '../domain/teams.js';
import type { MatchSnapshot } from '../domain/match.js';
import type { ReplayChunk, ReplayManifest } from '../domain/replay.js';

/** Browser-local IndexedDB; structured repositories isolate future adapters. */
export interface DraftRepository {
  loadSelection(): Promise<Result<SelectionDraft | null>>;
  saveSelection(draft: SelectionDraft): Promise<Result<void>>;
  loadLineups(selectionId: string): Promise<Result<LineupDraft | null>>;
  saveLineups(draft: LineupDraft): Promise<Result<void>>;
}

export interface MatchRepository {
  saveSnapshot(snapshot: MatchSnapshot): Promise<Result<void>>;
  getSnapshot(matchId: MatchId): Promise<Result<MatchSnapshot>>;
  beginReplay(manifest: ReplayManifest): Promise<Result<void>>;
  /** Idempotent by (matchId,index); commit complete only after all chunks exist. */
  appendChunk(chunk: ReplayChunk): Promise<Result<void>>;
  commitReplay(manifest: ReplayManifest): Promise<Result<void>>;
  readChunk(matchId: MatchId, index: number): Promise<Result<ReplayChunk>>;
  getManifest(matchId: MatchId): Promise<Result<ReplayManifest>>;
  markFailed(matchId: MatchId, message: string): Promise<Result<void>>;
  discardIncompleteReplay(matchId: MatchId): Promise<Result<void>>;
}

export interface StorageMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly storesAffected: readonly string[];
}

export const STORAGE_STORES = [
  'guest-players', 'weekly-forms', 'selection-drafts', 'lineup-drafts',
  'match-snapshots', 'replay-manifests', 'replay-chunks', 'preferences',
] as const;
