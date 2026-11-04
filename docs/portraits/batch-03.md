# Oyuncu portreleri — toplu ekleme / batch 03

## Kapsam ve durum

Kullanıcı, onayladığı Baran ve üç örneğin ardından fotoğrafı bulunan bütün oyuncuların aynı şablonla üretilip sisteme eklenmesini istedi. Bu talep, batch-02.md içindeki örneklerden sonra onay bekleme notunun yerini alır.

Bu turda dokuz yeni portre eklendi. Baran, Onur, Göktuğ ve Utku ile birlikte kaynak fotoğrafı bulunan 13 oyuncu tamamlandı. Mevcut 48 kişilik katalogdaki diğer 35 oyuncunun fotoğrafı yok; mevcut forma illüstrasyonlarını kullanmaya devam ediyorlar. Kaynakta olmayan yüzler üretilmedi.

Üretim yöntemi: yerleşik imagegen aracı, her oyuncu için ayrı düzenleme çağrısı; transparent_background=true. CLI/API alternatifi kullanılmadı. Her çağrıda ilk referans orijinal kişi fotoğrafı, ikinci referans onaylı forma/kadraj örneğidir. Orijinaller, önceki sürümler ve araç çıktı dosyaları korundu.

## Ortak şablon

- Önden, göz hizasında, başın tamamı görünür; dik ve dengeli omuzlar, gövde ortasına kadar kadraj.
- Nötr stüdyo ışığı, gerçekçi kumaş, birbirine uygun baş/gövde ölçeği ve temiz alfa kenarları.
- Her iki kolun silüeti forma manşetinde biter; manşet altında kol/ten görünmez. Orta gövde aşağı devam eder.
- Kaynaktaki yüz, yaş, saç, sakal ve ten korunur. Gülümseyenlerde hafif kapalı ağız tebessümü, ciddi duranlarda sakin ciddi ifade.
- Kulüp renkleri mevcut görsel kimlikten alınır; fotoğraftaki eski forma takımı değiştirmez. Sponsor ve kulüp arması yoktur.
- Göğüste yalnızca küçük yuvarlak millî bayrak: Mamadou için mevcut sistemle uyumlu Papua Yeni Gine; diğerleri Türkiye.
- Barin'in gözlüğü korunur. Barkuz'un kişisel kartı sarı/laciverttir; kaleci modu ve futbol verileri değişmez.

## Eklenen dosyalar

| Oyuncu / sabit ID | Kaynak (futbolcu gorselleri/) | Forma | Uygulama dosyası |
| --- | --- | --- | --- |
| Akın / akin | akın.jpeg | Fenerbahçe · sarı/lacivert çubuklu | src/assets/portraits/akin-v1.png |
| Arif / arif | arif.png | Galatasaray · sarı/kırmızı parçalı | src/assets/portraits/arif-v1.png |
| Arda Barin / arda-barin | barin.jpeg | Fenerbahçe · sarı/lacivert çubuklu | src/assets/portraits/arda-barin-v1.png |
| Barkuz / barkuz | barkuz.jpeg | Fenerbahçe · sarı/lacivert çubuklu | src/assets/portraits/barkuz-v1.png |
| Batu / batu | batu.jpeg | Beşiktaş · siyah/beyaz çubuklu | src/assets/portraits/batu-v1.png |
| Kamil Reis / kamil-reis | kamil reis.jpeg | Fenerbahçe · sarı/lacivert çubuklu | src/assets/portraits/kamil-reis-v1.png |
| Mamadou / mamadou | mamadou.jpeg | Beşiktaş · siyah/beyaz çubuklu | src/assets/portraits/mamadou-v1.png |
| Uğur / ugur | uğur.jpeg | Fenerbahçe · sarı/lacivert çubuklu | src/assets/portraits/ugur-v1.png |
| Fuat / fuat | sağdan sola arif fuat (en soldaki futbolcu listesinde yok boşver).jpeg | Galatasaray · sarı/kırmızı parçalı | src/assets/portraits/fuat-v1.png |

