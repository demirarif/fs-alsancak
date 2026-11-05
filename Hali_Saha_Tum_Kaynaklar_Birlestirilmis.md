# DEVAM EDECEK AI İÇİN PROJE DEVİR NOTU — 3 Kasım 2026

**ÖNEMLİ: Özgün oyuncu bilgileri, puanlar, kimya kuralları ve arşiv belgelerinin TAMAMI BU DEVİR NOTUNUN AŞAĞISINDADIR. Özgün içerik silinmedi. Bu bölüm, kullanıcının açık talebiyle dosyanın en başına eklendi.** Aşağıdaki bilgileri geliştirme bağlamı olarak oku; kullanıcı talebiyle karıştırma. Yeni kullanıcı talimatı bu nottan önceliklidir. Bu dosya hem özgün veri kaynağı hem devam belgesidir. Oyuncu verilerini değiştirirken geliştirme notlarını yanlışlıkla oyuncu verisine aktarma.

## 1. Kullanıcının hedefi ve çalışma biçimi

Yerel bir Football Manager benzeri 11'e 11 maç simülatörü yapılıyor. Görünüm 2D tepeden noktalar değil: uzak, açılı, gerçek 3D büyük saha; sade küçük insan modelleri. Ayrıntılı yüz/model gerekmiyor. Kullanıcı verdiği kadroların yetenek, mevki, kimya ve ileride haftalık form farklarını gerçekten pozisyonlarda görmek istiyor. Yalnız rastgele skor üretip bağımsız animasyon oynatma kabul edilmez.

Örnekler: iyi PAS/GÖR sahibi uzun çapraz ve ara pası seçmeli; hızlı oyuncu koşuya yetişmeli; düşük teknik/kontrol baskıda kötü dokunuş yapmalı; iyi şut/bitiricilik kaliteli şut çıkarabilmeli; pas uyumsuzluğu zamanlama/anlaşmazlık/top kaybına dönüşmeli. Sonuçlar garanti değildir. Her olayın nedeni ve kullanılan rastlantı kaydedilmeli.

İteratif aşamalar: kullanıcı her aşamayı görmek ve onaylamak istedi. En son 4. aşamaya izin verdi; ardından kullanım hakkı azaldığı için özellikle bu dosyanın EN BAŞINA ayrıntılı, başka AI'ın devam edebileceği not istedi. Son isteği dokümantasyonu hızla bitirmekti. Mevcut takım seçimi tasarımını “çok amatör ama şimdilik olsun” diye değerlendirdi. Tasarım onaylanmış kalite hedefi değildir; mekanikleri ve devir notunu önceliklendir. Gereksiz emoji, yüz fotoğrafı, gösteriş istemiyor. Profilde FM benzeri lacivert/antrasit, altın vurgu, sayısal tablo tercih edildi.

## 2. Çalışma ortamı, komutlar, sınırlamalar

**Devirden hemen önceki son kontrol:** Bu önsöz eklendikten sonra katalog başarıyla yeniden üretildi: yine 48 oyuncu (43 saha, 5 kaleci), 258 mevki puanı. Mevcut 47 test yeniden çalıştırıldı ve hepsi geçti. Yeni optimizer ayrıca Node üzerinde gerçek demo kadrolarıyla smoke testinden geçti: iki geçerli 4-2-3-1 ve takım başına beş alternatif üretildi; `validateLineups` onayladı. Bu smoke test tarayıcı/Worker/drag-drop kabul testinin veya yeni Barkuz testlerinin yerine geçmez. Bu notun son güncellemesi hash'i tekrar değiştirebildiği için katalog son yazımdan sonra tekrar üretildi.

- Proje: `C:/Users/arifdemir/Desktop/fs-alsancak`. PowerShell/Windows; Git deposu yok. Yerel uygulama, buluta yayınlama talebi yok.
- Node 22.14, Vite 8.3.5, Three.js 0.187, TypeScript 7.0.2; `fake-indexeddb` test bağımlılığı. `package.json` gerçek komut kaynağıdır.
- `npm run dev` yerel sunucuyu 127.0.0.1:5173'te açar. Sunucu zaten çalışıyor olabilir; önce kontrol et. Node/Vite komutunda açık port gerekiyorsa `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort`. PowerShell/npm argüman aktarımı önceki denemede portu kök klasör sanıp 404 vermişti.
- `npm run check:architecture`, `npm run test:catalog`, `npm run test:guests`, `npm run test:selection`, `npm run check:catalog`, `npm run import:catalog`, `npm run build`.
- Testler doğrudan `node --experimental-strip-types tests/...test.mjs` çalışır. `node --test` alt süreç açması sandbox'ta EPERM verebilir; bu nedenle scriptler doğrudan çalıştırılır.
- 4. aşamadan önce 17 katalog + 18 misafir + 12 seçim = 47 test geçti, tip kontrolü ve build geçti. 4. aşama eklemelerinden sonra tip kontrolü tekrar geçti. Yeni 4. aşamanın kapsamlı testleri ve tarayıcı doğrulaması henüz tamamlanmadı; bu farkı gizleme.
- Son 4. aşama build denemesi Worker importu sırasında Vite'ın Windows `optimizeSafeRealPathSync` alt süreç çalıştırmasında **spawn EPERM** ile durdu. Bu bir sandbox/ortam engeli olabilir; gerçek derleyici kod hatası gibi varsayma. Normal terminalde veya uygun sandbox izniyle build'i tekrar dene. Başarılı olmadan “derleme geçti” deme.
- Üç boyutlu bundle yaklaşık 566 KB; boyut uyarısı önce de vardı. 3D sahne dinamik yükleniyor; kadro ekranında çizim durur.
- Tarayıcı QA için desteklenen `mcp__cua_repl` kullanıldı. Tarayıcı IAB ID 2. `cua.getTab` bazen `browser.user is unavailable` diyor; `cua.createBrowserTab('iab','http://127.0.0.1:5173/',{visible:true})` çalışmıştı. Son önceki teslim sekmesi 5'ti; ID'yi doğrula. Büyük data:URL hata sekmesini envanterle dökmekten kaçın.
- 1440×900/1000 masaüstü ve 390×844 dar genişlik denenmişti; 3. aşamada yatay taşma yoktu. Ekran görüntüsü kaydetmek için `tab.screenshot({fullPage:false})` ve Node fs ile gerçek dosyaya yazma kullanıldı. `getScreenshot()` native panelde kırpılabiliyor. Geçici viewport override'ını teslimden önce resetle, tabı `markDeliverable()` yap.

## 3. Kaynak veri ve ölçekler — çok kritik

Bu dosyanın aşağıdaki özgün arşivinde 48 gerçek oyuncu, 43 saha oyuncusu, 5 gerçek kaleci bulunur. 12 saha özelliği, 7 mevki uygunluğu; 258 saha mevki puanı var. Kalecilerin 12 saha özelliği kaynakta YOK; uydurma. Sabit ASCII ID ile isim ayrı tutulur. Örneğin `goktug` ile `hakan-goktug`, `eren` ile `eren-emeksiz` aynı kişi değildir. İsim substring'iyle kimya eşleştirme.

- Temel özellikler ve uygunluk 1–10, ondalık hassasiyet korunur. Hesaplanan rol puanları 0–100 ve iki ondalıktır. Kaynaktaki bazı tek ondalık farklar veri hatası değildir; kullanıcı bunu açıkça belirtti.
- Kullanıcının son gösterim tercihi: profil ve kartlarda özellik/uygunluk **20 üzerinden tam sayı** (`round(v*2)`), rol seviyesi `round(rating/5)`. Kayıtları 20'ye çevirme veya yuvarlayarak bozma.
- 16–20 yeşil; 10–15 sarı; 1–9 kırmızı. Özellik barı yok. Rol yıldızları mutlak 0–100 seviyeden beş yıldız/yarım yıldız olarak üretilir.
- Rol formülü `src/v1/domain/ratings.ts`, ağırlıklar `config/rating-model.ts`: %92 yetenek, %8 uygunluk. Tercih edilen ana mevki kaynak seçimi; sayısal başka rol daha yüksek diye değiştirme.
- `scripts/import-catalog.mjs` bu dosyanın TAM byte SHA-256'sını kullanır. Bu yeni devir notu başa eklendiğinden kaynak hash değişir: **`npm run import:catalog` ardından check/test/build çalıştırılmalı.** Özgün veriler aynı kalmasına rağmen katalog sürümü değişebilir. Kalıcı misafirlerin referans sürümü eski kalabilir; bu provenance bilgisidir, silme.
- Üretilenler: `src/v1/data/generated/player-catalog.json`, `catalog-import-report.json`, `chemistry-source.json`; rapor `docs/catalog-import-report.md`. Importer bütün kaynak ilişkileri metin olarak korur; `chemistry-source.json` hâlâ `source-only` arşivdir. Yeni çalıştırılabilir kural kitabı ayrı dosyadadır.

## 4. Tamamlanan önceki aşamalar (0–3)

0: `src/v1` altında domain, application, data, workers, engine, renderer ve feature sözleşmeleri; beş dizilişin 11 slotlu tanımları; form/replay/snapshot genişleme alanları. `docs/architecture.md`, `docs/implementation-roadmap.md` detaylı mimari kaynağıdır.

1: Katalog importer, kaynak doğrulama, immutable katalog/index, Türkçe aksan duyarsız arama ve iki ondalıklı puanlar. Tüm gerçek isimler ve kimya metni korundu. Ömer'in canonical puanı 75,05; farklı kaynak gösterimleri raporda durur.

2: Oyuncu envanteri, ortak profil modalı, referanstan misafir oluşturma, kalıcı IndexedDB kaydı. Genel yüzde veya fiziksel/teknik-oyun ayrı yüzde; aralık %60–120, başlangıç %95. Fiziksel hız/dayanıklılık/güç; kalan dokuz özellik teknik/oyun. Kaleci referansında yalnız genel yüzde ve mevcut kalecilik puanı. Yeni ID, tekrar hesaplanan rol puanları, kopyalanan uygunluk/rol alışkanlığı. İsim bazlı özel kimya ve haftalık form misafire kopyalanmaz. Başarı ancak transaction commit sonrası gösterilir. Modal klavye/fokus/kaçış ve HTML kaçışları var.

Misafir politikası `config/defaults.ts`: pas alma aday faydası ×0,94; efektif pas −0,3, görüş −0,3, pozisyon −0,2; ilk kontrol hata olasılığı `min(1,p0*1.08,p0+0.03)`. Bu pas yasağı değildir. GK etkisi dağıtım/iletişimde, kurtarış ratinginde değil. Baz stat değişmez; haftalar geçtikçe otomatik sıfırlanan uyum yok. Motor henüz bunları uygulamıyor. Tarayıcıda örnek `Deniz` (%95 Baran, CM 76,63 → ekranda 15/20) kayıtlı olabilir.

3: Ana giriş Mavi/Kırmızı takım, sağ envanter. Aktif takım başlığına tıkla, oyuncuya tıkla ekle; ilk ekranda drag/drop yok. Takım başına 11, tek gerçek kaleci, iki takımda yinelenen ID yok. × çıkarır; Temizle yalnız takım seçimini boşaltır. Profil ve misafir erişimi, arama/mevki/boşta filtreleri, maç tarihi. Revizyonlu immutable seçim; hızlı tıklamalar kayıt kuyruğunda sırayla commit olur. Yenilemede takım ve aktif seçim gelir. Başka sekme daha yeni revizyonu ezemez; bozuk kayıt sessizce silinmez. Onay kayıt bitmeden açılamaz.

3D demo ayrıca güncellendi: mavi/kırmızı formalar; kaleciler beyaz/siyah. En fazla 5 bağlamsal isim, zeminsiz 9 px (küçük ekranda 8 px), top sahibi yeşil; takım işareti rengini koruyan mavi daire/kırmızı kare. Etiket yerleşimi top çevresini boş bırakır. Mevcut demo 72 saniyelik **hazır hareket sekansıdır**, maç sonucu hesaplamaz; seçili gerçek kadroları oynamaz. Bunu gerçek motor diye sunma. Demo örnek 22 gerçek katalog oyuncusunu kullanır. Kullanıcının son kadroları bu demo isimlerinden bağımsızdır.

## 5. YENİ ÖZEL TALEP: Barkuz kaleci modu — ASLA UNUTMA

Yalnız **Barkuz** için basit **Kaleci** aç/kapa düğmesi istenmiştir. Kapalıyken asıl saha oyuncusu/forvet özellikleri kalır. Açıkken kaleci olur ve **Yusuf ile aynı/benzer kalecilik seviyesini** kullanır. Mevcut kaynakta ayrıntılı GK statları olmadığından Yusuf'un tek kalecilik ratingi ve GK uygunluğu alınır; yeni kurtarış/refleks statları uydurulmaz.

Kaleciyken özel yeteneği: **oyun kurarken orta sahanın ilerisindeki kanatlara uzun ve isabetli pas atabilmek**. Genel kurtarış ratingini artırma; bütün paslarını mükemmel yapma. Mesafe/hedef/oyun fazı/alan/baskı/alıcı koşusu ve rakip kesmesi dikkate alınmalı. Aynı oyuncunun ID'si `barkuz` olarak kalır; Yusuf kimliğine veya misafire dönüşmez. Arif–Barkuz kilitli ilişkisi kaybolmaz.

Yazılan uygulama:

- `SelectionDraft.barkuzGoalkeeper?: boolean`, komut `set-barkuz-goalkeeper`. Eski kayıtlar alan yoksa kapalı olarak uyumludur. Toggle seçimin revizyonunu artırır ve kalıcı kaydolur.
- `domain/match-players.ts / resolveMatchCatalog`: kaynak kataloğu değiştirmeyen maçlık overlay. Yusuf GK ratingi; `goalkeeperReferenceId:'yusuf'`; `specialAbilities` içinde `accurate-long-wide-distribution`.
- Başlangıç özel yetenek parametreleri: pas 9/10, görüş 8,5/10; en az 30 metre, hücum yönüne göre x>0,5, kanat z≤0,25 veya z≥0,75. Bunlar makul ilk tuning kararları, kullanıcının verdiği kesin sayılar değil. `engine/keeper-distribution.ts` hedefe göre bu yeteneği döndürür; **henüz çalışan maç motoruna bağlı değildir**.
- Seçim envanterinde ve seçili Barkuz satırında yalnız ona ait Kaleci düğmesi eklendi. Başka kaleci varken aktif etmek açık hata verir; sessizce diğer kaleciyi atmaz. Önce mevcut kaleciyi çıkar, sonra Barkuz'u aç.
- Seçim servisi GK doğrulamasında resolved katalog kullanır. Taktik ekranı/profil de resolved katalog kullanır. Genel oyuncu kütüphanesi asıl katalogla kalır; misafir fabrikasını maçlık overlay ile bozma.
- Kaleci modunu motor snapshot'ına resolved oyuncu ve yetenekle taşımak zorunludur. Snapshot factory henüz uygulanmadı; bu bağlantı sonraki AI'ın görevi.

## 6. 4. aşama — TAMAMLANDI (3 Kasım 2026, ikinci oturum)

**4. aşama kapandı ve kullanıcıya lokalde gösterildi.** Yeni `tests/lineup.test.mjs` (22 test, `npm run test:lineups`) ile toplam 69 test geçer; tip kontrolü ve `npm run build` geçti, `dist` yeniden üretildi. Başsız Chrome ile 21 adımlı akış denetimi geçti: Barkuz düğmesi yalnız Barkuz'da, iki kaleci bloklaması, onay → #dizilis, worker sonucu, tıkla-tıkla/klavye/sürükle-bırak takası, kaleci ve takımlar arası takas yasağı, 5 diziliş, öneri uygulama, yenileme, aktif takım değişimi, kadro değişimi, eksik kadroyla doğrudan #dizilis, hızlı geçişte eski hesap, 390 px taşma, konsol hatası yok. Görseller: `preview-tactics-desktop.jpg`, `preview-tactics-phone.jpg`, `preview-team-selection-barkuz.jpg`.

**Dev sunucu uyarısı:** 5173'te önceki oturumun kısıtlı ortamında açılmış eski Vite süreci, worker importunda `spawn EPERM` verip taktik ekranını 500 ile kırıyordu; kod hatası değildi. Güncel sunucu 5174'te açıldı (`node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort`). IndexedDB port bazlıdır: 5173'te kurulan kadrolar 5174'te görünmez. Eski süreç kapatılırsa 5173'te yeniden açılabilir.

Bu oturumda düzeltilenler (aşağıdaki eksik listesinin 1, 2, 3, 5'in pregame kısmı, 6'nın taktik kısmı, 7, 8, 9):
- M.Emre çift sayımı: `*-defensive-cover` artık M.Emre'yi partner saymaz; M.Emre desteği kendi kuralıyla bir kez +0,5. Farklı ikinci güçlü savunmacı normal +1 cap içinde ayrıca eklenir (kaynak: “Savunma güven ağı M.Emre + Berkin → DEF +0,5”).
- Barkuz GK: `assessLineups().keeperDistribution` uzun dağıtım PAS/GÖR'üne pair modifierlarını uygular (Arif ile 9/8,5 → 8,5/8). Kurtarış/kalecilik puanı değişmez. Motor aksiyonunda kullanımı 6. aşamada.
- Atmosfer: `TeamEvaluation.atmosphere` iyi/nötr eşiği isimlerle; Arif, Barkuz ile aynı takımdayken stabilizatör sayılmaz. Pregame aktif negatif kaynak üretilmez.
- `domain/lineups.ts / rebaseLineupDraft`: yalnız aktif takım/isim/tarih değişince kayıtlı diziliş korunur; roster veya Barkuz modu değişince yeniden önerilir.
- Taktik UI: aynı slota ikinci tık seçimi temizler; geçersiz takastan sonra vurgu kalmaz; render sonrası klavye odağı korunur; eksik kadroyla #dizilis worker açmadan açıklama gösterir; raporda “baz → maçlık değer / 20” listesi.

Önceki oturumun ilk notu (tarihsel):

- `domain/assignment.ts`: 10 saha oyuncusu için bitmask DP ile tam maksimum rol ağırlıklı eşleştirme. Kaleci GK'da sabit. `config/formations.ts`: 4-2-3-1, 4-3-3, 4-4-2, 3-5-2, 5-3-2. Yerleşim anchor'ları hücum yönünde x=0 kendi kale, x=1 rakip kale; z enine 0–1.
- `application/lineup-optimizer.ts`: beş dizilişi iki takım için üretir, 25 karşılıklı kombinasyonu değerlendirir; seçilen çiftte birkaç yer değişimiyle kimya/rol yerleşimini iyileştirir. Tam global kombinasyonel kimya optimumu garanti edilmez. Alternatifler hesaplanmış rol/kimya puanına göre sıralanır.
- `workers/optimizer.worker.ts`: worker hesabı. UI her hesapta runId + selectionRevision kontrol eder, önceki worker'ı iptalde terminate eder; eski cevap yeni kadroya uygulanmamalıdır.
- `application/lineup-service.ts`: change-formation, swap-slots, apply-suggestion; her sonuç roster/slot/GK doğrulamasından geçer. Kadro oyuncuları değişmez; GK saha rolüne takas edilemez. Diziliş değiştirmek yeni forma göre rol eşleştirmesini tekrar kurar.
- `domain/lineups.ts`: kaydedilmiş şekil + semantik doğrulama; 11 tekil slot, seçilen 11 oyuncu, gerçek GK slotu, seçim ID/revizyon eşleşmesi.
- `data/local-lineups.ts`: IndexedDB lineup-drafts, seçim revizyonunu aynı transaction'da kontrol; sıra dışı/stale kayıtları ve başka sekme çakışmasını reddetme. UI otomatik kayıt kuyruğu ve retry içerir.
- `features/lineup-review/controller.ts` + CSS: `#dizilis` taktik odası; iki saha, diziliş dropdown'ları, alternatif öneriler, native drag/drop ve iki oyuncuya sırayla tıklayarak takas; profil açma, canlı iki takımın beş metriği, kaynaklı etki açıklamaları ve uyarılar. Yerleşimi onaylamak kayıt onayıdır; maç motoru bağlı gibi davranmaz.
- `src/main.js`: selection-confirmed → #dizilis rotası. Taktik ekranından #kadrolar'a geri; #demo ayrı. `index.html` içine #lineup-screen eklendi. Yenilemede kayıtlı diziliş yüklenip mevcut seçim revizyonuyla doğrulanır; geçersiz/eskimişse yeniden önerilir.
- `config/chemistry-rulebook.ts`: çalıştırılabilir, kaynak referanslı kurallar; `domain/lineup-evaluation.ts`: rol/komşuluk/karşı takım/eşleşme ve etkili statlar. Bu yeni sistem tüm maç içi olayları henüz çalıştırmaz.

