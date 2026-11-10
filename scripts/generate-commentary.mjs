#!/usr/bin/env node
/* Türkçe spiker sesleri (2026-11-10, kullanıcı: "türkçe spiker olarak serhanı alalım" · "x pas verdi, x'ten güzel bir pas gibi şeyler de
 * ekle, top kaybı falan çeşitli sesleri üret, zaten sonrasında tekrarlatıcaz hepsini, golde falan duygu ekle").
 *
 * Ses: "Alsancak Spiker" — kullanıcının dinleyip seçtiği, ElevenLabs'te tariften tasarlanmış ses ("gol çığlığı": son dakika golünü
 * bağırarak anlatan, nefes nefese, İstanbullu Türk spiker). İki tür replik üretir ve public/sounds/spiker/ altına yazar:
 *   · genel replikler (kurtarış, direk, aut, korner, devre arası...) — her duruma birkaç tane, maç sırayla çalar;
 *   · her oyuncu için isimli replikler ("Top Alper'de.", "Alper'den harika bir pas!", "Alper topu kaptırdı."...).
 * Coşkulu anlar (gol, şut, direk, penaltı...) eleven_v3 ile [shouting]/[excited] etiketleriyle, "dengeli" ayarda üretilir (kullanıcının
 * seçtiği; en özgür ayar bu seste isimleri bozuyor). Sakin replikler --calm ile seçilen ayarda (varsayılan: eleven_multilingual_v2,
 * dengeli — bu seste kısa cümleleri en net okuyan). "GOOOOL" gibi harf uzatmaları ve büyük harfli adlar söyleyişi bozduğu için
 * metinler düz yazımla yazılır. Maç manifest.json'u okur (src/match/match-audio.js).
 *
 * Var olan dosyalar yeniden üretilmez (yarıda kalırsa tekrar çalıştırmak yeter; --force hepsini yeniler). Anahtar hiçbir yere yazılmaz:
 *   node scripts/generate-commentary.mjs --env-file <.env yolu>          (ya da export ELEVENLABS_API_KEY=...)
 *   node scripts/generate-commentary.mjs --dry                           kaç replik, kaç karakter (anahtar gerekmez)
 *   seçenekler: --voice <voice_id> · --calm v2|v3 · --only goal,shot · --players alper,taha · --generic-only · --force
 *               · --sfx · --normalize */
