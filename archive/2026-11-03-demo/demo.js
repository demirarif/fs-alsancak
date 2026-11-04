// A deterministic motion study, deliberately independent of match rules.
// The eventual engine/replay adapter should return the same frame contract.
import { players } from './players.js';

export const DURATION = 72;
export const phases = [
  { start: 0, title: 'Oyun merkezde kuruluyor.', description: 'Kısa paslar, destek koşuları ve topun çevresinde görünen isimler.', tags: ['Orta saha', 'Bağlamsal isimler'] },
  { start: 16, title: 'Oyun yön değiştiriyor.', description: 'Çapraz top havalanıyor. Uzak kanat genişliyor, savunma kayıyor.', tags: ['Uzun çapraz pas', 'Topun uçuşu'] },
  { start: 32, title: 'Boşluğa koşu başlıyor.', description: 'Savunma arkasına bırakılan top ve hareket halindeki pas seçeneği.', tags: ['Ara pas', 'Hücum koşusu'] },
  { start: 48, title: 'Ceza sahasında buluşma.', description: 'Hücum ve savunma yaklaşıyor; isimler pozisyonun çevresinde kalıyor.', tags: ['Son pas', 'Savunma takibi'] },
  { start: 64, title: 'Top artık kalecide.', description: 'Kalecinin adı top kendisine geldiğinde açılıyor; diğer isimler geri çekiliyor.', tags: ['Kaleci kontrolü', 'İsim geçişi'] },
];

const keys = [
  { t: 0, owner: 5, p: [-12, -9] },
  { t: 2.3, owner: 5, p: [-9, -7] },
  { t: 3.7, owner: 6, p: [-5, 10] },
  { t: 5.7, owner: 6, p: [-2, 9] },
  { t: 7.1, owner: 7, p: [5, 1] },
  { t: 9.4, owner: 7, p: [9, 2] },
  { t: 10.8, owner: 5, p: [0, -7] },
  { t: 13.4, owner: 5, p: [2, -8] },
  { t: 15.2, owner: 6, p: [4, 11] },
  { t: 17.8, owner: 6, p: [6, 12] },
  { t: 21.0, owner: 8, p: [23, -26], arc: 8 },
  { t: 24.3, owner: 8, p: [29, -25] },
  { t: 26, owner: 7, p: [19, -9] },
  { t: 29.7, owner: 7, p: [21, -7] },
  { t: 32, owner: 8, p: [30, -22] },
  { t: 34.2, owner: 8, p: [31, -21] },
  { t: 36.4, owner: 10, p: [38, -9] },
  { t: 40, owner: 10, p: [43, -8] },
  { t: 42, owner: 7, p: [31, -3] },
  { t: 45.2, owner: 7, p: [34, -2] },
  { t: 48, owner: 9, p: [38, 21], arc: 3 },
  { t: 51.4, owner: 9, p: [44, 19] },
  { t: 53.8, owner: 10, p: [43, 4] },
  { t: 57.8, owner: 10, p: [45, 3] },
  { t: 60, owner: 11, p: [50, 0], arc: 1.4, shot: true },
  { t: 65.2, owner: 11, p: [49, 0] },
  { t: 67.6, owner: 13, p: [36, -10] },
  { t: 70, owner: 13, p: [33, -9] },
  { t: 72, owner: 16, p: [15, -10] },
];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;

/** Every owner change is a pass (or the shot): who strikes when, who receives when. Drives kick/receive animation and dust. */
export const DEMO_TOUCHES = keys.slice(0, -1).flatMap((a, i) => {
  const b = keys[i + 1];
  return a.owner === b.owner ? [] : [{ kickT: a.t, kicker: a.owner, receiveT: b.t, receiver: b.owner, shot: !!b.shot, from: { x: a.p[0], z: a.p[1] }, to: { x: b.p[0], z: b.p[1] } }];
});

