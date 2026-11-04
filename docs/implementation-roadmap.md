# V1 uygulama sırası

Mimari, envanter/puanlama, misafir oyuncu/profil/kayıt, iki takıma tıklayarak kadro seçimi, diziliş/taktik odası ve otomatik/elle kamera tamamlandı. Her adım çalışır ve incelenebilir bir sonuçla kapanır; sonraki adım aynı sözleşmeleri kullanır.

## 0. Mimari — tamamlandı

- [x] Ekran akışı ve veri/servis sözleşmeleri.
- [x] Misafir oluşturma ve uyum politikasının tanımı.
- [x] Beş dizilişin 11 slotlu konfigürasyonu.
- [x] Haftalık form, worker, tekrar kaydı ve kamera genişleme noktaları.
- [x] Uygulama adımları ve tip kontrolü.

## 1. Gerçek oyuncu envanteri ve puanlama — tamamlandı

Kaynak Markdown sürümlü JSON'a aktarıldı. 48 kişilik gerçek envanter, kaynaklı notlar, sabit ID'ler, arama/okuma adaptörü ve iki ondalıklı mevki puanlaması hazır. Önizleme oyuncuları envanterden çözülüyor. [Aktarım raporu](catalog-import-report.md).

Dosyalar: `data` altına importer ve catalog adapter; `domain` yanına puanlama fonksiyonları; `config` yanına mevki ağırlıkları ve kaynak ID eşlemesi; `scripts` altına aktarım betiği.

Kabul:

- [x] 48 kayıt, 43 saha oyuncusu, 5 kaleci; 12 özellik ve 7 uygunluk tam.
- [x] 258 mevki puanı iki ondalıkla yeniden hesaplandı; kaynağın tek ondalıklı gösterimleri ±0,05 payla doğrulandı.
- [x] Ömer için hesaplanan 75,05 kullanılır; kaynak 75,0 / 75,1 gösterimleri raporda/arşivde korunur. Ana roller kaynakla aynıdır.
- [x] İsimler ve ID'ler ayrı; mevcut 3D prova gerçek envantere bağlı.
- [x] Bozuk veri/puan, kaynak model değişikliği, isim çakışması, kaleci ayrımı ve önizleme entegrasyonu testleri.

## 2. Misafir oyuncu ekleme, profil ve yerel kayıt — tamamlandı

Üstte **Oyuncular** → **Yeni oyuncu** ile referans seçimi, isim, genel/iki çubuklu ölçek, canlı önizleme ve kaydet çalışır. Envanter kartından veya örnek kadrolardaki oyuncudan ortak profil açılır. İlk IndexedDB migration'ı ve misafir deposu hazırdır. Yerel oyuncu kayıtları bu tarayıcı/orijine aittir; tarayıcı verisi silinirse yerel kayıtlar da silinir.

Kabul:

- [x] `%95 Baran` yeni ID ve yeniden hesaplanmış özellik/rol puanlarıyla kaydolur; sayfa yenilendiğinde kalır. Örnek: Deniz, CM **76,63**.
- [x] Her özellik tam bir çubuğa bağlı; türetilen değerler sınırda ve iki ondalıkta.
- [x] Kaleci referansında yalnız genel çubuk ve kalecilik puanı.
- [x] Misafir kaydı isim bazlı kimya/form miras almaz; uyum etkisi profilinde ayrı gösterilir. Baz ratinge peşinen uygulanmaz.
- [x] Modal fare/klavye ile kapanır, odak geri döner; olmayan biyografik veri gösterilmez.
- [x] Yeni kayıt ancak IndexedDB transaction tamamlandığında başarılı sayılır; çift kayıt, kota/izin ve bozuk yerel veri hataları görünür sonuç döndürür.
- [x] Profil revizyonu: lacivert/antrasit tema, barsız ve renkli 20 üzerinden tam sayı gösterimi, rol yıldızları. Kayıt puanları iki ondalık olarak korunur.

