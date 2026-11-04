import type { Attribute, OutfieldPlayer, Player, PlayerCatalog } from '../../domain/players.js';

export interface ProfileInsight {
  readonly style:string;
  readonly observations:readonly {readonly title:string;readonly text:string;readonly tone?:'caution'}[];
  readonly partners:readonly {readonly title:string;readonly text:string;readonly initials:string}[];
  readonly context:readonly string[];
}

type Observation=ProfileInsight['observations'][number];
type Partner=ProfileInsight['partners'][number];
type SourceInsight=Partial<ProfileInsight>;
const partner=(title:string,text:string,initials:string):Partner=>({title,text,initials});

/** Human-written summaries of the source notes. These describe possibilities,
 * not effects currently active in a selected squad. Identity is always exact. */
const SOURCE_INSIGHTS:Readonly<Record<string,SourceInsight>>={
  baran:{
    style:'Oyun kurucu',
    // Preserve the wording approved in the original Baran design.
    observations:[
      {title:'Pas oyununu yönlendirir.',text:'Pas kalitesi ve oyun görüşüyle hücumu hazırlar. Takım arkadaşlarını yönlendirir; dayanıklılığıyla savunmaya da katkı verir.'},
      {title:'Son vuruşta sınırlı.',text:'Top kontrolü ve pozisyon bilgisi güçlüdür. Bitiriciliği daha düşük olduğu için golü hazırlayan rolde daha etkilidir.',tone:'caution'},
    ],
    partners:[
      partner('Eren ile','Aynı takımda olduklarında ikisinin de pas kalitesi ve oyun görüşü artar.','E'),
      partner('Eren ve Arif ile','Aynı takımda, orta sahada pas bağlantısı kuran rollerde oynarlarsa üçünün de pas kalitesi ve oyun görüşü artar.','EA'),
    ],
    context:[
      'Eren ve Arif’le üçlü uyum sağlandığında, Eren’le olan ikili katkı ayrıca eklenmez.',
      'Pas ve oyun görüşü güçlü takım arkadaşlarıyla daha rahat oynar; oyunu okuyuşu ve pozisyon alması iyileşir. Bu özellikleri çok zayıf bir çevredeyse aynı alanlarda zorlanabilir.',
      'Süleyman ve Kamil Reis’le takımın iletişimini ve sakinliğini destekler. Süleyman’la birlikte, Melih’in pas oyununa olumlu katkı sağlayan ortamı da oluşturabilir.',
    ],
  },
  taha:{style:'Çok yönlü kanat',partners:[partner('Alper ile','Aynı takımda oynadıklarında ikisinin de pas kalitesi ve oyun görüşü artar.','A')],context:[
    'İyi niyetli ve takım odaklı yaklaşımı, saha içindeki iletişimi destekler. Bunun için kişisel özelliklerine ayrıca bir artış eklenmez.',
  ]},
  alper:{style:'Bitirici kanat',partners:[partner('Taha ile','Aynı takımda oynadıklarında ikisinin de pas kalitesi ve oyun görüşü artar.','T')],context:[
    'Takım arkadaşının hatasından sonra destekleyici davranabilir; gergin ortamda morali ve birlikteliği toparlamaya yardımcı olur.',
    'Bu olumlu yaklaşım, tek başına kişisel özelliklerinin arttığı anlamına gelmez.',
  ]},
  servan:{style:'Topla etkili stoper',partners:[partner('Göktuğ ile','Aynı takımdayken ikisinden birinin olumsuz tavrı veya tartışması, gerginliğin daha hızlı yayılmasına yol açabilir.','G')],context:[
    'Görevi net ve takım düzeni sağlıklıyken, yalnız kadroda bulunması nedeniyle olumsuz bir etki oluşmaz.',
    'Takım arkadaşlarını küçümsemeye veya yerini terk etmeye başladığında, pas tercihleri ve pozisyon disiplini bozulabilir; takımın uyumu da bundan etkilenir.',
    'Böyle bir ortam, İsmail gibi takımın havasından daha kolay etkilenen oyunculara da yansıyabilir.',
  ]},
  mahmut:{style:'Topla yaratıcı',context:[
    'Çok tartışmalı bir takım ortamında gerginliği artırma riski bulunur. Bu risk, her maçta sorun çıkaracağı anlamına gelmez.',
  ]},
  goktug:{style:'Gol tehdidi olan kanat',partners:[
    partner('Servan ile','Aynı takımdayken olumsuz tavır veya tartışma başlarsa takımın havası daha hızlı bozulabilir.','S'),
    partner('Uğur ve Utku ile','Göktuğ veya Uğur’un tartışmaya girmesi, bu grupta gerginliğin büyümesi riskini artırabilir.','UU'),
  ],context:[
    'Çok iyi bir gününde şutları ve son vuruşları daha etkili hale gelebilir.',
    'Uzun süre pas alamama, tartışma veya oyuna küsme durumunda presi, pozisyon disiplini ve bitirişleri zayıflayabilir.',
    'Utku’nun bu tür davranışlara katılma riski, takımında kendisi dışında en az iki tartışmaya yatkın oyuncu bulunmasına bağlıdır. Bu isimlerin yalnızca bir araya gelmesi tartışma yaşandığı anlamına gelmez.',
  ]},
  barkuz:{style:'Bitirici forvet',partners:[partner('Arif ile','Aynı takımda olduklarında ikisinin de pas kalitesi ve oyun görüşü azalır; takımın uyumu da olumsuz etkilenir.','A')],context:[
    'Arif’le olan bu uyumsuzluk, takımın geri kalanının olumlu olmasıyla kendiliğinden ortadan kalkmaz.',
    'Çok iyi bir gününde şutları ve bitirişleri güçlenebilir. Çok kötü bir gününde ise top kontrolü, şutları ve son vuruşları zayıflayabilir.',
    'Kaleci seçeneği açıldığında Yusuf seviyesinde kaleciliğe geçer; oyun kurarken orta sahanın ilerisindeki kanatlara isabetli uzun pas atma yeteneği ayrıca devreye girer.',
  ]},
  'm-emre':{style:'Savunma lideri',partners:[
    partner('Tevfik ile','Aynı takımda olduğunda Tevfik’in, M.Emre’nin yokluğuna bağlı huzursuzluğu ortadan kalkar.','T'),
    partner('Destek isteyen stoperlerle','Berkin, Direnç, Şeker, Halit veya Metehan ile savunmada yan yana oynadığında partnerinin savunması ve pozisyon alması iyileşebilir.','BD'),
  ],context:[
    'Deneyimi ve iletişimi özellikle savunma hattını daha sakin ve düzenli tutmaya yardımcı olur.',
    'Berkin’le savunma birlikteliği, bu desteğin belirgin örneklerinden biridir. Aynı desteği anlatan notlar ayrı ayrı tekrarlanarak sayılmaz.',
  ]},
  erhan:{style:'Koşuları besleyen oyun kurucu',context:[
    'Birlikte oynamaya açık, hızlı koşucularla bağlantı kurabildiğinde pas kalitesi ve oyun görüşü artabilir.',
    'Hücumda topun gereğinden fazla tutulduğu, bencil tercihlerin veya çatışmanın öne çıktığı bir grupta aynı alanlarda zorlanabilir.',
  ]},
  ismail:{style:'Teknik bitirici',partners:[
    partner('Baran, Arif ve Eren ile','Bu üç oyuncudan en az ikisiyle aynı takımda oynarsa pas kalitesi ve oyun görüşü artar.','BAE'),
    partner('Göktuğ ve Barkuz ile','İkisinin de hücumda baskın rol üstlendiği bir takımda pas oyunu ve oyunu okuyuşu olumsuz etkilenebilir.','GB'),
  ],context:[
    'Barkuz’un kalede kullanılması, aynı hücumdaki iki baskın oyuncu durumundan farklıdır.',
    'Takımın havası olumsuzlaştığında top kontrolü ve oyun görüşü zayıflayabilir; hücumdaki rol paylaşımının net olması önemlidir.',
  ]},
  eren:{style:'Hücum oyun kurucusu',partners:[
    partner('Baran ile','Aynı takımda olduklarında ikisinin de pas kalitesi ve oyun görüşü artar.','B'),
    partner('Baran ve Arif ile','Aynı takımda, birbirine pas bağlantısı sağlayan orta saha ve oyun kurma rollerinde oynarlarsa üçünün de pas oyunu güçlenir.','BA'),
  ],context:[
    'Baran ve Arif’le üçlü uyum sağlandığında, Baran’la olan ikili katkı ayrıca eklenmez.',
    'Yakınında pas ve oyun görüşü güçlü oyuncular bulunduğunda daha rahat oynar. Pas desteği düşük kaldığında ise pas kalitesi ve oyunu okuyuşu gerileyebilir.',
    'Çok iyi veya kötü bir gününde teknik katkısı da değişebilir. Pas oyununa uygun bir grupta olumlu etki verir; tek başına bütün takımın havasını değiştirdiği varsayılmaz.',
  ]},
  arif:{style:'İki yönlü orta saha',partners:[
    partner('Baran ve Eren ile','Aynı takımda, oyun kurarken birbirlerine pas bağlantısı sağlayan rollerde oynarlarsa üçünün de pas kalitesi ve oyun görüşü artar.','BE'),
    partner('Barkuz ile','Aynı takımda olduklarında ikisinin de pas kalitesi ve oyun görüşü azalır; takımın uyumu da olumsuz etkilenir.','B'),
  ],context:[
    'Barkuz’la olan uyumsuzluk, takımın genel havası olumlu olsa da kendiliğinden kaybolmaz. Barkuz’un kalede kullanılması da bu ilişkiyi silmez.',
    'Baran ve Eren’le olan üçlü uyum, Baran–Eren birlikteliğinin üzerine ikinci kez eklenmez.',
    'Barkuz eşleşmesi dışında genel olarak uyumlu ve dengeli bir takım arkadaşıdır.',
  ]},
  emir:{style:'Şut tehdidi olan kanat'},
  'hakan-goktug':{style:'İletişimi güçlü stoper',partners:[partner('Güçlü bir stoperle','Fiziksel olarak güçlü bir stoperle yan yana oynadığında savunması ve pozisyon alması iyileşebilir.','S')],context:[
    'Savunma hattındaki yapıcı iletişimi, takımın birlikte hareket etmesine yardımcı olur.',
    'Pas kalitesi yüksek bir rakibin uzun ve hava toplarıyla tehdit oluşturduğu durumlarda savunmada zorlanabilir.',
  ]},
  melih:{style:'Kombinasyon oyuncusu',partners:[partner('Baran ve Süleyman ile','Bu ikisiyle oluşan güçlü ve olumlu pas ortamı, Melih’in pas kalitesini ve oyun görüşünü artırabilir.','BS')],context:[
    'Pas alışverişine açık ve iletişimi olumlu bir oyuncudur. Güçlü bir kombinasyon ortamında daha rahat oynar.',
  ]},
  mustafa:{style:'Şut tehdidi olan orta saha',context:[
    'Sorumluluk aldığı iyi bir gününde pozisyon alması ve şutları daha etkili hale gelebilir.',
    'Bencil tercihlerin ve kötü kararların öne çıktığı bir gününde pas kalitesi ve oyun görüşü gerileyebilir; bu tercihler takım arkadaşlarını da zorlayabilir.',
  ]},
  mali:{style:'Hareketli savunmacı',context:[
    'Olumlu ve girişken yaklaşımı takımın iletişimini destekler. Bu katkı, kişisel özelliklerine her zaman ayrıca bir artış eklendiği anlamına gelmez.',
  ]},
  mensur:{style:'Teknik hücum bağlantısı',context:[
    'İyi gününde pası, oyun görüşü ve top kontrolü güçlenebilir; kötü gününde bu alanlarda daha fazla zorlanabilir.',
    'Zaman zaman tartışmaya yatkın davranabilir. Rakibin dikkatini veya sakinliğini bozması, o maçın gidişatına bağlı küçük bir üstünlük sağlayabilir; bu kalıcı bir özellik artışı değildir.',
  ]},
  suleyman:{style:'Sakin pas bağlantısı',partners:[
    partner('Baran ve Kamil Reis ile','Birlikte takımın iletişimini ve sakinliğini desteklerler. Tek bir hafif olumsuz tavır, bu birlikteliği kendiliğinden kötü bir ortama çevirmez.','BK'),
    partner('Baran ve Melih ile','Baran’la birlikte kurduğu olumlu pas ortamı, Melih’in pas kalitesi ve oyun görüşünü artırabilir.','BM'),
  ],context:[
    'Sakin ve kapsayıcı yaklaşımı takımın uyumunu destekler. Bu etki, kendi kişisel özelliklerine ayrıca bir artış eklemez.',
  ]},
  onur:{style:'Mücadeleci bek',partners:[partner('Ömer ile','Aynı takımda oynadıklarında ikisinin de bütün temel özellikleri güçlenir. Rakip takımlarda olduklarında ise ikisi de bu alanlarda geriler.','Ö')],context:[
    'Saygılı ve görevine bağlı yaklaşımı takımın iletişimine olumlu katkı sağlar.',
    'Ömer’le olan birliktelik yalnız pasla sınırlı değildir; fiziksel, teknik ve savunma özelliklerini de kapsar.',
  ]},
  omer:{style:'Pres ve pozisyon oyuncusu',partners:[partner('Onur ile','Aynı takımda oynadıklarında ikisinin de bütün temel özellikleri güçlenir. Rakip takımlarda olduklarında ise ikisi de bu alanlarda geriler.','O')],context:[
    'Olumlu ve mücadeleci yaklaşımı, takımın oyunda kalmasına yardımcı olur.',
    'Onur’la olan birliktelik yalnız savunmayla sınırlı değildir; fiziksel ve teknik özelliklerini de kapsar.',
  ]},
  mamadou:{style:'Merkezde denge oyuncusu'},
  caca:{style:'Pas bağlantısı kuran orta saha'},
  utku:{style:'Mücadeleci stoper',context:[
    'Takımı öndeyken savunma, pres, pozisyon alma ve dayanıklılık yönleri güçlenebilir; takım gerideyken aynı alanlarda gerileyebilir.',
    'Takımında kendisi dışında en az iki tartışmaya yatkın oyuncu varsa, benzer davranışlara katılma riski artar. Tek başına bu tür bir sorun kaynağı sayılmaz.',
    'Göktuğ veya Uğur’un tartışmaya girdiği bir grupta, gerginliğin büyümesine kapılabilir.',
  ]},
  'kamil-reis':{style:'Lider kanat',partners:[partner('Baran ve Süleyman ile','Birlikte takımın iletişimini ve sakinliğini desteklerler. Tek bir hafif olumsuz tavır, bu grubu kendiliğinden kötü bir ortama çevirmez.','BS')],context:[
    'Liderliği ve toparlayıcı yaklaşımı takımın uyumunu destekler; bu katkı kendi kişisel özelliklerine ayrıca bir artış eklemez.',
  ]},
  'ali-efe':{style:'Hücum bağlantısı',context:[
    'Belirgin biçimde kötü bir gününde dayanıklılığı, presi ve pozisyon alması zayıflayabilir. Bu durum her maç için varsayılmaz.',
  ]},
  yanki:{style:'Hücumda hızlanan bek',context:[
    'Takımı aktif biçimde hücum ederken koşu hızı belirgin şekilde yükselir; aynı anda pas kalitesi çok düşer. Bu bölüm bittiğinde alışılmış özelliklerine döner.',
    'Bu nedenle hücumdaki koşu tehdidiyle pas güvenilirliğini aynı şey olarak değerlendirmemek gerekir.',
  ]},
  tevfik:{style:'Yerleşim odaklı stoper',partners:[partner('M.Emre ile','Aynı takımda olduklarında, M.Emre’nin yokluğuna bağlı huzursuzluğu ve bundan doğan uyum kaybı ortadan kalkar.','ME')],context:[
    'M.Emre kendi takımında değilse takımın uyumu bir miktar düşebilir. Tevfik ayrıca sinirlenmeye başlarsa pas kalitesi ve oyun görüşü de zayıflayabilir.',
    'M.Emre’nin yokluğu, her pozisyonda otomatik olarak sinirleneceği anlamına gelmez.',
  ]},
  berkin:{style:'Destekle güçlenen stoper',partners:[partner('M.Emre ile','Savunmada yan yana oynadıklarında M.Emre’nin desteği, Berkin’in savunmasını ve pozisyon almasını iyileştirebilir.','ME')],context:[
    'Yanında güçlü bir savunmacı olduğunda daha rahat oynar. Savunmayı tek başına taşımak zorunda kalırsa savunması ve yerleşimi zayıflayabilir.',
  ]},
  direnc:{style:'Destekle güçlenen stoper',partners:[partner('M.Emre ile','Savunmada yan yana oynadıklarında M.Emre’nin desteği, Direnç’in savunmasını ve pozisyon almasını iyileştirebilir.','ME')],context:[
    'Yanında güçlü bir savunmacı olduğunda savunması ve pozisyon alması iyileşebilir.',
    'Kötü bir gününde pas kalitesi, savunması ve pozisyon alması gerileyebilir.',
  ]},
  eto:{style:'Pres odaklı savunmacı',partners:[partner('Güçlü bir savunmacıyla','Yanındaki güçlü savunmacının desteği, hızlı ve güçlü rakiplere karşı yaşadığı zorluğu bir miktar azaltabilir.','S')],context:[
    'Rakip hücumcunun hem hızlı hem güçlü olduğu eşleşmelerde savunması ve pozisyon alması zayıflayabilir. Rakip iki alanda da çok üst düzeyse bu zorluk daha belirgin hale gelir.',
    'Hatalara yargılamadan yaklaşan olumlu tavrı, takımın sakinliğini korumasına yardımcı olur.',
  ]},
  ugur:{style:'Yerini koruyan savunmacı',partners:[partner('Göktuğ ve Utku ile','Göktuğ veya Uğur’un tartışmaya başlaması, bu grupta gerginliğin büyümesi riskini artırabilir.','GU')],context:[
    'Olumsuz ve tartışmalı bir ortamda gerginliği büyütebilir. Kendi oyunu büyük ölçüde aynı kalsa da takımın uyumu bundan etkilenebilir.',
    'Utku üzerindeki bu etki, onun takımında kendisi dışında en az iki tartışmaya yatkın oyuncu bulunmasına bağlıdır.',
  ]},
  'arda-barin':{style:'Şut arayan orta saha',context:[
    'Zor anlarda olumlu bir tepki verdiği bir bölümde şutları, bitirişleri ve pozisyon alması güçlenebilir.',
    'Kötü bir gününde pas kalitesi, top kontrolü ve pozisyon alması gerileyebilir.',
  ]},
  'yigit-cetinkaya':{style:'Pas bağlantısı kuran bek'},
  batu:{style:'Pas bağlantısı kuran bek',context:[
    'Nefes veya fiziksel zorlanma yaşadığı bir bölümde hızı ve dayanıklılığı düşebilir. Bu etki, fiziksel sorun yaşanmasına bağlıdır.',
  ]},
  seker:{style:'Destek isteyen stoper',partners:[partner('M.Emre ile','Savunmada yan yana oynadıklarında M.Emre’nin desteği, Şeker’in savunmasını ve pozisyon almasını iyileştirebilir.','ME')],context:[
    'Güçlü bir stoperin yanında daha rahat savunur. Rakibin özellikle onun bulunduğu bölgeyi hedeflediği durumlarda savunması ve yerleşimi zayıflayabilir.',
  ]},
  halit:{style:'Basit oynayan savunmacı',partners:[partner('M.Emre ile','Savunmada yan yana oynadıklarında M.Emre’nin desteği, Halit’in savunmasını ve pozisyon almasını iyileştirebilir.','ME')],context:[
    'Oyunu geriden kurma sorumluluğu fazla yüklendiğinde pas kalitesi, top kontrolü ve oyun görüşü zayıflayabilir.',
  ]},
  metehan:{style:'Basit oynayan savunmacı',partners:[partner('M.Emre ile','Savunmada yan yana oynadıklarında M.Emre’nin desteği, Metehan’ın savunmasını ve pozisyon almasını iyileştirebilir.','ME')],context:[
    'Oyunu geriden kurma sorumluluğu fazla yüklendiğinde pas kalitesi, top kontrolü ve oyun görüşü zayıflayabilir.',
  ]},
  altug:{style:'Görüşüyle katkı veren orta saha',context:[
    'Pas alamadığında, oyundan uzaklaştığında veya anlaşamadığı bir oyuncuyla birlikte oynadığında pas kalitesi, presi ve dayanıklılığı gerileyebilir.',
    'Bu durum birlikte oynamaya ilişkin bir risktir; her maçta oyundan kopacağı anlamına gelmez.',
  ]},
  oguz:{style:'Dengeli savunmacı',context:['Özel birlikte oynama etkilerine ilişkin yeterli gözlem henüz bulunmuyor.']},
  'eren-emeksiz':{style:'Savunma bağlantısı',context:['Özel birlikte oynama etkilerine ilişkin yeterli gözlem henüz bulunmuyor.']},
  fuat:{style:'Destek isteyen savunmacı',partners:[partner('Güçlü bir stoperle','Yanındaki güçlü stoper, ileri çıkışlarının savunmada bıraktığı açığı bir miktar karşılayabilir.','S')],context:[
    'Kontrolsüz biçimde ileri çıktığında savunması ve pozisyon alması zayıflayabilir.',
    'Topu gereğinden fazla riskli kullandığında pas kalitesi ve top kontrolü gerileyebilir.',
  ]},
  akin:{style:'Basit görevlerle oynayan savunmacı',context:[
    'Skoru yakın bir maçın son bölümünde şutları, bitirişleri ve pozisyon alması bir miktar güçlenebilir. Bu katkı bütün maç boyunca geçerli değildir.',
  ]},
};