### 6.1 Değerlendirme ve kaynaklı kurallar

Kalıcı baz statlar değişmez. Normal bonuslar özellik başına +1, cezalar −1 ile sınırlanır; kilitli kurallar sonra uygulanır ve kaynak gereği 10 üstü efektif değer korunabilir. Efektif statlar `EffectiveAttributes` içinde bazdan ayrıdır. Haftalık form alanı desteklenir fakat UI şu an `forms:[]` gönderir.

Aktif pregame örnekleri: Alper–Taha +0,5 PAS/GÖR; Baran–Eren +0,5; bağlantılı oyun kurulumunda Baran–Eren–Arif üçlü +0,5 ve ikiliyle stack olmaz; Arif–Barkuz −0,5 PAS/GÖR ve −1 atmosfer, iyi ortam bunu silmez; Onur–Ömer aynı takımda 12 stat +1, karşı takımda −0,5; M.Emre yokken Tevfik atmosfer −0,5. Çevre pas kalitesi, savunma partneri, Hakan'ın güçlü stoper partneri, Eto'nun rakip hız/güç mismatch'i, İsmail'in teknik çekirdeği gibi yerleşim koşulları yazıldı.

Kaynakta nitel olan “bağlantılı” için başlangıç kararı: normalize anchor mesafesi ≤0,46; güçlü pas/görüş her ikisi ≥8; güçlü savunmacı DEF≥7,5; güçlü partner GÜÇ≥8. Bunlar açık uygulama eşikleri, kaynakta kesin sayıyla söylenmiş her kural değil. Formasyon veya slot değişimiyle bağlantılar değiştiği için puanlar da değişir.

Beş gösterge 0–100 açıklanabilir tuning göstergesidir, kazanma olasılığı değil: rol gücü; yakın pas ağının PAS/GÖR/KONTROL kalitesi; uyum/isim ilişkisi/mevki/misafir; savunma/orta saha/GK ve rakip tehdit; hücum bitiricilik/şut/koşu/pas desteği. Optimizasyon bileşik ağırlıkları %45 rol, %20 pas, %15 uyum, %10 savunma, %10 hücum. Bu ağırlıklar ileride kalibre edilmeli; gerçek maç sonuçlarının yerine kullanılmamalı.

**Önemli eksikler/denetimler (önceki oturumun listesi; durumları yukarıda, kalanlar 4., 5'in maç içi kısmı ve 6'nın form kısmıdır):**

1. Yeni Barkuz + 4. aşama için davranış testlerini yaz/çalıştır; UI worker, yenileme, takas, 5 diziliş, iki takım skorunun güncellenmesi, kaleci yasağı ve stale cevapları tarayıcıda doğrula. Build EPERM engelini çöz.
2. Savunma desteğinde genel “güçlü savunmacı yanında” ve ayrıca M.Emre desteği aynı fiziksel partnerden iki kez +0,5 sayılabilir. Kaynak aynı desteği yineliyorsa exclusion group/dedup ile düzelt; genel cap bunu tamamen çözmüş sayılmaz. Teknik çekirdek ikili/üçlü exclusion zaten yazıldı.
3. GK Barkuz'un Arif ile pas/görüş cezası açıklama logunda bulunur fakat GK'nin sparse 12 statı olmadığı için uzun dağıtım hesabına ayrıca taşınmalıdır. Mevcut pregame pas metriği GK'yi pas ağının dışında tutar; özel uzun dağıtım katkısını henüz saymaz. Kurtarış puanını düşürmeden bunu motorun dağıtım aksiyonuna uygula.
4. Pregame evaluator davranış/phase/score/atmosphere tetiklerini olmuş saymaz. Yankı hücumda HIZ=10/PAS=1, Utku önde/geride, Akın clutch, Servan/Göktuğ tartışma vb. rulebook'ta kısmen tanımlı ama temporal motor uygulaması yok. Kaynaktaki bütün kişi modifierları henüz çalıştırılabilir kurala çevrilmiş değildir. Aşağıdaki özgün tabloları eksiksiz tek tek karşılaştır.
5. Pozitif stabilizatör sayısı uyuma katkı verir; tam aktif negatif davranış sayacı, güçlü/hafif kaynak dengesi, atmosfer good/bad ve hassas oyuncu zinciri henüz tamamlanmadı. Sırf Göktuğ/Servan kadroda diye otomatik kavga cezası verme.
6. Taktik profilleri ortak baz/resolved oyuncu profilini açar; aktif modifierların baz/efektif yan yana profil gösterimi henüz yok. Haftalık form editörü, sürüm kaydı ve optimizasyona gerçek form yükleme henüz yok.
7. Taktik UI'nin yeniden render'ında klavye odağı ve native drag/drop'un gerçek tarayıcı davranışı özel olarak kontrol edilmeli. Drop kaleci/saha ve çapraz takım değişimine izin vermemeli.
8. Seçim revizyonu aktif takım değişiminde de artıyor. Kadroya dokunmadan yalnız aktif takım değiştirmek eski taktik taslağını invalid edebilir. Gerekirse roster fingerprint ile yalnız UI değişikliklerinde atamaları güvenli rebase et; stale motor sonuçlarını kabul etme.
9. Doğrudan #dizilis açılışı, eksik kadro, storage failure/conflict retry ve kayıt kuyruğunda ekran değişimi test edilmeli. Üretim derlemesi doğrulanmadan dist klasörünü güncel teslim sanma.

## 6b. Üçüncü oturum (3 Kasım 2026) — 6. ve 7. aşama: maç motoru, maç ekranı, özetler

**Durum:** Maç motoru, Web Worker hesaplama, 3D maç ekranı, devre arası müdahale, 10/5 dakikalık gerçek hızda özet ve 9:16 Instagram videosu çalışıyor, başsız Chrome'da baştan sona denendi. Demo (`#demo`, `#ornek-futbolcu`) kullanıcı isteğiyle `archive/2026-11-03-demo/` altına kaldırıldı; tek akış `#kadrolar → #dizilis → #mac`. Diğer AI'ın arayüz oturumu (1.–4. kısım; envanter/oyuncu kartı "Baran" tasarım dili) bitti; sahiplik kaydı `docs/ai-coordination.md`.

**Kullanıcı kararları (değiştirme):**
- Maç 60 dk (2×30). Faul, serbest vuruş, penaltı var; ofsayt ve kart YOK. Kafa golü herkes için formülle (güç + pozisyon + bitiricilik/teknik); Arif, Mensur, Taha, Servan'a özel güçlü kafa. Devre arasında diziliş ve oyuncu yerleri değişebilir (kaleciler kalede).
- Her simülasyon yeni seed (`freshSeed()`); aynı kadroyla farklı maç. Seed yalnız oynanan maçın tutarlı tekrar izlenmesi için.
- Kişilikler karar ağırlığı olarak (özellik değil): Taha çalımcı, Alper pasör, Göktuğ pas sevmez/şut sever; Yankı her maç bir kez uçtan uca sürer (bazen gol); Servan bazen savunmadan alıp gücüyle karşı kaleye gider; Mensur zayıf/kötü pres yapan rakibe bacak arası atar. Solaklar: Alper, Mustafa, Baran, M.Emre. Kaleden kaleye uzun pasçılar (kaleciler hariç): Arif, Servan, Göktuğ, M.Emre, Mensur, Alper. Şans: direk, seken gol, kaleci hatası, günün formu; güçlü/uyumlu takım da 1 farkla kaybedebilir.
- Futbol hissi: şut açısı bulan şutu çeker, kaleciye yuvarlamaz; ya da biri müdahale eder. Şut/bitiricilik yüksek olan ceza sahasına girince ya da duruma göre dışarıdan vurur; düşük olan da vurur ama bol bol auta gider. Serbest vuruş ve korner gerçek duran top gibi. Kaleci kendi kalesine gol YOK; GOL denince top gerçekten ağlara girer. 2–1 gibi düşük skor neredeyse imkânsız olmalı (medyan ~12 toplam gol).
- İzleme: maç siyah ekranla açılır, oyuncular sahaya yürürken yarı arka planda hesaplanır; "yükleniyor/simüle ediliyor" yazısı yok. "Özet · 10 dk" ve "Özet · 5 dk" önemli anları GERÇEK HIZDA (1×) gösterir, hızlandırma değildir; anlar topun oyuna girdiği yerden (aut, taç, serbest vuruş, korner, santra) başlar, orta saha mücadelesi atlanır. 1×/2×/4×/8× tam maç için şimdilik kalır. Zaman çizelgesi golleri değil önemli anları nötr işaretler (skor belli olmasın). Sol olay akışı küçük ve yarı saydam.
- Instagram: "Özeti indir · 9:16" en fazla 60 sn; yalnız goller, coşkulu kurgu (beyaz flaş kesme, GOL x/N sayacı, yer kalırsa kale arkasından ağır çekim tekrar), orta alan mücadelesi yok; skor açılışta değil kapanışta.
- Görünüm: low-poly oyuncular, lacivert/bordo forma + beyaz şort, Mamadou siyahi; maç ekranı envanter/oyuncu kartı diliyle (koyu lacivert panel, altın vurgu, Manrope, forma simgeleri). Takım vurgu renkleri taktik odasıyla aynı: #8cb4ed / #e598a8.

**Dosyalar:**
- Motor: `src/v1/engine/` — `rng.ts` (sfc32 + splitmix32, durum devre arasında taşınır), `runtime.ts` (oyuncu durumu, efektif değerler, kaleci vekil statları, pregame kimya, günün formu, ruh hali/atmosfer), `football.ts` (geometri, hız, uçuş), `simulation.ts` (`simulateHalf(snapshot, half, lineups, carry)`; 30 Hz tick, 5 Hz karar, 10 Hz kayıt), `replay.ts` (kare düzeni, ACTION/BALL_STATE). Ayar: `src/v1/config/engine-tuning.ts` (katsayılar, stiller, solaklar, uzun pasçılar, şans, kalibrasyon). `application/match-factory.ts` snapshot üretir; `workers/simulation.worker.ts` yarı başına hesaplar.
- Maç ekranı: `src/match/match-screen.js` (akış: siyah → sahaya çıkış + worker → başlama vuruşu → özet/tam izleme → devre arası kartı ve diziliş editörü → ikinci yarı → maç sonu), `match-renderer.js` (Three.js; `size`/`pose` seçenekleri dışa aktarım için), `replay-sampling.js`, `highlight-edit.js` (önemli an analizi, `halfHighlights(replay, budget)`), `walkout.js`, `kit-icon.js`, `match.css`.
- Özet video: `src/match/reel-plan.js` (gol klipleri, ağır çekim tekrarlar, dikey kameralar), `highlight-export.js` (kare kare çizim, WebCodecs H.264; yoksa MediaRecorder), `mp4-muxer.js` (ftyp+moov+mdat, ses yok).
- Testler: `npm run test:engine` (motor kuralları, belirlenimcilik, devre devamı, solaklar, Yankı, kalibrasyon), `npm run test:highlights` (10/5 dk kurgu, duran toptan başlama, reel, kameralar, MP4 yapısı), `npm run calibrate:engine`. Ayrıca mevcut `test:catalog`, `test:guests`, `test:selection`, `test:lineups`, `test:camera`, `test:appearance`.

**Bilinen eksikler / sıradaki:** haftalık form girişi (8. aşama); UI vurgu renklerinin lacivert/bordo olup olmayacağı kullanıcıya sorulmuştu, cevap yok (maç ekranı taktik odasının vurgularını kullanıyor); maç kaydı IndexedDB'ye yazılmıyor (yeniden açınca maç yeniden oynanır); özet video sessiz, müzik Instagram'da eklenir.

