import catalogData from './generated/player-catalog.json' with { type: 'json' };
import type { CatalogReader } from './catalog.js';
import type { PlayerCatalog } from '../domain/players.js';
import { validatePlayerCatalog, deepFreeze } from './catalog-validation.ts';
import { createCatalogIndex } from './catalog-index.ts';

const parsed = validatePlayerCatalog(catalogData);
if (parsed.ok) deepFreeze(parsed.value);

/** Read-only seed catalog. Guest persistence is a distinct step-2 adapter. */
export const bundledCatalogReader: CatalogReader = {
  async load() { return parsed; },
};

export function getBundledCatalog(): PlayerCatalog {
  if (!parsed.ok) throw new Error(`Oyuncu envanteri geçersiz: ${parsed.problems.map(p => p.message).join(' ')}`);
  return parsed.value;
}

export const bundledCatalogIndex = createCatalogIndex(getBundledCatalog());