import { mkdir, writeFile, readFile, readdir, rename, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { renameSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'sounds', 'spiker');
const API = 'https://api.elevenlabs.io';
/** "Alsancak Spiker" (the user's choice, 2026-11-10). The earlier voice, Serhan, was 5RyvChxppAoRnQsfCtIh. */
const SPIKER = 's4R0kmUXB5AoaxLgQ9Ee';
/** How the lines are read, in three tiers (the user: "duygusunu azaltabilirsin normal tarafın çünkü orda bir gol beklemiyoruz, ara
 * pasta falan duygulu olabilir"):
 *   excited — goals, shots, the post, saves, penalties: the user's pick ("yeni model, dengeli");
 *   lively  — a through ball, a dribble, a cross, a good tackle: eleven_multilingual_v2 with more style;
 *   calm    — who has the ball, passes, losses, fouls, corners: eleven_multilingual_v2 (the user's pick, "eski model, dengeli"),
 *             with less style than that sample. --calm v3 reads them with the excited model instead. */
const EXCITED = { model_id: 'eleven_v3', voice_settings: { stability: .5, similarity_boost: .8, speed: 1.1 } };
const LIVELY = { model_id: 'eleven_multilingual_v2', voice_settings: { stability: .4, similarity_boost: .8, style: .7, use_speaker_boost: true, speed: 1.08 } };
const CALM = {
  v2: { model_id: 'eleven_multilingual_v2', voice_settings: { stability: .6, similarity_boost: .8, style: .2, use_speaker_boost: true, speed: 1.05 } },
  v3: { model_id: 'eleven_v3', voice_settings: { stability: .5, similarity_boost: .8, speed: 1.08 } },
};

/* ── Türkçe ekler: "Alper'den", "Top Alper'de". Son ünlü kalın (a ı o u) → a, ince → e; sert ünsüzle bitiyorsa d → t. ── */
const lastVowel = w => [...w.toLocaleLowerCase('tr')].reverse().find(c => 'aıoueiöü'.includes(c)) ?? 'e';
const hard = w => 'çfhkpsşt'.includes(w.toLocaleLowerCase('tr').at(-1));
const suffix = (name, a, e) => { const w = name.split(' ').at(-1), back = 'aıou'.includes(lastVowel(w)); return `${name}'${hard(w) ? 't' : 'd'}${back ? a : e}`; };
const abl = n => suffix(n, 'an', 'en'), loc = n => suffix(n, 'a', 'e');
/** Katalogdaki adın söylenişi, gerektiğinde. */
const SPOKEN = { 'm-emre': 'Emre' };

/* ── Replikler. ex: coşkulu (etiketli, en yüksek seviye), lv: canlı; ikisi de değilse sakin. Kullanıcı: "gol pozisyonlarını falan çok
 * duygusuz okuyor" — şut, kurtarış ve aut da coşkulu; gol cümleleri bir spikerin gol anı gibi akar. Tek kelimelik replik yok: tek başına
 * "Korner." İngilizce "corner" gibi okunuyor (konuşma tanıma %89-94 İngilizce algıladı), cümle içinde Türkçe (%92-95). ── */
const ex = text => ({ text, excited: true }), lv = text => ({ text, lively: true });
const GENERIC = {
  goal: [ex('[shouting] Ve gol gol gol! [excited] Ne gol ama, kaleci çaresiz, top ağlarda!'), ex('[shouting] Gol! Gol! Gol! [excited] Tribünler ayağa kalktı, top ağlarda!'), ex('[excited] Vuruyor ve [shouting] gol! [excited] İnanılmaz bir gol, inanılmaz!')],
  shot: [ex('[excited] Ve vuruyor!'), ex('[excited] Ve şutunu çekti!')],
  'header-shot': [ex('[excited] Kafa vuruşu!'), ex('[excited] Kafayı vurdu!')],
  save: ['Kaleci topu kontrol ediyor.', ex('[excited] Kaleci kurtarıyor!')],
  parry: [ex('[excited] Kaleci çeliyor!'), ex('[excited] Son anda çeldi, müthiş kurtarış!')],
  spill: [ex('[excited] Kaleci topu elinden kaçırdı!')],
  post: [ex('[shouting] Direk! [excited] Kıl payı, inanılmaz!'), ex('[excited] Direkten döndü!')],
  wide: [ex('[excited] Az farkla dışarıda!'), 'Auta gidiyor.', ex('[excited] Ah, yakın geçti!')],
  block: ['Savunmaya çarptı!', 'Şut bloke edildi!'],
  foul: ['Faul var.', 'Hakem düdüğü çalıyor, faul.'],
  penalty: [ex('[shouting] Penaltı! [excited] Hakem beyaz noktayı gösteriyor!'), ex('[excited] Penaltı kararı!')],
  'penalty-kick': ['Penaltıyı kullanmaya hazırlanıyor... ve vuruyor!'],
  corner: ['Korner kullanılacak.', 'Top kornere çıktı.'],
  cross: [lv('Ortaya geliyor!'), lv('Ceza sahasına orta!')],
  'free-kick': ['Serbest vuruş kazanıldı.', 'Serbest vuruşu kullanmaya hazırlanıyorlar.'],
  'keeper-claim': ['Kaleci havada topu aldı.', 'Kaleci çıkıp topu kontrol etti.'],
  nutmeg: [ex('[excited] Bacak arası! Ne yaptı öyle!'), ex('[excited] Rakibinin bacak arasından geçirdi!')],
  tackle: [lv('Güzel müdahale!'), 'Topu kaptı.'],
  interception: ['Pas arada kesildi.', lv('Araya girdi!')],
  loss: ['Top kaybı oldu.', 'Topu kaptırdı.'],
  'bad-touch': ['Kötü bir kontrol.'],
  'pass-good': [lv('Güzel bir pas!'), lv('Harika bir ara pası!')],
  'kick-off-start': [lv('Ve maç başlıyor! Bol şans her iki takıma da.')],
  'second-half': [lv('İkinci yarı başladı!')],
  restart: ['Santra yapıldı, oyun yeniden başlıyor.'],
  'half-time': ['Hakem ilk yarıyı bitiriyor.', 'İlk yarının sonuna geldik.'],
  'full-time': [ex('[excited] Ve maç sona eriyor! Son düdük çaldı!')],
};
/** Her oyuncu için: n = söylenen ad. */
const PLAYER = {
  ball: [n => `Top ${loc(n)}.`],
  pass: [n => `${n} pasını verdi.`],
  'pass-good': [n => lv(`${abl(n)} harika bir pas!`)],
  beat: [n => lv(`${n} rakibini geçiyor!`)],
  tackle: [n => `${n} topu kaptı.`],
  loss: [n => `${n} topu kaptırdı.`],
  'bad-touch': [n => `${n} topu kontrol edemedi.`],
  foul: [n => `${n} faul yaptı.`],
  shot: [n => ex(`[excited] ${n} vuruyor!`)],
  goal: [n => ex(`[shouting] Ve gol gol gol! [excited] ${n} attı! Ne gol ama, top ağlarda!`), n => ex(`[shouting] Gol! Gol! Gol! [excited] ${n}, ${n} ağları sarsıyor!`)],
};
/** Kaleciler (katalogda kalecilik uygunluğu 9+) için ek replikler. */
const KEEPER = { save: [n => ex(`[excited] ${n} kurtarıyor!`), n => ex(`[excited] ${n} gole izin vermiyor!`)] };
/** Kayıtlı efektler (--sfx; anahtarda sound_generation izni gerekir): varsa maç sentezlenmiş düdük ve kükreme yerine bunları çalar. */
const EFFECTS = {
  'whistle-short': ['A football referee blowing one short, sharp pea whistle blast on an open pitch, close microphone, no crowd', 1],
  'whistle-long': ['A football referee blowing one long pea whistle blast for a penalty, open pitch, close microphone, no crowd', 1.6],
  'whistle-double': ['A football referee blowing two pea whistle blasts, short then long, for half-time, open pitch, no crowd', 2.2],
  'whistle-final': ['A football referee blowing the final whistle: two short pea whistle blasts and one long one, open pitch, no crowd', 3],
  'crowd-goal': ['A packed football stadium crowd erupting into a huge roar and cheering after a goal, then settling', 6],
};

/* ── Seviye: her replik ölçülüp tek bir kazançla hedefe çekilir (coşkulular daha yüksek), tepe -1 dBFS altında. ffmpeg yoksa atlanır.
 * Önce baştaki ve sondaki sessizlik kırpılır: eleven_v3 kısa cümlelerin sonuna 2-3,5 sn boşluk ekleyebiliyor ("İsmail vuruyor!" 1,5 sn
 * konuşma + 3,6 sn sessizlik) ve maç spikeri replik bitene kadar konuşuyor saydığı için o boşlukta başka anlar söylenemiyordu. ── */
const LEVEL = { calm: -19, lively: -17, excited: -14 };
const levelOf = j => j.excited ? LEVEL.excited : j.lively ? LEVEL.lively : LEVEL.calm;
// -40 dB: this voice's "silence" is a faint room tone between -45 and -40 dB. A file is rewritten only when it gets shorter (no needless
// re-encoding).
const TRIM = 'silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.12,areverse';
const seconds = f => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout) || 0;
function normalize(file, target) {
  const tmp0 = `${file}.trim.mp3`;
  if (spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-af', TRIM, '-b:a', '128k', tmp0]).status === 0) {
    if (seconds(tmp0) > .3 && seconds(tmp0) < seconds(file) - .1) renameSync(tmp0, file); else unlinkSync(tmp0);
  }
  const m = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  if (m.error) return null;
  const s = m.stderr.slice(m.stderr.lastIndexOf('Summary:')), I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(s)?.[1]), peak = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(s)?.[1]);
  if (!Number.isFinite(I) || !Number.isFinite(peak)) return null;
  const gain = Math.min(target - I, -1 - peak);
  if (Math.abs(gain) < .3) return 0;
  const tmp = `${file}.tmp.mp3`;
  if (spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-af', `volume=${gain.toFixed(2)}dB`, '-b:a', '128k', tmp]).status !== 0) return null;
  return rename(tmp, file).then(() => gain);
}