Fuat, adlandırılmış grup fotoğrafındaki ortadaki papyonlu kişidir. En sağdaki Arif için daha net olan arif.png kullanıldı; en soldaki katalog dışı kişi işlenmedi. Önceki grup fotoğrafındaki Göktuğ ile Hakan Göktuğ farklı sabit ID'lerdir; bu tur Hakan Göktuğ için yüz eklenmedi.

## Uygulama bağlantısı ve sonraki revizeler

Tek eşleme noktası: src/v1/features/player-profile/player-kit.ts / PLAYER_PORTRAITS. Her dosya sabit oyuncu ID'siyle kayıtlıdır. Profil kartı, envanter ve oyuncu paylaşım görselinin portre alanı mevcut ortak görsel kimlik üzerinden kullanır. Takım seçimi/diziliş alanlarındaki mavi/kırmızı takım formaları korunur.

Yeni portre veya revize geldiğinde yeni sürümlü PNG ekleyip yalnız ilgili ID'nin URL'sini güncellemek yeterli. Eski dosyaları silmeyin. Oyun motoru, oyuncu yetenekleri, ana katalog ve kaynak MD bu çalışma kapsamında değiştirilmedi.

## Üretimde kullanılan tam istemler

### Akın (akin)

İlk referans: futbolcu gorselleri/akın.jpeg

İkinci referans: C:/Users/arifdemir/Desktop/fs-alsancak/src/assets/portraits/utku-v1.png

```text
Use case: identity-preserve / compositing. Produce ONE transparent professional football-player bust cutout, matching the supplied approved Baran template in composition, scale, lighting, realism and finish. Image 1 is ONLY the new player's facial identity reference; image 2 is ONLY the approved Baran framing/lighting/jersey construction reference. Replace Baran with the specified person; do NOT transfer Baran's face, hair or beard to the new player. Preserve the real source person's identity, facial structure, eye and nose shapes, age, skin tone, hairline and hairstyle. Natural skin detail, no face beautification, no plastic smoothing, no invented jaw. Eye-level front-facing camera, square and level shoulders, complete crown around 5% below the top of a roughly 4:5 portrait canvas, centred head at 50% width, same natural adult head-to-shoulder ratio as the template. Soft neutral studio key light, subtle rim, cohesive chin/collar shadows, clean high-end football-game portrait quality. One short-sleeved jersey, crown to mid-torso. CRITICAL SLEEVE CROP: the cutout ENDS EXACTLY at the fabric edge of each short sleeve cuff; outside the central torso there must be genuine alpha transparency immediately below both sleeves. NO bare upper arms, NO forearms, NO hands. Only face, ears and neck show skin. Keep jersey torso extending below the sleeve level as in the approved template; no rectangular whole-image chop. Realistic football fabric, seams, folds, crew collar. ONLY one small round Turkish red crescent-and-star badge at upper centre chest. No club logo, no sponsors, no brands, no lettering, no numbers. True transparent background with clean alpha hair/fabric edges. No stadium, backdrop, baked checkerboard, floor shadow, card, UI, text, extra people or collage. Output only the single new player's cutout.

IDENTITY: The target AKIN is the single large foreground man taking the outdoor selfie. Preserve his short side-swept dark hair, thick eyebrows, broad fuller cheeks, distinctive eyes, nose and full short dark beard/moustache. Keep his heavier facial build and neck proportions, without slimming or beautifying. Give him a very subtle relaxed closed-mouth smile close to his source. Remove the coat, casual shirt, drink and background.

KIT: Use EXACTLY the yellow and deep navy vertical stripe pattern, cloth, crew collar, gold piping and cuff construction from image 2 (approved Utku). One small round Turkish crescent-and-star badge at upper centre chest. No club or sponsor logo.
```

### Arif (arif)

İlk referans: futbolcu gorselleri/arif.png

İkinci referans: C:/Users/arifdemir/Desktop/fs-alsancak/src/assets/portraits/baran-v2.png

