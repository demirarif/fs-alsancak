# Eşzamanlı çalışma notu (3 Kasım 2026)

**Güncel durum:** Arayüz oturumu (1.–4. kısım düzeltmeleri) kullanıcının bildirdiğine göre bitti; son değişikliği 16:48'de `src/v1/features/match-prep.css`. O andan itibaren tüm dosyalar maç motoru oturumunun sorumluluğundadır. Aşağıdaki bölüm, iki oturumun aynı anda çalıştığı dönemin sahiplik kaydıdır.

## Maç motoru oturumu (6. aşama + maç ekranı + özet video)
Bu oturumun dosyaları:
- `src/v1/engine/*` (rng, runtime, football, simulation, replay)
- `src/v1/config/engine-tuning.ts`
- `src/v1/application/match-factory.ts`
- `src/v1/workers/simulation.worker.ts`
- `src/match/*` (maç ekranı, 3D izleyici, sahaya çıkış, önemli anlar kurgusu, devre arası, 9:16 özet video ve MP4 yazıcı)
- `tests/engine.test.mjs`, `tests/highlight.test.mjs`, `scripts/calibrate-engine.mjs`

Ortak dosyalarda yalnız küçük, işaretli eklemeler:
- `src/main.js`: `#mac` rotası; `#demo` ve `#ornek-futbolcu` rotalarının kaldırılması (kullanıcı demoyu arşivlemek istedi).
- `index.html`: `<main id="match-screen">` ve demo öğelerinin kaldırılması.
- `src/v1/domain/match.ts`, `src/v1/workers/protocol.ts`, `src/v1/config/chemistry-rulebook.ts`: olay türleri, worker mesajları, günün formu kuralları.
- `package.json`: `test:engine`, `test:highlights`, `calibrate:engine` komutları.
- Taktik ekranı değiştirilmez: "Yerleşimi onayla" düğmesine `main.js` içinden dinleyici eklenir, maç ekranı dizilişi IndexedDB'den okur.

## Arayüz oturumu (1.–4. kısım arayüz düzeltmeleri) — bitti
- `src/v1/features/**`, `src/style.css` kadro/taktik/profil bölümleri, `team-selection.css`, `lineup-review.css`, `player-library.css`.

Dokunmadan önce dosyayı yeniden oku; aynı dosyayı düzenlemen gerekirse küçük ve yerel değişiklik yap. `Hali_Saha_Tum_Kaynaklar_Birlestirilmis.md` değişirse `npm run import:catalog` çalıştır.

## 4 Kasım 2026, 15:20 — motor oturumu: telefon düzeni ve ortak üst çubuk (2. aşama)
Kullanıcının istediği 2. aşama (telefon/dar ekran düzeni ve ortak tasarım parçaları) bu oturumda yapılıyor. Değişen dosyalar:
- `src/v1/features/ui/design-system.css`: üç ekranın ortak üst çubuğu tek tanımda (eski `:has()` kopyaları `compact-selection.css`, `tactics-room.css`, `match-ui.css` başından kaldırıldı) + telefon kuralları.
- `src/v1/features/team-selection/compact-selection.css`, `src/v1/features/lineup-review/tactics-room.css`, `src/match/match-ui.css`, `src/v1/features/social-export/social-export.css`: dosya sonlarına `@media(max-width:720px)` blokları.
- `src/v1/features/team-selection/controller.ts`: havuz başlığına telefonda görünen takım anahtarı; `index.html`: üst çubuk düğmelerinde kısa/uzun etiket.
Oyuncu kartı/profil/portre dosyalarına (`player-card.css`, `player-kit.ts`, `src/assets/portraits/`) dokunulmuyor; o işi yapan oturum devam edebilir.

## 4 Kasım 2026, 15:50 — motor oturumu: TV kamerası ve GOL afişi (3. aşama)
Değişen dosyalar: `src/stadium.js` (tribün grupları, kale arkası koltukları), `src/v1/rendering/camera-director.ts` (`standsBehindCamera`, dikey ekran çerçevesi), `src/v1/config/defaults.ts` (`CAMERA_POLICY`), `src/match/match-renderer.js` (kameranın gerisindeki tribünü gizler), `src/match/match-ui.css` (GOL alt bandı), `tests/camera.test.mjs`.

## 4 Kasım 2026, 16:20 — motor oturumu: oynatma durumları, yavaş çekim, rastgelelik kaydı (4. aşama)
Değişen dosyalar: `src/match/match-screen.js` (oynatma durumları, 0,25×/0,5×, "Son pozisyon"), `src/match/match-ui.css` (alt çubuk), `src/v1/engine/rng.ts`, `src/v1/engine/simulation.ts` ve `src/v1/config/engine-tuning.ts` (faul vücut teması), `tests/engine.test.mjs`.