**Motor geri bildirim turu (aynı gün, sonda uygulandı):** GOL denince top her zaman çizgiyi geçip ağlarda kalır (30 maç / 378 golde doğrulandı); kaleci kendi kalesine gol yok, kaleciye çarpıp giren top son vuran hücumcunun golüdür; kaleci kendi ceza sahasına giden topa çıkar, kaçırdığı top kaleden uzağa seker; şutsuz giren nadir top isabetli şut sayılır (şut hiçbir yarıda golden az olmaz). Korner: alıcı durarak vurur, 5 hücumcu yakın/uzak direk/penaltı noktası/merkez/ceza yayına koşar, savunma adam + bölge tutar, bazen kısa korner. Serbest vuruş bölgeye göre: yakın-merkez → baraj (2–4 kişi, 9,15 m) üstünden direkt şut; kanat-son üçte bir → orta; derin → pas. Şut: ceza sahasında açı görenler vurur, dışarıdan istek ŞUT/BİT + alan + açıya bağlı; kale önünde uzun top sürme/çalım değeri düşer; savunma ceza sahası yakınında daha sert kapanır; şut hızı en az 18,5 m/s; zayıf şutçunun sapması büyük. Fark 3+ olunca öndeki takım gevşer, yorgun savunmacı ikili mücadele kaybeder, geride kalan takım daha çok koşu yapar. Ayar düğmeleri şimdilik `simulation.ts` başındaki `K` nesnesinde (`T.calibration`'ı ezer); sonda kalite kalibrasyonu: `K.calibration.keeper` .8 → .68.

**Hızlı kalibrasyon (12 maç, son hâl):** toplam gol 6, 7, 8, 10, 10, 11, 12, 12, 13, 13, 15, 17 (medyan ~11,5, en az 6); maç başı ~36 şut, isabet %53–56, pas ~%68, kafa golü ~2, penaltı ~0,4.

**Yarın için açık işler (kullanıcı MVP'yi yarın gözden geçirecek):** isabet oranı hedefin üstünde (%35–45 isteniyordu); 20–25 m şutlar fazla gol buluyor; direkt serbest vuruş golü %0–6, baraj %30–45 blokluyor; örnek kadrolarda saha oyuncusu Barkuz maç başı ~3 golle baskın; `K` düğmeleri `engine-tuning.ts`'e taşınmalı ve sürüm metni güncellenmeli; duran top ve yeteneğe göre şut testleri yok; `scripts/calibrate-engine.mjs` yüzdelik yazmıyor. Tarayıcı QA betikleri oturum geçici klasöründeydi (proje içinde değil).

## 6c. Dördüncü oturum (4 Kasım 2026) — motor görsel QA: ekranda fizik dışı hiçbir şey olmasın

Kullanıcı: "motoru mükemmel hale getir" — topun bir anda kalecinin elinde kalması, garip kafa vuruşları, kayarak müdahale ve faullerin düzgün gösterilmemesi; ardından: korner hazırlığını izlemeyelim, top dışarı çıkıp geri gelmesin, altı pasa girmeden şut, etrafı boşsa gol ihtimali yüksek / 2–3 kişi sarmışsa ya geçsin (yetenek yeterse) ya şut zayıf kalsın, oyuncular sahaya göre biraz büyük.

**Ölçüm aracı:** `scripts/scan-anomalies.mjs` (`node --experimental-strip-types scripts/scan-anomalies.mjs 6 1 --examples`): maçları simüle eder, replay'i 3D görünümün çizdiği gibi (10 Hz kare + top temas anahtarları) tarar; 13 anomali türü (kaleci ışınlanması, topun ayağa yapışması, uzaktan/alçak kafa, oyuncu ışınlanması, uzaktan müdahale, müdahalesiz/uzaktan faul, ceza sahası dışında elle tutma, takılan top, gövdeden geçen top, saha dışına taşma, sebepsiz top yön değişimi). `tests/engine.test.mjs` bunları maç başı tavanlarla kilitler (11 test).

**Önce → sonra (maç başı, 9 maçlık tarama):** kalecinin uzaktan/yüksekten tutması ~16 → ~0,1; topun ayağa yapışması ~60 → 0; uzaktan kafa ~45 → 0; sebepsiz havada yön değişimi ~140 → ~0,4; gövdeden geçen top ~65 → ~0,2; uzaktan müdahale ~4,6 → 0; müdahalesiz faul ~1,3 → 0; saha dışına taşma ~20 → 0; oyuncu ışınlanması ~8 → ~0,6 (kalanlar 1,2–1,3 m'lik hızlı adımlar).

**Kök nedenler ve çözümler (`src/v1/engine/simulation.ts`):**
- Kurtarış kale çizgisinde değil kalecinin derinliğinde, topun o noktadaki çizgisinde; `diveFor()` kalecinin gövdesini uçuş hızı sınırıyla oraya taşır (`RtPlayer.lunge`), yerdeyken top eldedir (`groundedUntil`). Direkten kornere çelinen top artık ışınlanmaz, eldiven noktasından dışarı uçar.
- Hava topu: kafa yalnız ≤ 0,95 m ve 1,35–2,45 m yükseklikte; kaleci eli ≤ 1,25 m ve ≤ 2,85 m. Kafa vuranın ışınlanması kaldırıldı (yarım adım atar), yakındaki rakip de yükselir; kafa şutu temas noktasından çıkar.
- Müdahale temas anında karar verir (`startChallenge`/`resolveChallenge`): 1,45 m'ye kadar ayakta, 2,5 m'ye kadar kayarak (`ACTION.slide`, gövde topa kayar, yerde kalır); yetişemezse boşa gider. Çalım sonrası müdahale de aynı yoldan. Faule uğrayan öne düşer (`ACTION.fall`), yerdeyken sürüklenmez.
- Top alındığında 0,24 sn'de ayağa/ele oturur (`ball.settle`); kötü dokunuş topu gövdeden uzağa sektirir; hızlı alçak top oyuncunun içinden geçemez, sekme (`bodyBlock`).
- Replay'e top temas anahtarları (`HalfReplay.ballKeys`) ve duran top yer değiştirmeleri (`ballCuts`) eklendi; `src/match/replay-sampling.js` topu temas noktalarından geçirir, yeni topu kaydırmadan gösterir. Top dışarı çıkınca ~0,9 sn yuvarlanmaya devam eder.
- Hareket: fren 6,5 m/s² (`locomotion.brake`), kimse çizgiye/tribüne taşmaz; köşe vuruşçusu dışında kimse kale çizgisinin gerisine geçmez (kaleci çizgi arkasından ışınlanıyordu). Kaleci yalnız rakipten belirgin önce yetişeceği topa çıkar (`K.keeperFirst`), yerinden uzaklaşınca koşarak döner.
- Şut: altı pas içine top sürme değeri düşük (`K.sixCarry`), ceza sahasında açık şut isteği (`K.closeUrge`); etrafı boşsa sakin vuruş (`K.freeComposure`), 2–3 kişi sarmışsa sıkışık zayıf şut + bloke (`K.crowdSigma`, `K.smother`, `K.crampedSpeed`), yetenekliyse çalım tercih edilir. Uzak şutta kaleci erken görür (erişim + daha az elden kaçırma), uzak isabet düşer (`K.distanceSigma` .14).

**İzleme:** 2 sn'yi aşan duran top beklemeleri (korner/serbest vuruş hazırlığı, gol sonrası santra) her hızda kesmeyle atlanır (`match-screen.js / stoppages`). Kayarak müdahale, öne düşme ve havadan kollar yukarıda yakalama animasyonları (`src/lowpoly-player.js`); kaleci uçuşunda gövdeyi motor taşır. Oyuncular %10 küçültüldü (`PLAYER_SCALE` .9, adım uzunluğu ölçekle).

**Kalibrasyon (16 maç):** toplam gol en az 5, medyan 11, en çok 17; maç başı ~43 şut, isabet ~%56, kafa golü ~2,8, faul ~13, müdahale ~73. Şut mesafesi: altı pas içi %3, 6–12 m %17, 12–18 m %49, 18 m+ %31; gole dönüş sırasıyla %39, %26, %28, %9. `engine-tuning` sürümü `engine-v1-tuning-4`.

**Kullanıcıyla istişare bekleyenler:** isabet oranı yüksek (%56) — daha çok şut dışarı mı gitsin; kafa golü maç başı ~2,8 fazla mı; 6–12 m dönüşü kalabalık kuralı yüzünden 12–18 m'nin altında; TV kamerası top ana tribün tarafındayken tribünü alt kısımda gösteriyor; duran top atlamasında taç (≤2,6 sn) gösteriliyor.

## 6d. Beşinci oturum (4 Kasım 2026, istişare sonrası) — 1. aşama: korner, pas isabeti, tek ayar kaynağı

Kullanıcı arayüz yenilemesinden sonra istişare istedi, diğer AI'nın 14 maddelik incelemesini de değerlendirtti ve "inisiyatif al, arayüz dilimize uygun yap, aşama aşama gidelim" dedi. Sıra: **1)** motor gerilemeleri (korner, pas) + ayarlar tek kaynak + testler; **2)** telefon düzeni ve ortak tasarım parçaları; **3)** TV kamerası ve GOL afişi; **4)** hızlı işler (oynatma durumları, rastgelelik kaydı, yavaş çekim/son pozisyon); **5)** yıldız baskınlığı, isabet oranı, gevşeme kuralı; **6)** kişilik kurallarının sahada görünmesi, "neden oldu" görünümü, mevki uyumu; **7)** maç arşivi/yedek, haftalık form, paylaşım. Kullanıcı kararı: dizilişte oyuncu başına mevki uyumu göstergesi gerekmez (metrikler zaten düşüyor).

**1. aşama bulguları (22 maç ölçüldü) ve çözümler (`src/v1/engine/simulation.ts`):**
- Korner maç başı ~1'e düşmüştü (3 Kasım 4,8). Kaleci direğin dışına çeldiği topu dokunma beklemesi olmadığı için hemen yeniden eline alıyordu (16 vakanın 15'i; yorum "korner" diyordu). Çelen kaleci 0,9 sn dokunamaz; çelme kale çizgisinde direğin dışındaki bir noktadan geçecek şekilde atılır. Blokların bir kısmı direğin dışına seker (`play.blockBehind`); ceza sahasındaki savunma kafası, rakip zorluyorsa daha sık, kornere gider (`headBehind`); kanattan ortayı kapatan adama çarpan orta çizgiye yakınsa kornere çıkar (`crossBlock`, `deflectBy`). Taç atışları yumuşak ve alıcının dizine iner (`throwSpeed`, `throwLanding`); eskiden alıcının üstünden geçip kendi kale çizgisinden çıkıyordu.
- Pas isabeti %54–55'e düşmüştü (3 Kasım %68). Kesmeyi deneyip kaçıran savunmacının vücuduna top bir de çarpıp sekiyordu (sekmelerin %92'si); her pas iki kez kaybediliyordu. Artık kaçıran adam ya hattan çekilir (`missedStab`) ya da top ayağına değip yavaşlayarak ve ondan uzağa dönerek devam eder (`bodyBlock` içinde). Yerdeki oyuncu topa dokunamaz. Uzaklaştırmalar pas sayılmaz.
- Kornerler açılınca kafa golü 4'e çıktı (kornerlerin %28'i gol). Kafa vuruşu daha yavaş (`shot.headerSpeedBase/PerAerial`), direk dibine daha az yerleşir (`headerAimSpread`), kafa isabeti biraz düştü; kaleci havadaki ortada (almaya çıkmıyorsa) çizgisinde kalır (`crossLine`), altı pasın 1 m ötesine kadar düşen ortaya zamanında yetişebiliyorsa çıkar (`claimHeight`, `claimBeyond`); kendi ceza sahasında savunmacı hava topunda küçük avantajlı (`boxAerialEdge`), korner markajı daha sıkı (`cornerMarkGap`).
- Kullanıcı ara notu: "kaleciler çok fazla uzun degaj atıyor, her maç bundan gol oluyor". Ölçüm: doğrudan kaleci uzun topuyla başlayan gol maç başı ~0,13; ama aut ~23/maç ve kaleci ~16 uzun vuruş. Hedefsiz ileri kafa (yakında arkadaş yoksa) topu önüne indirir (aut kaynağının ~5/maç'ı buydu); kaleci kısa seçenek varken uzun vurmayı daha az seçer (`keeperLongCost`): Barkuz'lu kadroda uzun vuruş 16,6 → 9,9/maç. Barkuz'un uzun kanat pası artık sabit 9 değil, kimya sonrası dağıtım değeri (Arif aynı takımdaysa 8,5).
- Ayarlar tek kaynak: simülasyondaki `K` grubu `ENGINE_TUNING.play`'e taşındı (maç kaydına `engineCoefficients` ile girer); kalibrasyon ve kaleci değerleri genel bloklarda. Sürüm `engine-v1-tuning-5`.

**Sonuç (40 maç, yeni tohumlar):** toplam gol ortalama ~10 (medyan 10, %10–%90 6–16, ≤5 gollü maç 1/40); pas isabeti %65; korner 5,7; kafa golü 1,6 (kafa vuruşlarının %15'i); kornerden gol %9; isabet %52; faul ~13. Görsel tarama temiz (gövdeden geçen top 0; tarayıcı topu ve oyuncuyu artık aynı çizim anında karşılaştırıyor). `tests/engine.test.mjs` 12 test: kalibrasyon testi pas %60–80, korner 3–9/maç, isabet ≤%66, kafa golü ≤4/maç sınırlarıyla sıkılaştırıldı; yeni test: çelinen top kalecinin eline dönmez, çoğu kornere döner.

**5. aşamaya kalanlar:** maçın golcüsü ortalama ~5 gol (Alper tur kadrosunda 6,1/maç), isabet %52 (hedef ~%40), dengesiz kadrolarda 7+ farklı skorlar. Kullanıcı kararı: golcünün 5 gol atması yalnız çok gollü maçlarda, 7+ fark yalnız dengesiz kadrolarda olabilir.

**2. aşama (aynı gün) — telefon düzeni ve ortak üst çubuk:** 390 px'te kadro havuzu görünmüyor, dizilişte isimler üst üste, maçta skor tablosu/kamera/kontroller çakışıyor, devre arası kartında takım adları harf harf kırılıyordu (yeni `match-ui.css` gibi katmanlar eski telefon kurallarını koşulsuz eziyordu). Üst çubuk artık tek tanım (`ui/design-system.css`; yedi dosyadaki ekran başına kopyalar kaldırıldı); telefonda yalnız "A." işareti, geçerli adımın adı, kısa düğme etiketleri. Kadrolar ≤800 px ve kısa ekranlarda tek sütun kayar: iki takım başlığı yan yana (takım seçici), aktif takımın listesi, havuz (başlığında yapışkan takım anahtarı ve sayaçlar), altta yapışkan "Dizilişe geç"; giriş kutuları 16 px (telefon odaklanınca yakınlaştırmasın). Diziliş: metrikler üstte iki sütun, sahalar tam genişlik (68:105), diziliş düğmeleri ayrı satır, dokun-dokun yer değiştirme, yapışkan alt çubuk, uyum detayları tek sütun. Maç ≤720 px: skor tablosunda forma + skor + saat, kamera açıları resmin altında, kontroller üç satır, devre arası/maç sonu kartı tek sütun ve düğmeleri altta yapışkan. Paylaşım penceresi telefonda tam ekran. Yatay telefonda uygulama ekran yüksekliğine sığar. Masaüstü ve tablet (820 px) görünümü değişmedi; 360/390/768/1440 px ve 844×390 yatayda kontrol edildi. 3. aşamaya: dikey ekranda TV kamerası sahayı küçük gösteriyor, GOL afişi kalenin üstünde.

**3. aşama (aynı gün) — TV kamerası ve GOL afişi:** TV kamerası ana tribünün arka duvarının gerisinde (z=72) olduğu için tribün kadrajın altını, kale arkasının koltuksuz beton basamakları da kaleye dönünce ekranın yarısını gri bantlarla dolduruyordu; dar ekranda kamera yatay kapsamı korumak için geri çekilip görüntüyü gökyüzü ve tribünle dolduruyordu. Çözüm: kamera hangi tribünün içinde ya da gerisindeyse o tribün o görüntüde çizilmez (`standsBehindCamera`, `stadium.js` tribünleri yan ±1 / kale arkası ±1 gruplarına ayırdı; panolar, yollar ve çizgiler kalır; yedek kulübeleri ana tribünle gizlenir; Instagram özetinin kameraları için de geçerli). Kale arkası tribünlerine yan tribünler gibi koltuk eklendi. Ekran 1,25 en-boy oranından darsa görüntü uzamak yerine daralır (`CAMERA_POLICY.portraitFrameAspect`; "Geniş" açı bütün sahayı korumak için geri çekilmeye devam eder); dikey ekranda TV gantrisi daha yüksek ve yakın (36 m, z=52; `presets.broadcast.portrait`). TV nişanı taç çizgisinden 6 m içeride kalır (`pitchBiasZ`). GOL afişi ekranın ortasından alt üçte bire, TV'deki gibi tek satırlık alt banda taşındı. `tests/camera.test.mjs` 14 test (yeni: kameranın gerisindeki tribün, dikey ekranda gökyüzü değil saha, taçta top kadrajda).

**4. aşama (aynı gün) — oynatma, rastgelelik kaydı, yavaş çekim:** Sahaya çıkışta "Duraklat" yürüyüşü de durdurur, başlama vuruşu oynatmayı bekler. Özet bitince saat son bölümün sonuna geri düşmez (devre sonunda kalır). Devre arası/maç sonu kartı açıkken oynat, "Son pozisyon", "geç" düğmeleri ve zaman çubuğu pasif (kartın arkasında zaman değişmiyordu ama değiştirilebiliyordu); boşluk tuşu da kart açıkken işlemez. İzleme biçimlerine 0,25× ve 0,5× eklendi. "Son pozisyon": son 20 saniyedeki en son önemli anı (şut, kurtarış, gol; yoksa son 8 sn) 4 sn öncesinden yarı hızda oynatır, "TEKRAR · 0,5×" etiketiyle; bitince kaldığı yere döner, tekrarda olay akışı ve GOL bandı yinelenmez. Rastgelelik: kayıttan dönen akış 12 ısınma adımını artık tekrarlamaz, kayıt bekleyen normal çekilişi de taşır (`state()` 4–5 sayı, okumak akışı bozmaz), yani devre arası kaydı akışı birebir sürdürür. Bu değişiklik ikinci yarıların rastgele akışını kaydırdığı için motor testlerinde iki şey ortaya çıktı: penaltı testi 6 maçta şansa bağlıydı (12 maça çıkarıldı); faul topa uzanma mesafesiyle çalınabiliyordu (gövdeler 2 m) — artık faul vücut teması ister (`play.foulBodyStand` 1,5 m, `foulBodySlide` 1,8 m), faul maç başı ~12. Motor testleri 14 (yeni: rastgelelik kaydı, penaltı ayrı test).

**5. aşama (aynı gün) — yıldız baskınlığı, isabet, oyun durumu:** Ölçüm: şutların ~%76'sını forvetler çekiyordu, merkez orta sahalar maç başı 1'den az. Son üçte birdeki ataklar kısa (medyan 2 sn, %90'ı 6 sn altı), orta saha ceza sahasına ancak 5–7 sn'de yetişiyordu. Maç az gollüyken 2+ golü olan forvetin sonraki gollerinin ~%74'ü rakibin kendi ceza sahası önünde kestiği pastan, kaptığı ya da boşta kalan toptan geliyordu (ortalama 17 m'de, 2,3 sn içinde şut). Çözümler (`src/v1/engine/simulation.ts`, katsayılar `ENGINE_TUNING.play`):
- Gol atan oyuncuya dikkat (`heat*`): 2 golde tam (`heatGoals`), maç çok gollüyse söner (`heatOpen`, `heatOpenGoals` — 5 gollü golcü çok gollü maçta yine çıkabilir). Markajcılar önce onu alır ve daha sıkı durur (`heatMark`), çalım denemesinde savunma daha sert (`heatDefense`), şutunda baskı artar (`heatPress`), pas yapan onun yakınındaki koridorları daha riskli görür (`heatWary`).
- Çalımda yakındaki her ek savunmacı kapatır (`coverBeat`, üst sınır `beatMax`, `takeOnBias`); "şut bitiriciliği soğukkanlılığı" biraz düştü (`composure`).
- Oyun durumu, kullanıcı kararı "ikisi de doğru": 3 farkla öne geçen biraz gevşer (eski kural, `relax*`), 2+ geride kalan risk alır — savunma hattı `riskLine` m yukarı, uzaktan şut `riskShots` kadar daha sık, daha çok koşu (`chasingRuns`).
- Orta saha: topa sahipken orta saha topun en fazla `midfieldGap` m gerisinde durur (en ileri `midfieldTop`); top son üçte birdeyken merkez orta sahalar ceza sahasına, savunma hattının önüne geç koşu yapar ve orta/geri pas için orada bekler (`midfieldRuns`). Uzaktan şut isteği biraz arttı (`rangeUrge`), bitiricilik kalibrasyonu .86. Sürüm `engine-v1-tuning-6`.

**Sonuç (160 maç, dört kadro):** gol ortalama 10,4 (%10–%90 7–15, en az 4); 10 golün altındaki maçlarda 5+ gol atan oyuncu 23/160 → 4/160 (12 golün altında 36 → 14), 5+ gollerin çoğu artık 12+ gollü maçlarda; 7+ farklı 30 maçın 28'i dengesiz kadrolarda (dengeli kadroda 1/40, güç farkı 28 olan kadroda 24/40; güçlü takım bir kez 1 farkla kaybetti); isabet %51; pas %63. Dengeli kadroda maçın golcüsü maçtaki gollerin %35'ini atıyor (dengesizde %43–45). Motor 14, kamera 14, highlight 7, seçim 12, diziliş 22, misafir 18, görünüm 4, katalog 16 test geçti; görsel tarama temiz (12 maç); build geçti. Aynı 48 maçta forvet dışı oyuncuların golü maç başı 2,0 → 2,5; az gollü maçta 2+ golü olan forvetin sonraki golleri 70 → 54. Kalan gözlemler: ofsayt olmadığından forvetler önde bekliyor ve şutların çoğunu yine onlar çekiyor (halı sahaya uygun; 6. aşamada mevki uyumu cezasıyla birlikte tekrar bakılabilir). İsabet hedefi (~%40) tutulmadı: maç başı ~40 şutla isabet %40'a inerse gol ortalaması ~7–8'e düşüyor; kullanıcının ~11 gol kararı öncelikli tutuldu, kullanıcı isterse şut sayısı/kaleciyle birlikte ayrıca indirilir.

**6. aşama (aynı gün) — kişilik kuralları sahada, "neden oldu", mevki uyumu:** Takım kimyası kuralları (Kamil Reis/Süleyman +0,5, Arif–Barkuz −1, Tevfik M.Emre'siz −0,5, kötü atmosferde Uğur/Mahmut −0,5, Servan −1) önceden yalnız diziliş metriğindeydi, maç motoru yok sayıyordu. Artık takımın toplam kimyası (±1 içinde) × `personality.chemistryShare` (0,4) diğer takım arkadaşlarının pas/görüş/pozisyonuna uygulanır; kuralın sahibi etkilenmez ("kendi performansı sabit"). Maç içinde devreye giren kurallar (Utku öndeyken/gerideyken, Akın yakın maçın sonunda, kötü atmosferde İsmail/Uğur/Mahmut, Batu'nun nefesi, Erhan çatışması) olay akışında açıklamasıyla görünür. Mevki uyumu: oyuncunun en iyi mevki puanından 4 puandan fazla düşük bir yerde oynarsa her puan için pozisyon −0,05 (en çok −1), rolün ana becerisi (stoper/bek savunma, orta saha pas, 10 numara görüş, kanat top sürme, forvet bitiricilik) yarısı kadar düşer (`engine/position-fit.ts`, `positionFit`; kimya sınırına takılmaz). Diziliş ekranında oyuncu başına gösterge yok (kullanıcı kararı). "Neden oldu?": maç ekranında olay akışındaki satıra tıklayınca motorun o anki hesabı açılır (tahmini olasılık, baskı, mesafe, sonuç, kullanılan özellikler, o anda oyuncu üzerindeki kurallar; mevki ve kimya kuralları da) ve maç okurken bekler; kapatınca ya da Esc ile devam eder. Doğrulama: motor 14 test, build, masaüstü tarayıcıda açılma/duraklama/devam kontrolü geçti.

**7. aşama (aynı gün) — maç arşivi/yedek, kaleci formu, 9:16:** Biten her maç bu cihazda arşive kaydedilir (`src/v1/data/match-archive.ts`, `match-snapshots` deposu: anlık görüntü — tohum, ayar sürümü, kurallar, oyuncular —, ikinci yarı dizilişi, skor, ilk yarı, golcüler; oynatma kareleri saklanmaz, aynı motor sürümüyle birebir yeniden üretilebilir). Maç sonu kartında "Maç arşivi" penceresi: kayıtlı maçlar, "Yedeği indir" (kadro/diziliş taslakları, misafirler, haftalık formlar, ayarlar ve arşiv tek JSON dosyada) ve "Yedek yükle" (onay sorar; aynı anahtarlı kayıtları değiştirir). Kaleci haftalık formu (`goalkeeperDelta`) taktik odasında hesaba katılıyor ama maç motoru yok sayıyordu; artık kaleci reytingine eklenir. 9:16 özet videosunda skor tablosu etiketi, alt yazıların ikinci satırı ve tarih ~%20 büyüdü. 6. aşamanın kimya etkisi 160 maçta gol ortalamasını 10,4 → 9,9'a düşürdüğü için `chemistryShare` 0,4 → 0,25 (yeniden: gol 10,6, en az 3; 10 golün altında 5+ golcü 11/160, 7'si güç farkı 28 olan kadroda, dengeli kadroda 0; 7+ farkın 26/30'u iki dengesiz kadroda). Doğrulama: motor 14 test, build, tarayıcıda maç sonu → arşiv penceresi → yedek içeriği geçti. Kalan: arşivden maçı yeniden izleme düğmesi, arşive üst çubuktan erişim, telefon görünümü kontrolü.

**Çevrimiçi sürüm (5 Kasım 2026) — günün maçı, canlı yayın, dinar bahisleri:** Kullanıcı kararları: site herkese açılır ama giriş zorunlu; gerçek para asla yok: "dinar" yalnız oyun parası, satın alınmaz, hiçbir şeye çevrilmez. Altyapı Cloudflare (ücretsiz plan): tek Worker hem siteyi (`dist/`) hem `/api`'yi aynı adresten sunar (giriş çerezi iPhone'da da çalışsın diye), veriler D1'de (`worker/schema.sql`: kullanıcılar, oturumlar, maçlar ve bültenleri, bahisler, dinar hareketleri, dinar istekleri), maç kayıtları KV'de. Supabase kullanılmadı (kullanıcının hesabı dolu).
- Giriş: kullanıcı adı oyuncunun adı küçük harfle (Kamil Reis → kamil, M.Emre → emre, Ali Efe → aliefe, Arda Barin → barin, Hakan Göktuğ → hakan, Yiğit Çetinkaya → yiğit, Eren Emeksiz → erenemeksiz; `src/v1/online/usernames.ts`); büyük harf ve Türkçe harf fark etmez. İlk şifre adın sonuna "!"; ilk girişte zorunlu şifre değiştirme ("basit bir şifre seç ama unutma; unutursan Arif'e yaz"). Admin hesabı ayrı (`admin`); admin bahis oynamaz, Arif kendi oyuncu hesabıyla oynar. Oturum 90 gün; şifreler PBKDF2 özeti. Gözlemciler (futbol oynamayan arkadaşlar; ilk ikisi Ece → ece, Zeynep → zeynep) Yönetim panelinden eklenir: bahis oynar, dinar toplar, kadroda ve oyuncu kartlarında yoktur; admin anahtarı açana kadar genel tabloda görünmez.
- Roller: yalnız admin kadro seçer, dizilişi kurar ve simüle eder; diğerleri yalnız "Günün maçı" ve canlı yayını görür. Admin'in kendi sayfası: Yönetim paneli; solda menü (telefonda üstte), her seferinde tek bölüm, bölüm adreste kalır (`#yonetim/bahisler`; kullanıcı: "en alta gidiyorum, menü gibi kullanalım"): **Simülasyon** (yeni maç planla — bu tarayıcıda kayıtlı dizilişle, maç admin hangi cihazdaysa orada üretilir ve sonuç gösterilmeden yüklenir —; planlanan maçlar: "Oranlar", "Sonucu gör", "Yeniden üret" — oynanan bahisler iade edilir, oyunculara not düşer —, "İptal et" — bahisler iade —), **Bahisler** (oran düzenleyici; oyuncu bahisleri iki açılır menüyle: oyuncu — iki takımın her oyuncusu — ve bahis — gol atar, 2+, hat-trick, 4+, 5+, asist —; bültende yoksa önerilen oranla eklenir; altında oyuncu × bahis tablosu, hücreye basınca seçilir; kaydedilmemiş değişiklikte altta Kaydet/Vazgeç çubuğu; maç başlayınca salt okunur), **Sonuçlar** (biten maçlar, oynanan/ödenen/kayıp bonusu, kasa, herkesin bahisleri), **Oyuncular** (bakiye, şifre durumu, sıfırlama), **Gözlemciler**. Hesap menüsü logonun yanında (sağ uç kadro/taktik adım çubuğunun).
- Canlı yayın: maç 1–2 gün önceden üretilebilir; kayıt başlama saatine kadar sunucuda kilitli. Yayın "Özet · 10 dk" kurgusudur (sahaya çıkış, ilk yarı, 45 sn devre arası kartı, sahaya çıkış, ikinci yarı; ~11 dk) ve sunucu saatine göre akar: geç gelen kaldığı yerden izler; duraklatan ya da "Son pozisyon" izleyen "CANLI'ya dön" ile döner; yayın sürerken hız ve zaman çubuğu kilitli, bitince tekrar serbest (`src/match/broadcast-plan.js`).
- Dinar ve bahis (`src/v1/online/markets.ts`; sunucu ve tarayıcı aynı kodu kullanır): herkes 30.000 dinarla başlar, bahis 100–5.000 dinar. Kasaya karşı sabit oran, kâr payı yok: kasa da kaybedebilir, iyi tahmin eden katlar, havuz bölüşülmez. Oranları admin'in tarayıcısı önerir: aynı dizilişlerle 80/160/320 maç daha oynatılır (gerçek maçın tohumu değil; `src/online/odds-runner.js`), olasılıktan adil oran bulunur ve hep aşağı yuvarlanır (1,05–200). Admin oranları maç başlamadan düzenler, seçenek kapatır/açar, kendi oyuncu bahsini ekler (oyuncuyu ve gol sayısını seçince önerilen oranla: "Barin gol atar", hat-trick); "Kaydet ve bültene aç"tan sonra oyuncular maçı ve oranları görür, başlama saatinde bahisler kilitlenir. Bahisler: maç sonucu, fark, ilk yarı/maç sonu, ilk ve ikinci yarı sonucu, hangi yarı daha gollü, yarı ve maç toplam gol alt/üst (ör. 8,5), takım golleri, iki takım 4+, doğru skor (16'sı listede; 0–25 her skor oynanır), oyuncu golü (1+, 2+, hat-trick), maçın golcüsü, maçın oyuncusu, ilk golü atan oyuncu ve takım, asist, penaltı, kafa golü, korner. Oranı 1,10'un altındaki seçenek kesine yakın sayılır: görünür ama oynanamaz; admin bilerek açabilir. Oranlar oynanan paraya göre ağır ağır değişir (oynanan taraf düşer, diğerleri yükselir; admin'in oranından en fazla %30), bahis o anki orana kilitlenir. Açık yok: bir bahiste yalnız bir taraf, ve bir kişinin aynı maçtaki bahisleri her sonuçta en az birini kazandıramaz (ör. 7,5 üst ile 9,5 alt birlikte alınmaz; `covers`). Yayın bitince ödenir: kazanan tutar × oran, maçtan net kaybedene kaybının %30'u geri. Herkesin bahsi maç bitince görünür. Bakiyesi biten (100 dinarın altı) arkadaşından dinar ister; arkadaşı gönderir ya da reddeder.
- Saklama: tam kayıt (~9 MB) maçtan 3 gün sonra KV'den kendiliğinden silinir; skor, goller ve 9:16 özetin verisi (~0,2 MB: özetin kullandığı anlar dışındaki kareler sıfırlanmış kopya, `src/match/reel-trim.js`) kalıcı. Kayıt biçimi `src/v1/online/recording.ts`.
- Yayında (5 Kasım 2026): https://alsancak.alsancak-match-preview.workers.dev. Güvenlik (kullanıcı: "açıkta hiç endpoint kalmasın"): giriş yapmamış biri yalnız Worker'ın verdiği ayrı giriş sayfasını ve sunucu saatini görür; sitenin bütün dosyaları (kod, oyuncu verisi, resimler) yalnız geçerli oturuma gider (`run_worker_first`, `private` önbellek); ilk şifreyle (ad + "!") açılan oturum sunucuda da yalnız şifre değiştirebilir; bir kullanıcı adına 15 dakikada 10 yanlış şifre o adı 15 dakika kilitler (`login_failures`); her yanıtta çerçeveleme/tür tahmini kapalı başlıklar; hiçbir yanıtta şifre özeti yok. Şifre listesi yalnız kullanıcının Masaüstündeki dosyada; projede, GitHub'da ve sitede yok (`worker/seed.local.sql` kullanılıp silinir).
- Yerelde (`npm run dev`, sunucu yok) uygulama eskisi gibi tam açık çalışır; çevrimiçi parçalar yalnız `/api` varken devreye girer. Önizleme: `npm run build` + `npx wrangler dev --local` (yerel veritabanı `worker/schema.sql` ve `worker/make-seed.mjs`'in yazdığı `worker/seed.local.sql` ile kurulur).
- Aynı gün düzen düzeltmeleri: kadro ve taktik ekranları her pencere boyunda tek sayfaya sığar (kullanıcı: "hiç kaydırma olmamalı"); 800 px altında taktik metrikleri üstte şerit, iki saha yan yana; 560 px altında tek saha ve takım düğmeleri; kadrolar 680–800 px iki sütun, altında "Kadrolar | Oyuncu havuzu" düğmeleri; uygulama çerçevesinin eski en az yükseklik kuralı (640/670 px) kaldırıldı.

## 7. Motoru kuracak AI için sıralı yol haritası

**4. ve 5. aşama TAMAMLANDI (ikinci oturum).** 5. aşama kamera: `src/v1/rendering/camera-director.ts` (saf TS, renderer'dan bağımsız; `tests/camera.test.mjs` 11 test) + `src/camera-input.js` + `#demo` kamera paneli. Kullanıcının tarifi: demo sahası/renkleri kalsın; üç otomatik açı düğmesi — **TV yayını** (gerçek yayın: ana tribün z≈72, y=24, orta saha rayında kayar, son üçte birde daralır), **Geniş** (köşeden, sol yakın köşe), **Kale arkası** (hücum edilen kalenin 24 m arkası, 10,5 m; kale önde görünür; uç 8 m histerezisle ana tribün üzerinden değişir) — ve elle ayar. Elle: sol sürükle açı/eğim, tekerlek/pinch yakınlık (bunlar otomatik takipte ofset olarak korunur), sağ/orta tık veya Shift sürükle / iki parmak kaydırma serbest mod; "Otomatiğe dön" (ve çift tık) kullanıcının göreli açısını korur; hazır açı düğmesi ve "Sıfırla" ofseti sıfırlar. Klavye 1/2/3. Kamera sunum zamanında çalışır (duraklatılmışken de döner); zemin/tribün/duvar yükseklik sınırı `CAMERA_POLICY.clearance`. İsim etiketleri sabit köşe yerine ölçülen HUD kutularından kaçınır (`scene.setHudExclusions`). Eski alt çubuk yakınlık kaydırıcısı kaldırıldı. Gerçek motor kareleri `cameraSubjectFromFrame(frame)` ile bağlanacak. Aynı turda kullanıcı isteğiyle: taktik raporundaki /20 paneli ve Barkuz notundaki sayılar silindi; Barkuz Kaleci düğmesi aç/kapa anahtarı; kadro kartında × yok, satıra basınca havuza döner, profil ↗.

6. aşama gerçek maç motoru: renderer'dan bağımsız saf domain + Web Worker. Sabit tick 50 Hz, karar 5 Hz, top substep 2, replay snapshot 10 Hz, 30 sn parça; ilk mimari tuning kararları `config/defaults.ts`. Seed zorunlu, Math.random veya render dt'ye bağlı sonuç üretme. Zaman çizelgesi geri sarıldığında aynı maç aynı kalmalı. **KULLANICI NETLEŞTİRDİ: her “Simüle et” YENİ rastgele seed alır; aynı kadro + aynı dizilişle bile koşu/pas/olay/skor farklı çıkabilmeli, aynı skor ancak tesadüfen gelir. Seed'i kadrodan/dizilişten türetme veya sabitleme; seed yalnız oynanmış o maçın replay tutarlılığı ve testler içindir.** 90 dakika başlangıç süresi; saha 105×68 m. Maç süresi/olay sıklığı/skor örnekleri birlikte kalibre edilmeli; kullanıcının gerçek maç süresi ayrıca öğrenilebilir.

Adım adım önce mikro senaryolar: kısa pas/ilk kontrol; çapraz uzun pas/uçuş/iniş; ara pas + koşucunun hız/ivme/yorgunluk yetişmesi; baskı/tackle/interception; şut yönü/şiddet/sapma + GK kurtarış; gol/santra, taç, korner, faul/serbest vuruş, ofsayt/penaltı kuralları; sonra 22 oyunculu sürekli takım şekli ve tam maç. Oyuncular her tick topun peşine yığılmamalı: rol anchor'ı, takım bloğu, hücum/savunma geçişi, genişlik, destek koşusu, markaj ve baskı sorumluluğu gerekir.

Karar sistemi aday pas/koşu/dripling/şut aksiyonlarını birden çok özellikle puanlasın: PAS/GÖR seçeneği görme ve uygulama; KNTRL ilk dokunuş; HIZ/DAY koşu ve sürdürülebilirlik; ŞUT/BİT/POZ fırsat/bitiriş; DEF/PRES/POZ/GÜÇ rakibe müdahale. Rakip baskısı, mesafe, açılar, ön kesme, koşu zamanlaması, alan ve risk dikkate alınmalı. İsim kimyası yalnız genel rating sayısına gömülmemeli; iletişim/alıcı faydası/aksiyon uygulama etkisi olarak olaylarda gözlenmeli. Barkuz GK uzun kanat dağıtımını bu aşamada mutlaka bağla.

Kimya uygulama sırası: baz özellik → haftalık form → kaynaklı pair/trio/rol çevresi → atmosfer/maçup → faz/skor/yorgunluk/guest. Normal cap ile locked istisnaları açık uygulanmalı; maç bitince baz katalogya yazılmaz. Aynı bonusu açıklama tablosunun tekrarı yüzünden iki kez sayma. Bütün uygulanmış modifierlar ruleId, kişi ID'leri ve nedenle EventReason'a girsin. Eren çevre bonusu üçlüyle normal cap içinde ayrıca işlenebilir; ikili/üçlü bonuslar birlikte yığılmaz. Onur–Ömer locked taşması source gereğidir.

Kullanıcının yüksek skorlu amatör maç örnekleri: 4–2, 4–3, 4–4, 5–5, 7–5, 9–7, 11–7; uç örnek 16–0. 3–3 de kabul. Bunlar skor zorunluluğu, hard minimum/max veya önce skor seçme talebi değildir. Başlangıç toplam gol medyanı hedefi 12 olarak mimaride kaydedildi. Çok sayıda seed ile dağılımı, şut/pas/top kaybı/GK kalitesini kalibre et; her maç aynı skora yaklaşmasın. İyi takımların gerçek özellik üstünlüğü ölçülebilmeli; skorlar gösterilen gerçek olaylardan doğmalı.

## 8. Snapshot, replay, hazırlık sahnesi, görselleştirme

`domain/match.ts`: immutable MatchSnapshot; seçilmiş resolved oyuncular (Barkuz modu dahil), iki geçerli lineup, form, rulebook/kararlar, tuning sürümleri, seed, hafta ve ayarlar. Henüz MatchSnapshotFactory uygulanmadı. Kaynak veri sonra değişse eski maç değişmemeli. `domain/replay.ts`, `workers/protocol.ts`, `engine/contracts.ts`, renderer sözleşmelerini oku.

Kullanıcı “simüle et” dediğinde maç worker'da hesaplanırken sahaya çıkış/kadro tanıtımı gösterilebilir; gerçek hazırlık tamamlanmadan sahte tamamlandı mesajı verme. Worker chunk'ları IndexedDB'ye yazıldıkça ack/backpressure, iptal, ilerleme ve failure; tam commit olmayan maç final replay gibi açılmaz. Playback renderer sadece kaydedilmiş tick/pose/ball/events gösterir. Seek en yakın indeksli chunk'a; buffer yoksa buffering. Gol/santra/devre geçişinin üzerinden yanlış interpolasyon yapma. Hız ¼×–4× ve pause/seek yalnız izleme; sonucu değiştirmez.

`src/demo.js` geçici index tabanlı 72 sn koreografidir; motorun yerine genişletme. Yeni frame sözleşmesinde oyuncu ID, teamId, action, stamina, ball state, possession, attackDirection, event involvement bulunur. `src/scene.js` mevcut prototip frame adapter'ı ileride gerçek ID tabanlı frame'e dönüştürülmeli; gerçek seçili 22 modele geçilmeli. Gol yeme sonrası GK adı yaklaşık 3 sn; top tutarken GK adı; diğer zamanlar uzaktaki GK sürekli isimli olmasın. Top sahibi/alıcı/presçi/duel/support öncelikli en fazla beş ad; her yer yazı olmasın. Topu etiket kapatmamalı.

## 9. Dosya haritası ve kalıcı kayıt ayrıntıları

- `src/main.js`: ortak library + seçim + taktik routing; `src/preview.js`: lazy 3D demo kontrolleri.
- `src/players.js`: demodaki 22 sabit gerçek ID ve başlangıç konumları; `player-model.js`, `stadium.js`, `scene.js`: Three.js görünüm.
- `src/v1/domain/players.ts`, `teams.ts`, `modifiers.ts`, `match.ts`, `replay.ts`, `common.ts`: temel tipler. `application/services.ts`, `state.ts`: uygulama sözleşmeleri.
- `data/browser-database.ts`: ortak IDB açma, upgrade/versionchange, transactionComplete/requestValue. DB `alsancak-match-engine`, version 1; stores guest-players, weekly-forms, selection-drafts, lineup-drafts, match-snapshots, replay-manifests, replay-chunks, preferences. Tüm store'lar ilk upgrade'de yaratılmıştır; yeni alanlar bu aşamada migration gerektirmedi.
- `data/local-catalog.ts`: yalnız misafir ekle/arşivle; kaynak kayıtlar salt okunur. `preferences.catalog-revision` artar. `data/local-selection.ts`: active-selection pointer + selection-drafts, revizyon ve idempotence kontrolü. `data/local-lineups.ts`: yeni taktik taslağı.
- `features/player-library.ts`: tek ortak katalog/guest/modal servisi; subscribe ile inventory değişimi yayılır, openProfile opsiyonel displayCatalog kabul eder. Misafir factory asıl katalogdan çalışır.
- `features/team-selection/controller.ts`: otomatik kayıt kuyruğu, state, Barkuz düğmesi; onay CustomEvent `selection-confirmed` yayar. `features/lineup-review/controller.ts`: yeni 4. aşama, worker ve taktik UI.
- `config/defaults.ts`: guest, cap, skor kalibrasyonu, kamera ve motor başlangıç parametreleri. `config/chemistry-rulebook.ts`: yeni kısmi çalıştırılabilir kurallar. Kaynağın aşağıdaki tüm özel kurallarıyla tamamlanmalı.
- `tests/catalog.test.mjs`, `guest-player.test.mjs`, `selection.test.mjs`: önceki 47 test. `tests/lineup.test.mjs`: Barkuz modu, atama, optimizer, taktik komutları, kayıt çakışması ve kaynak kimya örnekleri (22 test).
- Önceki görseller: `preview-team-selection.jpg`, `preview-team-labels.jpg`, `preview-player-profile-revised.jpg`, `preview-guest-editor.jpg`. Bunlar 4. aşamadan önceki ekranlardır; yeni taktik ekranının görsel kanıtı değildir.

## 10. Devam ederken ilk yapılacak somut kontrol listesi

**En güncel durum için önce 6b bölümünü oku (üçüncü oturum: maç motoru, maç ekranı, özetler; demo arşivde).** **Güncel durum (ikinci oturum sonu):** 1–5 aşağıdaki maddeler yapıldı; 4. ve 5. aşama kapandı (toplam 83 test: katalog 17, misafir 18, seçim 12, diziliş 22, kamera 11, görünüm 3).

**Yeni futbolcu görünümü — ONAYLANDI ve `#demo`ya uygulandı:** Kullanıcı bir FM tarzı referans ekran görüntüsü verdi; istenen yalnız futbolcu tipi ve hareket (UI/stadyum değil): az köşeli düz yüzeyli (low-poly flat shading) ince atletik oyuncular, yüzsüz küçük kafa + saç başlığı, sırtta numara, açık şort, dize kadar tozluk, oyuncudan oyuncuya farklı canlı krampon, çeşitli ten/saç, ayrı kaleci rengi, alttaki yumuşak gölge; koşuda diz/dirsek bükülür, adım hızla uyumlu, ayak kaymaz. Kullanıcı kararları: kafa küre değil **dikdörtgen**, şort biraz uzun, saç oyuncuya göre uzun/orta/kısa/çok kısa (`HAIR_STYLES`); Mavi = **lacivert** forma, Kırmızı = **bordo** forma, beyaz şort; **Mamadou siyahi**, diğerleri açıktan esmere dengeli (`config/appearance.ts`, oyuncu ID'sine göre sabit); şutta **hafif duman/toz** ve bu tür efektlere önem verilmeli. Uygulama: `src/lowpoly-player.js`, `src/match-effects.js`, örnek sayfa `#ornek-futbolcu` (`src/player-study.js`). Kullanıcı örneği gördü, son ayar: kafa %10 daha dar, boyun %20 uzun, şort dizin ~10 cm üstüne kadar; "tamamız" dedi. `#demo` 22 oyuncusu yeni modelde (`src/scene.js`, `DEMO_TOUCHES` ile vuruş/top alma, toz, şut izi); eski `src/player-model.js` kullanılmıyor. Top: `src/match-ball.js`, kullanıcı "Şampiyonlar Ligi topu gibi" istedi; beyaz + lacivert yıldız panelli ÖZGÜN top yapıldı, tescilli UEFA tasarımı kopyalanmadı. Açık soru: UI vurgu renkleri (açık mavi/kırmızı) lacivert/bordo olsun mu — cevap gelmedi. Sonra 6. aşama maç motoru (her simülasyon yeni seed!), ardından 7 hazırlık/replay. Bu not her değiştiğinde `npm run import:catalog` sonra `check:catalog` ve tüm test scriptleri çalıştırılmalı.

1. `npm run import:catalog` (bu önsöz nedeniyle hash değişti); check:catalog, check:architecture, üç mevcut test scripti. Yeni source tablolarının 48/43/5 ve 258 puanı aynı kaldığını doğrula.
2. Barkuz modu kalıcı aç/kapa, Yusuf GK rating eşitliği, orijinal forvet verisinin değişmediği, yalnız Barkuz'da buton, iki kaleci bloklaması ve long-wide target sınırlarını test et.
3. Gerçek iki tam takım seç; Kadroları onayla → #dizilis; worker sonucu, 5 formasyon, tekil 11 slot, GK sabit, roster korunması, click/click ve drag/drop, profil, her iki takım göstergeleri, save/reload ve retry. Aynı slotta tekrar tıklama seçimi temizleyip render/fokus davranışını kontrol et.
4. Arif–Barkuz pozitif ortamda hâlâ negatif; Baran/Eren/Arif çift/üçlü dedup; Onur/Ömer birlikte/rakip; M.Emre/Tevfik; güçlü savunma desteği dedup; Eto rakip mismatch; guest named chemistry miras almama testleri.
5. Build'i Windows EPERM engeli giderilmiş ortamda doğrula; screenshot al, görseli kullanıcıya göster. UI'nin amatör bulunduğunu unutma; sonraki tasarım iyileştirmesi ayrıca ele alınabilir.
6. Kaynak kuralların kısmi kalanlarını tamamla, sonra kamera ve maç motoruna yukarıdaki sırayla geç. Mevcut statik demoyu gerçek maç gibi sunma. Çalışmayan şeyi tamamlandı yazma.

---

# ÖZGÜN OYUNCU VERİLERİ VE ARŞİV BELGELERİ AŞAĞIDADIR — İÇERİK KORUNMUŞTUR

<!-- ALSANCAK_ORIGINAL_SOURCE_START -->


# Halı Saha — Birleştirilmiş Eksiksiz Kaynak Arşivi

> İçerik: kaynak karşılaştırma raporu; 3 PDF’nin Markdown aktarımı; Excel’in veri ve formüllerinin Markdown aktarımı. Bölüm ayraçları dışında kaynak içerikler değiştirilmemiştir.


---

# ARŞİV BÖLÜMÜ 1: `Hali_Saha_Kaynak_Karsilastirma_ve_Tutarlilik_Raporu.md`

# Halı Saha — Kaynak Karşılaştırma ve Tutarlılık Raporu

**Kontrol tarihi:** 3 Kasım 2026  
**Kaynaklar:** 3 PDF (toplam 12 sayfa) ve 1 Excel çalışma kitabı (2 çalışma sayfası).  
**İlke:** Kaynak veriler değiştirilmedi; çelişkiler düzeltilmek yerine açıkça belgelendi. Baz puanlar ile maçlık efektif puanlar birbirine karıştırılmadı.

## 1. Kesin sayısal çelişki — 1 adet

| Alan | Kaynak 1 | Kaynak 2 | Sonuç |
| --- | --- | --- | --- |
| **Ömer — ana rol Stoper puanı** | `Hali_Saha_Guncel_Mevki_Listesi.pdf`, s. 1, sıra 23: **75.1** | `Hali_Saha_Tam_Oyuncu_Veritabani.xlsx`, `Oyuncu Veritabanı!D25`: **75.0**; `AD25` formülü `=D25` | **0.1 puan uyuşmazlık.** Kitapçık formülü ve Excel’deki 12 yetenek/uygunluk ile yeniden hesaplanan sonuç **75.0**. PDF’deki **75.1** korunmuştur; otomatik düzeltilmedi. |

Diğer **47 ana puan**, oyuncu isimleri ve sıralama PDF ile Excel arasında uyumludur. Saha oyuncularının PDF’de gösterilen **43 ikinci mevki puanı** Excel’deki ilgili mevki değerleriyle eşleşir. Beş kalecide ikinci mevki bulunmaz.

## 2. Görünürde çelişki gibi duran, kurallarla açıklanabilen ana mevki seçimleri

Bazı oyuncuların Excel’de sayısal olarak en yüksek skoru ana rolü değildir. Bu durum hem *Temel Kural Kitapçığı, bölüm 9–10* hem de Excel son notundaki **gerçek kullanım filtresi** ilkesince mümkün. Tek başına veri hatası değildir.

| Oyuncu | Sıralamadaki ana rol ve puanı | Daha yüksek hesaplanan mevki | Değerlendirme |
| --- | --- | --- | --- |
| Arif | Göbek OS **79.2** | Bek **80.5** (Stoper **79.8** de daha yüksek) | Kullanım filtresi nedeniyle CM seçilmesi mümkün; Excel ana rolüyle tutarlı |
| Mamadou | Göbek OS **74.7** | Stoper **74.8** | Sadece **0.1** fark; kullanım filtresiyle tutarlı olabilir |
| Batu | Bek **64.0** | Göbek OS **66.0** | **2.0** puan daha yüksek alternatif rol var; ancak Excel ana rolü Bek ve PDF’de ikinci rol Kanat **64.1** gösterilmiş. Rol tercihi için kullanım gerekçesi açıklanırsa uygulama daha denetlenebilir olur |

**Not:** PDF, “ikinci mevki” alanında mutlaka ikinci en yüksek matematiksel skoru değil, kullanılabilir alternatif mevkileri seçebiliyor. Bu nedenle Batu’nun 66.0 Göbek OS skorunun listede ikinci mevki olarak yer almaması tek başına aritmetik hata değildir.

## 3. Uygulama belirsizlikleri — kaynaklarda çelişki olduğu kesinleşmemiş konular

1. **Efektif statlar 10'u aşabilir mi?** Temel yetenekler 1–10 olarak tanımlanıyor; Kimya kitapçığında Onur ve Ömer aynı takımdayken 12 özelliğin tamamına +1.0 uygulanıyor. Excel’de **Ömer’in PRES baz değeri 10**; doğrudan uygulama **11** üretiyor. Efektif stat için `min(10, değer)` sınırı belirtilmemiş. Bu, hesaplama motorunda açık karara bağlanmalı; mevcut kaynak değiştirilmedi.
2. **Eren’e aynı anda uygulanabilen +0.5 teknik bonuslar:** Baran–Eren ikilisi ile Baran–Eren–Arif üçlüsünün bonuslarının üst üste binmeyeceği açık. Fakat Eren’in çevresinde PAS ≥8 ve GÖR ≥8 olduğunda aldığı kendi +0.5 PAS/GÖR bonusunun üçlü bonusuna ayrıca eklenip eklenmeyeceği açık yazılmamış. Normal özellik başına +1.0 bonus tavanı var, ama tetikleyicilerin birlikte sayılması ayrıca kesinleştirilebilir.
3. **Takım kimyası puanlarının efektif puana dönüşümü:** Oyuncu kaynaklı +0.5/−0.5 veya kilitli −1 takım kimyası etkileri ve iyi/kötü atmosfer eşikleri tanımlı; fakat toplam kimya skorundan tek tek yetenek ya da ratinge yapılan evrensel sayısal dönüşüm formülü verilmemiş. Kimya katmanında isim bazlı koşullarla çalışmak gerekiyor.
4. **Rol filtresinin operasyonel sınırı:** Ana rolün otomatik salt maksimum puan olmadığı net, ancak 1–10 Stage 1 uygunluğu ve gözlenen kullanım notlarının hangi kesin eşikle rolü dışladığı belirlenmemiş. Mevcut `Ana Mevki` hücreleri bu manuel kararın kaydı olarak korunmalı.
5. **Üst üste gelen atmosfer etkilerinin önceliği:** Güçlü stabilizatör bir hafif negatif kaynağı dengeleyebilir, fakat bunun iyi/kötü kimya eşiği hesaplamasından önce mi sonra mı yapılacağına dair tam bir algoritma yok. Kilitli Arif–Barkuz cezasının otomatik iptal edilmemesi ise açık bir istisna olarak tanımlı.

Bunlar **sayısal veri çelişkisi değil**, ileri aşamada takım kurma motorunu birebir deterministik kodlamak için netleştirilecek kararlardır.

## 4. Excel'in güncellenme davranışına ilişkin önemli yapısal risk

`Oyuncu Veritabanı` sayfasındaki **258 saha mevki puanı (D:I)**, XLSX dosyasında formül değil **sabit sayısal değer** olarak saklanıyor. `Ana Puan` sütununda ise **48 hücre formülü** var (ör. `AD25 = D25`). Bu nedenle Stage 2 yetenek veya Stage 1 uygunluk değerleri Excel içinde değiştirildiğinde **D:I puanları kendiliğinden yeniden hesaplanmaz**. Bu bir mevcut veri uyuşmazlığı değildir; gelecekte güncelleme yapılırsa tutarsızlık doğurabilecek bir bakım riskidir.

## 5. Doğrulama kapsamı ve sonuçları

| Kontrol | Bulgular |
| --- | --- |
| Oyuncu listesi | **48/48** oyuncu, adlar ve sıra PDF/Excel arasında eşleşti |
| Saha oyuncusu / kaleci | **43 saha oyuncusu**, **5 kaleci** |
| Mevki formülü | **258/258** saha mevki puanı yeniden hesaplamayla uyumlu; formül `%92 Stage 2 + %8 Stage 1` |
| Mevki ağırlıkları | **6/6** mevki ağırlık sütununun toplamı **%100** |
| Stage 1 dönüşümü | **10** tam sayı katsayısı; ara değerler doğrusal olarak enterpole edildi |
| Stage 2 | **12** temel yetenek başlığının tamamı mevcut |
| Baran örneği | CM ham **7.890**; Bek ham **7.835**; kitapçıktaki yaklaşık değerler tutarlı |
| Güncel liste | **48** ana, **43** ikinci mevki değeri: yalnızca **Ömer’in ana puanı** farklı |
| Kimya kitabındaki tablolar | **8** kilitli eşleşme, **68** oyuncu/durum modifier satırı, **12** atmosfer örneği, **8** kısa referans kategorisi |
| Excel yapı | 2 sayfa; `Oyuncu Veritabanı!A1:AD52`, `Model Özeti!A1:D6`; 48 ana puan formülü, tüm kaynak kolonları MD’ye aktarıldı |
| PDF görsel nesneleri | Belgelerde bağımsız gömülü raster görsel yok; tablolar, başlıklar, altbilgiler ve metinler aktarıldı |

### PDF → Markdown metin kapsama denetimi

Bu denetimde her PDF'nin bütün sayfalarından çıkarılan metinsel öğeler, oluşturulan Markdown'daki öğelerle **çoklu küme (token frekansı)** bazında karşılaştırıldı. Sayfa başlıkları ve dipnotlar da hesaba katıldı. Bu, metin eksiltmelerini bulmak için ek güvence sağlar; görsel tasarımın piksel piksel aynen taşınması anlamına gelmez.

| Kaynak PDF | Sayfa sayısı | Kaynak metin öğesi | Markdown'da eksik kaynak metin öğesi |
| --- | ---: | ---: | ---: |
| `Hali_Saha_Puanlama_Sistemi_Kural_Kitapcigi.pdf` | 4 | 1225 | **0** |
| `Hali_Saha_Kimya_Performans_Kural_Kitapcigi.pdf` | 7 | 2069 | **0** |
| `Hali_Saha_Guncel_Mevki_Listesi.pdf` | 1 | 302 | **0** |

## 6. Kaynak önceliği önerisi (otomatik değişiklik değildir)

**Uygulama için önerilen ayrım:** Kalıcı Stage 2 özellikleri, Stage 1 uygunlukları ve ilan edilmiş ana roller için **Excel**; hesaplama mantığı için **Temel Kural Kitapçığı**; maç içi geçici etkiler için **Kimya ve Performans Kitapçığı**; okunabilir yayın görünümü için **Güncel Mevki Listesi PDF** kullanılabilir. Tek kesin skor uyuşmazlığında Ömer için hesaplanmış **75.0** sayısı Excel ve formülle tutarlıdır; PDF’deki **75.1** ise kaynak sadakati gereği olduğu gibi aktarılmıştır.

**Doğrudan kaynak değişikliği yapılmadı.** Bu rapor, kaynak belgelerden ayrıdır; gerekirse ileride revizyon kararları bu rapor üzerinden verilebilir.


---

# ARŞİV BÖLÜMÜ 2: `Hali_Saha_Puanlama_Sistemi_Kural_Kitapcigi.md`

# Halı Saha Puanlama Sistemi — Temel Kural Kitapçığı

> Kaynak: `Hali_Saha_Puanlama_Sistemi_Kural_Kitapcigi.pdf` · 4 sayfa. Her sayfa sırasıyla aktarılmıştır.


---

<!-- Kaynak: Hali_Saha_Puanlama_Sistemi_Kural_Kitapcigi.pdf; sayfa 1/4 -->

HALI SAHA PUANLAMA SİSTEMİ

Temel Kural Kitapçığı - Yetenek, Mevki Uygunluğu ve Mevki Performans Puanı

## 1. Sistem neyi ölçüyor?


Bu sistemin amacı, bir oyuncuyu tek bir "genel puan" ile tanımlamak yerine üç ayrı katmanı birbirinden ayırmaktır: oyuncunun futbol yetenekleri, bir mevkide ne kadar doğal olduğu ve bu iki bilginin birleşiminden oluşan gerçekçi mevki performans puanı.

| Katman | Ölçek | Ne anlatır? |
| --- | --- | --- |
| Stage 1 - Mevki Uygunluğu | 1-10 | Oyuncu bu mevkide ne kadar doğal, alışık ve kullanılabilir? |
| Stage 2 - 12 Temel Yetenek | 1-10 | Oyuncunun futbol olarak gerçekten ne yapabildiği |
| Mevki Performans Puanı | 0-100 | Bu yeteneklerle ilgili mevkide kaçlık oynadığı |

Önemli ayrım: Bir oyuncunun bir mevkide 9/10 doğal olması, o mevkide çok iyi olduğu anlamına gelmez. Stage 1 sadece rol alışkanlığını ve doğal kullanımını anlatır; asıl futbol kalitesini Stage 2 belirler.

## 2. Stage 1 - Mevki uygunluğu


Mevki uygunluğu, oyuncunun o rolde ne kadar doğal olduğunu gösterir. Yetenek puanı değildir. Bir oyuncu stoperde 9/10 doğal olabilir ama savunma, güç veya pozisyon bilgisi zayıfsa gerçek stoper performans puanı yine düşük çıkar.

| Uygunluk | Katsayı | Yorum |
| --- | --- | --- |
| 10 | 1.00 | Tam doğal |
| 9 | 0.98 | Neredeyse tam doğal |
| 8 | 0.93 | Güçlü uyum |
| 7 | 0.84 | Belirgin ikinci rol |
| 6 | 0.76 | Kullanılabilir |
| 5 | 0.73 | Sınırlı ama yakın |
| 4 | 0.65 | Zayıf uyum |
| 3 | 0.56 | Nadir kullanım |
| 2 | 0.46 | Çok zayıf uyum |
| 1 | 0.35 | Pratikte doğal değil |

Ara değerler doğrusal olarak hesaplanır. Örneğin 8.5 uygunluk, 8 ve 9 katsayılarının ortasına denk gelir: yaklaşık 0.955.

## 3. Stage 2 - 12 temel yetenek

| Kısaltma | Yetenek | Ne ölçer? |
| --- | --- | --- |
| HIZ | Hız | Sürat, hızlanma ve açık alandaki tempo |

Halı Saha Puanlama Sistemi - Temel Kural Kitapçığı Sayfa 1

---

<!-- Kaynak: Hali_Saha_Puanlama_Sistemi_Kural_Kitapcigi.pdf; sayfa 2/4 -->

| Kısaltma | Yetenek | Ne ölçer? |
| --- | --- | --- |
| DAY | Dayanıklılık | Maç boyunca fiziksel seviyeyi koruyabilme |
| GÜÇ | Fizik/Güç | İkili mücadele ve temas direnci |
| PAS | Pas | Pas doğruluğu ve kalitesi |
| GÖR | Oyun Görüşü | Boş alanı, pas opsiyonunu ve oyunun devamını görebilme |
| KNTRL | Top Kontrolü | İlk dokunuş ve topu temiz kontrol etme |
| DRİB | Dripling | Topla adam eksiltme ve taşıma |
| ŞUT | Şut | Vuruş kalitesi ve tehdit oluşturma |
| BİT | Bitiricilik | Net pozisyonu gole çevirme |
| DEF | Savunma | Markaj, müdahale ve savunma becerisi |
| PRES | Pres/Top Kazanma | Rakibe baskı ve topu geri kazanma |
| POZ | Pozisyon Alma | Doğru yerde bulunma, koşu ve zamanlama |

Bu 12 puan oyuncunun kalıcı temel değerleridir. Bir maçtaki form, rakip veya takım ortamı bu temel değerleri kalıcı olarak değiştirmez.

## 4. Her mevki neden farklı hesaplanıyor?


Çünkü futbolda her rol farklı özellik ister. Stoper için savunma ve pozisyon alma çok önemliyken, kanatta hız ve dripling daha değerlidir. Bu nedenle her mevki için 12 yeteneğe ayrı ağırlık verilir. Her sütunun toplamı %100’dür.

| Özellik | Stoper | Bek | Göbek OS | Hücumcu OS | Kanat | Forvet |
| --- | --- | --- | --- | --- | --- | --- |
| HIZ | 10% | 18% | 5% | 8% | 20% | 15% |
| DAY | 6% | 14% | 12% | 7% | 10% | 7% |
| GÜÇ | 14% | 6% | 5% | 3% | 3% | 10% |
| PAS | 8% | 10% | 18% | 16% | 8% | 4% |
| GÖR | 4% | 6% | 16% | 18% | 8% | 4% |
| KNTRL | 5% | 7% | 10% | 12% | 10% | 8% |
| DRİB | 2% | 8% | 7% | 12% | 18% | 8% |
| ŞUT | 1% | 2% | 5% | 8% | 7% | 10% |
| BİT | 0% | 2% | 2% | 6% | 7% | 20% |
| DEF | 25% | 12% | 7% | 1% | 1% | 0% |
| PRES | 10% | 8% | 6% | 3% | 3% | 4% |
| POZ | 15% | 7% | 7% | 6% | 5% | 10% |

Örnek yorum: Kanatta HIZ %20 ve DRİB %18 ile öne çıkar. Forvette BİT %20 ile en yüksek ağırlıktadır. Stoperde DEF %25, POZ %15 ve GÜÇ %14 en belirleyici başlıklardır.

## 5. Ham mevki puanı nasıl bulunur?


Önce yalnızca 12 yetenek kullanılır. Her yetenek, ilgili mevkideki ağırlığıyla çarpılır ve sonuçlar toplanır. Böylece 10 üzerinden ham mevki yeteneği elde edilir.

Ham Mevki Puanı = Σ (Yetenek Puanı × Mevki Ağırlığı)

Halı Saha Puanlama Sistemi - Temel Kural Kitapçığı Sayfa 2

---

<!-- Kaynak: Hali_Saha_Puanlama_Sistemi_Kural_Kitapcigi.pdf; sayfa 3/4 -->

Örneğin bir göbek orta saha için PAS %18 ve GÖR %16 olduğu için, bu iki özellik toplamda sonucun %34’ünü oluşturur. Bu nedenle pas ve oyun görüşü güçlü bir oyuncu CM hesabında belirgin avantaj kazanır.

## 6. Final mevki performans puanı


Ham puan tek başına kullanılmaz. Oyuncunun o mevkide ne kadar doğal olduğunu gösteren Stage 1 de hesaba katılır; fakat özellikle düşük ağırlıkta tutulur.

Stage 2 yetenek etkisi: %92 Stage 1 mevki uygunluğu etkisi: %8

Final Mevki Puanı = [0.92 × Ham Mevki Puanı + 0.08 × (10 × Stage 1 Katsayısı)] × 10

Son ×10 işlemi yalnızca gösterim içindir. Böylece 8.03 yerine 80.3 gibi 100 üzerinden okunması daha kolay bir puan kullanılır.

## 7. Neden Stage 1 sadece %8?


Çünkü sistemin ana amacı yetenekleri ölçmektir. Mevki alışkanlığı oyuncuyu desteklemeli, ancak gerçek futbol kalitesini ezmemelidir. 9/10 doğal bir stoper, savunması kötü diye yüksek rating almamalı; aynı şekilde çok yetenekli bir oyuncu sırf bir mevkide 1/10 doğal diye tamamen yok sayılmamalıdır.

## 8. Baran üzerinden örnek hesap


Baran’ın örneği sistemin mantığını iyi gösterir. Güncel temel özellikleri aşağıdaki gibidir:

| HIZ | DAY | GÜÇ | PAS | GÖR | KNTRL | DRİB | ŞUT | BİT | DEF | PRES | POZ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7.5 | 8.5 | 7 | 8.5 | 8 | 8 | 7 | 6.5 | 4 | 8.5 | 7.5 | 8.5 |

Göbek Orta Saha: CM ağırlıklarıyla ham yetenek yaklaşık 7.89/10 çıkar. CM uygunluğu 8.5 olduğu için Stage 1 katsayısı yaklaşık 0.955’tir. Formül sonucunda baz CM ratingi yaklaşık 80.2 olur.

Bek: Bek ağırlıklarıyla ham yetenek yaklaşık 7.84/10 çıkar. Bek uygunluğu 10/10 olduğu için Stage 1 katkısı maksimumdur. Sonuç yaklaşık 80.1 olur.

Burada önemli olan şudur: Baran’ın teknik seti CM’de biraz daha avantajlıdır; buna karşılık bekteki 10/10 doğal rol uygunluğu farkı kapatır.

## 9. "Genel puan" ne anlama geliyor?


Bu sistemde 12 yeteneğin düz ortalamasını alıp oyuncuya tek bir genel puan vermiyoruz. Genel sıralamada kullanılan puan, oyuncunun gerçekçi biçimde kullanılabileceği en güçlü ana mevkideki baz performans ratingidir.

Örneğin bir oyuncunun kanat puanı 85.5 ve bu onun gerçek ana rolüyse, genel listede 85.5 ile yer alır. Bu sayı "her yerde 85.5 oynar" anlamına gelmez; yalnızca en güçlü gerçek rolündeki seviyesini gösterir.

## 10. Gerçek kullanım filtresi


Matematik bazen bir oyuncuyu alışık olmadığı bir rolde beklenenden yüksek gösterebilir. Bu nedenle Stage 1 ve bilinen kullanım alışkanlığıyla bir gerçek kullanım filtresi uygulanır. Amaç "hesaplayabiliyor" ile "normalde burada oynatılır" arasındaki farkı korumaktır.

Örneğin fiziksel ve teknik olarak çok güçlü bir hücumcu bazı bek ağırlıklarında yüksek ham puan çıkarabilir. Ancak Stage 1 verisi ve gerçek kullanım notları onun doğal rolünün kanat/forvet olduğunu söylüyorsa, genel sıralamadaki ana rolü bek yapılmaz.

Halı Saha Puanlama Sistemi - Temel Kural Kitapçığı Sayfa 3

---

<!-- Kaynak: Hali_Saha_Puanlama_Sistemi_Kural_Kitapcigi.pdf; sayfa 4/4 -->

## 11. Kaleciler


Saf kaleciler için şu an saha oyuncularındaki 12 özellik sistemi kullanılmaz. Kaleciler tek bir Kalecilik puanıyla 100 üzerinden değerlendirilir. Bu puan diğer saha mevkilerine zorla dönüştürülmez.

İleride istenirse refleks, bire bir, hava topu, pozisyon alma, ayakla oyun gibi ayrı kaleci özellikleri eklenebilir; fakat mevcut modelde tek Kalecilik ratingi kullanılır.

## 12. Maç içi efektif puan - kısa not


Baz mevki puanı oyuncunun kalıcı seviyesidir. Maç günü form, rakip eşleşmesi, takım yapısı veya mental durum nedeniyle geçici bir efektif performans oluşabilir. Bu etkiler baz ratingi değiştirmez; yalnızca o maç veya oyun fazı için uygulanır.

Bu kitapçık temel puanlama sistemine odaklanır. Ayrıntılı kimya, özel ikili/üçlü eşleşmeler ve oyuncu bazlı geçici bonus/cezalar ayrı Kimya ve Performans Kural Kitapçığında tutulur.

## 13. Sistemin tek cümlelik özeti

| Kavram | Kısa tanım |
| --- | --- |
| Yetenek Puanı | Oyuncunun ne kadar iyi olduğu |
| Mevki Uygunluğu | Nerede oynamaya ne kadar alışık olduğu |
| Ham Mevki Puanı | 12 yeteneğin o mevkinin ihtiyaçlarına göre ağırlıklı ortalaması |
| Final Mevki Puanı | %92 yetenek + %8 mevki uygunluğu, 100 üzerinden |
| Ana Rol | Gerçek kullanım filtresinden sonra oyuncunun en güçlü gerçek rolü |
| Efektif Maç Puanı | Baz puanın maç özelindeki form ve eşleşmelerle geçici olarak değişmiş hali |

Kısacası: "Bu oyuncu 80’lik" demek yerine, "Bu oyuncu bu mevkide 80 oynuyor; başka mevkilerde farklı puan üretir" yaklaşımı kullanılır. Sistem, oyuncuyu tek boyutlu değil rol bazlı değerlendirir.

Halı Saha Puanlama Sistemi - Temel Kural Kitapçığı Sayfa 4


---

# ARŞİV BÖLÜMÜ 3: `Hali_Saha_Kimya_Performans_Kural_Kitapcigi.md`

# Halı Saha — Kimya ve Performans Kural Kitapçığı

> Kaynak: `Hali_Saha_Kimya_Performans_Kural_Kitapcigi.pdf` · 7 sayfa. Aşağıdaki metin, tablo satırları ve tüm sayfa içerikleri aktarılmıştır.


---

<!-- Kaynak: Hali_Saha_Kimya_Performans_Kural_Kitapcigi.pdf; sayfa 1/7 -->

HALI SAHA

KİMYA VE PERFORMANS

KURAL KİTAPÇIĞI

Takım dengesi • oyuncu kimyası • form • eşleşme • maç içi modifier sistemi

Sistem Halı saha oyuncu veritabanı ve takım optimizasyonu

Sürüm Kimya / performans kuralları - 2026

Temel ilke Ana rating sabit, maçlık efektif rating dinamik

Halı Saha Kimya ve Performans Kural Kitapçığı


---

<!-- Kaynak: Hali_Saha_Kimya_Performans_Kural_Kitapcigi.pdf; sayfa 2/7 -->

## 1. Sistemin Temel Mantığı


Bu kitapçık, oyuncuların kalıcı yetenek puanlarını değiştirmeden; aynı takımda oynayan isimlerin ilişkisini, takım atmosferini, form durumunu, eşleşme avantajlarını ve maç içi psikolojik etkileri geçici “efektif puanlar” üzerinden değerlendirir.

- Stage 2 ana yetenek puanları kalıcıdır. Kimya, form ve matchup kuralları sadece o maç veya oyun fazı için efektif değeri değiştirir.

- Normal şartlarda aynı özelliğe gelen toplam bonus +1.0, toplam ceza -1.0 ile sınırlandırılır. Kilitli özel kurallar bu sınırı aşabilir.

- Takım kimyası, bireysel özellik bonuslarından ayrı bir katmandır. Bir oyuncu kendi statını kaybetmeden takımın atmosferini aşağı veya yukarı çekebilir.

- Takım kurucu, kuralları yalnız maçtan sonra yorumlamaz; kadroyu oluştururken olumlu eşleşmeleri, negatif kombinasyonları ve kritik mismatch risklerini önceden hesaba katar.

- Özel çift ve üçlü kimyalar genel atmosfer tarafından otomatik silinmez. Özellikle Arif-Barkuz gibi kilitli negatif ilişkiler ayrıca uygulanır.

## 2. Takım Kimyası Kaynakları


### 2.1 Güçlü olumlu stabilizatörler


Bu oyuncular normal davranışlarında takımın iletişimini, sakinliğini ve birlik duygusunu artırır. Kötü atmosferi tek başlarına tamamen yok etmezler; ancak hafif negatif bir kaynağı dengeleyebilirler.

- Baran - saha içi yönlendirme, iletişim ve oyun organizasyonu. Kavgacı değildir; düşük PAS/GÖR çevresinde yaşadığı frustrasyon teknik bağlantı problemidir.

- Kamil Reis - liderlik ve abi/reis etkisi; takım kimyası +0.5.

- Süleyman - sakin, olgun, pas odaklı ve kapsayıcı; takım kimyası +0.5.

- Alper - moral yükselten, hata sonrası destekleyen ve takım odaklı; gergin ortamda +0.5 kimya eğilimi.

- Hakan Göktuğ - özellikle savunma hattında yapıcı iletişim; +0.5 kimya eğilimi.

- Mali - pozitif ve proaktif takım etkisi; +0.5 kimya eğilimi.

- Onur - saygılı, görev disiplinli ve iyi niyetli; +0.5 kimya eğilimi.

- Ömer - sürekli pozitif ve mücadeleci; +0.5 kimya eğilimi.

- Eto - hatalara yargısız yaklaşan, dirençli ve pozitif; +0.5 kimya eğilimi.

- Melih - uyumlu, pozitif iletişimli ve kombinasyon oyununa açık; +0.5 kimya eğilimi.

- Taha - iyi niyetli, takım odaklı ve güvenilir; +0.5 kimya eğilimi.

- M.Emre - deneyimli savunma lideri ve dengeleyici; özellikle savunma ünitesinde +0.5 kimya eğilimi.

- Arif - genel olarak uyumlu ve dengeli; Barkuz eşleşmesi dışında nötr-pozitif.

- Eren - teknik/pas kalitesi yüksek gruplarda pozitif etkileşim verir; tek başına genel kimya kaynağı sayılmaz.

### 2.2 Nötr / düşük kimya etkili oyuncular


Ali Efe, Çaça, Emir, Eren Emeksiz, Halit, Metehan, Yiğit Çetinkaya, Oğuz, Akın, Batu, Berkin, Direnç, Fuat, Şeker ve Arda Barin kendi başlarına takım atmosferini otomatik olarak yukarı veya aşağı çekmez. Özel tetikleyicileri devreye girerse maçlık modifier uygulanır.

### 2.3 Kolay etkilenebilen / sinirlenebilen oyuncular


- Altuğ - pas alamazsa veya sevmediği oyuncuyla oynarsa oyundan kopabilir.

- Barkuz - form ve mental olarak dalgalı; Arif ile aynı takım özel negatif eşleşmedir.

- İsmail - negatif atmosferden ve yıldız rolü çatışmasından etkilenir.

- Tevfik - M.Emre kendi takımında değilse daha kolay irrite olabilir.

- Mustafa - kötü karar/bencillik günlerinde takım arkadaşlarını frustrasyona sokabilir.

- Göktuğ - servis alamadığında küsme/tartışma riski vardır; aynı zamanda kavgacı profildir.

- Uğur - negatif atmosferde tartışmayı büyütebilir; kendi performansı nispeten stabildir.

- Mensur - hafif kavgacı; rakibi ve bazen ortamı mental olarak zorlayabilir.

- Mahmut - hafif kavgacı.

- Utku - yalnız takımında en az iki başka kavgacı varsa kavgacı trait aktif olur.

Halı Saha Kimya ve Performans Kural Kitapçığı


---

<!-- Kaynak: Hali_Saha_Kimya_Performans_Kural_Kitapcigi.pdf; sayfa 3/7 -->

- Servan - güçlü kavgacı/negatif risk; küçümseme ve yapı bozma davranışı tetikleyicidir.

### 2.4 Kavgacı / aktif negatif kimya riski


Göktuğ (güçlü), Servan (güçlü), Uğur, Mensur (hafif), Mahmut (hafif) ve koşullu olarak Utku. Bu isimlerin yalnız kadroda bulunması otomatik ceza yaratmaz; negatif davranış tetiklendiğinde aktif negatif kaynak sayılırlar.

## 3. Takım Atmosferi Eşik Kuralları


- İyi kimya: en az 2 aktif olumlu stabilizatör + en fazla 1 aktif negatif kaynak. Kimyaya hassas oyuncular pozitif ortam bonusu alabilir.

- Kötü kimya: en az 2 aktif negatif kaynak veya Göktuğ/Servan gibi 1 güçlü negatif kaynak + başka bir irrite/kavgacı oyuncu. Hassas oyuncular negatif ortam cezası alabilir.

- Baran, Kamil Reis, Süleyman, M.Emre, Alper ve Hakan Göktuğ gibi güçlü stabilizatörlerden biri, atmosfer hesabında 1 hafif negatif kaynağı dengeleyebilir.

- Arif-Barkuz gibi kilitli çift cezası, genel pozitif atmosfer nedeniyle otomatik iptal edilmez.

- Takım kimyası raporu mutlaka isimlerle açıklanır: “kimya iyi” demek yerine hangi oyuncuların ortamı yükselttiği veya düşürdüğü belirtilir.

## 4. Kilitli Özel Kimya ve Eşleşme Kuralları

| Oyuncu / Durum | Tetikleyici | Aktif etki |
| --- | --- | --- |
| Alper + Taha | Aynı takım | İkisine de PAS +0.5, GÖR +0.5. |
| Arif + Barkuz | Aynı takım | İkisinin de PAS -0.5, GÖR -0.5; takım kimyası -1. |
| Baran + Eren | Aynı takım | İkisine de PAS +0.5, GÖR +0.5. |
| Baran + Eren + Arif | Aynı takım ve bağlantılı orta saha/build-up rolleri | Üçüne de PAS +0.5, GÖR +0.5. Baran-Eren bonusuyla stack olmaz. |
| Onur + Ömer | Aynı takım | İkisinin de tüm 12 Stage 2 özelliği +1.0. |
| Onur vs Ömer | Rakip takımlar | İkisinin de tüm 12 Stage 2 özelliği -0.5. |
| Yankı | Takımı aktif hücum fazında | Efektif HIZ = 10, PAS = 1. Oyun fazı bitince base değerlere döner. |
| M.Emre + Tevfik | Aynı takım | Tevfik’in M.Emre yokluğuna bağlı negatif kimya cezası tamamen kalkar. |

## 5. Oyuncu Bazlı Maçlık Modifier Kuralları

| Oyuncu / Durum | Tetikleyici | Aktif etki |
| --- | --- | --- |
| Akın | Yakın maçın son bölümü / clutch anı | ŞUT +0.5, BİT +0.5, POZ +0.5. |
| Ali Efe | Belirgin kötü form günü | DAY -0.5, PRES -0.5, POZ -0.5. |
| Alper | Taha ile aynı takım | PAS +0.5, GÖR +0.5. Genel pozitif kişiliği ayrıca direkt stat bonusu üretmez. |
| Altuğ | Pas alamama, mental kopma veya sevmediği oyuncuyla oynama | DAY -0.5, PRES -0.5, PAS -0.5. |
| Arda Barin | Pozitif clutch modu | ŞUT +0.5, BİT +0.5, POZ +0.5. |
| Arda Barin | Kötü varyans günü | PAS -0.5, KNTRL -0.5, POZ -0.5. |
| Arif | Barkuz ile aynı takım | PAS -0.5, GÖR -0.5; Barkuz da aynı cezayı alır; takım kimyası -1. |
| Baran | Güçlü PAS/GÖR oyuncularıyla çevrili | GÖR +0.5, POZ +0.5. |

Halı Saha Kimya ve Performans Kural Kitapçığı


---

<!-- Kaynak: Hali_Saha_Kimya_Performans_Kural_Kitapcigi.pdf; sayfa 4/7 -->

| Oyuncu / Durum | Tetikleyici | Aktif etki |
| --- | --- | --- |
| Baran | Çok düşük PAS/GÖR çevresi | GÖR -0.5, POZ -0.5. Bu kavgacılık değil teknik bağlantı/frustrasyon etkisidir. |
| Barkuz | Çok iyi form günü | ŞUT +0.5, BİT +0.5. |
| Barkuz | Çok kötü form günü | KNTRL -0.5, ŞUT -0.5, BİT -0.5. |
| Batu | Nefes/fizik problemi | İlgili fazda HIZ -0.5, DAY -1.0. |
| Berkin | Güçlü savunmacı yanında | DEF +0.5, POZ +0.5. |
| Berkin | Savunmayı tek başına taşıma | DEF -0.5, POZ -0.5. |
| Çaça | Normal kullanım | Özel modifier yok; stabil/nötr. |
| Direnç | Güçlü savunmacı yanında | DEF +0.5, POZ +0.5. |
| Direnç | Kötü gün | PAS -0.5, DEF -0.5, POZ -0.5. |
| Emir | Normal kullanım | Özel modifier yok. |
| Eren | Bağlantılı hattında PAS>=8 ve GÖR>=8 oyuncular | PAS +0.5, GÖR +0.5. |
| Eren | Düşük PAS/GÖR desteği | PAS -0.5, GÖR -0.5. |
| Eren | Çok iyi / kötü form | Uygun teknik özelliklerde +0.5 / -0.5. |
| Eren Emeksiz | Şimdilik | Veri az; modifier yok. |
| Erhan | Hızlı ve kooperatif koşucularla | PAS +0.5, GÖR +0.5. |
| Erhan | Bencil/top ezen veya çatışmalı hücum grubu | PAS -0.5, GÖR -0.5. |
| Eto | Rakip hücumcu HIZ/GÜÇ yaklaşık 7 | DEF -0.5, POZ -0.5. |
| Eto | Rakip hem HIZ hem GÜÇ 8+ | DEF -1.0, POZ -1.0; kritik mismatch. |
| Eto | Güçlü savunmacı yanında | Yukarıdaki matchup cezası uygun durumda 0.5 azaltılır. |
| Fuat | Kontrolsüz ileri koşular | POZ -1.0, DEF -0.5. |
| Fuat | Aşırı özgüvenli top kullanımı | KNTRL -0.5, PAS -0.5. |
| Fuat | Güçlü stoper yanında | Negatif etkinin bir kısmı absorbe edilir. |
| Göktuğ | Çok iyi gün | ŞUT +0.5, BİT +0.5. |
| Göktuğ | Pas gelmemesi, tartışma, küsme | PRES -0.5, POZ -0.5, BİT -0.5; aktif güçlü negatif kaynağa dönüşebilir. |
| Hakan Göktuğ | Fiziksel / yüksek GÜÇ stoper partneri | DEF +0.5, POZ +0.5. |
| Hakan Göktuğ | Rakibin yüksek PAS ile uzun/hava topu tehdidi | İlgili durumda DEF -0.5. |
| Halit | Fazla build-up sorumluluğu | PAS -0.5, KNTRL -0.5, GÖR -0.5. |
| İsmail | Baran-Arif-Eren üçlüsünden en az 2 kişi aynı takımda | PAS +0.5, GÖR +0.5. |
| İsmail | Göktuğ+Barkuz gibi iki dominant hücumcu ile | PAS -0.5, GÖR -0.5. |
| İsmail | Negatif takım atmosferi | KNTRL -0.5, GÖR -0.5. |
| Kamil Reis | Takımda normal rolünde | Takım kimyası +0.5; kişisel stat bonusu yok. |
| M.Emre | Berkin/Direnç/Şeker/Halit/Metehan gibi daha zayıf-ortalama stoperle | Partnerine DEF +0.5, POZ +0.5. |
| Mahmut | Çok kavgacı ortam | Takım kimyasında -0.5 risk. |
| Mali | Normal kullanım | Sabit kişisel modifier yok; pozitif/proaktif kimya kaynağı. |
| Mamadou | Normal kullanım | Özel modifier yok. |

Halı Saha Kimya ve Performans Kural Kitapçığı


---

<!-- Kaynak: Hali_Saha_Kimya_Performans_Kural_Kitapcigi.pdf; sayfa 5/7 -->

| Oyuncu / Durum | Tetikleyici | Aktif etki |
| --- | --- | --- |
| Melih | Güçlü pozitif pas/kombinasyon ortamı | PAS +0.5, GÖR +0.5. |
| Mensur | İyi gün | PAS +0.5, GÖR +0.5, KNTRL +0.5. |
| Mensur | Kötü gün | PAS -0.5, GÖR -0.5, KNTRL -0.5. |
| Mensur | Rakibi mental olarak bozması | Küçük mental/matchup etkisi; kalıcı stat değişmez. |
| Metehan | Fazla build-up sorumluluğu | PAS -0.5, KNTRL -0.5, GÖR -0.5. |
| Mustafa | Sorumluluk aldığı iyi gün | POZ +0.5, ŞUT +0.5. |
| Mustafa | Bencil/kötü karar günü | PAS -0.5, GÖR -0.5. |
| Oğuz | Şimdilik | Veri yetersiz; modifier yok. |
| Onur + Ömer | Aynı takım | Her iki oyuncunun tüm 12 özelliği +1.0. |
| Onur vs Ömer | Rakip takımlar | Her iki oyuncunun tüm 12 özelliği -0.5. |
| Servan | Zayıf oyuncuları aşağılama / pozisyon terk etme | Servan POZ -0.5, PAS -0.5; takım kimyası -1; aktif güçlü negatif kaynak. |
| Servan | Rol net ve yapı sağlıklı | Ceza yok. |
| Süleyman | Takımda normal rolünde | Takım kimyası +0.5; sakinleştirici liderlik. |
| Şeker | Güçlü stoper yanında | DEF +0.5, POZ +0.5. |
| Şeker | Rakibin onu hedeflemesi | DEF -0.5, POZ -0.5. |
| Taha | Alper ile aynı takım | PAS +0.5, GÖR +0.5. |
| Tevfik | M.Emre aynı takımda | Negatif kimya cezası yok. |
| Tevfik | M.Emre yok veya rakipte | Takım kimyası -0.5; irritasyon görünürse PAS -0.5, GÖR -0.5. |
| Uğur | Negatif/tartışmalı ortam | Kendi performansı büyük ölçüde sabit; takım kimyası -0.5. |
| Utku | Takımında en az 2 başka kavgacı | Kavgacı trait aktif; atmosfer riskini artırır. |
| Utku | Takımı önde | DEF +0.5, PRES +0.5, POZ +0.5, DAY +0.5. |
| Utku | Takımı geride | DEF -0.5, PRES -0.5, POZ -0.5, DAY -0.5. |
| Yankı | Takım aktif hücum fazında | HIZ=10, PAS=1; faz bitince base değerlere döner. |
| Yiğit Çetinkaya | Normal kullanım | Özel modifier yok. |
| Kiyan / Şahin / Talha / Yusuf / Sarp | Kaleci kimyası | Şimdilik özel modifier yok. |

## 6. İsim Bazlı Atmosfer Örnekleri

| Senaryo | İsimler | Sonuç |
| --- | --- | --- |
| Pozitif teknik çekirdek | Baran + Eren + Arif | Üçlü PAS/GÖR bonusu aktif olur. İsmail de aynı takımda ise kendi PAS/GÖR bonusunu tetikleyebilir. Bu takım yapısı kombinasyon oyununu destekler. |
| Pozitif liderlik çekirdeği | Baran + Süleyman + Kamil Reis | Üç güçlü stabilizatör. Tek bir hafif negatif kaynak atmosferi otomatik kötüye çeviremez. |
| Savunma güven ağı | M.Emre + Berkin | Berkin DEF +0.5 ve POZ +0.5 alır; M.Emre savunma kimyasını stabilize eder. |
| Savunma tamamlayıcılığı | Hakan Göktuğ + yüksek GÜÇ stoper | Hakan DEF +0.5 ve POZ +0.5 alır; fiziksel eksikliği partner tarafından kapatılır. |

Halı Saha Kimya ve Performans Kural Kitapçığı


---

<!-- Kaynak: Hali_Saha_Kimya_Performans_Kural_Kitapcigi.pdf; sayfa 6/7 -->

| Senaryo | İsimler | Sonuç |
| --- | --- | --- |
| Negatif güçlü çift | Göktuğ + Servan | İkisinden biri tetiklenirse kötü kimya eşiğine çok hızlı ulaşılır. İsmail gibi hassas oyuncular negatif atmosfer cezasına girebilir. |
| Negatif zincir | Göktuğ + Uğur + Utku | Göktuğ/Uğur aktif negatifleşirse Utku’nun koşullu kavgacı trait’i açılabilir ve atmosfer daha da bozulabilir. |
| Kilitli negatif çift | Arif + Barkuz | Genel takım çok pozitif olsa bile çiftin PAS/GÖR -0.5 ve takım kimyası -1 cezası ayrıca uygulanır. |
| Pozitif hücum ikilisi | Alper + Taha | İkisine PAS +0.5 ve GÖR +0.5; ayrıca iki oyuncu da takım atmosferini aşağı çekmez. |
| Aşırı özel pozitif çift | Onur + Ömer | Aynı takımda ikisinin tüm 12 özelliği +1.0. Bu kural normal +1 cap mantığının kilitli özel örneğidir. |
| Aşırı özel negatif çift | Onur vs Ömer | Rakip takımlardaysa ikisinin tüm 12 özelliği -0.5. |
| Pas ortamı | Baran + Süleyman + Melih | Melih’in pozitif kombinasyon ortamı bonusu PAS +0.5 / GÖR +0.5 aktive olabilir. |
| Teknik uyumsuzluk | Baran + çok düşük PAS/GÖR profilleri | Baran’ın GÖR -0.5 / POZ -0.5 bağlantı cezası tetiklenebilir; bu durum Baran’ın kavgacı olduğu anlamına gelmez. |

## 7. Takım Kurucunun Uygulama Sırası


- 1) Önce oyuncuların base yetenek ve mevki skorlarını hesapla.

- 2) Takımdaki pozitif stabilizatörleri, kavgacıları ve kimyaya hassas isimleri belirle.

- 3) Kilitli çift/üçlü kuralları uygula: Alper-Taha, Arif-Barkuz, Baran-Eren, Baran-Eren-Arif, Onur-Ömer vb.

