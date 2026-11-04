# V1 sözleşmeleri ve oyuncu envanteri

Envanter/puanlama ve misafir/profil/kayıt adımları uygulandı. `data/generated` kaynak MD'den üretilen sürümlü JSON; `data/markdown-importer.ts` aktarım; `domain/ratings.ts` iki ondalıklı puanlama; `domain/guest-player.ts` referanstan türetme; `data/local-catalog.ts` IndexedDB kayıt adaptörüdür. `features/player-library.ts`, envanter, misafir formu ve ortak profili mevcut görünüme bağlar. Diğer modüller sonraki adımların sözleşmeleridir.

- Mimari: [../../docs/architecture.md](../../docs/architecture.md)
- Uygulama sırası: [../../docs/implementation-roadmap.md](../../docs/implementation-roadmap.md)
- Genel dışa açılan sözleşmeler: `index.ts`
- Kontrol: `npm run check:architecture`
- Veri aktarımı: `npm run import:catalog`
- Güncellik: `npm run check:catalog`
- Testler: `npm run test:catalog`
- Misafir, profil ve kalıcı kayıt testleri: `npm run test:guests`
- [Aktarım raporu](../../docs/catalog-import-report.md)

Mevcut `src/main.js`, `scene.js`, `stadium.js`, `player-model.js` ve `demo.js` onaylanan 3D provadır. `src/players.js` artık 22 prova oyuncusunu gerçek envanterden ID ile alır. V1 ekranları/motor sonraki adımlarda bağlanır.
