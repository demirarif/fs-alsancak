import { api, serverNow } from './api.js';
import { decodeRecording } from '../v1/online/recording.ts';
import { COIN, COUPON, payoutOf, scoreOutcome, SCORE_MAX } from '../v1/online/markets.ts';
import './online.css';

/* The players' page (user decisions 2026-11-05): four tabs, kept in the address (#gunun-maci/kuponlar):
 * - Maç: the Alsancak coin wallet (a game currency only, never bought or paid out) and asking a friend for some when it has run out, the
 *   next match with its squads and a countdown, the bulletin until kick-off (one side per bet, odds move with the money, near-certain picks
 *   shown but not playable), "Canlı izle" from the kick-off;
 * - Kuponlarım: every bet one has made, match by match, open, won, lost or refunded;
 * - Sonuçlar: past matches with the result, the man of the match, one's net and the 30 % loss bonus, everybody's bets (only after the match);
 * - Tablo: the Alsancak coin table.
 * The balance and friends' coin requests show on every tab. What the admin does lives in the Yönetim paneli. */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const DAY=new Intl.DateTimeFormat('tr-TR',{weekday:'long',day:'numeric',month:'long'}),TIME=new Intl.DateTimeFormat('tr-TR',{hour:'2-digit',minute:'2-digit'}),SHORT=new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long'});
const when=ms=>`${DAY.format(ms)} · ${TIME.format(ms)}`,coin=n=>`${Math.round(n).toLocaleString('tr-TR')}`,odd=o=>o.toFixed(2).replace('.',',');
const signed=n=>`${n>0?'+':n<0?'−':''}${coin(Math.abs(n))}`;
/** A coupon pick; once its match is paid, green ✓ if it came in, red ✗ if not. */
const legItem=l=>`<li class="${l.won===true?'won':l.won===false?'lost':''}"><span>${l.won===true?'✓ ':l.won===false?'✗ ':''}${esc(l.label)}</span><b>${odd(l.odds)}</b></li>`;
function left(ms){const s=Math.max(0,Math.round(ms/1000)),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return d?`${d} gün ${h} saat`:h?`${h} saat ${m} dakika`:m?`${m} dakika ${s%60} saniye`:`${s} saniye`;}
const GROUPS=['Maç','Yarılar','Goller','Skor','Oyuncular','Özel','Diğer'];
const TABS=[['mac','Maç'],['kuponlar','Kuponlarım'],['sonuclar','Sonuçlar'],['tablo','Tablo']];
const FILTERS=[['all','Tümü'],['open','Bekleyen'],['won','Kazanan'],['lost','Kaybeden'],['void','İade']];
function goalsLine(r){
  if(!r?.goals.length)return 'Gol yok';
  return [0,1].map(i=>{const tally=new Map();for(const g of r.goals.filter(g=>g.team===i)){const k=g.ownGoal?`${g.name} (k.k.)`:g.name;tally.set(k,(tally.get(k)??0)+1);}
    return tally.size?`<span class="${i?'red':'blue'}">${[...tally].map(([n,c])=>esc(c>1?`${n} ${c}`:n)).join(', ')}</span>`:'';}).filter(Boolean).join(' · ');
}
const statusText={open:'bekliyor',won:'kazandı',lost:'kaybetti',void:'iade'};
/** A place in the lineup (formation slot) as a short Turkish code and its line (the chip's colour). */
const POS={GK:['KL','gk'],LB:['SLB','def'],RB:['SĞB','def'],LWB:['SLB','def'],RWB:['SĞB','def'],LCB:['STP','def'],CB:['STP','def'],RCB:['STP','def'],DM:['ÖL','mid'],
  LDM:['OS','mid'],RDM:['OS','mid'],LCM:['OS','mid'],RCM:['OS','mid'],CAM:['OOS','mid'],LM:['SLK','mid'],RM:['SĞK','mid'],LW:['SLK','fw'],RW:['SĞK','fw'],LS:['FV','fw'],RS:['FV','fw'],ST:['FV','fw']};
const POS_NAMES=[['KL','kaleci'],['STP','stoper'],['SLB','sol bek'],['SĞB','sağ bek'],['ÖL','ön libero'],['OS','orta saha'],['OOS','ofansif orta saha'],['SLK','sol kanat'],['SĞK','sağ kanat'],['FV','forvet']];