- 4) Takım atmosferinin iyi/kötü eşiğe ulaşıp ulaşmadığını isimlerle kontrol et.

- 5) Oyuncu bazlı pozitif veya negatif ortam modifierlarını uygula.

- 6) Rakip eşleşmelerini kontrol et: özellikle Eto, Şeker, savunma partnerleri ve fiziksel/hız mismatchleri.

- 7) Maç içi skor/form tetikleyicilerini uygula: Utku, Barkuz, Göktuğ, Mensur, Arda Barin, Akın vb.

- 8) Son efektif takım gücünü yalnız toplam rating ile değil; HIZ, PAS, DEF, BİT, PRES, POZ dağılımları ve kritik mismatchlerle birlikte değerlendir.

- 9) Raporlama yaparken “kimya +0.5” demekle yetinme; bonusu/cezayı hangi isimlerin tetiklediğini açıkça yaz.

## 8. Kısa Referans - Stabilizatörler ve Risk Kaynakları

| Kategori | Oyuncular |
| --- | --- |
| Güçlü pozitif stabilizatörler | Baran, Kamil Reis, Süleyman, Alper, Hakan Göktuğ, M.Emre |
| Pozitif destekçiler | Mali, Onur, Ömer, Eto, Melih, Taha |
| Genel uyumlu | Arif (Barkuz hariç), Eren (teknik gruplarda) |
| Kolay etkilenebilen | Altuğ, Barkuz, İsmail, Tevfik, Mustafa |
| Kavgacı güçlü risk | Göktuğ, Servan |
| Kavgacı / orta risk | Uğur |