```text
Use case: identity-preserve / compositing. Produce ONE transparent professional football-player bust cutout, matching the supplied approved Baran template in composition, scale, lighting, realism and finish. Image 1 is ONLY the new player's facial identity reference; image 2 is ONLY the approved Baran framing/lighting/jersey construction reference. Replace Baran with the specified person; do NOT transfer Baran's face, hair or beard to the new player. Preserve the real source person's identity, facial structure, eye and nose shapes, age, skin tone, hairline and hairstyle. Natural skin detail, no face beautification, no plastic smoothing, no invented jaw. Eye-level front-facing camera, square and level shoulders, complete crown around 5% below the top of a roughly 4:5 portrait canvas, centred head at 50% width, same natural adult head-to-shoulder ratio as the template. Soft neutral studio key light, subtle rim, cohesive chin/collar shadows, clean high-end football-game portrait quality. One short-sleeved jersey, crown to mid-torso. CRITICAL SLEEVE CROP: the cutout ENDS EXACTLY at the fabric edge of each short sleeve cuff; outside the central torso there must be genuine alpha transparency immediately below both sleeves. NO bare upper arms, NO forearms, NO hands. Only face, ears and neck show skin. Keep jersey torso extending below the sleeve level as in the approved template; no rectangular whole-image chop. Realistic football fabric, seams, folds, crew collar. ONLY one small round Turkish red crescent-and-star badge at upper centre chest. No club logo, no sponsors, no brands, no lettering, no numbers. True transparent background with clean alpha hair/fabric edges. No stadium, backdrop, baked checkerboard, floor shadow, card, UI, text, extra people or collage. Output only the single new player's cutout.

IDENTITY: The target ARIF is the single man in image 1 on a white background. Preserve his exact narrow/oval facial structure, slightly narrowed eyes, long swept-up dark hairstyle, natural brows, small moustache and light jaw stubble. Keep his relaxed composed neutral closed-mouth expression. Preserve the source face with high fidelity, replacing only the black T-shirt with the standard football jersey.

KIT: Use the same Galatasaray-colour shirt as approved Baran: viewer-left torso GOLDEN YELLOW, viewer-right torso DEEP RED, reversed short-sleeve colours, dark red crew neck and fine gold trim. One small round Turkish crescent-and-star badge at upper centre chest, no club or sponsor logo.
```

### Arda Barin (arda-barin)

İlk referans: futbolcu gorselleri/barin.jpeg

İkinci referans: C:/Users/arifdemir/Desktop/fs-alsancak/src/assets/portraits/utku-v1.png

```text
Use case: identity-preserve / compositing. Produce ONE transparent professional football-player bust cutout, matching the supplied approved Baran template in composition, scale, lighting, realism and finish. Image 1 is ONLY the new player's facial identity reference; image 2 is ONLY the approved Baran framing/lighting/jersey construction reference. Replace Baran with the specified person; do NOT transfer Baran's face, hair or beard to the new player. Preserve the real source person's identity, facial structure, eye and nose shapes, age, skin tone, hairline and hairstyle. Natural skin detail, no face beautification, no plastic smoothing, no invented jaw. Eye-level front-facing camera, square and level shoulders, complete crown around 5% below the top of a roughly 4:5 portrait canvas, centred head at 50% width, same natural adult head-to-shoulder ratio as the template. Soft neutral studio key light, subtle rim, cohesive chin/collar shadows, clean high-end football-game portrait quality. One short-sleeved jersey, crown to mid-torso. CRITICAL SLEEVE CROP: the cutout ENDS EXACTLY at the fabric edge of each short sleeve cuff; outside the central torso there must be genuine alpha transparency immediately below both sleeves. NO bare upper arms, NO forearms, NO hands. Only face, ears and neck show skin. Keep jersey torso extending below the sleeve level as in the approved template; no rectangular whole-image chop. Realistic football fabric, seams, folds, crew collar. ONLY one small round Turkish red crescent-and-star badge at upper centre chest. No club logo, no sponsors, no brands, no lettering, no numbers. True transparent background with clean alpha hair/fabric edges. No stadium, backdrop, baked checkerboard, floor shadow, card, UI, text, extra people or collage. Output only the single new player's cutout.

IDENTITY: The target ARDA BARIN is the single foreground man giving two thumbs up in the night football photo. Preserve his actual facial identity, prominent ears, short upright dark hairstyle, light moustache/beard and, CRITICALLY, his recognizable thin BLACK ROUND-RECTANGULAR EYEGLASSES. Keep glasses realistic and correctly aligned, with clear lenses and soft reflections. Give him a composed, slightly friendly closed-mouth expression close to the source. Standard neutral bust pose, remove hands, original red Real Madrid shirt and background.

KIT: Use EXACTLY the yellow and deep navy vertical stripe pattern, cloth, crew collar, gold piping and cuff construction from image 2 (approved Utku). One small round Turkish crescent-and-star badge at upper centre chest. No club or sponsor logo.
```