## 4 Kasım 2026, 17:20 — motor oturumu: yıldız baskınlığı, oyun durumu, orta saha (5. aşama)
Değişen dosyalar: `src/v1/engine/simulation.ts` (gol atan oyuncuya dikkat, çalımda kapatan ikinci adam, geride kalanın riski, orta sahanın topa sahipken yukarı çıkması ve geç koşusu), `src/v1/config/engine-tuning.ts` (`play` bloğuna yeni katsayılar, sürüm `engine-v1-tuning-6`). Ölçüm betikleri yalnız oturumun geçici klasöründe; proje dosyası eklenmedi.

## 4 Kasım 2026, 17:55 — motor oturumu: kişilik kuralları sahada, "neden oldu", mevki uyumu (6. aşama)
Değişen dosyalar: `src/v1/engine/runtime.ts` (takım kimyası maçta, devreye giren kurallar), `src/v1/engine/position-fit.ts` (yeni), `src/v1/domain/modifiers.ts` (`position-fit` katmanı), `src/v1/config/engine-tuning.ts` (`positionFit`, `personality.chemistryShare`), `src/v1/engine/simulation.ts` (kural olayları), `src/match/match-screen.js` ve `src/match/match-ui.css` ("Neden oldu?" paneli).

## 4 Kasım 2026, 18:10 — motor oturumu: maç arşivi/yedek, kaleci formu, 9:16 (7. aşama)
Değişen dosyalar: `src/v1/data/match-archive.ts` (yeni; mevcut `match-snapshots` deposunu kullanır, şema sürümü değişmedi), `src/match/match-screen.js` ve `src/match/match-ui.css` (maç sonu kartında arşiv penceresi), `src/v1/engine/runtime.ts` (kaleci haftalık formu), `src/match/highlight-export.js` (9:16 küçük yazılar), `src/v1/config/engine-tuning.ts` (`chemistryShare` .25).

## 5 Kasım 2026, 13:49 — motor oturumu: çevrimiçi sürüm (Cloudflare), yönetim paneli, ekranların pencereye sığması
Yeni: `worker/` (Worker, D1 şeması, hesap tohumu), `wrangler.jsonc`, `src/online/` (giriş, hesap menüsü, Günün maçı, Yönetim paneli, planlama, API), `src/v1/online/` (kullanıcı adları, puan kuralları, kayıt biçimi), `src/match/broadcast-plan.js`, `src/match/reel-trim.js`, `tests/online.test.mjs`.
Değişen ortak dosyalar: `src/main.js` (giriş ve roller, `#gunun-maci`, `#yonetim`, `#yayin/<id>`), `index.html` (iki yeni `<main>`), `src/match/match-screen.js` (canlı yayın modu), `src/v1/features/team-selection/{controller.ts,compact-selection.css}` ve `src/v1/features/lineup-review/{controller.ts,tactics-room.css}` (dar ekranlar pencereye sığar, telefonda görünüm/takım düğmeleri), `src/v1/features/ui/design-system.css` (`#app` en az yükseklik kaldırıldı). Üst çubuğun sağ ucu kadro/taktik adım çubuğunundur; oraya düğme eklenmez.

## 5 Kasım 2026, 15:30 — motor oturumu: bahisler (sonradan adı Alsancak coin), gözlemciler
Puan oyunu kalktı (`src/v1/online/scoring.ts` silindi), yerine `src/v1/online/markets.ts` (bahis türleri, oran önerisi, oran hareketi, "her sonuçta kazandıran" bahis takımı yasağı, ödeme ve %30 kayıp bonusu; Worker da bunu kullanır). Yeni: `src/v1/workers/odds.worker.ts` ve `src/online/odds-runner.js` (oran için aynı dizilişlerle çoklu simülasyon). Değişen: `worker/schema.sql` (bets, ledger, requests; kullanıcıda kind/listed), `worker/index.ts`, `worker/make-seed.mjs` (gözlemciler ece/zeynep, açılış dinarı), `src/online/{today-screen,admin-screen,planner,match-record,api}.js`, `src/online/online.css`. Yerel D1 tabloları yeniden kuruldu.
Aynı gün: Yönetim paneli menülü bölümlere ayrıldı (Simülasyon, Bahisler, Sonuçlar, Oyuncular, Gözlemciler). `src/main.js` artık `#yonetim/<bölüm>` adreslerini de Yönetim paneline yönlendirir (`admin.open(bölüm)`); `src/online/account-menu.js` geçerli öğeyi önekle eşler. Admin'e özel maç kasası `/api/state` içindeki son maçlarda `house` alanı.

## 5 Kasım 2026, 16:50 — motor oturumu: yayına alındı, site girişe kilitlendi
Canlı adres https://alsancak.alsancak-match-preview.workers.dev (D1 ve KV gerçek veride; örnek maç silindi, veritabanı 51 hesapla temiz). `wrangler.jsonc` `run_worker_first: true`: her istek önce Worker'a gelir; oturum yoksa `worker/index.ts` içindeki ayrı giriş sayfası, dosyalar 401. `requireUser` ilk şifreli oturumu yalnız `/api/password`'a bırakır; `login_failures` tablosu (şema sonuna eklendi) yanlış şifre kilidi. Uygulamaya yeni bir statik dosya eklenirse o da oturumla gelir; giriş sayfasına bağlı bir dosya eklenmez (giriş sayfası kendi içinde).