Halı Saha Kimya ve Performans Kural Kitapçığı


---

<!-- Kaynak: Hali_Saha_Kimya_Performans_Kural_Kitapcigi.pdf; sayfa 7/7 -->

| Kategori | Oyuncular |
| --- | --- |
| Hafif kavgacı | Mensur, Mahmut |
| Koşullu kavgacı | Utku - takımında en az 2 başka kavgacı varsa |

## 9. Not


Bu kural seti yaşayan bir modeldir. Yeni maç gözlemleri, yeni oyuncu verileri veya tekrarlanan davranış örüntüleri geldikçe kurallar revize edilebilir. Ancak revizyon yapılırken kalıcı base rating ile maçlık kimya/form modifierı birbirine karıştırılmamalıdır.

Halı Saha Kimya ve Performans Kural Kitapçığı



---

# ARŞİV BÖLÜMÜ 4: `Hali_Saha_Guncel_Mevki_Listesi.md`

# HALI SAHA - GÜNCEL OYUNCU MEVKİ PUANLARI

> Kaynak: `Hali_Saha_Guncel_Mevki_Listesi.pdf` · 1 sayfa · “Sıralama ana rol puanına göredir”.

| OYUNCU | ANA MEVKİ | PUAN | SONRAKİ MEVKİ | PUAN |
| --- | --- | --- | --- | --- |
| Taha | Kanat / Forvet | 87.5 | Hücumcu OS | 85.2 |
| Servan | Stoper | 86.3 | Göbek OS | 83.3 |
| Alper | Kanat / Forvet | 85.5 | Hücumcu OS | 82.2 |
| Mahmut | Hücumcu OS | 84.6 | Göbek OS | 83.5 |
| Göktuğ | Kanat / Forvet | 84.5 | Hücumcu OS | 82.8 |
| Barkuz | Forvet | 82.8 | Kanat | 78.6 |
| Kiyan | Kaleci | 82.5 | - | - |
| M.Emre | Stoper | 82.3 | Bek | 78.3 |
| Erhan | Hücumcu OS / Kanat | 81.7 | Göbek OS | 79.4 |
| İsmail | Forvet / Kanat | 81.7 | Hücumcu OS | 79.8 |
| Baran | Göbek OS / Bek | 80.2 | Hücumcu OS | 77.2 |
| Eren | Hücumcu OS / Kanat | 79.5 | Göbek OS | 77.1 |
| Arif | Göbek OS | 79.2 | Hücumcu OS | 77.7 |
| Emir | Kanat / Hücumcu OS | 78.3 | Forvet | 77.5 |
| Hakan Göktuğ | Stoper | 78.3 | Bek | 74.7 |
| Melih | Hücumcu OS / Göbek OS | 78.2 | Forvet | 75.8 |
| Şahin | Kaleci | 78.0 | - | - |
| Mustafa | Hücumcu OS | 77.5 | Göbek OS | 76.6 |
| Mali | Stoper / Bek | 77.3 | Göbek OS | 72.8 |
| Mensur | Hücumcu OS | 76.5 | Kanat | 74.8 |
| Süleyman | Kanat | 75.5 | Göbek OS | 75.3 |
| Onur | Bek | 75.1 | Forvet | 73.6 |
| Ömer | Stoper | 75.1 | Bek | 68.9 |
| Mamadou | Göbek OS | 74.7 | Stoper | 74.8 |
| Çaça | Göbek OS | 73.0 | Hücumcu OS | 71.2 |
| Utku | Stoper | 72.3 | Bek | 69.3 |
| Kamil Reis | Kanat / Hücumcu OS | 71.4 | Forvet | 68.5 |
| Ali Efe | Hücumcu OS | 70.3 | Göbek OS | 67.5 |
| Talha | Kaleci | 70.0 | - | - |
| Yusuf | Kaleci | 70.0 | - | - |
| Yankı | Bek | 69.8 | Stoper | 66.3 |
| Tevfik | Stoper | 69.2 | Bek | 61.9 |
| Berkin | Stoper | 68.1 | Bek | 64.0 |
| Direnç | Stoper | 67.7 | Bek | 62.6 |
| Eto | Stoper | 66.3 | Bek | 62.9 |
| Uğur | Stoper | 66.1 | Bek | 60.9 |
| Arda Barin | Göbek OS / Hücumcu OS | 64.7 | Bek | 61.6 |
| Yiğit Çetinkaya | Bek | 64.4 | Stoper | 62.7 |
| Batu | Bek | 64.0 | Kanat | 64.1 |
| Şeker | Stoper | 62.6 | Bek | 60.0 |
| Halit | Stoper | 62.1 | Bek | 58.6 |
| Metehan | Stoper | 62.1 | Bek | 58.6 |
| Sarp | Kaleci | 62.0 | - | - |
| Altuğ | Göbek OS | 61.6 | Stoper | 60.0 |
| Oğuz | Stoper / Bek | 61.0 | Göbek OS | 61.0 |
| Eren Emeksiz | Bek | 59.9 | Göbek OS | 58.6 |
| Fuat | Stoper | 59.7 | Bek | 54.3 |
| Akın | Stoper | 33.0 | Bek | 26.8 |


