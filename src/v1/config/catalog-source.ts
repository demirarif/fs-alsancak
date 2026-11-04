import type { Attribute, Position } from '../domain/players.js';

export const CATALOG_SOURCE_FILE = 'Hali_Saha_Tum_Kaynaklar_Birlestirilmis.md';
export const CATALOG_SCHEMA_VERSION = 1;
export const CATALOG_IMPORTER_VERSION = '1.0.0';

/** Explicit, persistent identity registry. Never derive IDs from rank or name. */
export const PLAYER_IDENTITIES = [
  ['taha', 'Taha'], ['servan', 'Servan'], ['alper', 'Alper'],
  ['mahmut', 'Mahmut'], ['goktug', 'Göktuğ'], ['barkuz', 'Barkuz'],
  ['kiyan', 'Kiyan'], ['m-emre', 'M.Emre'], ['erhan', 'Erhan'],
  ['ismail', 'İsmail'], ['baran', 'Baran'], ['eren', 'Eren'],
  ['arif', 'Arif'], ['emir', 'Emir'], ['hakan-goktug', 'Hakan Göktuğ'],
  ['melih', 'Melih'], ['sahin', 'Şahin'], ['mustafa', 'Mustafa'],
  ['mali', 'Mali'], ['mensur', 'Mensur'], ['suleyman', 'Süleyman'],
  ['onur', 'Onur'], ['omer', 'Ömer'], ['mamadou', 'Mamadou'],
  ['caca', 'Çaça'], ['utku', 'Utku'], ['kamil-reis', 'Kamil Reis'],
  ['ali-efe', 'Ali Efe'], ['talha', 'Talha'], ['yusuf', 'Yusuf'],
  ['yanki', 'Yankı'], ['tevfik', 'Tevfik'], ['berkin', 'Berkin'],
  ['direnc', 'Direnç'], ['eto', 'Eto'], ['ugur', 'Uğur'],
  ['arda-barin', 'Arda Barin'], ['yigit-cetinkaya', 'Yiğit Çetinkaya'],
  ['batu', 'Batu'], ['seker', 'Şeker'], ['halit', 'Halit'],
  ['metehan', 'Metehan'], ['sarp', 'Sarp'], ['altug', 'Altuğ'],
  ['oguz', 'Oğuz'], ['eren-emeksiz', 'Eren Emeksiz'],
  ['fuat', 'Fuat'], ['akin', 'Akın'],
] as const;

export const SOURCE_ATTRIBUTE_NAMES = {
  HIZ: 'speed', DAY: 'stamina', GÜÇ: 'strength', PAS: 'passing', GÖR: 'vision',
  KNTRL: 'control', DRİB: 'dribbling', ŞUT: 'shooting', BİT: 'finishing',
  DEF: 'defending', PRES: 'pressing', POZ: 'positioning',
} as const satisfies Readonly<Record<string, Attribute>>;

export const POSITION_LABELS = {
  GK: 'Kaleci', CB: 'Stoper', FB: 'Bek', CM: 'Göbek OS',
  CAM: 'Hücumcu OS', W: 'Kanat', ST: 'Forvet',
} as const satisfies Readonly<Record<Position, string>>;

export const SOURCE_EXPECTATIONS = {
  players: 48, outfield: 43, goalkeepers: 5, positionRatings: 258,
  secondaryRatings: 43, lockedRows: 8, modifierRows: 68, atmosphereExamples: 12,
} as const;
