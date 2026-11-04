import { bundledCatalogIndex } from './v1/data/bundled-catalog.ts';
import { TEAM_PRESENTATION } from './v1/config/team-presentation.ts';

// Only positions/kit numbers are authored here. Player data comes from the catalog.
export const teams = [
  { id: 'home', ...TEAM_PRESENTATION['team-1'] },
  { id: 'away', ...TEAM_PRESENTATION['team-2'] },
];

const home = [
  ['kiyan', 1, 'KL', -49, 0], ['onur', 2, 'BEK', -30, -26],
  ['m-emre', 4, 'STP', -33, -9], ['omer', 5, 'STP', -33, 10],
  ['mali', 3, 'BEK', -29, 26], ['baran', 6, 'OS', -12, -9],
  ['arif', 8, 'OS', -10, 12], ['eren', 10, 'OS', 4, 1],
  ['taha', 7, 'KNT', 12, -25], ['alper', 11, 'KNT', 11, 25],
  ['ismail', 9, 'FV', 22, 1],
];
const away = [
  ['sahin', 1, 'KL', 49, 0], ['yanki', 2, 'BEK', 30, -26],
  ['servan', 4, 'STP', 33, -9], ['hakan-goktug', 5, 'STP', 33, 10],
  ['yigit-cetinkaya', 3, 'BEK', 29, 26], ['mamadou', 6, 'OS', 12, -10],
  ['caca', 8, 'OS', 10, 12], ['mahmut', 10, 'OS', -4, 0],
  ['erhan', 7, 'KNT', -12, -25], ['suleyman', 11, 'KNT', -11, 25],
  ['barkuz', 9, 'FV', -22, 1],
];

export const players = [home, away].flatMap((lineup, team) =>
  lineup.map(([id, number, role, x, z]) => {
    const player = bundledCatalogIndex.getById(id);
    if (!player) throw new Error(`Önizleme oyuncusu envanterde bulunamadı: ${id}`);
    return { ...player, number, role, team, keeper: player.kind === 'goalkeeper', base: { x, z } };
  }),
);