const args = process.argv.slice(2), flag = name => { const i = args.indexOf(`--${name}`); return i < 0 ? undefined : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true; };
const list = name => typeof flag(name) === 'string' ? new Set(String(flag(name)).split(',')) : null;
const only = list('only'), onlyPlayers = list('players');

/* ── Yapılacak işler. ── */
const catalog = JSON.parse(await readFile(path.join(ROOT, 'src', 'v1', 'data', 'generated', 'player-catalog.json'), 'utf8'));
const players = (catalog.players ?? catalog).filter(p => !onlyPlayers || onlyPlayers.has(p.id));
const jobs = [];
const job = (group, situation, i, line) => { const l = typeof line === 'string' ? { text: line } : line; jobs.push({ group, situation, file: `${group === 'generic' ? 'genel' : `oyuncu/${group}`}/${situation}-${i + 1}.mp3`, ...l }); };
for (const [situation, lines] of Object.entries(GENERIC)) if (!only || only.has(situation)) lines.forEach((l, i) => job('generic', situation, i, l));
if (!flag('generic-only')) for (const p of players) {
  const n = SPOKEN[p.id] ?? p.name, sets = { ...PLAYER, ...((p.suitability?.GK ?? 0) >= 9 ? KEEPER : {}) };
  for (const [situation, makers] of Object.entries(sets)) if (!only || only.has(situation)) makers.forEach((make, i) => job(p.id, situation, i, make(n)));
}
const spoken = j => j.text.replace(/\[[^\]]+\]\s*/g, '');
if (flag('dry')) {
  // --json: the whole list (file, spoken text, excited), for checking the recordings against it.
  if (flag('json')) { console.log(JSON.stringify(jobs.map(j => ({ file: j.file, text: spoken(j), excited: !!j.excited, lively: !!j.lively })))); process.exit(0); }
  console.log(`${jobs.length} replik, ${jobs.reduce((s, j) => s + j.text.length, 0)} karakter (${jobs.filter(j => j.group === 'generic').length} genel, ${players.length} oyuncu).`);
  for (const j of jobs.slice(0, 400)) console.log(`  ${j.file.padEnd(34)} ${j.excited ? '!' : ' '} ${spoken(j)}`);
  process.exit(0);
}