## 3. İlk giriş: iki takıma tıklayarak oyuncu seçimi — tamamlandı

Ana girişte Mavi/Kırmızı takım blokları ve sağ envanter açılır. Saf seçim servisi, revizyonlu IndexedDB taslağı ve ekran denetleyicisi bağlandı. Profil ve misafir ekleme ortak oyuncu kütüphanesini kullanır. `#demo` hazır hareket provasıdır; seçilen kadroları maç motoru varmış gibi oynatmaz. Geçerli kadroları onaylamak `selection-confirmed` olayıyla değişmez taslağı sonraki adım için hazırlar; diziliş önericisi dördüncü adımda bağlanacaktır.

Kabul:

- [x] Oyuncular tık tık aktif takıma eklenir; arama, mevki ve boşta filtresi vardır. İlk ekranda sürükleme yoktur.
- [x] Tek oyuncu iki takımda olamaz, 11 sınırı geçilemez; dolu takım sessizce oyuncu değiştirmez. Her takımda tek gerçek kaleci bulunur.
- [x] Tek oyuncuyu çıkarma, takımı temizleme ve aktif takım değiştirme nettir. Maç tarihi ve seçimler yenilemede korunur.
- [x] Hızlı tıklamalar sırayla kaydedilir. Başka sekmedeki yeni revizyon ezilmez; depolama hatası ve yeniden deneme görünürdür. Kayıt tamamlanmadan kadro onaylanamaz.
- [x] Eksik oyuncu/kaleci durumunda açık gerekçe; 22 geçerli oyuncuda onay ve bir sonraki adım için teslim noktası.
- [x] Ortak profiller ve misafirler seçim ekranında erişilebilir. Misafir kendi kimliği ve uyum politikasıyla seçilir.
- [x] Demoda mavi/kırmızı formalar, beyaz/siyah kaleciler. En fazla beş bağlamsal isim; 9 px barsız/zeminsiz etiket, top sahibinde yeşil isim ve rengini koruyan mavi daire/kırmızı kare. İsim yerleşimi topun etrafında boşluk bırakır.
- [x] Seçim/persistans testleri, mevcut katalog ve misafir testleri, tip kontrolü, derleme ve tarayıcı kontrolü.

## 4. Önerilen dizilişler ve canlı takım değerlendirmesi — tamamlandı

Kaynak kimya kuralları kadro düzeyinde çalışır; tam rol eşleştirmesi ve iki takımı birlikte değerlendiren öneri worker'ı `#dizilis` taktik odasına bağlı. Barkuz kaleci modu seçimden taktiğe kadar taşınır. `tests/lineup.test.mjs` (22 test) ve 21 adımlı başsız Chrome akış denetimi geçti. Görseller: `preview-tactics-desktop.jpg`, `preview-tactics-phone.jpg`, `preview-team-selection-barkuz.jpg`.

Kabul:

- [x] Beş dizilişte tam 11 tekil atama ve gerçek kaleci slotu; saha oyuncusu yanlışlıkla kaleye atanmaz. Eşleştirme 10! permütasyonla doğrulandı.
- [x] Kullanıcı kendi oyuncularını koruyarak diziliş değiştirir; slotları sürükler veya iki kez seçer. Klavyede odak aynı düğmede kalır; aynı oyuncuya ikinci tık seçimi temizler.
- [x] Her değişiklikte iki takımın rol/pas/uyum/savunma/hücum göstergeleri güncellenir, nedenleri isimlerle açıklanır. Raporda atmosfer eşiği ve baz → maçlık değerler (20 üzerinden) yazılır.
- [x] Baran–Eren–Arif, Arif–Barkuz, Onur–Ömer, M.Emre–Tevfik, Eto eşleşmesi ve savunma desteği kaynak kurallarıyla denetlenir. Aynı partnerin desteği (M.Emre) iki kez sayılmaz; farklı iki güçlü partner normal +1 sınırında toplanır.
- [x] Eski worker cevabı yeni revizyona uygulanmaz; iptal ve geri dönüş çalışır. Yalnız aktif takım/tarih/isim değişimi elle düzenlenmiş dizilişi silmez; kadro veya Barkuz modu değişince yeniden önerilir.
- [x] Barkuz kalede Yusuf kalecilik puanını kullanır; Arif–Barkuz cezası uzun dağıtım PAS/GÖR değerine taşınır (18/17 → 17/16), kurtarış puanına dokunmaz. Dağıtımın maç aksiyonunda kullanımı 6. adımdadır.