const ATTRIBUTE_OBSERVATIONS:Readonly<Record<Attribute,{title:string;text:string;weakTitle:string;weakText:string}>>={
  speed:{title:'Koşularıyla alan kazanabilir.',text:'Hızını, boş alanlara çıkmak ve rakibine yetişmek için kullanabilir.',weakTitle:'Koşu yarışlarında zorlanabilir.',weakText:'Hızının sınırlı olduğu eşleşmelerde, erkenden yerini alması ve yakın destekle oynaması önem kazanır.'},
  stamina:{title:'Eforunu sürdürebilir.',text:'Dayanıklılığı, takımın hareketli oyununa ve tekrarlanan mücadelelere katkı vermesini sağlar.',weakTitle:'Eforunu dikkatli kullanmalı.',weakText:'Uzun süren ve sık tekrarlanan koşularda daha çabuk zorlanabilir; yükünün dengeli paylaşılması önemlidir.'},
  strength:{title:'Temaslı oyuna yatkın.',text:'Fiziksel gücü, rakiple temas halinde ve topu korumaya çalışırken kullanabileceği bir yönüdür.',weakTitle:'Fiziksel temasta desteğe ihtiyaç duyabilir.',weakText:'Güçlü rakiplerle doğrudan mücadele etmek yerine yerleşim ve yakın destekle oynaması daha uygun olabilir.'},
  passing:{title:'Pasla oyuna katılır.',text:'Pas kalitesi, takım arkadaşlarıyla bağlantı kurarken kullanabileceği yönlerinden biridir.',weakTitle:'Paslarda sadelik önemli.',weakText:'Zor ve dar açılı paslarda hata payı artabilir; yakın ve güvenli seçeneklerle daha rahat oynayabilir.'},
  vision:{title:'Oyunu okuyarak katkı verir.',text:'Oyun görüşü, takım arkadaşlarını ve pas seçeneklerini değerlendirmesinde öne çıkar.',weakTitle:'Pas seçeneklerinde desteğe ihtiyaç duyabilir.',weakText:'Hızlı değişen pozisyonlarda uygun seçeneği bulması zorlaşabilir; açık ve yakın pas bağlantıları işini kolaylaştırır.'},
  control:{title:'İlk kontrolüyle oyuna bağlanır.',text:'Top kontrolü, pası aldıktan sonra oyuna devam ederken kullanabileceği yönlerinden biridir.',weakTitle:'Baskıda ilk kontrolü zorlanabilir.',weakText:'Topu alırken rakip baskısı altında hata yapabilir; rahat bir vücut açısı ve yakın destek önemlidir.'},
  dribbling:{title:'Topla alan kazanabilir.',text:'Driplingi, rakibin yanından geçmek ve topu ileri taşımak için kullanabileceği yönlerinden biridir.',weakTitle:'Bire birde riski seçmeli.',weakText:'Topla rakip geçmeye çalışmak yerine basit pas ve doğru konumla oyuna katılması daha güvenli olabilir.'},
  shooting:{title:'Şutuyla tehdit yaratabilir.',text:'Şut kalitesi, kaleyi gördüğü pozisyonlarda kullanabileceği yönlerinden biridir.',weakTitle:'Şut seçiminde dikkatli olmalı.',weakText:'Zor şutlara yönelmek yerine daha uygun açı veya takım arkadaşına pas seçeneği araması daha verimli olabilir.'},
  finishing:{title:'Kaleye yakın etkili olabilir.',text:'Son vuruş becerisi, uygun gol pozisyonlarını değerlendirmesinde öne çıkar.',weakTitle:'Son vuruşta sınırlı.',weakText:'Golü tamamlamaktan çok pozisyonu hazırlayan veya takım arkadaşına aktaran rolde daha rahat katkı verebilir.'},
  defending:{title:'Savunma katkısı öne çıkar.',text:'Rakibi karşılaması ve savunma görevleri, mevcut özellikleri içinde kullanabileceği yönlerindendir.',weakTitle:'Savunmada desteğe ihtiyaç duyabilir.',weakText:'Top rakibe geçtiğinde yanında görev paylaşan bir takım arkadaşı bulunması, savunmadaki yükünü azaltabilir.'},
  pressing:{title:'Baskıyla oyuna katılır.',text:'Presi, rakibin rahat oynamasını engellemek ve topu geri kazanma çabasına katılmak için kullanabileceği bir yönüdür.',weakTitle:'Ön alan baskısı sınırlı.',weakText:'Rakibe sürekli ve yoğun baskı yapması gereken bir görevde zorlanabilir; baskı sorumluluğunu paylaşmak daha uygun olabilir.'},
  positioning:{title:'Yerleşimiyle oyuna katılır.',text:'Pozisyon bilgisi, takım düzeni içinde doğru yerde bulunmak için kullanabileceği yönlerinden biridir.',weakTitle:'Yerini korumak önemli.',weakText:'Oyunun yönü değişirken doğru yerde kalmakta zorlanabilir; görevinin ve yakınındaki desteğin net olması işini kolaylaştırır.'},
};