## 5 Kasım 2026, 19:45 — motor oturumu: kuponlar, kupon düzenleme/iptal, admin bakiye ve saat, telefonda yayın
- Kupon: `src/v1/online/markets.ts` (`COUPON`, `couponPossible`, `couponQuote`, `packSample`/`unpackSample`, `settle` kuponu seçimleriyle öder, `covers` kuponları da sayar). Oran simülasyonları planlamada `PUT /api/admin/matches/:id/samples` ile KV'ye (`samples:<id>`) gider; kupon oranı sunucuda bunlarla hesaplanır (`POST /api/matches/:id/quote`, bahis `POST /api/matches/:id/bets` `{legs, stake, replaces?}`; kupon satırı `market_id = 'kupon'`, seçimler `bets.legs` JSON — şemaya `ALTER TABLE bets ADD COLUMN legs TEXT` eklendi).
- Düzenleme/iptal: `replaces` ile yeni kupon tek işlemde yazılır, eskisi `withdrawn` + `refund:<id>`; `POST /api/bets/:id/cancel` başlamadan iade. `withdrawn` hiçbir listede yok; bütün "geçerli bahis" sorguları `status NOT IN ('void', 'withdrawn')` (yeni sorgu yazarsan bunu kullan).
- Admin: `POST /api/admin/users/:login/balance` `{balance}` ya da `{add}`, `POST /api/admin/balances` `{add, who}`, `POST /api/admin/matches/:id/time` `{kickoffAt}`; Yönetim panelinde formlar (`src/online/admin-screen.js`).
- Oyuncu sayfası (`src/online/today-screen.js`): fiş birden çok seçim tutar, oranı sunucudan ister (250 ms sonra), kupon kalemleri Kuponlarım'da ve "Bu maçtaki kuponların"da; Düzenle/İptal et başlamadan.
- Giriş sayfasına uygulamanın satır içi simgesi eklendi (girişsiz `/favicon.ico` 401 vermesin).

## 6 Kasım 2026, 19:30 — motor oturumu: hafif sunucu, yayın kurgusu v2, portreler WebP (kullanıcı onaylı)
- **Portreler (diğer oturumun dosyaları, kullanıcı onayıyla: "olur portleri webp'ye çevirelim, kalitesi önemli değil"):** `src/assets/portraits/*.png` → 448×560 WebP, kalite 70 (13 dosya 23,8 MB → 0,29 MB); `player-kit.ts` artık `.webp`. 1122×1402 PNG asılları `archive/portraits-png/` altında, silinmedi. Yeni portre eklenirse aynı boyda WebP olarak eklenmeli. Portre `<img>`'leri `loading="lazy"` (gizli kadro ekranındakiler inmez).
- **Yayın kurgusu v2** (`src/match/highlight-edit.js` `EDIT`; v1 = `EDIT_V1`, eskisiyle birebir aynı, testli): duran toptan gelen an top ölmeden 5 sn önce başlar, 3 sn'den kısa bekleyiş kesilmez, 8 sn'den yakın anlar birleşir, bütçe ekranda görüneni sayar. `stoppages` artık `highlight-edit.js`'te (`broadcast-plan.js` yeniden dışa veriyor), `playedPieces` kesme kuralı. Kayıt `edit` alanını taşır (`broadcastEdit`: plan, parçalar, duruşlar); `match-record.js` `live` kopyasını üretir (`trimForLive`), planlayıcı `PUT /api/admin/matches/:id/live` ile yükler.
- **Maç ekranı:** yayın kayıttaki kurguyla oynar (yoksa v1); kırpılmış kopyada hız/zaman çubuğu maç sonunda da kilitli, maç sonu kartı "Özeti izle"ye götürür; telefonda skorun yanında saat (`.match-scoreboard.is-live`). Kural duyurularının sayıları `commentary.js` `withoutEffect`/`announcedRule` ile gizli (motor metni aynı).
- **Sunucu:** `meta` sürüm sayacı + tetikleyiciler, `users.balance`/`users.bet_count`, `matches.settling_at` (yalnız ekleme: `worker/migrations/2026-11-06-state-rev.sql`; yeni veritabanı için `schema.sql`). `/api/state?v=` → `{same:true}`; `/api/recent?before=`; `GET /api/matches/:id/live` (yayında herkese, sonra yalnız admin; `recording` yalnız admin); `reel` oyunculara 3 gün, admin'e 7 gün; bahiste `seen` oranı (düştüyse 409 `{changed, odds, legs}`).