// Shared anchors guarantee continuous positions across every pass boundary and
// identical motion when seeking backwards. Rendering never advances game state.
const poseKeys = keys.map(key => players.map((p, i) => {
  const attack = clamp((key.p[0] + 10) / 60, 0, 1);
  let x = p.base.x, z = p.base.z;
  if (!p.keeper) {
    const shift = p.team === 0
      ? (p.role === 'STP' || p.role === 'BEK' ? 16 : 21)
      : (p.base.x > 20 ? 8 : 19);
    x = clamp(x + attack * shift + Math.sin(key.t * .31 + i * 1.7) * 1.4, -48, 46);
    z = z * (p.team === 1 ? 1 - attack * .16 : 1)
      + key.p[1] * .13 + Math.cos(key.t * .36 + i * 2) * 1.6;
  } else {
    x += (p.team === 0 ? .5 : -1) * attack;
    z = clamp(key.p[1] * .1, -2, 2);
  }
  const touch = keys.filter(k => k.owner === i)
    .sort((a, b) => Math.abs(a.t - key.t) - Math.abs(b.t - key.t))[0];
  if (touch) {
    const distance = Math.abs(touch.t - key.t);
    const w = clamp(1 - distance / 7, 0, 1);
    const blend = w * w * (3 - 2 * w);
    x = lerp(x, touch.p[0], blend);
    z = lerp(z, touch.p[1], blend);
  }
  if (p.team === 1 && !p.keeper && p.base.x > 20) {
    const distance = Math.hypot(x - key.p[0], z - key.p[1]);
    const engage = i === key.owner ? 0 : clamp((18 - distance) / 18, 0, .5);
    x = lerp(x, key.p[0] + 2.2, engage);
    z = lerp(z, key.p[1] + (z > key.p[1] ? 1.6 : -1.6), engage);
  }
  return { x, z };
}));

export function getDemoFrame(time) {
  const t = clamp(time, 0, DURATION);
  let k = keys.findIndex((key, i) => i < keys.length - 1 && t >= key.t && t < keys[i + 1].t);
  if (k < 0) k = keys.length - 2;
  const a = keys[k], b = keys[k + 1];
  const progress = clamp((t - a.t) / (b.t - a.t), 0, 1);
  const passing = a.owner !== b.owner;
  const ballX = lerp(a.p[0], b.p[0], progress);
  const ballZ = lerp(a.p[1], b.p[1], progress);
  const ballY = .16 + (passing ? Math.sin(progress * Math.PI) * (b.arc || .16) : Math.abs(Math.sin(t * 8)) * .035);
  const owner = passing ? (progress < .12 ? a.owner : progress > .87 ? b.owner : -1) : a.owner;
  const focus = passing ? [a.owner, b.owner] : [a.owner];
  const poses = players.map((p, i) => {
    const isHome = p.team === 0;
    const x = lerp(poseKeys[k][i].x, poseKeys[k + 1][i].x, progress);
    const z = lerp(poseKeys[k][i].z, poseKeys[k + 1][i].z, progress);
    const direction = Math.atan2(ballX - x + (isHome ? 1 : -1) * .8, ballZ - z);
    return { id: p.id, x, z, direction, running: !p.keeper, owner: i === owner };
  });

  // Maximum five labels. Keepers are contextual and only named on possession.
  let visible = [];
  if (owner >= 0 && players[owner].keeper) {
    visible = [owner, b.owner].filter((id, i, arr) => arr.indexOf(id) === i);
  } else {
    visible = focus.filter(i => !players[i].keeper || i === owner);
    const near = poses.map((p, i) => ({ i, distance: Math.hypot(p.x - ballX, p.z - ballZ) }))
      .filter(({ i }) => !players[i].keeper && !visible.includes(i))
      .sort((a, b) => a.distance - b.distance);
    visible.push(...near.filter(p => p.distance < 20).slice(0, 5 - visible.length).map(p => p.i));
  }
  let phase = phases.findLastIndex(p => t >= p.start);
  return { time: t, poses, ball: { x: ballX, y: ballY, z: ballZ }, owner, labels: visible, phase, passing, shot: !!b.shot && passing };
}