### Barkuz (barkuz)

İlk referans: futbolcu gorselleri/barkuz.jpeg

İkinci referans: C:/Users/arifdemir/Desktop/fs-alsancak/src/assets/portraits/utku-v1.png

```text
Use case: identity-preserve / compositing. Produce ONE transparent professional football-player bust cutout, matching the supplied approved Baran template in composition, scale, lighting, realism and finish. Image 1 is ONLY the new player's facial identity reference; image 2 is ONLY the approved Baran framing/lighting/jersey construction reference. Replace Baran with the specified person; do NOT transfer Baran's face, hair or beard to the new player. Preserve the real source person's identity, facial structure, eye and nose shapes, age, skin tone, hairline and hairstyle. Natural skin detail, no face beautification, no plastic smoothing, no invented jaw. Eye-level front-facing camera, square and level shoulders, complete crown around 5% below the top of a roughly 4:5 portrait canvas, centred head at 50% width, same natural adult head-to-shoulder ratio as the template. Soft neutral studio key light, subtle rim, cohesive chin/collar shadows, clean high-end football-game portrait quality. One short-sleeved jersey, crown to mid-torso. CRITICAL SLEEVE CROP: the cutout ENDS EXACTLY at the fabric edge of each short sleeve cuff; outside the central torso there must be genuine alpha transparency immediately below both sleeves. NO bare upper arms, NO forearms, NO hands. Only face, ears and neck show skin. Keep jersey torso extending below the sleeve level as in the approved template; no rectangular whole-image chop. Realistic football fabric, seams, folds, crew collar. ONLY one small round Turkish red crescent-and-star badge at upper centre chest. No club logo, no sponsors, no brands, no lettering, no numbers. True transparent background with clean alpha hair/fabric edges. No stadium, backdrop, baked checkerboard, floor shadow, card, UI, text, extra people or collage. Output only the single new player's cutout.

IDENTITY: The target BARKUZ is the single main foreground man wearing goalkeeper gloves in image 1. Preserve his short dark slightly swept-up hairstyle, square/full face, close full dark beard/moustache, eyebrows and exact eyes/nose proportions. Keep his serious composed closed-mouth expression and natural neck/build. Remove gloves, exposed arms, original patterned goalkeeper shirt and the pitch/background. This is his personal club-shirt portrait, so use the specified yellow/navy jersey, not a goalkeeper outfit.

KIT: Use EXACTLY the yellow and deep navy vertical stripe pattern, cloth, crew collar, gold piping and cuff construction from image 2 (approved Utku). One small round Turkish crescent-and-star badge at upper centre chest. No club or sponsor logo.
```

### Batu (batu)

İlk referans: futbolcu gorselleri/batu.jpeg

İkinci referans: C:/Users/arifdemir/Desktop/fs-alsancak/src/assets/portraits/baran-v2.png