Pregame bilinçli olarak tetiklenmeyenler: davranış (Göktuğ/Servan/Altuğ/Tevfik irritasyonu), skor (Utku, Akın), faz (Yankı) ve form günü kuralları. Bunlar `pendingRuleIds` olarak kalır ve 6. adımda motor olaylarına bağlanır.

## 5. Otomatik takip ve elle kamera — tamamlandı

`#demo` hareket provası yeni kamera yönetmenine bağlandı (`src/v1/rendering/camera-director.ts`, saf TS; `src/camera-input.js` fare/dokunma). Saha ve renkler korunur. Üç otomatik açı: **TV yayını** (ana tribün, orta saha hizası, ray üzerinde kayar), **Geniş** (sol yakın köşeden tüm saha), **Kale arkası** (hücum edilen kalenin arkası, kale önde). `tests/camera.test.mjs` (11 test) ve 17 adımlı başsız Chrome denetimi geçti. Görseller: `preview-camera-tv.jpg`, `preview-camera-wide.jpg`, `preview-camera-goal.jpg`, `preview-camera-phone.jpg`. Ayar değerleri `config/defaults.ts / CAMERA_POLICY` içinde; ilk tuning kararlarıdır.

Kabul:

- [x] Top ilerlerken kamera ilgili kaleye yaklaşır: TV yayını ray boyunca kayar ve son üçte birde daralır; kale arkası hücum edilen uca geçer (8 m histerezis, ana tribün üzerinden döner). Geniş/kale arkası seçenekleri çalışır.
- [x] Sol sürükleme açı/eğim, tekerlek ve iki parmak yakınlık, sağ tık / orta tık / Shift + sürükleme veya iki parmak kaydırma serbest konum. Paneldeki ⟲ ⟳ ▴ ▾ + − ve klavyede 1/2/3. "Otomatiğe dön" düğmesi ve çift tık; "Sıfırla" seçili açının varsayılanına döner.
- [x] Elle ayarlanan açı/yakınlık otomatik takipte korunur; kaydırma serbest moda geçirir, otomatiğe dönüşte açın kalır. Hazır açı düğmesi kendi açını sıfırlar. Duraklatılmış provada kamera hareket eder (sunum zamanı).
- [x] İsimler ölçülen HUD kutularıyla (skor tabelası, kamera paneli, başlık) çakışmaz. Kamera zeminin, tribünlerin ve arka duvarların altına girmez; dar ekranda balık gözü yerine geri çekilir.

## 5b. Küçük arayüz düzeltmeleri — tamamlandı

- [x] Taktik raporundaki "baz → maçlık değer / 20" paneli ve Barkuz notundaki sayılar kaldırıldı (hesap motor için duruyor).
- [x] Barkuz "Kaleci" düğmesi aç/kapa anahtarı (`role="switch"`).
- [x] Kadro kartında × yok: oyuncu satırına basınca havuza döner; profil için ayrı ↗.

## 5c. Yeni futbolcu görünümü — tamamlandı

Kullanıcı isteği: daha sade, az köşeli / düz yüzeyli (low-poly, flat shading) oyuncular; lacivert ve bordo forma, beyaz şort; Mamadou siyahi, diğerleri açıktan esmere dengeli; düzgün koşu; şutta hafif toz. Önce tek örnek gösterilir, onaydan sonra 22 oyuncuya uygulanır.

