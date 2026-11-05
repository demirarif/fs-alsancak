# Oyuncu envanteri — aktarım ve doğrulama raporu

> `npm run import:catalog` ile üretilir. Kaynak Markdown değiştirilmez.

Katalog sürümü: `catalog-v1-9347d28af9853371`  
Kaynak SHA-256: `71a05733134776e6cf834c665d6ae0a6b2a631611637e23adea96e4001f2da46`

## Sonuç

- **48 oyuncu:** 43 saha oyuncusu ve 5 kaleci.
- **258/258 saha mevki puanı** kaynak formülüyle hesaplandı ve kaynak gösterim hassasiyetinde doğrulandı.
- **48/48 ana puan**, **48/48 yayın ana puanı** ve **43/43 ikinci mevki puanı** doğrulandı.
- Uygulama ratingleri kullanıcının isteğiyle **iki ondalık** olarak hesaplanır. Kaynakta tek ondalıklı gösterimler için ±0,05 gösterim payı kullanılır.
- 12 temel özellik ve 7 mevki uygunluğu korunur; kalecilere eksik saha özellikleri eklenmez.
- Ana rol kaynak tercihi olarak korunur; daha yüksek hesaplanan başka bir mevkiye otomatik çevrilmez.
- 8 kilitli kimya, 68 oyuncu modifier ve 12 atmosfer örneği satırı kaynaklarıyla korundu. Çalıştırılabilir kimya motoru dördüncü adımdadır.

## Kaynak gösterim farkları

| Oyuncu | PDF gösterimi | İki ondalıklı uygulama puanı | Açıklama |
| --- | ---: | ---: | --- |
| Ömer | 75,10 | 75,05 | Tek ondalıklı Excel/PDF gösterimleri arşivde korundu; uygulama puanı kaynak formülünden iki ondalıkla hesaplandı. |

Onur CAM **69,55** ve Altuğ CB **60,05** normal iki ondalıklı puanlardır. Kaynaktaki tek ondalıklı gösterim farklılıkları veri hatası sayılmaz.

## Envanter

| Sabit ID | Oyuncu | Ana rol | Ana puan | Kullanım tercihleri |
| --- | --- | --- | ---: | --- |
| taha | Taha | Kanat | 87,47 | Kanat / Forvet / Hücumcu OS |
| servan | Servan | Stoper | 86,29 | Stoper / Göbek OS |
| alper | Alper | Kanat | 85,46 | Kanat / Forvet / Hücumcu OS |
| mahmut | Mahmut | Hücumcu OS | 84,61 | Hücumcu OS / Göbek OS |
| goktug | Göktuğ | Kanat | 84,52 | Kanat / Forvet / Hücumcu OS |
| barkuz | Barkuz | Forvet | 82,80 | Forvet / Kanat |
| kiyan | Kiyan | Kaleci | 82,50 | Kaleci |
| m-emre | M.Emre | Stoper | 82,29 | Stoper / Bek |
| erhan | Erhan | Hücumcu OS | 81,73 | Hücumcu OS / Kanat / Göbek OS |
| ismail | İsmail | Forvet | 81,67 | Forvet / Kanat / Hücumcu OS |
| baran | Baran | Göbek OS | 80,23 | Göbek OS / Bek / Hücumcu OS |
| eren | Eren | Hücumcu OS | 79,46 | Hücumcu OS / Kanat / Göbek OS |
| arif | Arif | Göbek OS | 79,19 | Göbek OS / Hücumcu OS |
| emir | Emir | Kanat | 78,33 | Kanat / Hücumcu OS / Forvet |
| hakan-goktug | Hakan Göktuğ | Stoper | 78,29 | Stoper / Bek |
| melih | Melih | Hücumcu OS | 78,22 | Hücumcu OS / Göbek OS / Forvet |
| sahin | Şahin | Kaleci | 78,00 | Kaleci |
| mustafa | Mustafa | Hücumcu OS | 77,54 | Hücumcu OS / Göbek OS |
| mali | Mali | Stoper | 77,25 | Stoper / Bek / Göbek OS |
| mensur | Mensur | Hücumcu OS | 76,52 | Hücumcu OS / Kanat |
| suleyman | Süleyman | Kanat | 75,46 | Kanat / Göbek OS |
| onur | Onur | Bek | 75,08 | Bek / Forvet |
| omer | Ömer | Stoper | 75,05 | Stoper / Bek |
| mamadou | Mamadou | Göbek OS | 74,68 | Göbek OS / Stoper |
| caca | Çaça | Göbek OS | 73,04 | Göbek OS / Hücumcu OS |
| utku | Utku | Stoper | 72,30 | Stoper / Bek |
| kamil-reis | Kamil Reis | Kanat | 71,37 | Kanat / Hücumcu OS / Forvet |
| ali-efe | Ali Efe | Hücumcu OS | 70,31 | Hücumcu OS / Göbek OS |
| talha | Talha | Kaleci | 70,00 | Kaleci |
| yusuf | Yusuf | Kaleci | 70,00 | Kaleci |
| yanki | Yankı | Bek | 69,85 | Bek / Stoper |
| tevfik | Tevfik | Stoper | 69,16 | Stoper / Bek |
| berkin | Berkin | Stoper | 68,05 | Stoper / Bek |
| direnc | Direnç | Stoper | 67,69 | Stoper / Bek |
| eto | Eto | Stoper | 66,26 | Stoper / Bek |
| ugur | Uğur | Stoper | 66,12 | Stoper / Bek |
| arda-barin | Arda Barin | Göbek OS | 64,70 | Göbek OS / Hücumcu OS / Bek |
| yigit-cetinkaya | Yiğit Çetinkaya | Bek | 64,37 | Bek / Stoper |
| batu | Batu | Bek | 63,97 | Bek / Kanat |
| seker | Şeker | Stoper | 62,58 | Stoper / Bek |
| halit | Halit | Stoper | 62,12 | Stoper / Bek |
| metehan | Metehan | Stoper | 62,12 | Stoper / Bek |
| sarp | Sarp | Kaleci | 62,00 | Kaleci |
| altug | Altuğ | Göbek OS | 61,61 | Göbek OS / Stoper |
| oguz | Oğuz | Stoper | 61,04 | Stoper / Bek / Göbek OS |
| eren-emeksiz | Eren Emeksiz | Bek | 59,91 | Bek / Göbek OS |
| fuat | Fuat | Stoper | 59,68 | Stoper / Bek |
| akin | Akın | Stoper | 33,05 | Stoper / Bek |

## Yenileme

- Kaynağı veya model tanımını güncelledikten sonra: `npm run import:catalog`.
- Üretilen verilerin güncelliğini değiştirmeden kontrol et: `npm run check:catalog`.
- Davranış/doğrulama testleri: `npm run test:catalog`.
- Normal build güncellik kontrolü yapar; eskimiş JSON ile sessizce devam etmez.
