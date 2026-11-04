import type { Problem, Result, SourceRef } from '../domain/common.js';
import type { BaseAttributes, OutfieldPosition, Player, Position, PositionSuitability } from '../domain/players.js';
import { ATTRIBUTE_KEYS } from '../domain/players.ts';
import { calculatePositionRating } from '../domain/ratings.ts';
import { sourceRatingCompatibility } from './rating-compatibility.ts';
import { ALL_POSITIONS, OUTFIELD_POSITIONS, POSITION_WEIGHTS, SUITABILITY_COEFFICIENTS } from '../config/rating-model.ts';
import { CATALOG_SCHEMA_VERSION, CATALOG_SOURCE_FILE, PLAYER_IDENTITIES, POSITION_LABELS, SOURCE_ATTRIBUTE_NAMES, SOURCE_EXPECTATIONS } from '../config/catalog-source.ts';
import type { CatalogImporter, CatalogImportReport, ImportDiscrepancy } from './catalog.js';
import type { CatalogImportOptions, ChemistrySourceArchive, ChemistrySourceRow } from './source-contracts.js';

interface SourceLine { readonly text: string; readonly number: number }
interface TableRow { readonly cells: readonly string[]; readonly line: number }

class ImportFailure extends Error {
  readonly problem: Problem;
  constructor(code: string, message: string, line?: number) {
    super(message);
    this.problem = line === undefined ? { code, message } : { code, message, field: `source-line:${line}` };
  }
}