```text
Use case: identity-preserve / compositing. Produce ONE transparent professional football-player bust cutout, matching the supplied approved Baran template in composition, scale, lighting, realism and finish. Image 1 is ONLY the new player's facial identity reference; image 2 is ONLY the approved Baran framing/lighting/jersey construction reference. Replace Baran with the specified person; do NOT transfer Baran's face, hair or beard to the new player. Preserve the real source person's identity, facial structure, eye and nose shapes, age, skin tone, hairline and hairstyle. Natural skin detail, no face beautification, no plastic smoothing, no invented jaw. Eye-level front-facing camera, square and level shoulders, complete crown around 5% below the top of a roughly 4:5 portrait canvas, centred head at 50% width, same natural adult head-to-shoulder ratio as the template. Soft neutral studio key light, subtle rim, cohesive chin/collar shadows, clean high-end football-game portrait quality. One short-sleeved jersey, crown to mid-torso. CRITICAL SLEEVE CROP: the cutout ENDS EXACTLY at the fabric edge of each short sleeve cuff; outside the central torso there must be genuine alpha transparency immediately below both sleeves. NO bare upper arms, NO forearms, NO hands. Only face, ears and neck show skin. Keep jersey torso extending below the sleeve level as in the approved template; no rectangular whole-image chop. Realistic football fabric, seams, folds, crew collar. ONLY one small round Turkish red crescent-and-star badge at upper centre chest. No club logo, no sponsors, no brands, no lettering, no numbers. True transparent background with clean alpha hair/fabric edges. No stadium, backdrop, baked checkerboard, floor shadow, card, UI, text, extra people or collage. Output only the single new player's cutout.

IDENTITY: The target BATU is the single foreground man with one arm raised and the other hand on his chest. Preserve his thick upward-styled dark hair, broad face, eyebrows, eyes, nose and very light facial stubble. Replace his broad toothy grin with a natural SUBTLE CLOSED-MOUTH SMILE while keeping him recognizable. Standard square-shouldered front-facing bust, no raised arm or hands, no arm tattoos visible because arms end at the sleeve cuffs. Replace original Arsenal jersey and remove all original branding. Add one small round Turkish crescent-and-star badge at upper centre chest.

KIT: Use a classic Beşiktaş-colour BLACK AND OFF-WHITE VERTICALLY STRIPED short-sleeved jersey, evenly spaced black/white stripes, black crew neck with thin off-white trim and matching cuffs. Keep the approved template's silhouette, cloth, shoulder construction, pose, scale and lighting. No club or sponsor logo.
```

### Kamil Reis (kamil-reis)

İlk referans: futbolcu gorselleri/kamil reis.jpeg

İkinci referans: C:/Users/arifdemir/Desktop/fs-alsancak/src/assets/portraits/utku-v1.png

```text
Use case: identity-preserve / compositing. Produce ONE transparent professional football-player bust cutout, matching the supplied approved Baran template in composition, scale, lighting, realism and finish. Image 1 is ONLY the new player's facial identity reference; image 2 is ONLY the approved Baran framing/lighting/jersey construction reference. Replace Baran with the specified person; do NOT transfer Baran's face, hair or beard to the new player. Preserve the real source person's identity, facial structure, eye and nose shapes, age, skin tone, hairline and hairstyle. Natural skin detail, no face beautification, no plastic smoothing, no invented jaw. Eye-level front-facing camera, square and level shoulders, complete crown around 5% below the top of a roughly 4:5 portrait canvas, centred head at 50% width, same natural adult head-to-shoulder ratio as the template. Soft neutral studio key light, subtle rim, cohesive chin/collar shadows, clean high-end football-game portrait quality. One short-sleeved jersey, crown to mid-torso. CRITICAL SLEEVE CROP: the cutout ENDS EXACTLY at the fabric edge of each short sleeve cuff; outside the central torso there must be genuine alpha transparency immediately below both sleeves. NO bare upper arms, NO forearms, NO hands. Only face, ears and neck show skin. Keep jersey torso extending below the sleeve level as in the approved template; no rectangular whole-image chop. Realistic football fabric, seams, folds, crew collar. ONLY one small round Turkish red crescent-and-star badge at upper centre chest. No club logo, no sponsors, no brands, no lettering, no numbers. True transparent background with clean alpha hair/fabric edges. No stadium, backdrop, baked checkerboard, floor shadow, card, UI, text, extra people or collage. Output only the single new player's cutout.

IDENTITY: The target KAMIL REIS is the single main foreground man smiling in the football photo. Preserve his actual adult age, subtly receding temples, short brushed-back dark hair, broad friendly face, smile lines, nose, eyes and dark beard stubble. Do not make him younger or give him a new full hairline. Turn the broad toothy grin into a warm restrained CLOSED-MOUTH SMILE. Replace original white shirt with the common yellow/navy football jersey, remove the original crest/branding and background.

KIT: Use EXACTLY the yellow and deep navy vertical stripe pattern, cloth, crew collar, gold piping and cuff construction from image 2 (approved Utku). One small round Turkish crescent-and-star badge at upper centre chest. No club or sponsor logo.
```

### Mamadou (mamadou)

İlk referans: futbolcu gorselleri/mamadou.jpeg