---

# ARŞİV BÖLÜMÜ 5: `Hali_Saha_Tam_Oyuncu_Veritabani.md`

# Halı Saha — Tam Oyuncu Veritabanı

> Kaynak: `Hali_Saha_Tam_Oyuncu_Veritabani.xlsx` · 2 çalışma sayfası · 48 oyuncu. Bu MD, değerleri, boş hücreleri ve ana puan formüllerini aktarır.

## Çalışma sayfası: Oyuncu Veritabanı

İlk satırdaki birleştirilmiş grup başlıkları: `A1:B1` SIRALAMA; `C1:I1` MEVKİ PERFORMANSI / 100; `J1:U1` 12 TEMEL YETENEK / 10; `V1:AB1` MEVKİ UYGUNLUĞU / 10; `AC1:AD1` ANA ROL.

Aşağıdaki tablolar, aynı 48 satırı sıra/oyuncu anahtarı üzerinden üç sütun grubuna ayırır. Boş tablo hücresi Excel’de gerçekten boş hücre anlamındadır.

### Sıralama, tüm mevki performansları ve ana rol

| Sıra | Oyuncu | Kaleci | Stoper | Bek | Göbek OS | Hücumcu OS | Kanat | Forvet | Ana Mevki | Ana Puan | Ana Puan Formülü (Excel) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Taha |  | 77 | 83.6 | 84 | 85.2 | 87.5 | 87.2 | Kanat | 87.5 | =H3 |
| 2 | Servan |  | 86.3 | 82.3 | 83.3 | 81.7 | 77.5 | 79.6 | Stoper | 86.3 | =D4 |
| 3 | Alper |  | 59.1 | 70.7 | 76.2 | 82.2 | 85.5 | 84.5 | Kanat | 85.5 | =H5 |
| 4 | Mahmut |  | 72.8 | 76.3 | 83.5 | 84.6 | 81.6 | 77 | Hücumcu OS | 84.6 | =G6 |
| 5 | Göktuğ |  | 57.7 | 69.1 | 74.8 | 82.8 | 84.5 | 84.2 | Kanat | 84.5 | =H7 |
| 6 | Barkuz |  | 56.1 | 64.1 | 61.8 | 67.4 | 78.6 | 82.8 | Forvet | 82.8 | =I8 |
| 7 | Kiyan | 82.5 |  |  |  |  |  |  | Kaleci | 82.5 | =C9 |
| 8 | M.Emre |  | 82.3 | 78.3 | 73.3 | 70.5 | 68.8 | 65.7 | Stoper | 82.3 | =D10 |
| 9 | Erhan |  | 65.4 | 72.1 | 79.4 | 81.7 | 81.7 | 76.1 | Hücumcu OS | 81.7 | =G11 |
| 10 | İsmail |  | 54.6 | 65.4 | 71.7 | 79.8 | 80.9 | 81.7 | Forvet | 81.7 | =I12 |
| 11 | Baran |  | 78.8 | 80.1 | 80.2 | 77.2 | 74.9 | 67 | Göbek OS | 80.2 | =F13 |
| 12 | Eren |  | 62.9 | 69.6 | 77.1 | 79.5 | 78.7 | 74.7 | Hücumcu OS | 79.5 | =G14 |
| 13 | Arif |  | 79.8 | 80.5 | 79.2 | 77.7 | 78 | 76.2 | Göbek OS | 79.2 | =F15 |
| 14 | Emir |  | 58 | 65.3 | 71.3 | 77.7 | 78.3 | 77.5 | Kanat | 78.3 | =H16 |
| 15 | Hakan Göktuğ |  | 78.3 | 74.7 | 68.4 | 63.2 | 64.2 | 57.6 | Stoper | 78.3 | =D17 |
| 16 | Melih |  | 55.3 | 63.7 | 73.6 | 78.2 | 75.3 | 75.8 | Hücumcu OS | 78.2 | =G18 |
| 17 | Şahin | 78 |  |  |  |  |  |  | Kaleci | 78 | =C19 |
| 18 | Mustafa |  | 70.6 | 70.8 | 76.6 | 77.5 | 73.1 | 73.5 | Hücumcu OS | 77.5 | =G20 |
| 19 | Mali |  | 77.3 | 75.2 | 72.8 | 69.4 | 69.3 | 66.1 | Stoper | 77.3 | =D21 |
| 20 | Mensur |  | 66.6 | 65.4 | 73.9 | 76.5 | 74.8 | 72.6 | Hücumcu OS | 76.5 | =G22 |
| 21 | Süleyman |  | 65.8 | 73.1 | 75.3 | 74.4 | 75.5 | 68.4 | Kanat | 75.5 | =H23 |
| 22 | Onur |  | 73.5 | 75.1 | 71.6 | 69.5 | 67.3 | 73.6 | Bek | 75.1 | =E24 |
| 23 | Ömer |  | 75 | 68.9 | 60.6 | 51.2 | 54 | 57.2 | Stoper | 75 | =D25 |
| 24 | Mamadou |  | 74.8 | 70.1 | 74.7 | 69.1 | 64.6 | 58.4 | Göbek OS | 74.7 | =F26 |
| 25 | Çaça |  | 68.6 | 67.9 | 73 | 71.2 | 64 | 58.1 | Göbek OS | 73 | =F27 |
| 26 | Utku |  | 72.3 | 69.3 | 67.2 | 63.8 | 61.9 | 60 | Stoper | 72.3 | =D28 |
| 27 | Kamil Reis |  | 57.3 | 64 | 66.7 | 71.4 | 71.4 | 68.5 | Kanat | 71.4 | =H29 |
| 28 | Ali Efe |  | 54.5 | 61.3 | 67.5 | 70.3 | 67.8 | 64.6 | Hücumcu OS | 70.3 | =G30 |
| 29 | Talha | 70 |  |  |  |  |  |  | Kaleci | 70 | =C31 |
| 30 | Yusuf | 70 |  |  |  |  |  |  | Kaleci | 70 | =C32 |
| 31 | Yankı |  | 66.3 | 69.8 | 59 | 53.8 | 61.3 | 56 | Bek | 69.8 | =E33 |
| 32 | Tevfik |  | 69.2 | 61.9 | 60.8 | 56.1 | 51 | 49.6 | Stoper | 69.2 | =D34 |
| 33 | Berkin |  | 68.1 | 64 | 56.9 | 55.1 | 55.7 | 54.7 | Stoper | 68.1 | =D35 |
| 34 | Direnç |  | 67.7 | 62.6 | 56.9 | 52.3 | 50.4 | 46.9 | Stoper | 67.7 | =D36 |
| 35 | Eto |  | 66.3 | 62.9 | 55 | 50.3 | 52 | 47.5 | Stoper | 66.3 | =D37 |
| 36 | Uğur |  | 66.1 | 60.9 | 59.3 | 53.8 | 51.2 | 47.9 | Stoper | 66.1 | =D38 |
| 37 | Arda Barin |  | 56.5 | 61.6 | 64.7 | 64.2 | 60.1 | 55 | Göbek OS | 64.7 | =F39 |
| 38 | Yiğit Çetinkaya |  | 62.7 | 64.4 | 62.9 | 63.4 | 60.2 | 55.5 | Bek | 64.4 | =E40 |
| 39 | Batu |  | 59.7 | 64 | 66 | 63.4 | 64.1 | 55.5 | Bek | 64 | =E41 |
| 40 | Şeker |  | 62.6 | 60 | 51.9 | 49.2 | 50.9 | 46 | Stoper | 62.6 | =D42 |
| 41 | Halit |  | 62.1 | 58.6 | 52.5 | 47.9 | 47.1 | 44.7 | Stoper | 62.1 | =D43 |
| 42 | Metehan |  | 62.1 | 58.6 | 52.5 | 47.9 | 47.1 | 44.7 | Stoper | 62.1 | =D44 |
| 43 | Sarp | 62 |  |  |  |  |  |  | Kaleci | 62 | =C45 |
| 44 | Altuğ |  | 60 | 57.8 | 61.6 | 58.1 | 53.2 | 52.7 | Göbek OS | 61.6 | =F46 |
| 45 | Oğuz |  | 61 | 61 | 61 | 58 | 58 | 58 | Stoper | 61 | =D47 |
| 46 | Eren Emeksiz |  | 59.8 | 59.9 | 58.6 | 52.4 | 51.2 | 48.8 | Bek | 59.9 | =E48 |
| 47 | Fuat |  | 59.7 | 54.3 | 49.3 | 45.8 | 43.9 | 42.5 | Stoper | 59.7 | =D49 |
| 48 | Akın |  | 33 | 26.8 | 23.1 | 21.5 | 18.6 | 21.2 | Stoper | 33 | =D50 |


