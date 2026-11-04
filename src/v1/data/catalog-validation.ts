import type { Problem, Result } from '../domain/common.js';
import type { Player, PlayerCatalog } from '../domain/players.js';
import { ATTRIBUTE_KEYS } from '../domain/players.ts';
import { calculatePositionRatings } from '../domain/ratings.ts';
import { ALL_POSITIONS, OUTFIELD_POSITIONS } from '../config/rating-model.ts';
import { CATALOG_SCHEMA_VERSION } from '../config/catalog-source.ts';

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const number = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const source = (value: unknown) => object(value) && text(value.file) && text(value.section) && (value.detail === undefined || typeof value.detail === 'string');
const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));

/** Runtime validation is required even when a JSON import has inferred TS types. */
export function validatePlayerCatalog(input: unknown): Result<PlayerCatalog> {
  const problems: Problem[] = [];
  const invalid = (field: string, message: string) => problems.push({ code: 'INVALID_CATALOG', field, message });
  if (!object(input)) return { ok: false, problems: [{ code: 'INVALID_CATALOG', message: 'Katalog bir nesne olmalı.' }] };
  if (input.schemaVersion !== CATALOG_SCHEMA_VERSION) invalid('schemaVersion', 'Desteklenmeyen katalog şeması.');
  if (!text(input.version)) invalid('version', 'Katalog sürümü gerekli.');
  if (!timestamp(input.importedAt)) invalid('importedAt', 'Aktarım tarihi geçersiz.');
  if (!source(input.source)) invalid('source', 'Kaynak bilgisi geçersiz.');
  if (!Array.isArray(input.players) || input.players.length === 0) invalid('players', 'En az bir oyuncu gerekli.');
  const ids = new Set<string>();
  if (Array.isArray(input.players)) input.players.forEach((value: unknown, index: number) => {
    const path = `players[${index}]`;
    if (!object(value)) { invalid(path, 'Oyuncu bir nesne olmalı.'); return; }
    const before = problems.length;
    if (!text(value.id)) invalid(`${path}.id`, 'Oyuncu ID gerekli.');
    else if (ids.has(value.id)) invalid(`${path}.id`, 'Yinelenen oyuncu ID.');
    else ids.add(value.id);
    if (!text(value.name)) invalid(`${path}.name`, 'Oyuncu adı gerekli.');
    if (typeof value.archived !== 'boolean') invalid(`${path}.archived`, 'Arşiv durumu boolean olmalı.');
    if (value.kind !== 'outfield' && value.kind !== 'goalkeeper') invalid(`${path}.kind`, 'Oyuncu türü geçersiz.');
    if (!object(value.suitability) || ALL_POSITIONS.some(key => !number((value.suitability as Record<string, unknown>)[key], 1, 10)) || Object.keys(value.suitability).length !== 7) {
      invalid(`${path}.suitability`, 'Yedi mevki uygunluğu 1–10 aralığında olmalı.');
    }
    if (!Array.isArray(value.preferredPositions) || !value.preferredPositions.length || new Set(value.preferredPositions).size !== value.preferredPositions.length
      || value.preferredPositions.some(pos => !ALL_POSITIONS.includes(pos as typeof ALL_POSITIONS[number]))
      || !value.preferredPositions.includes(value.mainPosition)) invalid(`${path}.preferredPositions`, 'Mevki tercihleri tekil olmalı ve ana rolü içermeli.');
    if (!Array.isArray(value.notes) || value.notes.some(note => !object(note) || !text(note.text) || (note.source !== undefined && !source(note.source)))) {
      invalid(`${path}.notes`, 'Notlar kaynaklı düz metin kayıtları olmalı.');
    }
    if (!object(value.origin)) invalid(`${path}.origin`, 'Oyuncu kökeni gerekli.');
    else if (value.origin.kind === 'catalog') {
      if (!source(value.origin.source)) invalid(`${path}.origin.source`, 'Envanter kaynağı geçersiz.');
    } else if (value.origin.kind === 'guest') {
      const o = value.origin;
      if(!text(value.name)||value.name.trim().length<2||value.name.trim().length>40||/[\u0000-\u001f\u007f]/u.test(String(value.name))) invalid(`${path}.name`, 'Misafir adı 2–40 karakter olmalı.');
      if (!text(o.referencePlayerId) || !text(o.referenceCatalogVersion) || !timestamp(o.createdAt) || o.adaptation !== 'unfamiliar') invalid(`${path}.origin`, 'Misafir kaynak bilgisi geçersiz.');
      const scaling = o.scaling;
      if (!object(scaling) || !(scaling.mode === 'overall' && number(scaling.overallPercent, 60, 120) && Number.isInteger(scaling.overallPercent)
        || scaling.mode === 'split' && number(scaling.physicalPercent, 60, 120) && number(scaling.gamePercent, 60, 120) && Number.isInteger(scaling.physicalPercent) && Number.isInteger(scaling.gamePercent))) invalid(`${path}.origin.scaling`, 'Misafir yüzdeleri geçersiz.');
      if (value.kind === 'goalkeeper' && object(scaling) && scaling.mode !== 'overall') invalid(`${path}.origin.scaling`, 'Kaleci için genel yüzde kullanılmalı.');
    } else invalid(`${path}.origin.kind`, 'Oyuncu kökeni geçersiz.');
    if (value.kind === 'goalkeeper') {
      if (value.mainPosition !== 'GK' || !number(value.goalkeeperRating, 0, 100)) invalid(path, 'Kaleci ana rolü veya kalecilik puanı geçersiz.');
      if ('attributes' in value || 'positionRatings' in value) invalid(path, 'Kaleci için uydurma saha özellikleri bulunamaz.');
    } else if (value.kind === 'outfield') {
      if (!OUTFIELD_POSITIONS.includes(value.mainPosition as typeof OUTFIELD_POSITIONS[number])) invalid(`${path}.mainPosition`, 'Ana saha rolü geçersiz.');
      if (!object(value.attributes) || Object.keys(value.attributes).length !== 12 || ATTRIBUTE_KEYS.some(key => !number((value.attributes as Record<string, unknown>)[key], 1, 10))) invalid(`${path}.attributes`, 'On iki temel özellik 1–10 aralığında olmalı.');
      if (!object(value.positionRatings) || Object.keys(value.positionRatings).length !== 6 || OUTFIELD_POSITIONS.some(key => !number((value.positionRatings as Record<string, unknown>)[key], 0, 100))) invalid(`${path}.positionRatings`, 'Altı saha mevki puanı 0–100 aralığında olmalı.');
      if ('goalkeeperRating' in value) invalid(path, 'Saha oyuncusunda kalecilik puanı bulunamaz.');
    }
    if (before === problems.length) {
      const player = value as unknown as Player;
      if (player.kind === 'outfield') {
        const ratings = calculatePositionRatings(player.attributes, player.suitability);
        OUTFIELD_POSITIONS.forEach(key => { if (Math.abs(ratings[key] - player.positionRatings[key]) > 1e-8) invalid(`${path}.positionRatings.${key}`, 'Saklanan puan iki ondalıklı kaynak formülüyle uyuşmuyor.'); });
      }
    }
  });
  return problems.length ? { ok: false, problems } : { ok: true, value: input as unknown as PlayerCatalog };
}

export { deepFreeze } from '../domain/immutable.ts';
