import type { PlayerId, SourceRef } from '../domain/common.js';

export interface ChemistrySourceRow {
  readonly id: string;
  readonly kind: 'locked' | 'modifier' | 'atmosphere-example';
  readonly cells: readonly [string, string, string];
  readonly subjectPlayerIds: readonly PlayerId[];
  readonly source: SourceRef;
}

/** Text preservation only: no executable rule predicates have been inferred. */
export interface ChemistrySourceArchive {
  readonly status: 'source-only';
  readonly version: string;
  readonly markdown: string;
  readonly rows: readonly ChemistrySourceRow[];
}

export interface CatalogImportOptions {
  readonly catalogVersion: string;
  readonly importedAt: string;
}
