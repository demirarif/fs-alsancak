import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createCatalogImporter } from '../src/v1/data/markdown-importer.ts';
import { calculatePositionRating, calculatePositionRatings, roundRating, suitabilityCoefficient } from '../src/v1/domain/ratings.ts';
import { ATTRIBUTE_KEYS } from '../src/v1/domain/players.ts';
import { OUTFIELD_POSITIONS, POSITION_WEIGHTS } from '../src/v1/config/rating-model.ts';
import { createCatalogIndex, formatRating, mainRating } from '../src/v1/data/catalog-index.ts';
import { validatePlayerCatalog } from '../src/v1/data/catalog-validation.ts';
import { bundledCatalogReader, getBundledCatalog } from '../src/v1/data/bundled-catalog.ts';

const root = new URL('../', import.meta.url);
const text = await readFile(new URL('Hali_Saha_Tum_Kaynaklar_Birlestirilmis.md', root), 'utf8');
const importer = createCatalogImporter({ catalogVersion: 'test-catalog', importedAt: '2026-11-03T00:00:00.000Z' });
const imported = importer.importMarkdown(text);
assert.equal(imported.ok, true, JSON.stringify(imported));
const report = imported.value;
const catalog = report.catalog;
const byId = id => catalog.players.find(player => player.id === id);

// Fixtures deliberately damage source tables; no implementation logic is copied.
function rewriteTable(heading, transform) {
  const start = text.indexOf(heading) + heading.length;
  assert.ok(start >= heading.length);
  const rest = text.slice(start);
  const next = /\r?\n#{1,3} /u.exec(rest);
  const end = next ? start + next.index : text.length;
  return text.slice(0, start) + transform(text.slice(start, end)) + text.slice(end);
}
function changeCell(heading, name, index, replacement) {
  return rewriteTable(heading, body => body.split(/\r?\n/u).map(line => {
    if (!/^\| \d+ \|/u.test(line)) return line;
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (cells[1] !== name) return line;
    cells[index] = replacement;
    return `| ${cells.join(' | ')} |`;
  }).join('\n'));
}
function rejects(source, code) {
  const result = importer.importMarkdown(source);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(problem => problem.code === code), JSON.stringify(result));
}

test('all source players, ratings and chemistry text are accounted for', () => {
  assert.deepEqual(report.checks, { players:48, outfield:43, goalkeepers:5, verifiedPositionRatings:258,
    verifiedMainRatings:48, verifiedPublishedMainRatings:48, verifiedSecondaryRatings:43,
    lockedChemistryRows:8, modifierRows:68, atmosphereExamples:12 });
  assert.equal(new Set(catalog.players.map(p => p.id)).size, 48);
  assert.equal(report.chemistrySource.status, 'source-only');
  assert.equal(report.chemistrySource.rows.length, 88);
  assert.ok(report.chemistrySource.markdown.includes('Arif-Barkuz gibi kilitli çift cezası'));
  assert.deepEqual(report.precision, { storedRatingDecimals:2, sourceRatingDecimals:1 });
});

test('rulebook example and interpolation produce independently known values', () => {
  const baran = byId('baran');
  const cm = calculatePositionRating(baran.attributes, 'CM', baran.suitability.CM);
  assert.ok(Math.abs(cm.rawAbility - 7.89) < 1e-10);
  assert.ok(Math.abs(cm.suitabilityCoefficient - .955) < 1e-10);
  assert.ok(Math.abs(cm.exact - 80.228) < 1e-10);
  assert.equal(cm.rating, 80.23);
  assert.equal(calculatePositionRating(baran.attributes, 'FB', 10).rating, 80.08);
  assert.ok(Math.abs(suitabilityCoefficient(8.5) - .955) < 1e-10);
  assert.equal(suitabilityCoefficient(1), .35);
  assert.equal(suitabilityCoefficient(10), 1);
});

