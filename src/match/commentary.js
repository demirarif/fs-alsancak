/* Spoken-style lines for the event feed (user decision: no percentages or ratings on screen, a bit of fun). The engine's explanation stays
 * the technical record; this is presentation only. Lines avoid case suffixes on names so every name reads correctly. */
const pick=(e,lines)=>{let h=0;for(const c of e.id)h=(h*31+c.charCodeAt(0))>>>0;return lines[h%lines.length];};
const fill=(line,a,b)=>line.replaceAll('{a}',a).replaceAll('{b}',b);

/** Technical leftovers removed when an event has no dedicated line. */
export function plain(text){
  return text.replace(/\s*·\s*(gol olasılığı|başarı tahmini)\s*%\d+/g,'').replace(/\s*·\s*\d+\s*m\b/g,'').replace(/\s*\([^)]*\d[^)]*\)/g,'').replace(/\s*·\s*$/,'').trim();
}

export function commentary(e,nameOf){
  const a=nameOf(e.actorId)||'',b=nameOf(e.targetPlayerId)||'',o=e.outcome,say=lines=>fill(pick(e,lines),a,b);
  switch(e.kind){
    case 'goal':{
      const assist=b&&o!=='own-goal'?` · asist ${b}`:'';
      if(o==='own-goal')return say(['Talihsiz an! Top kendi ağlarında.','Kendi kalesine! Buna kimse inanamıyor.']);
      if(o==='header')return say(['GOOOL! {a} kafayı vurdu, top ağlarda!','{a} yükseldi, kafayla bitirdi! GOL!'])+assist;
      return say(['GOOOL! {a} ağları sarstı!','{a} affetmedi! GOL!','GOL! {a} topu ağlara gömdü!','{a} vurdu ve GOL! Tribünler ayakta!'])+assist;
    }
    case 'shot':case 'header':case 'penalty':{
      if(e.kind==='penalty')return say(['Penaltı noktasında {a}…','{a} topu penaltı noktasına koydu. Gerilim tavan!']);
      if(o==='post')return say(['{a} denedi… direkten döndü!','Direk! {a} ellerini başına koydu.']);
      if(o==='save'||o==='parry')return e.kind==='header'?say(['{a} kafayı vurdu, kaleci yerinde!','{a} kafayla yokladı!']):say(['{a} şutu çekti!','{a} vurdu, kaleci uzanıyor…','{a} sert vurdu!']);
      if(o==='block')return say(['{a} vurdu, araya ayak girdi!','{a} şutu çekti, savunma bloke etti.']);
      if(o==='goal')return say(['{a} vuruyor…','{a} şutu çekti!']);
      return e.kind==='header'?say(['{a} kafayı vurdu, top dışarıda.','{a} kafayla denedi, auta gitti.']):say(['{a} şansını denedi, top auta.','{a} vurdu ama tribünlere!','{a} denedi, kıl payı dışarıda.']);
    }
    case 'save':
      if(o==='spill')return say(['{a} topu elinden kaçırdı! Tehlike!','{a} tutamadı, top önünde kaldı!']);
      if(o==='parry')return say(['{a} uçtu, çeldi!','Müthiş refleks! {a} topu çıkardı.']);
      return say(['{a} topu kucakladı.','{a} yerinde, top elinde.','{a} kurtardı! Duvar gibi.']);
    case 'beat':
      return e.importance>=.45?say(['Bacak arası! {b} ne olduğunu anlamadı.','{a} bacak arasından geçirdi! Tribünler coştu.']):say(['{a} çalımı attı, {b} geride kaldı.','{a} sıyrıldı, önü açık!','{a} {b} ile karşı karşıya… geçti!']);
    case 'through-pass':return say(['{a} ara pası çıkardı, {b} koşuda!','Ne pas! {a} savunmayı ikiye böldü.']);
    case 'cross':return say(['{a} ortaladı, ceza sahası karışık!','{a} topu içeri gönderdi!']);
    case 'corner':return say(['Korner! Ceza sahasında itiş kakış.','Korner kullanılacak, herkes ceza sahasında.']);
    case 'free-kick':return e.importance>=.5?say(['Kale önünde serbest vuruş! Baraj kuruluyor.','Tehlikeli bölgede serbest vuruş, {a} topun başında.']):plain(e.reason.explanation);
    case 'foul':
      if(e.importance>=.7)return say(['PENALTI! {a} ceza sahasında indirdi.','Penaltı! Hakem beyaz noktayı gösterdi.']);
      return say(['{a} sert girdi, faul.','Faul! {b} yerde kaldı.']);
    case 'keeper-claim':return say(['{a} havada topu kaptı.','{a} çıktı, topu aldı.']);
    case 'clearance':
      if(o==='deflection')return say(['Sekti! Top yön değiştirdi…','Şut sekiyor, kaleci ters köşede!']);
      if(o==='block')return say(['{a} kendini topun önüne attı!','{a} son anda bloke etti.']);
      return plain(e.reason.explanation);
    case 'mood':
      if(e.importance>=.6)return /savunma/.test(e.reason.explanation)?say(['{a} savunmada topu aldı, gücüyle ilerliyor!','{a} tek başına çıktı, kimse durduramıyor!']):say(['{a} topu aldı, tek başına gidiyor!','{a} şov başlıyor, kimse yetişemiyor!']);
      return plain(e.reason.explanation);
    default:return plain(e.reason.explanation);
  }
}
