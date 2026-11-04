# Alsancak — 3D görünüm provası

**V1 ilk üç adım hazır:** 48 oyunculuk envanter, iki ondalıklı puanlama, referanstan misafir oluşturma, oyuncu profilleri ve kalıcı Mavi/Kırmızı kadro seçimi. Ana ekranda takım başlığını seçip sağdaki oyunculara tıkla. **+ Misafir** ile referanstan yeni oyuncu ekle. [Aktarım raporu](docs/catalog-import-report.md), [mimari](docs/architecture.md), [uygulama sırası](docs/implementation-roadmap.md). Sıradaki adım diziliş önerileri ve canlı takım değerlendirmesi.

**3D demo** bağlantısı 105 × 68 m saha, 22 sade oyuncu, uzak yayın kamerası ve bağlamsal isimleri gösterir. Demo, görsel onay için hazırlanmış 72 saniyelik **hazır hareket sekansı** oynatır. Oyuncu puanlarından maç sonucu hesaplamaz. Demodaki kadrolar örnektir; ana ekrandaki seçimler ayrı kaydedilir.

## Çalıştırma

```powershell
npm install
npm run dev
```

Terminaldeki yerel adresi aç. Üretim derlemesi: `npm run build`.

Mimari tip kontrolü: `npm run check:architecture`.

Oyuncu verisini kaynaktan üretmek için `npm run import:catalog`; değiştirmeden güncellik kontrolü için `npm run check:catalog`; veri ve puanlama testleri için `npm run test:catalog`. `npm run build` önce katalog güncelliğini doğrular.

Misafir/profil/IndexedDB testleri: `npm run test:guests`. Yerel kayıtlar aynı tarayıcı ve adres/orijinde kalır; tarayıcı site verileri silinirse bu kayıtlar da silinir.

Kadro seçimi/kaleci kontrolleri ve kalıcı taslak testleri: `npm run test:selection`. İki takımda 11'er oyuncu ve birer gerçek kaleci gerekir. Aynı oyuncu iki kez seçilemez. Her seçim revizyonu sırayla kaydedilir; başka sekmenin yeni kaydı ezilmez. Oyuncu satırından profil açılır, × ile çıkarılır; **Temizle** yalnız ilgili takımın seçimlerini boşaltır.

Profil görünümü FM referansına göre lacivert/antrasit tonlarında, 20 üzerinden tam sayılar ve rol yıldızlarıyla sunulur. Özellikler yeşil/sarı/kırmızı eşiklerle gösterilir; özellik çubukları kaldırılmıştır. Kayıt/hesaplama hassasiyeti iki ondalık olarak korunur.

## Kontroller

- Oynat/duraklat, başa al, ¼× / ½× / 1× / 2× / 4× hız ve sürüklenebilir zaman çizelgesi.
- Beş pozisyona doğrudan geçiş: orta saha, çapraz pas, ara pas/koşu, ceza sahası, kaleci.
- Yayın, geniş ve kale arkası kameraları; yakınlık ayarı; tam ekran.
- Akıllı isimleri aç/kapat. Aynı anda en fazla beş küçük, arka plansız isim; kaleciler top kendilerindeyken. Top sahibi yeşil, takım işareti mavi daire/kırmızı kare. Kaleciler beyaz/siyah forma giyer.
- Klavye: Boşluk oynat/duraklat, R başa al, ← / → üç saniye geri/ileri.

## Küçük dosya ayrımı

- `src/stadium.js`: saha, çizgiler, kaleler, tribünler; dış görsel varlık gerektirmez.
- `src/player-model.js`: sade 3D oyuncu modeli ve koşu animasyonu.
- `src/scene.js`: görüntüleme, kamera ve isim yerleşimi.
- `src/demo.js`: yalnızca hazır hareket provası; kare sözleşmesi: oyuncu konumları, top, top sahibi ve görünür isimler.
- `src/players.js`: örnek kadroların saha yerleşimi; 22 oyuncuyu gerçek envanterden sabit ID ile alır.
- `src/v1/data/generated`: 48 kişilik JSON envanter, aktarım raporu ve korunmuş kimya metni.
- `src/v1/domain/ratings.ts`: kaynak formülüyle iki ondalıklı mevki puanlama.
- `src/v1/domain/guest-player.ts`: referans oyuncudan yüzdeyle misafir oluşturma; baz puan/özel kimya ayrımı.
- `src/v1/data/local-catalog.ts`: sürümlü IndexedDB, atomik misafir kaydı ve salt okunur kaynakla birleştirme.
- `src/v1/features/player-library.ts`: oyuncu envanteri, canlı ekleme formu ve profil pencereleri.
- `src/v1/application/selection-service.ts`: değişmez kadro komutları ve diziliş öncesi doğrulama.
- `src/v1/data/local-selection.ts`: kadro taslağı, atomik kayıt ve sekmeler arası revizyon kontrolü.
- `src/v1/features/team-selection/controller.ts`: tıklayarak kadro seçimi, filtreler ve kayıt kuyruğu.
- `src/main.js`: giriş/3D demo geçişi ve ortak oyuncu kütüphanesi.
- `src/preview.js`: gerektiğinde yüklenen 3D prova ve kontrolleri; kadro ekranındayken çizim durur.

Görsel geri bildirim kabul edildi. V1 mimarisi `src/v1` altında tanımlandı; mevcut görüntüleyici ileride maç motoru veya kayıtlı tekrar tarafından üretilen kareleri gösterecek adaptöre dönüştürülecek.

## Sonraki aşama için kaydedilen istekler

- Seçilen iki kadroya diziliş önerisi ve mevki düzenleme; 11'e 11 büyük sahada maç motoruna bağlama.
- 12 kalıcı özellik, mevki uygunluğu, koşullu kimya, rakip eşleşmesi, yorgunluk ve ileride haftalık form. Kalıcı veri ile maçlık etkiler ayrı tutulacak.
- Pas seçimi PAS/GÖR; kontrol KNTRL; koşu HIZ/DAY; şut ŞUT/BİT; savunma DEF/PRES/POZ/GÜÇ gibi birden fazla özellik ve pozisyon koşullarıyla belirlenecek.
- Maç hazırlanırken sahaya çıkış/kadro sunumu; arka planda hesaplanan simülasyon ve kayıttan akıcı gösterim.
- Kullanıcının gerçek skor örnekleri: 4–2, 4–3, 4–4, 5–5, 7–5, 9–7, 11–7; uç örnek 16–0. 3–3 de mümkün. Bunlar kalibrasyon referanslarıdır; şimdilik skor sabitlenmez veya sonuç üretilmez. Maç süresi ve saha ölçeği ile birlikte hücum sıklığı/başarı oranı ayarlanacak.
- Kaynaktaki belirsizlikler (efektif 10 üstü değerler, bazı bonusların birleşmesi, nitel tetikleyiciler) motor aşamasında açık kurallar olarak ele alınacak.

## Doğrulama

Derleme: Vite. Oynatma demosu sabit bir fonksiyon olduğundan zaman çizelgesinde geri/ileri gitmek aynı kareyi üretir. Tarayıcıda WebGL desteği gerekir. Yazı tipleri yüklenmezse yerel sistem fontları kullanılır.
