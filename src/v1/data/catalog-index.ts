import type { PlayerId } from '../domain/common.js';
import type { Player, PlayerCatalog, Position } from '../domain/players.js';
import { deepFreeze } from './catalog-validation.ts';

export interface CatalogSearch {
  readonly query?: string;
  readonly position?: Position;
  readonly kind?: Player['kind'];
  readonly includeArchived?: boolean;
}

export interface CatalogIndex {
  readonly players: readonly Player[];
  getById(id: PlayerId): Player | undefined;
  search(options?: CatalogSearch): readonly Player[];
}

/** Search folding is never used to determine identity or trigger named rules. */
export function normalizeSearch(text: string): string {
  return text.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/gu, 'i')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/gu, ' ');
}

export function createCatalogIndex(catalog: PlayerCatalog): CatalogIndex {
  const stable = Object.isFrozen(catalog) ? catalog : deepFreeze(structuredClone(catalog));
  const byId = new Map(stable.players.map(player => [player.id, player]));
  const names = new Map(stable.players.map(player => [player.id, normalizeSearch(player.name)]));
  return Object.freeze({
    players: stable.players,
    getById(id: PlayerId) { return byId.get(id); },
    search(options: CatalogSearch = {}) {
      const tokens = normalizeSearch(options.query ?? '').split(' ').filter(Boolean);
      return Object.freeze(stable.players.filter(player => (options.includeArchived || !player.archived)
        && (!options.kind || player.kind === options.kind)
        && (!options.position || player.preferredPositions.includes(options.position))
        && tokens.every(token => names.get(player.id)!.includes(token))));
    },
  });
}

/** Main means declared role, not max(positionRatings). */
export function mainRating(player: Player): number {
  return player.kind === 'goalkeeper' ? player.goalkeeperRating : player.positionRatings[player.mainPosition];
}

export function formatRating(value: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}