test('all six roles obey full-strength and minimum-strength boundary fixtures', () => {
  for (const p of OUTFIELD_POSITIONS) {
    assert.equal(Object.values(POSITION_WEIGHTS[p]).reduce((a,b) => a+b,0), 100);
    const attrs = n => Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key,n]));
    assert.equal(calculatePositionRating(attrs(10), p, 10).rating, 100);
    assert.equal(calculatePositionRating(attrs(1), p, 1).rating, 12);
  }
});

test('two decimals retain fractional scores, including the former display ties', () => {
  assert.equal(byId('onur').positionRatings.CAM, 69.55);
  assert.equal(byId('altug').positionRatings.CB, 60.05);
  assert.equal(byId('omer').positionRatings.CB, 75.05);
  assert.equal(roundRating(80.228), 80.23);
  assert.equal(roundRating(8.075), 8.08);
  assert.equal(formatRating(75), '75,00');
  for (const player of catalog.players.filter(p => p.kind === 'outfield')) {
    assert.deepEqual(player.positionRatings, calculatePositionRatings(player.attributes, player.suitability));
  }
});

test('manual role preferences survive higher numerical alternatives', () => {
  for (const [id, role, higherRole] of [['arif','CM','FB'],['batu','FB','CM'],['mamadou','CM','CB']]) {
    const p = byId(id);
    assert.equal(p.mainPosition, role);
    assert.ok(p.positionRatings[higherRole] > p.positionRatings[role]);
    assert.equal(mainRating(p), p.positionRatings[role]);
    assert.equal(p.preferredPositions[0], role);
  }
});

test('goalkeepers stay sparse and are never inferred from suitability alone', () => {
  const keepers = catalog.players.filter(p => p.kind === 'goalkeeper');
  assert.deepEqual(keepers.map(p => [p.name,p.goalkeeperRating]), [['Kiyan',82.5],['Şahin',78],['Talha',70],['Yusuf',70],['Sarp',62]]);
  assert.ok(keepers.every(p => !('attributes' in p) && !('positionRatings' in p)));
  assert.equal(byId('barkuz').suitability.GK, 9);
  assert.equal(byId('barkuz').kind, 'outfield');
  assert.equal('goalkeeperRating' in byId('barkuz'), false);
});

test('longer player names do not activate short-name chemistry identities', () => {
  for (const [name, expected] of [['Eren Emeksiz','eren-emeksiz'],['Hakan Göktuğ','hakan-goktug']]) {
    const rows = report.chemistrySource.rows.filter(row => row.cells[0] === name);
    assert.ok(rows.length > 0);
    rows.forEach(row => assert.deepEqual(row.subjectPlayerIds, [expected]));
  }
  const trio = report.chemistrySource.rows.find(row => row.cells[0] === 'Baran + Eren + Arif');
  assert.deepEqual([...trio.subjectPlayerIds].sort(), ['arif','baran','eren']);
});

test('reordering a source table keeps player identity and role data stable', () => {
  const changed = rewriteTable('### Sıralama, tüm mevki performansları ve ana rol', body => {
    const lines = body.split(/\r?\n/u), data = lines.filter(line => /^\| \d+ \|/u.test(line)).reverse();
    return lines.map(line => /^\| \d+ \|/u.test(line) ? data.shift() : line).join('\n');
  });
  const r = importer.importMarkdown(changed);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.value.catalog.players.map(p => [p.id,p.name,p.mainPosition]), catalog.players.map(p => [p.id,p.name,p.mainPosition]));
});

test('missing numbers, invalid numbers, unknown names and duplicate rows fail closed', () => {
  const heading = '### 12 temel yetenek (Stage 2)';
  for (const invalid of ['', 'NaN', 'Infinity', '11', '0']) rejects(changeCell(heading,'Baran',5,invalid), invalid === '11' || invalid === '0' ? 'NUMBER_RANGE' : 'INVALID_NUMBER');
  rejects(changeCell(heading,'Taha',1,'Bilinmeyen oyuncu'), 'UNKNOWN_PLAYER');
  rejects(changeCell(heading,'Taha',1,'Servan'), 'DUPLICATE_PLAYER');
});