İkinci referans: C:/Users/arifdemir/Desktop/fs-alsancak/src/assets/portraits/baran-v2.png

```text
Use case: identity-preserve / compositing. Produce ONE transparent professional football-player bust cutout, matching the supplied approved Baran template in composition, scale, lighting, realism and finish. Image 1 is ONLY the new player's facial identity reference; image 2 is ONLY the approved Baran framing/lighting/jersey construction reference. Replace Baran with the specified person; do NOT transfer Baran's face, hair or beard to the new player. Preserve the real source person's identity, facial structure, eye and nose shapes, age, skin tone, hairline and hairstyle. Natural skin detail, no face beautification, no plastic smoothing, no invented jaw. Eye-level front-facing camera, square and level shoulders, complete crown around 5% below the top of a roughly 4:5 portrait canvas, centred head at 50% width, same natural adult head-to-shoulder ratio as the template. Soft neutral studio key light, subtle rim, cohesive chin/collar shadows, clean high-end football-game portrait quality. One short-sleeved jersey, crown to mid-torso. CRITICAL SLEEVE CROP: the cutout ENDS EXACTLY at the fabric edge of each short sleeve cuff; outside the central torso there must be genuine alpha transparency immediately below both sleeves. NO bare upper arms, NO forearms, NO hands. Only face, ears and neck show skin. Keep jersey torso extending below the sleeve level as in the approved template; no rectangular whole-image chop. Realistic football fabric, seams, folds, crew collar. ONLY one small round Papua New Guinea national-flag badge at upper centre chest. No club logo, no sponsors, no brands, no lettering, no numbers. True transparent background with clean alpha hair/fabric edges. No stadium, backdrop, baked checkerboard, floor shadow, card, UI, text, extra people or collage. Output only the single new player's cutout.

IDENTITY: The target MAMADOU is the single main foreground man in image 1. Preserve his exact facial identity, dark skin tone, very short close-cropped black hair, ears, eyes, nose, lips and close beard/stubble. Relight him cleanly and naturally without lightening his complexion. Keep a gentle restrained CLOSED-MOUTH SMILE close to his friendly source expression. Replace the Barcelona shirt, remove all original logos and the background. IMPORTANT NATIONAL FLAG: his ONLY chest badge must be a small round PAPUA NEW GUINEA FLAG: diagonal black/red fields, yellow bird-of-paradise in the red field and white Southern Cross stars in black. NOT the Turkish flag. Keep this badge's size and position the same as the approved portrait template.

KIT: Use a classic Beşiktaş-colour BLACK AND OFF-WHITE VERTICALLY STRIPED short-sleeved jersey, evenly spaced black/white stripes, black crew neck with thin off-white trim and matching cuffs. Keep the approved template's silhouette, cloth, shoulder construction, pose, scale and lighting. No club or sponsor logo.
```

### Uğur (ugur)

İlk referans: futbolcu gorselleri/uğur.jpeg

İkinci referans: C:/Users/arifdemir/Desktop/fs-alsancak/src/assets/portraits/utku-v1.png

```text
Use case: identity-preserve / compositing. Produce ONE transparent professional football-player bust cutout, matching the supplied approved Baran template in composition, scale, lighting, realism and finish. Image 1 is ONLY the new player's facial identity reference; image 2 is ONLY the approved Baran framing/lighting/jersey construction reference. Replace Baran with the specified person; do NOT transfer Baran's face, hair or beard to the new player. Preserve the real source person's identity, facial structure, eye and nose shapes, age, skin tone, hairline and hairstyle. Natural skin detail, no face beautification, no plastic smoothing, no invented jaw. Eye-level front-facing camera, square and level shoulders, complete crown around 5% below the top of a roughly 4:5 portrait canvas, centred head at 50% width, same natural adult head-to-shoulder ratio as the template. Soft neutral studio key light, subtle rim, cohesive chin/collar shadows, clean high-end football-game portrait quality. One short-sleeved jersey, crown to mid-torso. CRITICAL SLEEVE CROP: the cutout ENDS EXACTLY at the fabric edge of each short sleeve cuff; outside the central torso there must be genuine alpha transparency immediately below both sleeves. NO bare upper arms, NO forearms, NO hands. Only face, ears and neck show skin. Keep jersey torso extending below the sleeve level as in the approved template; no rectangular whole-image chop. Realistic football fabric, seams, folds, crew collar. ONLY one small round Turkish red crescent-and-star badge at upper centre chest. No club logo, no sponsors, no brands, no lettering, no numbers. True transparent background with clean alpha hair/fabric edges. No stadium, backdrop, baked checkerboard, floor shadow, card, UI, text, extra people or collage. Output only the single new player's cutout.

IDENTITY: The target UGUR is the single main man giving a thumbs-up in the night selfie, wearing a white T-shirt and holding a wrapped object. Preserve his actual broad face, light-brown short side-parted hair, moustache and jaw stubble, eye shapes and natural skin tone. Keep the friendly expression as a subtle CLOSED-MOUTH SMILE rather than the original broad grin. Remove raised thumb, hands, object, casual clothes and night background. Standard front-facing common-template bust and yellow/navy shirt.

KIT: Use EXACTLY the yellow and deep navy vertical stripe pattern, cloth, crew collar, gold piping and cuff construction from image 2 (approved Utku). One small round Turkish crescent-and-star badge at upper centre chest. No club or sponsor logo.
```

