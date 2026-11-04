import type { PlayerId, Result, SourceRef } from '../domain/common.js';
import type { GuestPlayerRequest, Player, PlayerCatalog, WeeklyForm } from '../domain/players.js';
import type { ChemistryRulebook } from '../domain/modifiers.js';
import type { ChemistrySourceArchive } from './source-contracts.js';

export interface ImportDiscrepancy {
  readonly playerName: string;
  readonly field: string;
  readonly reportedValue: number | string;
  readonly canonicalValue: number | string;
  readonly source: SourceRef;
  readonly resolution: string;
}

export interface CatalogImportReport {
  readonly catalog: PlayerCatalog;
  /** Executable chemistry belongs to step 4; preserve original text now. */
  readonly chemistrySource: ChemistrySourceArchive;
  readonly discrepancies: readonly ImportDiscrepancy[];
  readonly precision: { readonly storedRatingDecimals: 2; readonly sourceRatingDecimals: 1 };
  readonly checks: {
    readonly players: number; readonly outfield: number; readonly goalkeepers: number;
    readonly verifiedPositionRatings: number; readonly verifiedMainRatings: number;
    readonly verifiedPublishedMainRatings: number; readonly verifiedSecondaryRatings: number;
    readonly lockedChemistryRows: number; readonly modifierRows: number;
    readonly atmosphereExamples: number;
  };
}

/** Build-time Markdown import. Original file stays immutable and outside runtime. */
export interface CatalogImporter {
  importMarkdown(text: string): Result<CatalogImportReport>;
}

export interface CatalogReader {
  load(): Promise<Result<PlayerCatalog>>;
}

export interface PlayerCatalogRepository extends CatalogReader {
  saveGuest(player: Player): Promise<Result<PlayerId>>;
  archiveGuest(playerId: PlayerId): Promise<Result<void>>;
}

export interface RulebookRepository {
  load(version?: string): Promise<Result<ChemistryRulebook>>;
}

export interface GuestPlayerFactory {
  preview(request: GuestPlayerRequest, catalog: PlayerCatalog): Result<Player>;
  /** Snapshot attributes + reference version; allocate a fresh identity. */
  create(request: GuestPlayerRequest, catalog: PlayerCatalog): Result<Player>;
}

export interface WeeklyFormRepository {
  forWeek(weekId: string): Promise<Result<readonly WeeklyForm[]>>;
  save(form: WeeklyForm): Promise<Result<void>>;
}