export function mountToday(host,{user}){
  // slip: {match, legs:[{market, code, label, odds}], stake, replaces, back} — one pick is a bet, several a coupon; `replaces` is the bet being
  // edited and `back` its stake, which comes back when the edit goes in. quote: the server's coupon odds for those picks.
  let data=null,poll=null,tick=null,shown='',tab='mac',group='Maç',slip=null,quote=null,placing=false,quoteTimer=null,asking=false,people=null,notice='',coupons=null,couponFilter='all',lastFull=0,older=[],olderMore=false;
  // reels: a match's 9:16 summary made on this visit ({making, progress} while it is made, then {url, filename}).
  const details=new Map(),reels=new Map();
  const signature=d=>JSON.stringify([d.balance,d.requests.incoming.map(r=>r.id),d.requests.outgoing.map(r=>[r.id,r.status]),d.upcoming.map(m=>[m.id,m.live,m.over,m.regenerated,m.mine.length,m.book?.markets.map(x=>x.outcomes.map(o=>o.odds).join()).join()]),d.recent.map(m=>[m.id,m.net]),d.leaderboard.map(x=>[x.username,x.balance])]);
  async function refresh(force=true){
    // A poll sends the version of what it has: while nothing has changed the server answers {same:true} after one small read (user,
    // 2026-11-06: "işlemciyi hafiflet"); a full answer at least every 5 minutes. An action of one's own always asks in full.
    try{const v=!force&&data?.v&&Date.now()-lastFull<300_000?data.v:null,d=await api.state(v);if(d.same&&data){updateSlip();return;}
      data=d;lastFull=Date.now();if(tab==='kuponlar')coupons=await api.coupons();const sig=signature(data)+(tab==='kuponlar'?JSON.stringify(coupons?.matches.map(m=>[m.id,m.bets.map(b=>b.status).join()])):'');
      // Someone typing a stake keeps the field; the next poll redraws.
      if((force||sig!==shown)&&!host.querySelector('.tm-slip input:focus,.tm-ask input:focus')){shown=sig;render();}else updateSlip();}
    catch(e){if(e.status===401||e.status===403){location.reload();return;}host.innerHTML=`<div class="tm"><p class="tm-error">${esc(e.message)}</p><button class="tm-button" data-retry>Tekrar dene</button></div>`;}
  }
  /** Squads as everyone sees them before betting (user, 2026-11-05: "bahis oynamadan önce kadroları görmeleri lazım kesinlikle", "mobilin
   * de buna uygun olması lazım"): both teams side by side, on a phone too, goalkeeper to attack, each place as a short code. */
  function team(t,i){return `<div class="tm-team ${i?'red':'blue'}"><h3><span>${esc(t.name)}</span><small>${esc(t.formation)}</small></h3><ul>${t.players.map(p=>{const [code,unit]=POS[p.slot]??[p.label.slice(0,3).toLocaleUpperCase('tr-TR'),'mid'];
    const place=p.slot==='GK'?'Kaleci':p.label;
    return `<li><abbr class="tm-slot ${unit}" title="${esc(place)}">${esc(code)}</abbr><span class="tm-name">${esc(p.name)}</span><small>${esc(place)}</small></li>`;}).join('')}</ul></div>`;}
  function lineups(m){
    const used=new Set(m.teams.teams.flatMap(t=>t.players.map(p=>POS[p.slot]?.[0]).filter(Boolean)));
    return `<section class="tm-lineups" aria-label="Kadrolar"><div class="tm-lineups-head"><h2>Kadrolar</h2><span>Bahis oynamadan önce bak</span></div><div class="tm-teams">${m.teams.teams.map(team).join('')}</div>
      <p class="tm-legend">${POS_NAMES.filter(([c])=>used.has(c)).map(([c,n])=>`<b>${c}</b> ${n}`).join(' · ')}</p></section>`;
  }

  // --- every tab: the tabs, the balance, friends asking for coins ------------------------------------------------------------------
  function nav(){
    return `<nav class="tm-nav"><div class="tm-tabs-main" role="tablist" aria-label="Sayfa">${TABS.map(([id,label])=>`<button type="button" role="tab" aria-selected="${id===tab}" data-tab="${id}">${label}</button>`).join('')}</div>
      ${user.isAdmin?'<span class="tm-purse is-admin" title="Admin hesabı bahis oynamaz"><b>Admin</b><small>önizleme</small></span>':`<span class="tm-purse" title="Bakiyen"><b>${coin(data.balance)}</b><small>Alsancak coin</small></span>`}</nav>`;
  }
  function incoming(){
    return data.requests.incoming.map(x=>`<div class="tm-request"><span><b>${esc(x.displayName)}</b> senden <b>${coin(x.amount)} Alsancak coin</b> istiyor.</span><span class="tm-links"><button type="button" data-send="${x.id}">Gönder</button><button type="button" data-decline="${x.id}">Reddet</button></span></div>`).join('');
  }

  // --- Maç -------------------------------------------------------------------------------------------------------------------------
  /** The admin sees this page as a preview: the admin has no coins and no coupons and never bets; one's own are in one's own account. */
  function adminNote(){
    return `<section class="tm-card tm-admin-note"><p><b>Admin hesabındasın.</b> Bu sayfa oyuncuların gördüğünün önizlemesi: admin hesabının Alsancak coin'i ve kuponu yoktur, bahis oynayamaz. Kendi bakiyen, kuponların ve bahis için çıkış yapıp kendi kullanıcı adınla (ör. <b>arif</b>) gir.</p>
      <button class="tm-button" type="button" data-switch-account>Çıkış yap, kendi hesabımla gireyim</button></section>`;
  }
  function wallet(){
    if(user.isAdmin)return '';
    // Asking is for a balance that has run out (under the smallest bet).
    const canAsk=!user.isAdmin&&data.balance<COIN.minStake;if(!canAsk)asking=false;
    const r=data.requests,ask=asking?`<form class="tm-ask" data-ask-form><label>Kimden<select name="to" required><option value="">Seç</option>${(people??[]).map(p=>`<option value="${esc(p.username)}">${esc(p.displayName)}</option>`).join('')}</select></label>
      <label>Ne kadar<input type="number" name="amount" min="${COIN.minStake}" max="${COIN.start}" step="100" value="1000" inputmode="numeric"></label><button class="tm-button" type="submit">İsteği gönder</button><button class="tm-ghost" type="button" data-ask-cancel>Vazgeç</button></form>`:'';
    return `<section class="tm-card tm-wallet"><div class="tm-wallet-row"><div><div class="tm-eyebrow">BAKİYEN</div><strong class="tm-balance">${coin(data.balance)} <small>Alsancak coin</small></strong></div>
      ${canAsk?`<button class="tm-ghost" type="button" data-ask ${asking?'hidden':''}>Arkadaşından Alsancak coin iste</button>`:''}</div>${ask}
      ${r.outgoing.filter(x=>x.status==='pending'||Date.now()-x.at<86_400_000).map(x=>`<p class="tm-hint">${esc(x.displayName)} kişisinden ${coin(x.amount)} Alsancak coin istedin · ${x.status==='pending'?'bekliyor':x.status==='sent'?'gönderdi':'reddetti'}</p>`).join('')}
      ${notice?`<p class="tm-status" role="status">${esc(notice)}</p>`:''}<p class="tm-hint">Alsancak coin yalnız oyun parası; satın alınmaz, hiçbir şeye çevrilmez.${user.isAdmin?'':' Bakiyen biterse bir arkadaşından isteyebilirsin.'}</p></section>`;
  }
  // Every option is open again for each new coupon (user, 2026-11-10: "her kupondan sonra oynanabilir iddaa bacaklarını sıfırlayalım"):
  // what one already holds no longer locks a market's other options; the server refuses only a set that wins whatever the result.
  function outcomeButton(m,market,o,locked){
    const picked=slip&&slip.match===m.id&&slip.legs.some(l=>l.market===market.id&&l.code===o.code);
    const off=locked||user.isAdmin||!o.playable||!market.active,title=!o.playable?'Oynanamaz: kaybetme ihtimali neredeyse yok':'';
    const trend=o.base&&Math.abs(o.odds-o.base)>=.01?(o.odds<o.base?'down':'up'):'';
    return `<button type="button" class="tm-pick${picked?' is-picked':''}${trend?` is-${trend}`:''}" data-pick="${m.id}|${market.id}|${esc(o.code)}" ${off?'disabled':''} ${title?`title="${title}"`:''}><span>${esc(o.label)}</span><b>${odd(o.odds)}</b></button>`;
  }
  function bulletin(m){
    const book=m.book;if(!book)return '';const locked=m.live||serverNow()>=m.kickoffAt,groups=GROUPS.filter(g=>book.markets.some(x=>x.group===g&&x.active));
    if(!groups.includes(group))group=groups[0]??'Maç';
    const markets=book.markets.filter(x=>x.group===group&&x.active),inSlip=id=>slip?.match===m.id&&slip.legs.some(l=>l.market===id);
    const scoreBox=group==='Skor'&&!locked&&!user.isAdmin?`<form class="tm-other-score" data-other-score="${m.id}"><span>Başka skor</span><input name="a" type="number" min="0" max="${SCORE_MAX}" inputmode="numeric" aria-label="${esc(m.teams.names[0])} golleri"><span>–</span><input name="b" type="number" min="0" max="${SCORE_MAX}" inputmode="numeric" aria-label="${esc(m.teams.names[1])} golleri"><button class="tm-ghost" type="submit">Seç</button></form>`:'';
    return `<div class="tm-bulletin"><div class="tm-tabs" role="tablist">${groups.map(g=>`<button type="button" role="tab" aria-selected="${g===group}" data-group="${g}">${g}${book.markets.some(x=>x.group===g&&inSlip(x.id))?' •':''}</button>`).join('')}</div>
      ${markets.map(market=>`<div class="tm-market"><h4>${esc(market.label)}</h4><div class="tm-odds${market.outcomes.length>3?' many':''}">${market.outcomes.map(o=>outcomeButton(m,market,o,locked)).join('')}</div></div>`).join('')}${scoreBox}
      <p class="tm-hint">Seçeneklere bastıkça kupona eklenir; birden çok seçim kupon olur, oranlar çarpılır ve hepsi tutarsa kazanır. Her yeni kuponda bütün seçenekler yeniden oynanabilir; oran, oynadığın anki orana kilitlenir. Oranlar oynanan paraya göre ağır ağır değişir. Soluk seçenekler kesine yakın olduğu için oynanamaz. Her sonuçta en az birinin kazandığı bahisler (ör. 7,5 üst ile 9,5 alt) birlikte oynanmaz.</p></div>${slipBox(m)}`;
  }
  const slipKey=()=>JSON.stringify(slip?.legs.map(l=>[l.market,l.code])??[]);
  /** The slip's figures: total odds (a coupon's from the server), the note under it, what it pays, whether it can be placed. */
  function slipState(){
    const many=slip.legs.length>1,q=quote?.key===slipKey()?quote:null,refused=!!(q&&!q.ok&&!q.loading),odds=many?(q?.ok?q.odds:0):refused?0:slip.legs[0]?.odds??0,stake=Number(slip.stake)||0;
    const total=many?(q?.ok?odd(q.odds):refused?'—':'…'):refused?'—':odd(odds),error=(q&&!q.ok&&!q.loading?q.error:'')||slip.error||'';
    const note=error||(q?.ok&&q.factor>1?`Seçimler birbirine bağlı (biri olunca öteki de daha olası): kupon oranı çarpım olan ${odd(q.product)} yerine ${odd(q.odds)}.`:'');
    const room=data.balance+(slip.back??0),blocked=placing||!odds||stake<COIN.minStake||stake>COIN.maxStake||stake>room;
    return {many,odds,stake,total,note,error,blocked,win:payoutOf(stake,odds),room};
  }
  function slipBox(m){
    if(!slip||slip.match!==m.id||!slip.legs.length)return '';const st=slipState();
    return `<form class="tm-slip" data-slip novalidate><div class="tm-slip-head"><b>${st.many?`Kupon · ${slip.legs.length} seçim`:'Bahis'}</b>${slip.replaces?'<span class="tm-points wait">düzenleniyor</span>':''}<button type="button" class="tm-link" data-slip-cancel>${slip.replaces?'Düzenlemeden vazgeç':'Temizle'}</button></div>
      <ul class="tm-slip-legs">${slip.legs.map((l,i)=>`<li><span>${esc(l.label)}</span><b>${odd(l.odds)}</b><button type="button" data-leg-remove="${i}" aria-label="${esc(l.label)}: kupondan çıkar">×</button></li>`).join('')}</ul>
      <div class="tm-slip-total"><span>${st.many?'Kupon oranı':'Oran'}</span><b data-total>${st.total}</b></div><p class="tm-hint${st.error?' tm-error':''}" data-note ${st.note?'':'hidden'}>${esc(st.note)}</p>
      <div class="tm-slip-row"><label>Tutar<input name="stake" type="number" min="${COIN.minStake}" max="${Math.min(COIN.maxStake,st.room)}" step="50" value="${esc(slip.stake)}" inputmode="numeric"></label>
      <div class="tm-quick">${[100,500,1000,2500,5000].map(v=>`<button type="button" data-quick="${v}" ${v>st.room?'disabled':''}>${coin(v)}</button>`).join('')}</div></div>
      <div class="tm-slip-row"><span class="tm-win">Kazanırsan <b>${coin(st.win)}</b> Alsancak coin</span><span class="tm-actions"><button class="tm-button" type="submit" ${st.blocked?'disabled':''}>${placing?'Gönderiliyor…':slip.replaces?(st.many?'Kuponu güncelle':'Bahsi güncelle'):st.many?'Kuponu yap':'Bahsi yap'}</button></span></div>
      <p class="tm-hint">${st.many?'Kupondaki seçimlerin hepsi tutarsa kazanır.':'Başka seçeneklere de basarsan kupon olur, oranlar çarpılır.'} En az ${coin(COIN.minStake)}, en çok ${coin(COIN.maxStake)} Alsancak coin. Maç bitince net kaybının %${COIN.lossBonus*100}'u geri gelir.${slip.replaces?' Güncelleyince eski kupon iade edilir, yenisi o anki oranlarla yapılır.':''}</p></form>`;
  }
  /** The slip's figures again without drawing it anew (a stake being typed keeps its field). */
  function updateSlip(){
    const f=host.querySelector('[data-slip]');if(!f||!slip?.legs.length)return;const st=slipState();
    f.querySelector('[data-total]').textContent=st.total;const note=f.querySelector('[data-note]');note.hidden=!st.note;note.textContent=st.note;note.classList.toggle('tm-error',!!st.error);
    f.querySelectorAll('.tm-slip-legs b').forEach((b,i)=>{if(slip.legs[i])b.textContent=odd(slip.legs[i].odds);});
    f.querySelector('.tm-win b').textContent=coin(st.win);f.querySelector('button[type=submit]').disabled=st.blocked;
  }
  /** A coupon's odds from the server, a moment after the picks last changed. */
  function requestQuote(){
    clearTimeout(quoteTimer);if(slip)slip.error=null;if(!slip){quote=null;return;}
    const key=slipKey(),match=slip.match,legs=slip.legs.map(l=>({market:l.market,code:l.code})),many=legs.length>1;quote=many?{key,loading:true}:null;
    // A single pick asks too: the slip shows the odds of this moment, not those of the last refresh (pages refresh less often now).
    quoteTimer=setTimeout(async()=>{const r=await api.quote(match,legs,slip.replaces).catch(e=>({ok:false,error:e.message}));if(!slip||slipKey()!==key)return;
      if(many||!r.ok)quote={key,...r};else if(quote?.key!==key)quote=null;if(r.ok&&Array.isArray(r.legs))slip.legs.forEach((l,i)=>{l.odds=r.legs[i]??l.odds;});updateSlip();},250);
  }
  function toggleLeg(m,market,o){
    if(!slip||slip.match!==m.id)slip={match:m.id,legs:[],stake:slip?.stake??'500',replaces:null,back:0};
    const i=slip.legs.findIndex(l=>l.market===market.id),leg={market:market.id,code:o.code,label:`${market.label}: ${o.label}`,odds:o.odds};
    if(i>=0&&slip.legs[i].code===o.code)slip.legs.splice(i,1);else if(i>=0)slip.legs[i]=leg;
    else if(slip.legs.length>=COUPON.maxLegs){notice=`Bir kupona en çok ${COUPON.maxLegs} seçim konur.`;return;}else slip.legs.push(leg);
    if(!slip.legs.length)slip=null;requestQuote();
  }
  /** Editing a bet: its picks (at today's odds) and stake go back into the slip; placing it replaces the bet. */
  function editBet(bet){
    const m=data.upcoming.find(x=>x.id===bet.match||x.mine.some(b=>b.id===bet.id));if(!m?.book)return;
    const picks=(bet.legs??[{market:bet.market,code:bet.code,label:bet.label,odds:bet.odds}]).map(l=>{const market=m.book.markets.find(x=>x.id===l.market),o=market?.outcomes.find(x=>x.code===l.code)??(market?.family==='score'?scoreOutcome(m.book,l.code):null);
      return market&&o?{market:l.market,code:l.code,label:l.label,odds:o.odds}:null;}).filter(Boolean);
    slip={match:m.id,legs:picks,stake:String(bet.stake),replaces:bet.id,back:bet.stake};requestQuote();
  }
  const betRow=(b,editable=false)=>`<li class="${b.status}${b.legs?' is-coupon':''}"><span>${esc(b.label)}</span><span>${coin(b.stake)} @ ${odd(b.odds)}</span><b>${b.status==='open'?`olası ${coin(payoutOf(b.stake,b.odds))}`:b.status==='won'?`kazandı · ${coin(b.payout)}`:statusText[b.status]}</b>
    ${b.legs?`<ul class="tm-legs">${b.legs.map(legItem).join('')}</ul>`:''}
    ${editable&&b.status==='open'?`<div class="tm-bet-actions"><button type="button" data-bet-edit="${b.id}">Düzenle</button><button type="button" data-bet-cancel="${b.id}" data-stake="${b.stake}">İptal et</button></div>`:''}</li>`;
  function myBets(m){
    if(!m.mine.length)return '';const editable=!m.live&&serverNow()<m.kickoffAt&&!user.isAdmin;
    return `<div class="tm-mybets"><h3>Bu maçtaki kuponların</h3><ul>${m.mine.map(b=>betRow(b,editable)).join('')}</ul>${editable?'<p class="tm-hint">Maç başlayana kadar kuponunu düzenleyebilir ya da iptal edebilirsin (iptalde coin geri gelir).</p>':''}<button type="button" class="tm-more" data-tab="kuponlar">Bütün kuponların →</button></div>`;
  }
  function next(m){
    const now=serverNow();
    return `<section class="tm-card tm-next${m.live?' is-live':''}"><div class="tm-eyebrow">${m.live?'<span class="tm-live">CANLI</span>':'GÜNÜN MAÇI'}</div><h1>${esc(when(m.kickoffAt))}</h1>
      <p class="tm-count" data-count="${m.kickoffAt}">${m.live?'Yayında. Gel, kaldığı yerden izle. Bahisler kapandı.':`Başlamasına ${left(m.kickoffAt-now)}`}</p>
      ${m.regenerated?'<p class="tm-note">Kadro değişti, maç yeniden üretildi; önceki bahisler iade edildi.</p>':''}
      ${user.isAdmin?'<p class="tm-note">Admin hesabı bahis oynamaz; bülteni oyuncuların gördüğü gibi görüyorsun.</p>':''}
      <div class="tm-actions">${m.live?`<a class="tm-button" href="#yayin/${m.id}">Canlı izle</a>`:'<button class="tm-button" type="button" disabled>Maç başlayınca canlı izle</button>'}</div>
      ${lineups(m)}
      ${bulletin(m)}${myBets(m)}</section>`;
  }
  function matchTab(){
    const [first,...rest]=data.upcoming;
    return `${wallet()}${first?next(first):'<section class="tm-card tm-next"><div class="tm-eyebrow">GÜNÜN MAÇI</div><h1>Bültende maç yok</h1><p class="tm-count">Admin maçı bültene açınca burada görünecek.</p></section>'}
      ${rest.length?`<section class="tm-section"><h2>Sonraki maçlar</h2><ul class="tm-later">${rest.map(m=>`<li><b>${esc(when(m.kickoffAt))}</b><span>${esc(m.teams.names.join(' – '))}</span></li>`).join('')}</ul></section>`:''}`;
  }

  // --- Kuponlarım ------------------------------------------------------------------------------------------------------------------
  function couponsTab(){
    if(!coupons)return '<section class="tm-card"><p class="tm-hint">Kuponların yükleniyor…</p></section>';
    const all=coupons.matches.flatMap(m=>m.bets),settled=all.filter(b=>b.status==='won'||b.status==='lost'),staked=settled.reduce((s,b)=>s+b.stake,0),paid=settled.reduce((s,b)=>s+b.payout,0),bonus=coupons.matches.reduce((s,m)=>s+m.bonus,0);
    const net=paid-staked+bonus,won=settled.filter(b=>b.status==='won').length;
    const stat=(label,value,cls='')=>`<div class="tm-stat ${cls}"><span>${label}</span><b>${value}</b></div>`;
    const list=coupons.matches.map(m=>({...m,bets:m.bets.filter(b=>couponFilter==='all'||b.status===couponFilter)})).filter(m=>m.bets.length);
    return `<section class="tm-card tm-coupons"><h2>Kuponlarım</h2>
        ${all.length?`<div class="tm-stats">${stat('Bahis',coin(all.length))}${stat('Kazanan',`${won}/${settled.length}`)}${stat('Oynanan',coin(staked))}${stat('Net',signed(net),net>=0?'up':'down')}</div>`:''}
        <div class="tm-tabs" role="tablist" aria-label="Kupon durumu">${FILTERS.map(([id,label])=>`<button type="button" role="tab" aria-selected="${id===couponFilter}" data-filter="${id}">${label}</button>`).join('')}</div>
        ${list.length?list.map(couponMatch).join(''):`<p class="tm-hint">${all.length?'Bu durumda kupon yok.':user.isAdmin?'Admin hesabının kuponu olmaz; kuponların kendi hesabında.':'Henüz bahis oynamadın. Maç sekmesinde bültenden bir seçeneğe bas.'}</p>`}
        ${all.length?'<p class="tm-hint">Net = kazanılan − oynanan + kayıp bonusu; bekleyen bahisler sayılmaz.</p>':''}</section>`;
  }
  function couponMatch(m){
    const settledBets=m.bets.filter(b=>b.status==='won'||b.status==='lost'),net=m.over?settledBets.reduce((s,b)=>s+b.payout-b.stake,0):0;
    const head=m.over&&m.score?`${esc(m.names[0])} <strong>${m.score[0]}–${m.score[1]}</strong> ${esc(m.names[1])}`:`${esc(m.names[0])} – ${esc(m.names[1])}`;
    const state=m.status==='cancelled'?'<span class="tm-points">iptal · iade</span>':!m.over?`<span class="tm-points wait">${m.live?'canlı':'başlamadı'}</span>`:`<span class="tm-points ${net>=0?'':'down'}">${signed(net)}${m.bonus?` · bonus +${coin(m.bonus)}`:''}</span>`;
    const editable=m.status==='scheduled'&&!m.over&&!m.live&&serverNow()<m.kickoffAt&&data.upcoming.some(x=>x.id===m.id)&&!user.isAdmin;
    return `<article class="tm-coupon"><header><span class="tm-date">${esc(SHORT.format(m.kickoffAt))}</span><b>${head}</b>${state}</header><ul>${m.bets.map(b=>betRow(b,editable)).join('')}</ul></article>`;
  }

  // --- Sonuçlar --------------------------------------------------------------------------------------------------------------------
  function everyone(m){
    const d=details.get(m.id);if(!d)return '<p class="tm-hint">Yükleniyor…</p>';if(!d.bets.length)return '<p class="tm-hint">Bu maça kimse bahis oynamadı.</p>';
    const by=new Map();for(const b of d.bets){const e=by.get(b.name)??[];e.push(b);by.set(b.name,e);}
    return `<div class="tm-everyone">${[...by].map(([n,list])=>{const net=list.reduce((s,b)=>s+b.payout-(b.status==='void'?0:b.stake),0);return `<div class="tm-person"><h4>${esc(n)}<span class="${net>=0?'up':'down'}">${signed(net)}</span></h4><ul>${list.map(b=>`<li class="${b.status}"><span>${esc(b.label)}</span><span>${coin(b.stake)} @ ${odd(b.odds)}</span><b>${statusText[b.status]}${b.payout?` · ${coin(b.payout)}`:''}</b>${b.legs?`<ul class="tm-legs">${b.legs.map(legItem).join('')}</ul>`:''}</li>`).join('')}</ul></div>`;}).join('')}</div>`;
  }
  function recent(m){
    const r=m.result,d=details.get(m.id);
    return `<li class="tm-match"><div class="tm-match-head"><span class="tm-date">${esc(SHORT.format(m.kickoffAt))}</span><b>${esc(m.teams.names[0])} <strong>${r.score[0]}–${r.score[1]}</strong> ${esc(m.teams.names[1])}</b>
      ${m.mine.length?`<span class="tm-points ${m.net>=0?'':'down'}">${signed(m.net)}${m.bonus?` · bonus +${coin(m.bonus)}`:''}</span>`:''}</div>
      <p class="tm-goals">${goalsLine(r)}${r.motm?` · Maçın oyuncusu: <b>${esc(r.motm.name)}</b>`:''}</p>
      <div class="tm-links">${m.replayUntil&&serverNow()<m.replayUntil?`<a href="#yayin/${m.id}">Tekrar izle</a>`:''}${serverNow()<m.reelUntil?`<button type="button" data-reel="${m.id}" ${reels.get(m.id)?.making?'disabled':''}>${reelLabel(m.id)}</button>`:''}<button type="button" data-everyone="${m.id}">${d?.open?'Bahisleri gizle':'Herkesin bahisleri'}</button></div>
      ${d?.open?everyone(m):''}</li>`;
  }
  const reelLabel=id=>{const r=reels.get(id);return r?.making?`Özet hazırlanıyor… %${Math.round((r.progress??0)*100)}`:'Özeti izle';};
  /** The latest results come with the page; older ones five at a time (user, 2026-11-06). */
  const allRecent=()=>{const have=new Set(data.recent.map(m=>m.id));return [...data.recent,...older.filter(m=>!have.has(m.id))];};
  const resultsTab=()=>{const list=allRecent(),more=older.length?olderMore:data.recentMore;
    return `<section class="tm-section"><h2>Son maçlar</h2>${list.length?`<ul class="tm-recent">${list.map(recent).join('')}</ul>${more?'<button type="button" class="tm-more" data-older>Daha eski maçlar</button>':''}`:'<p class="tm-hint">Henüz oynanmış maç yok.</p>'}</section>`;};
  /** The 9:16 summary (user, 2026-11-06: "özeti izle olsun, ordan izleyip indirebilsin", never kept ready): made on the phone once per
   * visit, then played in a window over the page with a download button. */
  async function showReel(id){
    const have=reels.get(id);if(have?.url){openReel(have);return;}if(have?.making)return;
    const state={making:true,progress:0};reels.set(id,state);render();
    try{const rec=await decodeRecording(await api.reel(id)),{exportHighlights}=await import('../match/highlight-export.js');
      const out=await exportHighlights({snapshot:rec.snapshot,lineups:rec.lineups,halves:rec.halves,teamNames:rec.teamNames,onProgress:f=>{state.progress=f;const el=host.querySelector(`[data-reel="${id}"]`);if(el)el.textContent=reelLabel(id);}});
      Object.assign(state,{making:false,url:URL.createObjectURL(out.blob),filename:out.filename});openReel(state);}
    catch(e){reels.delete(id);notice=e.message;}
    render();
  }
  function openReel({url,filename}){
    closeReel();const box=document.createElement('div');box.className='tm-reel-view';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','Maç özeti');
    box.innerHTML=`<div class="tm-reel-card"><video src="${url}" controls playsinline autoplay></video><div class="tm-reel-actions"><a class="tm-button" href="${url}" download="${esc(filename)}">İndir</a><button type="button" class="tm-ghost" data-reel-close>Kapat</button></div></div>`;
    box.addEventListener('click',e=>{if(e.target===box||e.target.closest('[data-reel-close]'))closeReel();});
    document.body.append(box);box.querySelector('[data-reel-close]').focus({preventScroll:true});
  }
  function closeReel(){document.querySelector('.tm-reel-view')?.remove();}
  const onKey=e=>{if(e.key==='Escape')closeReel();};

  // --- Tablo -----------------------------------------------------------------------------------------------------------------------
  function tableTab(){
    const rows=data.leaderboard,me=rows.findIndex(r=>r.username===data.me.username);
    const row=(r,i)=>{const diff=r.balance-COIN.start;return `<li class="${i<3?`is-top${i+1}`:''}${i===me?' is-me':''}"><span class="tm-pos">${i+1}</span><span class="tm-who"><b>${esc(r.displayName)}${i===me?' <em>sen</em>':''}</b><small>${r.bets} bahis</small></span>
      <span class="tm-diff ${diff>0?'up':diff<0?'down':''}">${diff?signed(diff):'±0'}</span><strong>${coin(r.balance)}</strong></li>`;};
    const mine=me>=0?'':user.isAdmin?'<p class="tm-hint">Admin hesabı tabloda yer almaz.</p>':data.me.kind==='observer'?`<p class="tm-hint">Gözlemcisin: admin açınca tabloda görünürsün. Bakiyen ${coin(data.balance)} Alsancak coin.</p>`:`<p class="tm-hint">İlk bahsinle tabloya girersin. Bakiyen ${coin(data.balance)} Alsancak coin.</p>`;
    return `<section class="tm-card tm-board-card"><h2>Alsancak coin tablosu</h2><p class="tm-hint">Herkes ${coin(COIN.start)} Alsancak coin ile başladı; ortadaki sayı başlangıca göre kâr ya da zarar.</p>
      ${rows.length?`<div class="tm-board-head" aria-hidden="true"><span>#</span><span>Oyuncu</span><span>Kâr / zarar</span><span>Alsancak coin</span></div><ol class="tm-board">${rows.map(row).join('')}</ol>`:'<p class="tm-hint">İlk bahislerden sonra burada.</p>'}${mine}</section>`;
  }

  function render(){
    if(!data)return;
    const body=tab==='kuponlar'?couponsTab():tab==='sonuclar'?resultsTab():tab==='tablo'?tableTab():matchTab();
    // The match tab shows a notice in the wallet; the others under the tabs.
    host.innerHTML=`<div class="tm">${nav()}${user.isAdmin?adminNote():''}${incoming()}${notice&&tab!=='mac'?`<p class="tm-status" role="status">${esc(notice)}</p>`:''}${body}</div>`;
  }
  async function goto(id){
    tab=TABS.some(([x])=>x===id)?id:'mac';notice='';history.replaceState(null,'',tab==='mac'?'#gunun-maci':`#gunun-maci/${tab}`);render();host.scrollTop=0;
    if(tab==='kuponlar'){try{coupons=await api.coupons();}catch(e){coupons={matches:[]};notice=e.message;}render();}
  }
  const findPick=(matchId,marketId,code)=>{const m=data.upcoming.find(x=>x.id===matchId),market=m?.book?.markets.find(x=>x.id===marketId);return {m,market,o:market?.outcomes.find(x=>x.code===code)??(market?.family==='score'?scoreOutcome(m.book,code):null)};};
  host.addEventListener('input',event=>{const f=event.target.closest('[data-slip]');if(!f||!slip)return;slip.stake=f.stake.value;slip.error=null;updateSlip();});
  host.addEventListener('submit',async event=>{
    const f=event.target;event.preventDefault();
    if(f.matches('[data-slip]')){
      if(placing||!slip?.legs.length)return;
      const button=f.querySelector('button[type=submit]');button.disabled=true;const many=slip.legs.length>1,edited=!!slip.replaces,what=many?`${slip.legs.length} seçimli kupon`:slip.legs[0].label;
      placing=true;updateSlip();
      try{const r=await api.bet(slip.match,slip.legs.map(l=>({market:l.market,code:l.code})),Number(f.stake.value),slip.replaces,slipState().odds||null);placing=false;
        notice=`${edited?'Kupon güncellendi':many?'Kupon alındı':'Bahis alındı'}: ${what} @ ${odd(r.odds)}`;slip=null;quote=null;
        // A clean slate for the next coupon: the old slip goes even if its stake field still has the focus.
        if(document.activeElement instanceof HTMLElement&&host.contains(document.activeElement))document.activeElement.blur();
        await refresh();render();}
      catch(e){placing=false;notice='';
        // The odds dropped since they were shown (user, 2026-11-06): nothing is played; the slip takes the new odds and a press plays them.
        if(e.data?.changed&&slip){if(Array.isArray(e.data.legs))slip.legs.forEach((l,i)=>{l.odds=e.data.legs[i]??l.odds;});if(many)quote={key:slipKey(),ok:true,odds:e.data.odds,product:e.data.product??e.data.odds,factor:e.data.factor??1};
          slip.error=e.message;render();host.querySelector('.tm-slip')?.scrollIntoView({block:'nearest'});return;}
        slip.error=e.message;updateSlip();if(e.status===409)void refresh();}
      return;
    }
    if(f.matches('[data-other-score]')){
      const a=Number(f.a.value),b=Number(f.b.value);if(!Number.isInteger(a)||!Number.isInteger(b)||f.a.value===''||f.b.value==='')return;
      const {m,market,o}=findPick(f.dataset.otherScore,'score',`${a}-${b}`);if(!o)return;
      if(!o.playable){f.querySelector('span').textContent='Bu skor oynanamaz';return;}
      if(!slip?.legs.some(l=>l.market===market.id&&l.code===o.code))toggleLeg(m,market,o);render();host.querySelector('.tm-slip')?.scrollIntoView({block:'nearest'});return;
    }
    if(f.matches('[data-ask-form]')){
      try{await api.requestCoins(f.to.value,Number(f.amount.value));asking=false;notice='İsteğin gönderildi.';await refresh();}catch(e){notice=e.message;render();}
    }
  });
  host.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b||b.disabled)return;
    if(b.dataset.retry!==undefined){void refresh();return;}
    if(b.dataset.switchAccount!==undefined){b.disabled=true;try{await api.logout();}catch{}location.replace('/');return;}
    if(b.dataset.tab){await goto(b.dataset.tab);return;}
    if(b.dataset.filter){couponFilter=b.dataset.filter;render();return;}
    if(b.dataset.group){group=b.dataset.group;render();return;}
    if(b.dataset.pick){const [matchId,marketId,code]=b.dataset.pick.split('|'),{m,market,o}=findPick(matchId,marketId,code);if(!o)return;notice='';toggleLeg(m,market,o);render();return;}
    if(b.dataset.legRemove){slip.legs.splice(Number(b.dataset.legRemove),1);if(!slip.legs.length)slip=null;requestQuote();render();return;}
    if(b.dataset.quick){if(!slip)return;slip.stake=b.dataset.quick;slip.error=null;render();return;}
    if(b.dataset.slipCancel!==undefined){slip=null;quote=null;render();return;}
    if(b.dataset.betEdit){const bet=[...data.upcoming.flatMap(m=>m.mine.map(x=>({...x,match:m.id}))),...(coupons?.matches.flatMap(m=>m.bets.map(x=>({...x,match:m.id})))??[])].find(x=>x.id===b.dataset.betEdit);if(!bet)return;
      editBet(bet);if(tab!=='mac'){tab='mac';history.replaceState(null,'','#gunun-maci');}notice='';render();host.querySelector('.tm-slip')?.scrollIntoView({block:'center'});return;}
    if(b.dataset.betCancel){if(!confirm(`Bu kupon iptal edilsin mi? ${coin(Number(b.dataset.stake))} Alsancak coin geri gelir.`))return;
      try{await api.cancelBet(b.dataset.betCancel);if(slip?.replaces===b.dataset.betCancel)slip=null;notice='Kupon iptal edildi, coinin geri geldi.';if(tab==='kuponlar')coupons=await api.coupons();await refresh();}catch(e){notice=e.message;render();}return;}
    if(b.dataset.ask!==undefined){asking=true;notice='';if(!people)people=await api.people().catch(()=>[]);render();return;}
    if(b.dataset.askCancel!==undefined){asking=false;render();return;}
    if(b.dataset.send||b.dataset.decline){try{await api.answerRequest(b.dataset.send??b.dataset.decline,!!b.dataset.send);notice=b.dataset.send?'Alsancak coin gönderildi.':'İstek reddedildi.';await refresh();}catch(e){notice=e.message;render();}return;}
    if(b.dataset.everyone){const id=b.dataset.everyone,d=details.get(id);if(d){d.open=!d.open;render();return;}details.set(id,{bets:[],open:true});render();const full=await api.match(id).catch(()=>({bets:[]}));details.set(id,{bets:full.bets??[],open:true});render();return;}
    if(b.dataset.reel){void showReel(b.dataset.reel);return;}
    if(b.dataset.older!==undefined){b.disabled=true;try{const r=await api.recent(allRecent().at(-1)?.kickoffAt??Date.now());older=[...older,...r.recent];olderMore=r.more;}catch(e){notice=e.message;}render();}
  });
  /** Asks the server again (user, 2026-11-06): every 20 s from a quarter of an hour before a kick-off until its broadcast is over, every
   * minute otherwise, and at once at the final whistle (results and payouts). A hidden page does not ask; coming back it asks at once. */
  function schedule(){
    clearTimeout(poll);const now=serverNow(),list=data?.upcoming??[];
    let wait=list.some(m=>m.kickoffAt-now<15*60_000&&now<m.kickoffAt+m.broadcastMs)?20_000:60_000;
    for(const m of list){const end=m.kickoffAt+m.broadcastMs+1500;if(end>now&&end-now<wait)wait=end-now;}
    poll=setTimeout(async()=>{if(!document.hidden)await refresh(false);schedule();},Math.max(1000,wait));
  }
  function onVisible(){if(document.hidden||!poll)return;clearTimeout(poll);void refresh(false).finally(schedule);}
  // The countdown runs on the server clock; at zero the page fetches the live state (the watch button opens, the bulletin closes).
  function ticking(){const el=host.querySelector('[data-count]');if(!el||!data)return;const m=data.upcoming[0];if(!m||m.live)return;const ms=m.kickoffAt-serverNow();if(ms<=0){void refresh();return;}el.textContent=`Başlamasına ${left(ms)}`;}
  return {
    /** `sub` is the tab in the address (#gunun-maci/<sub>); none is the match tab. */
    open(sub){tab=TABS.some(([x])=>x===sub)?sub:'mac';clearTimeout(poll);clearInterval(tick);void refresh().finally(schedule);tick=setInterval(ticking,1000);
      document.addEventListener('visibilitychange',onVisible);window.addEventListener('keydown',onKey);},
    close(){clearTimeout(poll);clearInterval(tick);poll=tick=null;closeReel();document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('keydown',onKey);},
  };
}