function inferredStyle(player:OutfieldPlayer):string {
  const a=player.attributes;
  switch(player.mainPosition){
    case 'CB':return a.passing>=7.5&&a.vision>=7.5?'Geriden oyun kuran savunmacı':a.defending>=7.5&&a.positioning>=7.5?'Pozisyon odaklı savunmacı':a.strength>=7.5?'Fiziksel savunmacı':'Savunmacı';
    case 'FB':return a.passing>=7.5&&a.vision>=7.5?'Pas bağlantısı kuran bek':a.speed>=8&&a.stamina>=8?'Koşucu bek':a.defending>=7.5?'Savunmacı bek':'Bek';
    case 'CM':return a.passing>=7.5&&a.vision>=7.5?'Oyun kurucu':a.stamina>=8.5&&a.pressing>=8?'İki yönlü orta saha':a.defending>=7.5?'Denge oyuncusu':'Merkez orta saha';
    case 'CAM':return a.control>=8&&a.dribbling>=8.5?'Topla yaratıcı':a.passing>=8&&a.vision>=8?'Hücum oyun kurucusu':a.shooting>=8.5?'Şut tehdidi olan orta saha':'Hücum bağlantısı';
    case 'W':return a.speed>=8&&a.dribbling>=8?'Hızlı kanat':a.passing>=8?'Pas odaklı kanat':a.dribbling>=8?'Teknik kanat':'Kanat oyuncusu';
    case 'ST':return a.finishing>=8?'Bitirici forvet':a.strength>=8?'Fiziksel forvet':'Forvet';
  }
}