test('wrong ratings, wrong main-cell formulas and invented goalkeeper attributes fail', () => {
  rejects(changeCell('### Sıralama, tüm mevki performansları ve ana rol','Taha',7,'88.5'), 'SOURCE_RATING_MISMATCH');
  rejects(changeCell('### Sıralama, tüm mevki performansları ve ana rol','Baran',11,'=E13'), 'MAIN_FORMULA');
  rejects(changeCell('### 12 temel yetenek (Stage 2)','Kiyan',2,'7'), 'GOALKEEPER_DATA');
});

test('a changed scoring rule cannot silently reuse the old model', () => {
  rejects(text.replace('Final Mevki Puanı = [0.92 ×','Final Mevki Puanı = [0.90 ×'), 'MODEL_FORMULA');
  rejects(text.replace('| 10 | 1.00 | Tam doğal |','| 10 | 0.99 | Tam doğal |'), 'SOURCE_RATING_MISMATCH');
});

test('rating functions reject invalid direct inputs instead of returning NaN', () => {
  for (const invalid of [0,11,NaN,Infinity]) assert.throws(() => suitabilityCoefficient(invalid), RangeError);
  assert.throws(() => calculatePositionRating({...byId('baran').attributes, passing:NaN},'CM',8.5), RangeError);
  assert.throws(() => calculatePositionRating(byId('baran').attributes,'GK',10), RangeError);
});

test('runtime JSON validation catches corruption before a scene uses the catalog', () => {
  assert.equal(validatePlayerCatalog(catalog).ok, true);
  for (const mutate of [
    c => c.schemaVersion = 999,
    c => c.players[1].id = c.players[0].id,
    c => delete c.players[0].attributes.passing,
    c => c.players[0].positionRatings.W += .01,
    c => c.players.find(p => p.kind === 'goalkeeper').attributes = {},
  ]) {
    const c = structuredClone(catalog);mutate(c);assert.equal(validatePlayerCatalog(c).ok, false);
  }
});

test('Turkish search folds spelling but does not change identity or role rules', () => {
  const index = createCatalogIndex(catalog);
  for (const [query,id] of [['ISMAIL','ismail'],['goktug','goktug'],['yigit cetinkaya','yigit-cetinkaya'],['caca','caca'],['m emre','m-emre']]) assert.ok(index.search({query}).some(p => p.id === id));
  assert.equal(index.getById('Göktuğ'), undefined);
  assert.equal(index.getById('goktug').name, 'Göktuğ');
  assert.deepEqual(index.search({position:'GK'}).map(p=>p.id), ['kiyan','sahin','talha','yusuf','sarp']);
  assert.equal(index.search({query:'eren'}).length, 2);
});

test('catalog views cannot mutate shared source data', async () => {
  const mutable = structuredClone(catalog), index = createCatalogIndex(mutable);
  mutable.players[0].name = 'Değişti';
  assert.equal(index.players[0].name, 'Taha');
  assert.throws(() => index.players[0].attributes.passing = 1, TypeError);
  const loaded = await bundledCatalogReader.load();
  assert.equal(loaded.ok, true);
  assert.ok(Object.isFrozen(loaded.value.players[0].attributes));
  assert.equal(getBundledCatalog().players.length, 48);
});

test('committed catalog matches source fingerprints and recalculated records', async () => {
  const manifest = JSON.parse(await readFile(new URL('src/v1/data/generated/catalog-import-report.json',root),'utf8'));
  assert.equal(manifest.sourceSha256, createHash('sha256').update(await readFile(new URL('Hali_Saha_Tum_Kaynaklar_Birlestirilmis.md',root))).digest('hex'));
  const reread = createCatalogImporter({catalogVersion:manifest.catalogVersion,importedAt:manifest.importedAt}).importMarkdown(text);
  assert.equal(reread.ok, true);
  assert.deepEqual(getBundledCatalog(), reread.value.catalog);
});

// The 3D demo and its 22-player preview were archived (archive/2026-11-03-demo); tests/highlight.test.mjs covers the match screen's players.