### 12 temel yetenek (Stage 2)

| Sıra | Oyuncu | HIZ | DAY | GÜÇ | PAS | GÖR | KNTRL | DRİB | ŞUT | BİT | DEF | PRES | POZ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Taha | 9 | 9 | 8 | 8 | 8 | 8.5 | 9 | 8.5 | 9 | 7 | 9 | 8 |
| 2 | Servan | 8.5 | 8.5 | 9 | 8.5 | 8.5 | 8 | 8 | 8.5 | 6 | 9.5 | 8 | 7 |
| 3 | Alper | 9 | 9 | 8 | 8 | 8 | 8.5 | 9 | 9 | 9 | 2 | 5 | 6 |
| 4 | Mahmut | 8 | 8 | 8 | 8.5 | 9 | 9 | 10 | 6.5 | 6 | 6 | 7.5 | 8 |
| 5 | Göktuğ | 9 | 8 | 7 | 8 | 8 | 8 | 9 | 9 | 9 | 1 | 6 | 7.5 |
| 6 | Barkuz | 9 | 8 | 8.5 | 5 | 5 | 8 | 8 | 9 | 9.5 | 2 | 3.5 | 7.5 |
| 7 | Kiyan |  |  |  |  |  |  |  |  |  |  |  |  |
| 8 | M.Emre | 7.5 | 7.5 | 8.5 | 8 | 8 | 7.5 | 6.5 | 7 | 4 | 9 | 7 | 8 |
| 9 | Erhan | 8.5 | 8.5 | 7 | 8.5 | 8.5 | 8 | 8 | 8 | 6 | 3 | 7 | 9 |
| 10 | İsmail | 8 | 7.5 | 8 | 8 | 7 | 8.5 | 9 | 9 | 9 | 1 | 5 | 6 |
| 11 | Baran | 7.5 | 8.5 | 7 | 8.5 | 8 | 8 | 7 | 6.5 | 4 | 8.5 | 7.5 | 8.5 |
| 12 | Eren | 7.5 | 8 | 7.5 | 8 | 8 | 8 | 8 | 8.5 | 6 | 3 | 7 | 8 |
| 13 | Arif | 9.5 | 9 | 8.5 | 7.5 | 7.5 | 7 | 7 | 7 | 6 | 7.5 | 8 | 8 |
| 14 | Emir | 8 | 7 | 7.5 | 7.5 | 7.5 | 8 | 8 | 9 | 7.5 | 2.5 | 5 | 7 |
| 15 | Hakan Göktuğ | 8 | 7 | 7.5 | 7 | 7 | 6.5 | 7 | 4 | 2 | 8.5 | 7 | 8 |
| 16 | Melih | 7 | 7.5 | 7 | 8 | 8 | 7.5 | 8 | 8 | 8 | 1 | 5.5 | 8 |
| 17 | Şahin |  |  |  |  |  |  |  |  |  |  |  |  |
| 18 | Mustafa | 7.5 | 7 | 8 | 7.5 | 7 | 8 | 8 | 9 | 7 | 6.5 | 6.5 | 8.5 |
| 19 | Mali | 8 | 8 | 8 | 7 | 7 | 6.5 | 7 | 6.5 | 4 | 8 | 8 | 6.5 |
| 20 | Mensur | 7 | 6 | 7.5 | 8 | 8 | 8 | 8 | 8 | 6 | 5 | 5 | 7 |
| 21 | Süleyman | 7 | 7 | 7.5 | 8 | 7.5 | 7.5 | 8 | 8 | 6 | 5.5 | 7 | 7 |
| 22 | Onur | 7 | 8.5 | 8.5 | 7 | 6.5 | 6 | 6.5 | 6 | 7 | 7.5 | 9 | 8 |
| 23 | Ömer | 7 | 9 | 7.5 | 4 | 4 | 4 | 3 | 5 | 4 | 7.5 | 10 | 9 |
| 24 | Mamadou | 6.5 | 8 | 8 | 7.5 | 7.5 | 7.5 | 7 | 5 | 2 | 7.5 | 7.5 | 7.5 |
| 25 | Çaça | 7 | 7 | 6 | 8 | 8 | 7 | 6.5 | 5 | 3 | 6 | 7.5 | 7.5 |
| 26 | Utku | 6.5 | 7.5 | 8 | 6 | 6.5 | 6 | 6.5 | 6 | 4 | 7 | 8 | 7 |
| 27 | Kamil Reis | 6 | 6 | 6.5 | 7.5 | 7.5 | 7.5 | 8 | 7 | 7 | 4 | 5 | 7 |
| 28 | Ali Efe | 7 | 6 | 7 | 7 | 7 | 7.5 | 7 | 7 | 5 | 2 | 6 | 7 |
| 29 | Talha |  |  |  |  |  |  |  |  |  |  |  |  |
| 30 | Yusuf |  |  |  |  |  |  |  |  |  |  |  |  |
| 31 | Yankı | 8.5 | 9 | 8 | 4 | 4 | 6 | 7 | 5 | 3 | 7 | 8 | 3 |
| 32 | Tevfik | 4 | 6.5 | 7.5 | 7 | 7 | 7 | 4 | 3 | 3 | 7.5 | 6 | 7 |
| 33 | Berkin | 7 | 6 | 8 | 5.5 | 6 | 5 | 5 | 6 | 3 | 7 | 4 | 7.5 |
| 34 | Direnç | 6 | 6 | 6 | 6.5 | 6.5 | 5 | 4 | 2 | 2 | 7 | 7 | 7.5 |
| 35 | Eto | 6 | 6 | 6 | 5 | 5 | 5 | 6 | 3 | 2 | 7 | 9 | 6 |
| 36 | Uğur | 5.5 | 6.5 | 7 | 6.5 | 6.5 | 6.5 | 4 | 3 | 2 | 7 | 4 | 7 |
| 37 | Arda Barin | 5.5 | 6.5 | 5 | 6.5 | 6.5 | 6 | 7 | 7.5 | 3 | 6 | 5 | 6 |
| 38 | Yiğit Çetinkaya | 6 | 5 | 5 | 7.5 | 7.5 | 7 | 6.5 | 7.5 | 3 | 6 | 5 | 7.5 |
| 39 | Batu | 6 | 5 | 5 | 7.5 | 7.5 | 7 | 6.5 | 7.5 | 3 | 6 | 5 | 7.5 |
| 40 | Şeker | 6 | 6 | 6 | 5 | 5 | 5 | 6 | 3 | 2 | 7 | 5 | 6 |
| 41 | Halit | 5 | 7 | 7.5 | 6 | 5 | 5 | 4 | 2 | 2 | 6 | 5 | 6 |
| 42 | Metehan | 5 | 7 | 7.5 | 6 | 5 | 5 | 4 | 2 | 2 | 6 | 5 | 6 |
| 43 | Sarp |  |  |  |  |  |  |  |  |  |  |  |  |
| 44 | Altuğ | 5 | 4 | 8 | 6 | 8 | 7 | 5 | 6.5 | 5 | 7 | 3 | 3 |
| 45 | Oğuz | 6 | 6 | 6 | 6 | 6 | 6 | 6 | 6 | 6 | 6 | 6 | 6 |
| 46 | Eren Emeksiz | 6 | 6 | 6 | 6 | 6 | 6 | 4 | 4 | 3 | 6 | 5 | 6 |
| 47 | Fuat | 4 | 5 | 6 | 5 | 5 | 5 | 4 | 4 | 2 | 6.5 | 6 | 6 |
| 48 | Akın | 1 | 1 | 3 | 3 | 2 | 2 | 1 | 2 | 2 | 4 | 1 | 4 |