/** Derived only from the supplied player's base attributes, including guests. */
function attributeObservations(player:OutfieldPlayer):readonly Observation[] {
  const a=player.attributes;
  const preferred:readonly Attribute[]=player.mainPosition==='CB'?['defending','positioning','strength','passing','vision','stamina','speed','control','pressing','dribbling','shooting','finishing']:
    player.mainPosition==='ST'||player.mainPosition==='W'?['finishing','dribbling','speed','shooting','control','passing','vision','stamina','strength','positioning','pressing','defending']:
      ['passing','vision','control','stamina','positioning','defending','pressing','speed','dribbling','strength','shooting','finishing'];
  const best=[...preferred].sort((left,right)=>a[right]-a[left])[0]!;
  const weakCandidates:readonly Attribute[]=player.mainPosition==='CB'?['speed','stamina','passing','vision','control','positioning','defending']:
    player.mainPosition==='FB'?['stamina','passing','vision','control','positioning','defending']:
      player.mainPosition==='ST'?['stamina','passing','vision','control','pressing','finishing']:
        ['stamina','passing','vision','control','defending','pressing','finishing'];
  const weakest=[...weakCandidates].sort((left,right)=>a[left]-a[right])[0]!;
  const strong=ATTRIBUTE_OBSERVATIONS[best],weak=ATTRIBUTE_OBSERVATIONS[weakest];
  const first:Observation=Math.max(...Object.values(a))<5?
    {title:'Basit ve net bir görev daha uygun.',text:'Mevcut özellikleriyle yakın destek, az riskli tercihler ve sınırları belirli bir görev içinde oynaması daha uygun olabilir.'}:
    {title:strong.title,text:strong.text};
  if(a[weakest]<6.5)return [first,{title:weak.weakTitle,text:weak.weakText,tone:'caution'}];
  return [first,{title:'Birden fazla alanda katkı verebilir.',text:'Mevcut özellikleri tek bir işe sıkışmıyor; takımın düzenine göre farklı görevler arasında katkısını paylaşabilir.'}];
}