- [x] `src/lowpoly-player.js`: prizma gövde/uzuvlar, dikdörtgen kafa, uzun/orta/kısa/çok kısa saç (oyuncuya göre sabit), uyluk ortasının altına inen şort, diz/dirsek/bilek eklemleri, sırtta numara, oyuncuya göre saç ve renkli krampon. Koşu döngüsü kat edilen mesafeye bağlı (`strideCycleMeters`), ayak kaymaz; top alma, top sürme dokunuşu, pas/şut (geri çekiş → vuruş → devam), kaleci duruşu/uçuşu, sevinç.
- [x] `src/match-effects.js`: vuruşta hafif toz bulutu + çim parçaları + yer halkası, şut izinde kısa puflar, ağda ve yere düşüşte küçük toz. Maç zamanında çalışır (ağır çekimde yavaşlar).
- [x] `src/v1/config/appearance.ts` (3 test) ve `TEAM_KITS` (lacivert `#1d3766`, bordo `#76203a`, beyaz şort; kaleciler beyaz/siyah korunur).
- [x] Örnek sayfa `#ornek-futbolcu` (`src/player-study.js`): 9,5 sn koreografi, ¼×/½×/1×, anlara atlama, forma değiştirme, Yakın/TV/Geniş/Kale arkası kamera. Görseller: `preview-sample-*.jpg/png`.
- [x] Kullanıcı ayarı ve onayı: kafa %10 daha dar, boyun %20 uzun, şort dizin ~10 cm üstüne kadar. `#demo` 22 oyuncusu bu modele geçti (`src/scene.js`); pas/şutlarda vuruş ve top alma hareketi, vuruş tozu ve şut izi `DEMO_TOUCHES` üzerinden. Eski `src/player-model.js` artık kullanılmıyor.
- [x] Top: `src/match-ball.js`, beyaz zemin + altı lacivert yıldız panelli özgün maç topu (kullanıcı "Şampiyonlar Ligi topu gibi" istedi; tescilli UEFA tasarımı kopyalanmadı).
- [ ] UI vurgu renkleri (kadro kartı, taktik sahası, isim noktaları) hâlâ açık mavi/kırmızı; lacivert/bordo olup olmayacağı kullanıcıya soruldu, cevap bekleniyor.

## 6. Maç motoru: önce doğrulanabilir futbol

**Durum (3 Kasım 2026, üçüncü oturum): çalışıyor.** `src/v1/engine/simulation.ts` yarı yarı hesaplar (`simulateHalf`), worker'da koşar, 30 Hz tick / 5 Hz karar / 10 Hz kayıt; 60 dk maç (kullanıcı kararı). Kamera yönetmeni gerçek kareye maç ekranında bağlı (`src/match/match-renderer.js`).

- [x] Pas seçenekleri (kısa/uzun/ara/çapraz), şut, orta, top sürme, çalım, bacak arası (Mensur), uzaklaştırma; şut beklentisi ile uygulama aynı modelden; kaleci geometri/refleks/tutuş.
- [x] Faul, serbest vuruş, penaltı, korner, taç, aut, santra; ofsayt ve kart yok (kullanıcı kararı). Kafa golü formülü + Arif/Mensur/Taha/Servan özel.
- [x] Kişilik stilleri, solaklar, uzun pasçılar, Yankı/Servan tek başına koşuları, şans (direk, sekme, kaleci hatası, günün formu), ruh hali ve atmosfer; Barkuz uzun kanat dağıtımı.
- [x] Devre arası taşınan durum (RNG, skor, enerji, ruh hali, koşu planları); yeni dizilişle ikinci yarı.
- [x] Testler: `npm run test:engine`; kalibrasyon: `npm run calibrate:engine` (hedef medyan ~12 toplam gol, düşük skor çok nadir).
- Kullanıcı geri bildirimi turu: şut kararları/isabet dağılımı, gerçek duran top kurgusu (baraj, korner koşuları), kalecinin süpürmesi, "kaleci kendi kalesine" ve topun girmediği GOL hataları — ayrıntı `Hali_Saha_Tum_Kaynaklar_Birlestirilmis.md` 6b.