### 7 mevki uygunluğu sütunu (Stage 1)

| Sıra | Oyuncu | GK | CB | FB | CM | CAM | W | ST |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Taha | 1 | 1 | 6 | 8 | 8 | 9 | 9 |
| 2 | Servan | 1 | 10 | 4 | 7 | 7 | 1 | 9 |
| 3 | Alper | 1 | 1 | 1 | 6 | 7 | 10 | 10 |
| 4 | Mahmut | 1 | 1 | 1 | 10 | 9 | 4 | 5 |
| 5 | Göktuğ | 1 | 1 | 1 | 5 | 9 | 9 | 9 |
| 6 | Barkuz | 9 | 1 | 1 | 1 | 1 | 9 | 10 |
| 7 | Kiyan | 10 | 1 | 1 | 1 | 1 | 1 | 1 |
| 8 | M.Emre | 1 | 10 | 9 | 1 | 1 | 1 | 1 |
| 9 | Erhan | 1 | 1 | 1 | 8 | 8 | 9 | 4 |
| 10 | İsmail | 1 | 1 | 1 | 5 | 9 | 8 | 9 |
| 11 | Baran | 1 | 4 | 10 | 8.5 | 8 | 7 | 2 |
| 12 | Eren | 1 | 1 | 2 | 9 | 9 | 9 | 5 |
| 13 | Arif | 1 | 6 | 6 | 9 | 9 | 5 | 5 |
| 14 | Emir | 1 | 1 | 1 | 6 | 9 | 10 | 8 |
| 15 | Hakan Göktuğ | 1 | 10 | 9 | 3 | 1 | 1 | 1 |
| 16 | Melih | 1 | 1 | 1 | 9 | 9 | 6 | 6 |
| 17 | Şahin | 10 | 1 | 1 | 1 | 1 | 1 | 1 |
| 18 | Mustafa | 1 | 1 | 1 | 9 | 8 | 1 | 1 |
| 19 | Mali | 1 | 9 | 7 | 7 | 5 | 3 | 4 |
| 20 | Mensur | 1 | 7 | 1 | 9 | 9 | 9 | 9 |
| 21 | Süleyman | 1 | 1 | 9 | 9 | 5 | 9 | 1 |
| 22 | Onur | 1 | 1 | 7 | 4 | 5 | 1 | 8 |
| 23 | Ömer | 1 | 9 | 9 | 7 | 2 | 1 | 1 |
| 24 | Mamadou | 1 | 6 | 2 | 9 | 5 | 1 | 1 |
| 25 | Çaça | 1 | 5 | 3 | 10 | 9 | 1 | 1 |
| 26 | Utku | 1 | 8 | 7 | 6 | 4 | 1 | 1 |
| 27 | Kamil Reis | 1 | 1 | 5 | 3 | 6 | 9 | 5 |
| 28 | Ali Efe | 1 | 1 | 3 | 9 | 9 | 5 | 3 |
| 29 | Talha | 10 | 1 | 1 | 1 | 1 | 1 | 1 |
| 30 | Yusuf | 10 | 1 | 1 | 1 | 1 | 1 | 1 |
| 31 | Yankı | 1 | 7 | 9 | 4 | 1 | 1 | 1 |
| 32 | Tevfik | 1 | 9 | 7 | 1 | 1 | 1 | 1 |
| 33 | Berkin | 3 | 9 | 9 | 1 | 1 | 1 | 1 |
| 34 | Direnç | 1 | 9 | 8 | 1 | 1 | 1 | 1 |
| 35 | Eto | 1 | 9 | 9 | 2 | 1 | 1 | 1 |
| 36 | Uğur | 1 | 9 | 7 | 3 | 1 | 1 | 1 |
| 37 | Arda Barin | 1 | 1 | 7 | 9 | 8 | 3 | 3 |
| 38 | Yiğit Çetinkaya | 1 | 5 | 9 | 1 | 1 | 1 | 1 |
| 39 | Batu | 1 | 1 | 8 | 5 | 1 | 7 | 1 |
| 40 | Şeker | 1 | 9 | 9 | 1 | 1 | 1 | 1 |
| 41 | Halit | 1 | 9 | 9 | 1 | 1 | 1 | 1 |
| 42 | Metehan | 1 | 9 | 9 | 1 | 1 | 1 | 1 |
| 43 | Sarp | 10 | 1 | 1 | 1 | 1 | 1 | 1 |
| 44 | Altuğ | 1 | 9 | 9 | 9 | 2 | 1 | 1 |
| 45 | Oğuz | 1 | 5 | 5 | 5 | 1 | 1 | 1 |
| 46 | Eren Emeksiz | 1 | 6 | 9 | 7 | 1 | 1 | 1 |
| 47 | Fuat | 1 | 9 | 9 | 1 | 1 | 1 | 1 |
| 48 | Akın | 1 | 9 | 9 | 1 | 1 | 1 | 1 |


### Excel son notu (A52:AD52 birleştirilmiş)

Not: Mevki performansları baz puanlardır; kimya, form, özel eşleşme ve maç içi modifierlar bu tabloya dahil değildir. Ana mevki, gerçek kullanım filtresine göre belirlenmiştir; matematiksel olarak başka bir mevkide çok az daha yüksek puan çıkması ana rolü otomatik değiştirmez.

### Dosya yapısı

- Veri aralığı: `A1:AD52`.
- Birleştirilmiş aralıklar: `A1:B1, C1:I1, J1:U1, V1:AB1, AC1:AD1, A52:AD52`.
- Excel tablo nesnesi: `[('OyuncuVeritabani', 'A2:AD50')]`.
- Ana puan sütununda 48 formül vardır; her oyuncunun formülü ilk tabloda gösterilmiştir.

## Çalışma sayfası: Model Özeti

| Model Unsuru | Değer | Ağırlık/Not | Açıklama |
| --- | --- | --- | --- |
| Stage 2 | 12 temel yetenek | %92 | Mevki performansının ana kaynağı |
| Stage 1 | Mevki uygunluğu | %8 | Doğal/alışılmış rolü hafifçe etkiler |
| Puan ölçeği | 100 üzerinden | x10 | Örn. 8.03 → 80.3 |
| Kimya/Form | Bu tabloda hariç | Maçlık | Baz ratingleri kalıcı değiştirmez |
| Ana rol filtresi | Gerçek kullanım | Öncelikli | Acil durum mevkisi ana rol sayılmaz |