function goalkeeperInsights(player:Player):ProfileInsight {
  const longWide=player.specialAbilities?.some(ability=>ability.id==='accurate-long-wide-distribution');
  if(player.id==='barkuz'&&player.kind==='goalkeeper')return {
    style:longWide?'Uzun pasla oyun kuran kaleci':'Kaleci',
    observations:[
      {title:'Kalede farklı bir seçenek.',text:player.goalkeeperReferenceId==='yusuf'?'Kaleci olarak kullanıldığında Yusuf ile aynı kalecilik seviyesinde değerlendirilir.':'Kaleci olarak kullanıldığında kalesini koruma görevi üstlenir.'},
      ...(longWide?[{title:'Oyunu uzağa taşıyabilir.',text:'Oyun kurarken orta sahanın ilerisindeki kanatlara uzun ve isabetli paslar atabilir.'}]:[]),
    ],
    partners:SOURCE_INSIGHTS.barkuz!.partners??[],
    context:[
      'Kaleci seçeneği kapatıldığında kendi saha oyuncusu özelliklerine ve forvet rolüne geri döner.',
      ...(longWide?['Uzun pas yeteneği, ileri kanat hedefleri için özel bir seçenektir; bütün paslarının isabetli olacağı veya kurtarışlarının güçleneceği anlamına gelmez.']:[]),
      'Arif’le aynı takımda olduklarında dağıtımındaki pas kalitesi ve oyun görüşü ile takımın uyumu olumsuz etkilenebilir. Takımın genel havasının olumlu olması bu ilişkiyi silmez.',
    ],
  };
  return {
    style:'Kaleci',
    observations:[
      {title:'Kaleci rolünde.',text:'Takımın kalesini koruyan oyuncu olarak değerlendirilir.'},
      {title:'Ayrıntılı kaleci gözlemi bekleniyor.',text:'Çıkışları, refleksleri ve hava topları hakkında ayrı bir gözlem henüz bulunmuyor.'},
    ],
    partners:[],context:[],
  };
}