Sabit zaman, seed'li rastlantı, top/oyuncu hareketleri, karar puanlama, rakip baskısı, kontrol, pas/şut ve temel duran toplar. Kaynağın koşullu kimya, kişilik, yorgunluk ve misafir etkileri olaylara bağlanır. Önce küçük pozisyon senaryoları, ardından tam maç.

Kabul:

- Yüksek PAS/GÖR oyuncusunda uygun pozisyonda çapraz/ara pas; HIZ farkında yetişme farkı; kontrol/baskıda hatalı dokunuş.
- Her simülasyon yeni rastgele seed alır: aynı kadro ve dizilişle bile koşu, pas, olaylar ve skor farklı çıkabilir; aynı skor ancak tesadüfen gelir.
- Seed yalnız oynanmış maçın kaydı içindir: aynı seed ve aynı motor sürümü aynı olayları üretir, böylece geri sarma ve yeniden açma izleneni değiştirmez.
- Pas uyumsuzluğu anlaşmazlık olayında gerekçesiyle görülür; misafir uyumu yetenekten bağımsız sürekli ama ölçülü etki yapar.
- Topun konumu ile pasın/golün olay kaydı tutarlıdır; gol çizgisi, kurtarış ve maç saati kontrolleri geçer.

## 7. Arka plan hazırlığı, 3D gerçek maç ve kalibrasyon

Motor worker'a, çıktı replay deposuna, kayıtlar 3D adaptöre bağlanır. Kadro sunumu/sahaya çıkış gerçek hesaplama sürerken gösterilir. Skor dağılımları, seçilen kadrolar ve kullanıcı örnekleriyle ölçülür.

**Durum (üçüncü oturum):** `#mac` maç ekranı (`src/match/`): siyah açılış → oyuncular sahaya yürürken worker hesaplar → başlama vuruşu. "Özet · 10 dk" / "Özet · 5 dk" önemli anları gerçek hızda, duran toptan başlatarak gösterir (`highlight-edit.js`); 1×–8× tam maç. Zaman çizelgesi nötr önemli an işaretleri (skor sürprizi korunur). Devre arası kartı + diziliş editörü, maç sonu istatistikleri, "Özeti indir · 9:16" (yalnız goller, ≤60 sn, H.264 MP4). Envanter/oyuncu kartı tasarım dili.

- [ ] Maç kaydı IndexedDB'ye yazılmıyor; sayfa yenilenince maç yeniden oynanır (replay deposu ve "son maç" görünümü sonraki iş).
- [ ] İleri/geri sarma ¼× hızı yok (1×–8× var).

Kabul:

- Hesaplama sırasında arayüz akıcı; gerçek ilerleme, iptal/geri dönüş ve hata kurtarma çalışır.
- Sadece tam kayıt izlemeye açılır. Kota/yazma hatası başarı gibi gösterilmez.
- İleri/geri sarma ve ¼×–8× hız aynı sonucu/olayları korur; kaleci ve mücadele isimleri bağlama uyar.
- Olay seçimi oyuncu özellikleri, aktif kimya, baskı ve karar olasılığını açıklar.
- Birden çok seed ve dengeli/dengesiz kadro grubuyla gol/şut/pas/kurtarış dağılımı incelenir. Skor zorlanmaz; yüksek skorlu amatör maç profili ayarlanır.

## 8. Sonraki haftalar: form

Haftalık form girişi ve geçmiş görünümü eklenir. Zaten tanımlı `WeeklyFormRepository` ve snapshot alanları kullanılır; kalıcı puanlar ve eski maçlar yeniden yazılmaz. Misafir uyum politikasının otomatik silinmesi bu işin parçası değildir.
