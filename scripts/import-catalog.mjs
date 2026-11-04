import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createCatalogImporter } from '../src/v1/data/markdown-importer.ts';
import { CATALOG_IMPORTER_VERSION, CATALOG_SOURCE_FILE, PLAYER_IDENTITIES, POSITION_LABELS } from '../src/v1/config/catalog-source.ts';
import { ABILITY_WEIGHT, POSITION_WEIGHTS, RATING_DECIMALS, RATING_MODEL_VERSION, SUITABILITY_COEFFICIENTS, SUITABILITY_WEIGHT } from '../src/v1/config/rating-model.ts';

const root = new URL('../', import.meta.url);
const generated = new URL('src/v1/data/generated/', root);
const reportPath = new URL('catalog-import-report.json', generated);
const checking = process.argv.includes('--check');
if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Desteklenen tek seçenek: --check');
const serialize = value => JSON.stringify(value, null, 2) + '\n';
const hash = value => createHash('sha256').update(value).digest('hex');
const file = await readFile(new URL(CATALOG_SOURCE_FILE, root));
const sourceSha256 = hash(file);
const definitionSha256 = hash(serialize({ importer: CATALOG_IMPORTER_VERSION, model: RATING_MODEL_VERSION, decimals: RATING_DECIMALS,
  identities: PLAYER_IDENTITIES, weights: POSITION_WEIGHTS, coefficients: SUITABILITY_COEFFICIENTS, ability: ABILITY_WEIGHT, suitability: SUITABILITY_WEIGHT }));
let existing = null;
try { existing = JSON.parse(await readFile(reportPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const sameInput = existing?.sourceSha256 === sourceSha256 && existing?.definitionSha256 === definitionSha256;
const importedAt = sameInput ? existing.importedAt : new Date().toISOString();
const catalogVersion = `catalog-v1-${hash(sourceSha256 + definitionSha256).slice(0, 16)}`;
const result = createCatalogImporter({ catalogVersion, importedAt }).importMarkdown(file.toString('utf8'));
if (!result.ok) {
  for (const problem of result.problems) console.error(`${problem.code}: ${problem.message}${problem.field ? ` (${problem.field})` : ''}`);
  process.exitCode = 1;
} else {
  const { catalog, chemistrySource, ...validation } = result.value;
  const report = { schemaVersion: 1, importerVersion: CATALOG_IMPORTER_VERSION, ratingModelVersion: RATING_MODEL_VERSION,
    catalogVersion, importedAt, sourceFile: CATALOG_SOURCE_FILE, sourceSha256, definitionSha256, ...validation,
    chemistryStatus: chemistrySource.status };
  const n = value => value.toFixed(2).replace('.', ',');
  const summary = [
    '# Oyuncu envanteri — aktarım ve doğrulama raporu', '',
    '> `npm run import:catalog` ile üretilir. Kaynak Markdown değiştirilmez.', '',
    `Katalog sürümü: \`${catalogVersion}\`  `,
    `Kaynak SHA-256: \`${sourceSha256}\``, '',
    '## Sonuç', '',
    `- **${report.checks.players} oyuncu:** ${report.checks.outfield} saha oyuncusu ve ${report.checks.goalkeepers} kaleci.`,
    `- **${report.checks.verifiedPositionRatings}/258 saha mevki puanı** kaynak formülüyle hesaplandı ve kaynak gösterim hassasiyetinde doğrulandı.`,
    `- **${report.checks.verifiedMainRatings}/48 ana puan**, **${report.checks.verifiedPublishedMainRatings}/48 yayın ana puanı** ve **${report.checks.verifiedSecondaryRatings}/43 ikinci mevki puanı** doğrulandı.`,
    '- Uygulama ratingleri kullanıcının isteğiyle **iki ondalık** olarak hesaplanır. Kaynakta tek ondalıklı gösterimler için ±0,05 gösterim payı kullanılır.',
    '- 12 temel özellik ve 7 mevki uygunluğu korunur; kalecilere eksik saha özellikleri eklenmez.',
    '- Ana rol kaynak tercihi olarak korunur; daha yüksek hesaplanan başka bir mevkiye otomatik çevrilmez.',
    `- ${report.checks.lockedChemistryRows} kilitli kimya, ${report.checks.modifierRows} oyuncu modifier ve ${report.checks.atmosphereExamples} atmosfer örneği satırı kaynaklarıyla korundu. Çalıştırılabilir kimya motoru dördüncü adımdadır.`, '',
    '## Kaynak gösterim farkları', '',
    '| Oyuncu | PDF gösterimi | İki ondalıklı uygulama puanı | Açıklama |',
    '| --- | ---: | ---: | --- |',
    ...report.discrepancies.map(d => `| ${d.playerName} | ${n(Number(d.reportedValue))} | ${n(Number(d.canonicalValue))} | ${d.resolution} |`), '',
    'Onur CAM **69,55** ve Altuğ CB **60,05** normal iki ondalıklı puanlardır. Kaynaktaki tek ondalıklı gösterim farklılıkları veri hatası sayılmaz.', '',
    '## Envanter', '',
    '| Sabit ID | Oyuncu | Ana rol | Ana puan | Kullanım tercihleri |',
    '| --- | --- | --- | ---: | --- |',
    ...catalog.players.map(p => `| ${p.id} | ${p.name} | ${POSITION_LABELS[p.mainPosition]} | ${n(p.kind === 'goalkeeper' ? p.goalkeeperRating : p.positionRatings[p.mainPosition])} | ${p.preferredPositions.map(pos => POSITION_LABELS[pos]).join(' / ')} |`), '',
    '## Yenileme', '',
    '- Kaynağı veya model tanımını güncelledikten sonra: `npm run import:catalog`.',
    '- Üretilen verilerin güncelliğini değiştirmeden kontrol et: `npm run check:catalog`.',
    '- Davranış/doğrulama testleri: `npm run test:catalog`.',
    '- Normal build güncellik kontrolü yapar; eskimiş JSON ile sessizce devam etmez.', '',
  ].join('\n');
  const outputs = [
    [new URL('player-catalog.json', generated), serialize(catalog)],
    [reportPath, serialize(report)],
    [new URL('chemistry-source.json', generated), serialize(chemistrySource)],
    [new URL('docs/catalog-import-report.md', root), summary],
  ];
  if (checking) {
    const stale = [];
    for (const [path, expected] of outputs) {
      let actual = null;
      try { actual = await readFile(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (actual !== expected) stale.push(decodeURIComponent(path.pathname.split('/').at(-1)));
    }
    if (stale.length) { console.error(`Katalog çıktıları eksik/eski: ${stale.join(', ')}. npm run import:catalog çalıştır.`); process.exitCode = 1; }
    else console.log(`Katalog güncel: 48 oyuncu, 258 mevki puanı, iki ondalık · ${catalogVersion}`);
  } else {
    await mkdir(generated, { recursive: true });
    for (const [path, content] of outputs) await writeFile(path, content, 'utf8');
    console.log(`Aktarıldı: 48 oyuncu (43 saha + 5 kaleci), 258 mevki puanı · ${catalogVersion}`);
  }
}