export function playerInsights(player:Player,catalog:PlayerCatalog):ProfileInsight {
  // A guest may resemble a named player, but never inherits that person's ties.
  if(player.origin.kind==='guest'){
    const origin=player.origin;
    const reference=catalog.players.find(p=>p.id===origin.referencePlayerId);
    const keeper=player.kind==='goalkeeper';
    return {
      style:keeper?'Misafir kaleci':inferredStyle(player),
      observations:keeper?goalkeeperInsights(player).observations:attributeObservations(player),
      partners:[],
      context:[
        reference?`${reference.name} örnek alınarak oluşturulmuş bir oyuncudur; aynı kişi değildir.`:'Tanıdık bir oyuncu örnek alınarak oluşturulmuş ayrı bir oyuncudur.',
        keeper?'Yeni takıma alışma payı, topu oyuna sokarken ve savunmayla iletişim kurarken hissedilebilir; kalecilik seviyesini doğrudan düşürmez.':'Yeni takıma alışırken pas alışverişinde küçük zamanlama ve iletişim sorunları yaşayabilir. Baskı altında top kontrolü de biraz daha zorlaşabilir.',
        'Bu alışma payı pas alamayacağı anlamına gelmez. Örnek alınan oyuncunun özel birlikte oynama ilişkilerini devralmaz.',
      ],
    };
  }
  if(player.kind==='goalkeeper')return goalkeeperInsights(player);
  const curated=SOURCE_INSIGHTS[player.id];
  return {
    style:curated?.style??inferredStyle(player),
    observations:curated?.observations??attributeObservations(player),
    partners:curated?.partners??[],
    context:curated?.context??[],
  };
}