let manifest = { voice: SPIKER, generic: {}, players: {}, effects: {} };
try { manifest = { ...manifest, ...JSON.parse(await readFile(path.join(OUT, 'manifest.json'), 'utf8')) }; } catch {}
const record = j => { const bucket = j.group === 'generic' ? manifest.generic : (manifest.players[j.group] ??= {}); const files = new Set(bucket[j.situation] ?? []); files.add(j.file); bucket[j.situation] = [...files].sort(); };
const saveManifest = () => writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);

if (flag('normalize')) {
  for (const j of jobs) { const f = path.join(OUT, j.file); if (await access(f).then(() => true, () => false)) await normalize(f, levelOf(j)); }
  console.log('Seviyeler eşitlendi.'); process.exit(0);
}

let key = process.env.ELEVENLABS_API_KEY;
if (!key && typeof flag('env-file') === 'string') {
  const line = (await readFile(String(flag('env-file')), 'utf8').catch(() => '')).split(/\r?\n/).find(l => l.startsWith('ELEVENLABS_API_KEY='));
  key = line?.slice('ELEVENLABS_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
}
if (!key) { console.error('ELEVENLABS_API_KEY bulunamadı. Önce: export ELEVENLABS_API_KEY=...  ya da  --env-file <.env yolu>'); process.exit(1); }
const voice = typeof flag('voice') === 'string' ? String(flag('voice')) : SPIKER;
const calm = CALM[typeof flag('calm') === 'string' ? String(flag('calm')) : 'v2'];
if (!calm) { console.error(`--calm şunlardan biri olmalı: ${Object.keys(CALM).join(', ')}`); process.exit(1); }
manifest.voice = voice;

async function tts(j) {
  const how = j.excited ? EXCITED : j.lively ? LIVELY : calm;
  const body = { text: j.text, language_code: 'tr', ...how };
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${API}/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const text = await r.text().catch(() => '');
    // Too many at once / a passing server error: wait and try again.
    if ((r.status === 429 || r.status >= 500) && attempt < 4) { await new Promise(res => setTimeout(res, 1500 * 2 ** attempt)); continue; }
    throw new Error(`ElevenLabs ${r.status}: ${text.slice(0, 200)}`);
  }
}

const todo = [];
for (const j of jobs) { const f = path.join(OUT, j.file); if (!flag('force') && await access(f).then(() => true, () => false)) record(j); else todo.push(j); }
console.log(`${jobs.length} replikten ${todo.length} tanesi üretilecek (${todo.reduce((s, j) => s + j.text.length, 0)} karakter).`);
let done = 0, failed = 0;
async function worker() {
  for (let j; (j = todo.shift());) {
    try {
      const f = path.join(OUT, j.file);await mkdir(path.dirname(f), { recursive: true });
      await writeFile(f, await tts(j));await normalize(f, levelOf(j));record(j);
      if (++done % 25 === 0) { console.log(`  ${done} hazır`);await saveManifest(); }
    } catch (err) { failed++;console.error(`✗ ${j.file}: ${err.message}`);if (/401|quota|credits/i.test(err.message)) todo.length = 0; }
  }
}
await mkdir(OUT, { recursive: true });
await Promise.all(Array.from({ length: Number(flag('concurrency')) || 4 }, worker));

if (flag('sfx')) for (const [name, [text, seconds]] of Object.entries(EFFECTS)) {
  const r = await fetch(`${API}/v1/sound-generation?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, duration_seconds: seconds, prompt_influence: .6 }) });
  if (!r.ok) { const t = await r.text();console.error(/sound_generation/.test(t) ? 'Bu anahtarın ses efekti izni (sound_generation) yok: düdük ve kükreme maçta sentezlenmiş olarak kalır.' : `Efektler üretilemedi: ${r.status}`);break; }
  const file = `efekt/${name}.mp3`;await mkdir(path.join(OUT, 'efekt'), { recursive: true });await writeFile(path.join(OUT, file), Buffer.from(await r.arrayBuffer()));manifest.effects[name] = [file];console.log(`✓ ${file}`);
}
await saveManifest();
console.log(`\n${done} replik üretildi${failed ? `, ${failed} hata` : ''}. manifest.json yazıldı; maç bu sesleri bir sonraki açılışta kullanır.`);