### Fuat (fuat)

İlk referans: futbolcu gorselleri/sağdan sola arif fuat (en soldaki futbolcu listesinde yok boşver).jpeg

İkinci referans: C:/Users/arifdemir/Desktop/fs-alsancak/src/assets/portraits/baran-v2.png

```text
Use case: identity-preserve / compositing. Produce ONE transparent professional football-player bust cutout, matching the supplied approved Baran template in composition, scale, lighting, realism and finish. Image 1 is ONLY the new player's facial identity reference; image 2 is ONLY the approved Baran framing/lighting/jersey construction reference. Replace Baran with the specified person; do NOT transfer Baran's face, hair or beard to the new player. Preserve the real source person's identity, facial structure, eye and nose shapes, age, skin tone, hairline and hairstyle. Natural skin detail, no face beautification, no plastic smoothing, no invented jaw. Eye-level front-facing camera, square and level shoulders, complete crown around 5% below the top of a roughly 4:5 portrait canvas, centred head at 50% width, same natural adult head-to-shoulder ratio as the template. Soft neutral studio key light, subtle rim, cohesive chin/collar shadows, clean high-end football-game portrait quality. One short-sleeved jersey, crown to mid-torso. CRITICAL SLEEVE CROP: the cutout ENDS EXACTLY at the fabric edge of each short sleeve cuff; outside the central torso there must be genuine alpha transparency immediately below both sleeves. NO bare upper arms, NO forearms, NO hands. Only face, ears and neck show skin. Keep jersey torso extending below the sleeve level as in the approved template; no rectangular whole-image chop. Realistic football fabric, seams, folds, crew collar. ONLY one small round Turkish red crescent-and-star badge at upper centre chest. No club logo, no sponsors, no brands, no lettering, no numbers. True transparent background with clean alpha hair/fabric edges. No stadium, backdrop, baked checkerboard, floor shadow, card, UI, text, extra people or collage. Output only the single new player's cutout.

IDENTITY: The filename explicitly identifies the group from RIGHT TO LEFT as Arif, Fuat, then an unrelated person. The target FUAT is therefore the MIDDLE MAN, wearing a BLACK BOW TIE and black formal suit, between the phone-holding rightmost man and the leftmost man in a grey suit. Extract ONLY THE MIDDLE MAN'S FACE. Preserve Fuat's distinctive longer/oval face, drooping/narrow eyes, side-parted dark hair sweeping across the forehead, dark moustache and short jaw/goatee beard. Do NOT use the phone-holding Arif's face or the leftmost face. Use his own calm serious CLOSED-MOUTH expression, not Baran's facial hair. Convert to the common eye-level front-facing football bust; remove bow tie, suit, all other people, phone/hands and room.

KIT: Use the same Galatasaray-colour shirt as approved Baran: viewer-left torso GOLDEN YELLOW, viewer-right torso DEEP RED, reversed short-sleeve colours, dark red crew neck and fine gold trim. One small round Turkish crescent-and-star badge at upper centre chest, no club or sponsor logo.
```