function fail(code: string, message: string, line?: number): never { throw new ImportFailure(code, message, line); }
const clean = (s: string) => s.normalize('NFC').trim();
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function archive(lines: readonly SourceLine[], number: number): readonly SourceLine[] {
  const starts = lines.filter(line => line.text.startsWith(`# ARŞİV BÖLÜMÜ ${number}:`));
  if (starts.length !== 1) fail('SOURCE_SECTION', `Arşiv bölümü ${number} tekil olarak bulunamadı.`);
  const start = starts[0]!.number - 1;
  const next = lines.findIndex((line, i) => i > start && /^# ARŞİV BÖLÜMÜ \d+:/u.test(line.text));
  return lines.slice(start, next === -1 ? undefined : next);
}

function section(lines: readonly SourceLine[], title: string): readonly SourceLine[] {
  const starts = lines.map((line, i) => line.text === title ? i : -1).filter(i => i >= 0);
  if (starts.length !== 1) fail('SOURCE_HEADING', `Bölüm başlığı eksik veya birden fazla: ${title}`);
  const start = starts[0]!;
  const level = title.match(/^#+/u)![0].length;
  const next = lines.findIndex((line, i) => i > start && (line.text.match(/^(#+) /u)?.[1]?.length ?? Infinity) <= level);
  return lines.slice(start + 1, next === -1 ? undefined : next);
}

function table(lines: readonly SourceLine[], header: readonly string[]): readonly TableRow[] {
  const result: TableRow[] = [];
  let found = false;
  for (const line of lines) {
    if (!line.text.startsWith('|')) continue;
    if (!line.text.endsWith('|')) fail('TABLE_SYNTAX', 'Tablo satırının kapanış ayracı eksik.', line.number);
    const cells = line.text.slice(1, -1).split('|').map(clean);
    if (cells.every(cell => /^:?-{3,}:?$/u.test(cell))) continue;
    if (cells.length === header.length && cells.every((cell, i) => cell === header[i])) { found = true; continue; }
    if (!found || cells.length !== header.length) fail('TABLE_COLUMNS', `Beklenen tablo kolonları: ${header.join(', ')}`, line.number);
    result.push({ cells, line: line.number });
  }
  if (!found) fail('TABLE_HEADER', `Tablo başlığı bulunamadı: ${header.join(', ')}`);
  return result;
}

function cell(row: TableRow, index: number): string {
  const value = row.cells[index];
  if (value === undefined) fail('MISSING_CELL', `Kolon ${index + 1} eksik.`, row.line);
  return value;
}

function numeric(row: TableRow, index: number, min: number, max: number): number {
  const text = cell(row, index);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(text)) fail('INVALID_NUMBER', `Geçersiz/boş sayı: "${text}".`, row.line);
  const value = Number(text);
  if (!Number.isFinite(value) || value < min || value > max) fail('NUMBER_RANGE', `${text}, ${min}–${max} aralığı dışında.`, row.line);
  return value;
}

function source(sectionName: string, line: number): SourceRef {
  return { file: CATALOG_SOURCE_FILE, section: sectionName, detail: `Markdown satırı ${line}` };
}

function indexed(rows: readonly TableRow[], nameColumn: number): ReadonlyMap<string, TableRow> {
  const map = new Map<string, TableRow>();
  for (const row of rows) {
    const name = cell(row, nameColumn);
    if (!PLAYER_IDENTITIES.some(([, sourceName]) => sourceName === name)) fail('UNKNOWN_PLAYER', `Kimlik kayıt defterinde bulunmayan oyuncu: ${name}`, row.line);
    if (map.has(name)) fail('DUPLICATE_PLAYER', `Aynı tabloda yinelenen oyuncu: ${name}`, row.line);
    map.set(name, row);
  }
  if (map.size !== SOURCE_EXPECTATIONS.players) fail('PLAYER_COUNT', `Tabloda ${SOURCE_EXPECTATIONS.players} yerine ${map.size} oyuncu var.`);
  return map;
}

function position(label: string, line: number): Position {
  const found = ALL_POSITIONS.find(key => POSITION_LABELS[key] === label);
  if (!found) fail('UNKNOWN_POSITION', `Bilinmeyen mevki: ${label}`, line);
  return found;
}

function splitPositions(label: string, line: number): readonly Position[] {
  return label.split('/').map(part => position(part.trim(), line));
}

function exact(actual: number, expected: number, label: string, line: number): void {
  if (Math.abs(actual - expected) > 1e-8) fail('SOURCE_RATING_MISMATCH', `${label}: kaynak ${actual}, hesaplanan ${expected}.`, line);
}

function verifySourceModel(rulebook: readonly SourceLine[]): void {
  const coefficients = table(section(rulebook, '## 2. Stage 1 - Mevki uygunluğu'), ['Uygunluk', 'Katsayı', 'Yorum']);
  if (coefficients.length !== 10) fail('MODEL_COEFFICIENTS', 'On uygunluk katsayısı gerekli.');
  const seen = new Set<number>();
  for (const row of coefficients) {
    const level = numeric(row, 0, 1, 10);
    if (!Number.isInteger(level) || seen.has(level)) fail('MODEL_COEFFICIENTS', 'Uygunluk kademeleri tekil 1–10 olmalı.', row.line);
    seen.add(level);
    exact(numeric(row, 1, 0, 1), SUITABILITY_COEFFICIENTS[level]!, 'Uygunluk katsayısı', row.line);
  }
  const weights = table(section(rulebook, '## 4. Her mevki neden farklı hesaplanıyor?'), ['Özellik', ...OUTFIELD_POSITIONS.map(p => POSITION_LABELS[p])]);
  if (weights.length !== ATTRIBUTE_KEYS.length) fail('MODEL_WEIGHTS', '12 özellik ağırlığı gerekli.');
  const attrs = new Set<string>();
  for (const row of weights) {
    const label = cell(row, 0);
    const attribute = SOURCE_ATTRIBUTE_NAMES[label as keyof typeof SOURCE_ATTRIBUTE_NAMES];
    if (!attribute || attrs.has(attribute)) fail('MODEL_WEIGHTS', `Geçersiz/yinelenen özellik ağırlığı: ${label}`, row.line);
    attrs.add(attribute);
    OUTFIELD_POSITIONS.forEach((p, i) => {
      const text = cell(row, i + 1);
      if (!/^\d+%$/u.test(text)) fail('MODEL_WEIGHTS', `Yüzde bekleniyor: ${text}`, row.line);
      exact(Number(text.slice(0, -1)), POSITION_WEIGHTS[p][attribute], `${p}/${label}`, row.line);
    });
  }
  const formula = section(rulebook, '## 6. Final mevki performans puanı');
  if (!formula.some(line => line.text === 'Final Mevki Puanı = [0.92 × Ham Mevki Puanı + 0.08 × (10 × Stage 1 Katsayısı)] × 10')) {
    fail('MODEL_FORMULA', 'Kaynak %92/%8 formülü değişmiş; model sürümü incelenmeli.');
  }
}

/** Longest names first prevents Eren Emeksiz/Hakan Göktuğ matching short names. */
function mentionedPlayers(text: string): readonly string[] {
  let remaining = text;
  const found: string[] = [];
  for (const [id, name] of [...PLAYER_IDENTITIES].sort((a, b) => b[1].length - a[1].length)) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped(name)})(?=$|[^\\p{L}\\p{N}])`, 'gu');
    remaining = remaining.replace(pattern, (_all, prefix: string) => { if (!found.includes(id)) found.push(id); return `${prefix}${' '.repeat(name.length)}`; });
  }
  return found;
}

function preserveChemistry(lines: readonly SourceLine[], version: string): ChemistrySourceArchive {
  const rows: ChemistrySourceRow[] = [];
  const groups = [
    { title: '## 4. Kilitli Özel Kimya ve Eşleşme Kuralları', kind: 'locked', header: ['Oyuncu / Durum', 'Tetikleyici', 'Aktif etki'], count: SOURCE_EXPECTATIONS.lockedRows },
    { title: '## 5. Oyuncu Bazlı Maçlık Modifier Kuralları', kind: 'modifier', header: ['Oyuncu / Durum', 'Tetikleyici', 'Aktif etki'], count: SOURCE_EXPECTATIONS.modifierRows },
    { title: '## 6. İsim Bazlı Atmosfer Örnekleri', kind: 'atmosphere-example', header: ['Senaryo', 'İsimler', 'Sonuç'], count: SOURCE_EXPECTATIONS.atmosphereExamples },
  ] as const;
  for (const group of groups) {
    const entries = table(section(lines, group.title), group.header);
    if (entries.length !== group.count) fail('CHEMISTRY_COVERAGE', `${group.title}: ${group.count} yerine ${entries.length} satır var.`);
    entries.forEach((row, i) => {
      const subject = cell(row, group.kind === 'atmosphere-example' ? 1 : 0);
      const ids = mentionedPlayers(subject);
      if (ids.length === 0) fail('CHEMISTRY_SUBJECT', `Kimya satırındaki oyuncu eşleştirilemedi: ${subject}`, row.line);
      rows.push({ id: `source-${group.kind}-${String(i + 1).padStart(3, '0')}`, kind: group.kind,
        cells: [cell(row, 0), cell(row, 1), cell(row, 2)], subjectPlayerIds: ids,
        source: source(`Kimya ve Performans / ${group.title.slice(3)}`, row.line) });
    });
  }
  return { status: 'source-only', version, markdown: lines.map(line => line.text).join('\n'), rows };
}

function importCatalog(text: string, options: CatalogImportOptions): CatalogImportReport {
  if (!options.catalogVersion.trim() || !Number.isFinite(Date.parse(options.importedAt))) fail('IMPORT_OPTIONS', 'Geçerli katalog sürümü ve aktarım zamanı gerekli.');
  const lines = text.replace(/^\uFEFF/u, '').split(/\r?\n/u).map((text, i) => ({ text: clean(text), number: i + 1 }));
  const rules = archive(lines, 2), chemistryLines = archive(lines, 3), published = archive(lines, 4), database = archive(lines, 5);
  verifySourceModel(rules);
  const performance = indexed(table(section(database, '### Sıralama, tüm mevki performansları ve ana rol'), ['Sıra', 'Oyuncu', ...ALL_POSITIONS.map(p => POSITION_LABELS[p]), 'Ana Mevki', 'Ana Puan', 'Ana Puan Formülü (Excel)']), 1);
  const attributes = indexed(table(section(database, '### 12 temel yetenek (Stage 2)'), ['Sıra', 'Oyuncu', ...Object.keys(SOURCE_ATTRIBUTE_NAMES)]), 1);
  const suitability = indexed(table(section(database, '### 7 mevki uygunluğu sütunu (Stage 1)'), ['Sıra', 'Oyuncu', ...ALL_POSITIONS]), 1);
  const publication = indexed(table(published, ['OYUNCU', 'ANA MEVKİ', 'PUAN', 'SONRAKİ MEVKİ', 'PUAN']), 0);
  const chemistrySource = preserveChemistry(chemistryLines, options.catalogVersion);
  const discrepancies: ImportDiscrepancy[] = [];
  let verifiedPositionRatings = 0, verifiedMainRatings = 0, verifiedPublishedMainRatings = 0, verifiedSecondaryRatings = 0;
  const ranks = new Set<number>();
  const players: Player[] = [];

  for (const [id, name] of PLAYER_IDENTITIES) {
    const perf = performance.get(name), attr = attributes.get(name), fit = suitability.get(name), pub = publication.get(name);
    if (!perf || !attr || !fit || !pub) fail('MISSING_PLAYER', `${name} bütün kaynak tablolarında bulunmalı.`);
    const rank = numeric(perf, 0, 1, SOURCE_EXPECTATIONS.players);
    if (!Number.isInteger(rank) || ranks.has(rank)) fail('INVALID_RANK', `Geçersiz/yinelenen sıra: ${rank}`, perf.line);
    ranks.add(rank);
    exact(numeric(attr, 0, 1, 48), rank, `${name} Stage 2 sırası`, attr.line);
    exact(numeric(fit, 0, 1, 48), rank, `${name} Stage 1 sırası`, fit.line);
    const mainPosition = position(cell(perf, 9), perf.line);
    const publishedPrimary = splitPositions(cell(pub, 1), pub.line);
    if (!publishedPrimary.includes(mainPosition)) fail('MAIN_ROLE_CONFLICT', `${name} ana rolü yayın tablosuyla uyuşmuyor.`, pub.line);
    const secondaryLabel = cell(pub, 3);
    const secondary = secondaryLabel === '-' ? [] : splitPositions(secondaryLabel, pub.line);
    const preferredPositions = [...new Set([mainPosition, ...publishedPrimary, ...secondary])];
    const suitabilityValues = Object.fromEntries(ALL_POSITIONS.map((p, i) => [p, numeric(fit, i + 2, 1, 10)])) as PositionSuitability;
    const notes = chemistrySource.rows.filter(row => row.subjectPlayerIds.includes(id)).map(row => ({ text: row.cells.join(' — '), source: row.source }));
    for (const line of chemistryLines) {
      const match = /^- (.+?) - (.+)$/u.exec(line.text);
      if (match?.[1] === name) notes.push({ text: match[2]!, source: source('Kimya ve Performans / oyuncu profili', line.number) });
    }
    const origin = { kind: 'catalog', source: { ...source('Oyuncu Veritabanı', perf.line), detail: `Mevki/rol: MD ${perf.line}; Stage 2: MD ${attr.line}; Stage 1: MD ${fit.line}; Excel ana puan: ${cell(perf, 11)}` } } as const;
    const common = { id, name, origin, suitability: suitabilityValues, preferredPositions, notes, archived: false };
    let player: Player;
    let mainRating: number;
    if (mainPosition === 'GK') {
      if (attr.cells.slice(2).some(Boolean) || perf.cells.slice(3, 9).some(Boolean) || secondary.length !== 0 || cell(pub, 4) !== '-') {
        fail('GOALKEEPER_DATA', `${name} için kaynakta olmayan saha değerleri/ikinci mevki var.`, perf.line);
      }
      mainRating = numeric(perf, 2, 0, 100);
      player = { ...common, kind: 'goalkeeper', mainPosition: 'GK', goalkeeperRating: mainRating };
    } else {
      if (cell(perf, 2) !== '') fail('OUTFIELD_GK_RATING', `${name} saha oyuncusu için kaleci puanı beklenmiyor.`, perf.line);
      const values = Object.fromEntries(ATTRIBUTE_KEYS.map((key, i) => [key, numeric(attr, i + 2, 1, 10)])) as BaseAttributes;
      const ratings = Object.fromEntries(OUTFIELD_POSITIONS.map((p, i) => {
        const calculated = calculatePositionRating(values, p, suitabilityValues[p]);
        const reported = numeric(perf, i + 3, 0, 100);
        const compatibility = sourceRatingCompatibility(reported, calculated);
        if (compatibility === 'mismatch') fail('SOURCE_RATING_MISMATCH', `${name}/${p}: kaynak ${reported}, hesaplanan ${calculated.rating}.`, perf.line);
        verifiedPositionRatings++;
        return [p, calculated.rating];
      })) as Record<OutfieldPosition, number>;
      player = { ...common, kind: 'outfield', attributes: values, mainPosition, positionRatings: ratings };
      mainRating = ratings[mainPosition];
      if (secondary.length !== 1 || secondary[0] === 'GK') fail('SECONDARY_ROLE', `${name} için bir saha ikinci mevkisi gerekli.`, pub.line);
      const secondaryPosition = secondary[0]!;
      const secondaryRating = calculatePositionRating(values, secondaryPosition, suitabilityValues[secondaryPosition]);
      if (sourceRatingCompatibility(numeric(pub, 4, 0, 100), secondaryRating) === 'mismatch') fail('SECONDARY_RATING', `${name} ikinci mevki puanı formülle uyuşmuyor.`, pub.line);
      verifiedSecondaryRatings++;
    }
    const mainColumn = ALL_POSITIONS.indexOf(mainPosition) + 2;
    exact(numeric(perf, 10, 0, 100), numeric(perf, mainColumn, 0, 100), `${name} ana puan`, perf.line);
    const excelColumns = { GK:'C', CB:'D', FB:'E', CM:'F', CAM:'G', W:'H', ST:'I' } as const;
    const expectedFormula = `=${excelColumns[mainPosition]}${rank + 2}`;
    if (cell(perf, 11) !== expectedFormula) fail('MAIN_FORMULA', `${name}: ${expectedFormula} ana rol referansı bekleniyor.`, perf.line);
    verifiedMainRatings++;
    const publishedRating = numeric(pub, 2, 0, 100);
    const publicationMatches = player.kind === 'goalkeeper' ? Math.abs(publishedRating - mainRating) < 1e-8
      : sourceRatingCompatibility(publishedRating, calculatePositionRating(player.attributes, player.mainPosition, player.suitability[player.mainPosition])) !== 'mismatch';
    if (Math.abs(publishedRating - numeric(perf, 10, 0, 100)) > 1e-8) {
      discrepancies.push({ playerName: name, field: `${mainPosition} ana puan`, reportedValue: publishedRating, canonicalValue: mainRating,
        source: source('Güncel Mevki Listesi / PDF aktarımı', pub.line),
        resolution: 'Tek ondalıklı Excel/PDF gösterimleri arşivde korundu; uygulama puanı kaynak formülünden iki ondalıkla hesaplandı.' });
    }
    if (publicationMatches) verifiedPublishedMainRatings++;
    players.push(player);
  }
  const outfield = players.filter(p => p.kind === 'outfield').length;
  if (outfield !== SOURCE_EXPECTATIONS.outfield || players.length - outfield !== SOURCE_EXPECTATIONS.goalkeepers || verifiedPositionRatings !== SOURCE_EXPECTATIONS.positionRatings || verifiedSecondaryRatings !== SOURCE_EXPECTATIONS.secondaryRatings) {
    fail('CATALOG_COVERAGE', 'Oyuncu türleri veya doğrulanan puan sayıları kaynak kapsamıyla uyuşmuyor.');
  }
  return {
    catalog: { schemaVersion: CATALOG_SCHEMA_VERSION, version: options.catalogVersion, importedAt: options.importedAt,
      source: { file: CATALOG_SOURCE_FILE, section: 'ARŞİV BÖLÜMÜ 5 / Oyuncu Veritabanı; bölüm 4 / rol tercihleri' }, players },
    chemistrySource, discrepancies, precision: { storedRatingDecimals: 2, sourceRatingDecimals: 1 },
    checks: { players: players.length, outfield, goalkeepers: players.length - outfield, verifiedPositionRatings,
      verifiedMainRatings, verifiedPublishedMainRatings, verifiedSecondaryRatings,
      lockedChemistryRows: chemistrySource.rows.filter(row => row.kind === 'locked').length,
      modifierRows: chemistrySource.rows.filter(row => row.kind === 'modifier').length,
      atmosphereExamples: chemistrySource.rows.filter(row => row.kind === 'atmosphere-example').length },
  };
}

export function createCatalogImporter(options: CatalogImportOptions): CatalogImporter {
  return {
    importMarkdown(text: string): Result<CatalogImportReport> {
      try { return { ok: true, value: importCatalog(text, options) }; }
      catch (error) {
        if (error instanceof ImportFailure) return { ok: false, problems: [error.problem] };
        throw error;
      }
    },
  };
}
