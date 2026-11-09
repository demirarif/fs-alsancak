import { api, serverNow } from './api.js';
import { planMatch, repriceMatch } from './planner.js';
import { assistMarket, bookWarnings, fairOdds, playerMarket, ODDS } from '../v1/online/markets.ts';
import './online.css';

/* Yönetim paneli (admin account only, user decisions 2026-11-05): its own menu on the left (across the top on a phone) and one section
 * at a time, kept in the address (#yonetim/bahisler) so a reload stays there.
 * - Simülasyon: plan a match from the squads and lineup saved in this browser (simulated here, uploaded without showing the result, then
 *   priced by playing the same lineups again); the planned ones with "Sonucu gör", re-generate, cancel.
 * - Bahisler: the odds editor (the suggestion, near-certain picks closed); any player's goal or assist bet from two drop-downs, priced from
 *   his simulated goals, with a player × bet table to see and pick them; save, open the bulletin; read-only from the kick-off.
 * - Sonuçlar: finished matches, what was staked, paid and given back, the house's balance, everybody's bets; deleting a match, keeping or
 *   taking back what it paid.
 * - Oyuncular, Gözlemciler: balances (the admin may set one; the difference is a ledger entry), password resets, observers (on the table
 *   only once listed). Planned or live matches can be deleted too (their bets refunded). Coins are Alsancak coin, a game currency. */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const DAY=new Intl.DateTimeFormat('tr-TR',{weekday:'long',day:'numeric',month:'long'}),TIME=new Intl.DateTimeFormat('tr-TR',{hour:'2-digit',minute:'2-digit'}),SHORT=new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long'});
const when=ms=>`${DAY.format(ms)} · ${TIME.format(ms)}`,coin=n=>Math.round(n).toLocaleString('tr-TR'),odd=o=>o.toFixed(2).replace('.',','),pct=p=>`%${(p*100).toFixed(p<.1?1:0).replace('.',',')}`;
const signed=n=>`${n>0?'+':n<0?'−':''}${coin(Math.abs(n))}`;
const SPEEDS=[[400_000,'Yavaş'],[200_000,'Orta'],[100_000,'Hızlı']];
// The editor's tabs; a player's goal and assist bets (suggested or added, whatever their players' tab) are all edited in "Oyuncular".
const GROUPS=['Maç','Yarılar','Goller','Skor','Oyuncular','Diğer'],PLAYER_BETS=new Set(['player-goals','player-assist']);
const KINDS=[['1','Gol atar'],['2','2+ gol'],['3','Hat-trick (3+)'],['4','4+ gol'],['5','5+ gol'],['assist','Asist yapar']];
const SECTIONS=[
  {id:'simulasyon',label:'Simülasyon',lead:'Maçı bu cihazda üret: sonucu gizli kalır, oranları önerilir.'},
  {id:'bahisler',label:'Bahisler',lead:'Oranları gözden geçir ve düzenle, bültene aç. Maç başlayınca kilitlenir.'},
  {id:'sonuclar',label:'Sonuçlar',lead:'Biten maçlar: oynanan, ödenen ve geri verilen Alsancak coin, kasanın durumu; maç silme.'},
  {id:'oyuncular',label:'Oyuncular',lead:'Bakiyeler (düzenlenebilir), şifre durumu ve şifre sıfırlama.'},
  {id:'gozlemciler',label:'Gözlemciler',lead:'Futbol oynamayan arkadaşlar: bahis oynar, Alsancak coin toplar; kadroda yoktur.'},
];
const ICONS={
  simulasyon:'<circle cx="10" cy="10" r="7.5"/><path d="M8.6 7.1v5.8l4.6-2.9z"/>',
  bahisler:'<path d="M3 6h14v2.4a1.6 1.6 0 0 0 0 3.2V14H3v-2.4a1.6 1.6 0 0 0 0-3.2z"/><path d="M12.5 6.6v1.2M12.5 9.4v1.2M12.5 12.2v1.2"/>',
  sonuclar:'<path d="M6.5 3.5h7v3.5a3.5 3.5 0 0 1-7 0z"/><path d="M6.5 5H4a2.4 2.4 0 0 0 2.7 3M13.5 5H16a2.4 2.4 0 0 1-2.7 3M10 10.5v3.2M7 16.5h6"/>',
  oyuncular:'<circle cx="7.5" cy="7" r="2.7"/><path d="M2.6 16.2a4.9 4.9 0 0 1 9.8 0"/><circle cx="14.2" cy="7.8" r="2.1"/><path d="M13.4 12.1a4 4 0 0 1 4.2 4"/>',
  gozlemciler:'<path d="M1.8 10S4.8 4.6 10 4.6 18.2 10 18.2 10 15.2 15.4 10 15.4 1.8 10 1.8 10z"/><circle cx="10" cy="10" r="2.5"/>',
};
const icon=id=>`<svg class="ui-icon" viewBox="0 0 20 20" aria-hidden="true">${ICONS[id]}</svg>`;
const statusText={open:'bekliyor',won:'kazandı',lost:'kaybetti',void:'iade'};
const scorers=r=>!r.goals.length?'Gol yok':[0,1].map(i=>{const tally=new Map();for(const g of r.goals.filter(g=>g.team===i)){const k=g.ownGoal?`${g.name} (k.k.)`:g.name;tally.set(k,(tally.get(k)??0)+1);}
  return tally.size?`<span class="${i?'red':'blue'}">${[...tally].map(([n,c])=>esc(c>1?`${n} ${c}`:n)).join(', ')}</span>`:'';}).filter(Boolean).join(' · ');

export function mountAdmin(host,{plannerInput}){
  let data=null,users=null,section='simulasyon',filter='',busy=false,planStatus='',editing=null,observerNote='',userNote='',resultNote='',balanceOf=null,removing=null,moving=null;
  const revealed=new Map(),details=new Map(),form={day:defaultDay(),time:'20:00',sims:'160'};
  function defaultDay(){const d=new Date(serverNow());if(d.getHours()>=19)d.setDate(d.getDate()+1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  const playersOf=m=>m.teams.teams.flatMap((t,i)=>t.players.map(p=>({id:p.id,name:p.name,team:i})));
  function chips(m){
    const time=m.live?'<span class="adm-chip live">Yayında</span>':serverNow()<m.kickoffAt?'<span class="adm-chip">Planlandı</span>':'<span class="adm-chip">Bitti</span>';
    const odds=m.oddsStatus==='open'?'<span class="adm-chip ok">Bültende</span>':m.oddsStatus==='draft'?'<span class="adm-chip warn">Oranlar taslak · oyuncular görmüyor</span>':'<span class="adm-chip warn">Oran yok</span>';
    return time+odds+(m.regenerated?'<span class="adm-chip muted">yeniden üretildi</span>':'');
  }
  function navMeta(id){
    if(!data)return '';const next=data.upcoming[0];
    if(id==='simulasyon')return data.upcoming.length?`${data.upcoming.length} planlı`:'';
    if(id==='bahisler')return !next?'':next.oddsStatus==='open'?'bültende':next.oddsStatus==='draft'?'taslak':'oran yok';
    if(id==='sonuclar')return data.recent.length?String(data.recent.length):'';
    return users?String(users.filter(u=>u.kind===(id==='oyuncular'?'player':'observer')).length):'';
  }
  function render(){
    const s=SECTIONS.find(x=>x.id===section);
    host.innerHTML=`<div class="adm"><nav class="adm-nav" aria-label="Yönetim paneli"><span class="adm-eyebrow">YÖNETİM PANELİ</span>
        <div class="adm-nav-items">${SECTIONS.map(x=>`<button type="button" data-section="${x.id}"${x.id===section?' aria-current="page"':''}>${icon(x.id)}<span>${x.label}</span><small>${esc(navMeta(x.id))}</small></button>`).join('')}</div>
        <div class="adm-nav-links"><a href="#kadrolar">Kadro seçimi</a><a href="#dizilis">Taktik odası</a><a href="#gunun-maci">Oyuncu görünümü</a></div></nav>
      <div class="adm-main"><header class="adm-head"><h1>${s.label}</h1><p>${s.lead}</p></header>${body()}</div></div>`;
    if(section==='simulasyon')void showLineup();
  }
  function body(){
    if(!data)return '<p class="adm-hint">Yükleniyor…</p>';
    return section==='bahisler'?betsSection():section==='sonuclar'?resultsSection():section==='oyuncular'?playersSection():section==='gozlemciler'?observersSection():simulationSection();
  }

  // --- Simülasyon ------------------------------------------------------------------------------------------------------------------
  function simulationSection(){
    const up=data.upcoming;
    return `<div class="adm-grid"><section class="adm-card adm-plan"><h2>Yeni maç planla</h2><div data-lineup><p class="adm-hint">Kayıtlı diziliş okunuyor…</p></div>
        <div class="adm-form"><label>Gün<input type="date" name="day" value="${esc(form.day)}"></label><label>Saat<input type="time" name="time" value="${esc(form.time)}"></label>
          <label>Oran için simülasyon<select name="sims">${[['80','80 · hızlı'],['160','160 · önerilen'],['320','320 · hassas, uzun sürer']].map(([v,l])=>`<option value="${v}" ${v===form.sims?'selected':''}>${l}</option>`).join('')}</select></label>
          <button type="button" class="adm-button" data-plan ${busy?'disabled':''}>Planla</button></div>
        <p class="adm-status" data-status role="status">${esc(planStatus)}</p>
        <p class="adm-hint">Maç bu cihazda üretilir, sonucu gösterilmeden yüklenir; sonra aynı dizilişlerle oran için yeniden oynatılır (telefonda 80 seç). Bitince Bahisler açılır.</p></section>
      <section class="adm-card"><h2>Planlanan maçlar${up.length?` <small>${up.length}</small>`:''}</h2>${up.length?`<ul class="adm-matches">${up.map(matchRow).join('')}</ul>`:'<p class="adm-hint">Planlanmış maç yok.</p>'}</section></div>`;
  }
  function matchRow(m){
    const started=serverNow()>=m.kickoffAt;
    return `<li class="adm-match"><div class="adm-match-main"><b>${esc(when(m.kickoffAt))}</b>${chips(m)}<span class="adm-teams">${esc(m.teams.names[0])} – ${esc(m.teams.names[1])}</span></div>
      <div class="adm-actions"><button type="button" class="adm-button" data-odds-of="${m.id}">${started?'Bahisleri gör':'Oranlar'}</button><button type="button" class="adm-button ghost" data-reveal="${m.id}">${revealed.has(m.id)?'Sonucu gizle':'Sonucu gör'}</button>${started?'':`<button type="button" class="adm-button ghost" data-move="${m.id}">Saati değiştir</button><button type="button" class="adm-button ghost" data-replan="${m.id}">Yeniden üret</button>`}<button type="button" class="adm-button danger" data-delete="${m.id}" data-started="${started?1:''}">Sil</button></div>
      ${moving===m.id&&!started?moveForm(m):''}${revealed.has(m.id)?`<p class="adm-result">${revealed.get(m.id)}</p>`:''}</li>`;
  }
  function moveForm(m){
    const d=new Date(m.kickoffAt),p=n=>String(n).padStart(2,'0');
    return `<form class="adm-form adm-move" data-move-form="${m.id}"><label>Yeni gün<input type="date" name="day" value="${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}" required></label><label>Saat<input type="time" name="time" value="${p(d.getHours())}:${p(d.getMinutes())}" required></label>
      <button class="adm-button" type="submit">Kaydet</button><button class="adm-button ghost" type="button" data-move-cancel>Vazgeç</button><p class="adm-hint">Bahisler yerinde kalır; oyuncular yeni saati görür.</p></form>`;
  }
  async function showLineup(){
    const el=host.querySelector('[data-lineup]'),input=await plannerInput();if(!el||!el.isConnected)return;
    if(!input?.draft){el.innerHTML='<p class="adm-note">Kayıtlı diziliş yok. Önce <a href="#kadrolar">Kadro seçimi</a>, sonra <a href="#dizilis">Taktik odası</a>.</p>';return;}
    const names=new Map(input.ctx.catalog.players.map(p=>[p.id,p.name]));
    el.innerHTML=`<div class="adm-lineup">${input.draft.lineups.map((l,i)=>`<div class="adm-side ${i?'red':'blue'}"><b>${esc(input.ctx.selection.teams[i].name)}<small>${esc(l.formationId)}</small></b><p>${l.assignments.map(a=>esc(names.get(a.playerId)??a.playerId)).join(', ')}</p></div>`).join('')}</div>
      <p class="adm-hint">Bu tarayıcıda kayıtlı kadro ve diziliş. <a href="#kadrolar">Kadroları düzenle</a> · <a href="#dizilis">Dizilişi düzenle</a></p>`;
  }

  // --- Bahisler --------------------------------------------------------------------------------------------------------------------
  function betsSection(){
    const up=data.upcoming;
    if(!up.length)return `<section class="adm-card adm-empty"><h2>Planlanmış maç yok</h2><p class="adm-hint">Oranlar maç planlanınca önerilir; bülteni açınca oyuncular görür.</p><div><button type="button" class="adm-button" data-section="simulasyon">Simülasyon'a git</button></div></section>`;
    const pick=up.length>1?`<div class="adm-tabs" role="tablist" aria-label="Maç">${up.map(m=>`<button type="button" role="tab" aria-selected="${editing?.id===m.id}" data-odds-of="${m.id}">${esc(when(m.kickoffAt))}</button>`).join('')}</div>`:'';
    return pick+editor();
  }
  function editor(){
    const e=editing,m=e&&data.upcoming.find(x=>x.id===e.id);
    if(!m)return '<section class="adm-card"><p class="adm-hint">Oranlar yükleniyor…</p></section>';
    const b=e.book,locked=serverNow()>=m.kickoffAt,title=`<h2>${esc(when(m.kickoffAt))} · ${esc(m.teams.names[0])} – ${esc(m.teams.names[1])}</h2>`;
    if(e.busy)return `<section class="adm-card adm-odds">${title}<p class="adm-status">${esc(e.busy)}</p></section>`;
    if(!b)return `<section class="adm-card adm-odds">${title}<p class="adm-note">Bu maçın oranı yok.</p><div><button class="adm-button" type="button" data-reprice>Oranları hesapla</button></div></section>`;
    const warnings=locked?[]:bookWarnings(b),open=b.markets.filter(x=>x.active),closed=open.reduce((s,x)=>s+x.outcomes.filter(o=>!o.playable).length,0);
    const sum=f=>Object.values(f??{}).flatMap(Object.values).reduce((s,n)=>s+n,0),betCount=sum(e.counts),stakedSum=sum(e.staked);
    const status=locked?'<span class="adm-chip live">Maç başladı · oranlar kilitli</span>':m.oddsStatus==='open'?'<span class="adm-chip ok">Bültende</span>':'<span class="adm-chip warn">Taslak · oyuncular görmüyor</span>';
    const saveButtons=`<button type="button" class="adm-button ghost" data-save ${e.dirty?'':'disabled'}>Kaydet</button>${m.oddsStatus==='open'?'':'<button type="button" class="adm-button" data-open-bulletin>Kaydet ve bültene aç</button>'}`;
    const actions=locked?'':`<div class="adm-actions"><label class="adm-inline">Oran hareketi<select data-liquidity>${SPEEDS.map(([v,l])=>`<option value="${v}" ${b.liquidity===v?'selected':''}>${l}</option>`).join('')}</select></label>
      <button type="button" class="adm-button ghost" data-reprice>Yeniden hesapla</button>${saveButtons}</div>`;
    const indexed=b.markets.map((x,mi)=>[x,mi]),blocks=list=>list.map(([x,mi])=>marketBlock(x,mi,locked)).join('');
    const content=e.group==='Oyuncular'?`${playerBets(m,locked)}<h3 class="adm-sub">Diğer oyuncu bahisleri</h3>${blocks(indexed.filter(([x])=>x.group==='Oyuncular'&&!PLAYER_BETS.has(x.family)))}`
      :blocks(indexed.filter(([x])=>x.group===e.group&&!PLAYER_BETS.has(x.family)))||'<p class="adm-hint">Bu sekmede bahis yok.</p>';
    return `<section class="adm-card adm-odds"><div class="adm-odds-head"><div>${title}<div class="adm-odds-state">${status}${m.regenerated?'<span class="adm-chip muted">yeniden üretildi</span>':''}</div></div>${actions}</div>
      <p class="adm-hint">${b.meta.sims} simülasyondan öneri (gerçek maçın tohumu değil) · kâr payı yok, oranlar hep aşağı yuvarlanır · ${open.length} bahis açık · ${closed} seçenek kesine yakın, kapalı · ${betCount?`<b>${betCount} bahis oynandı, ${coin(stakedSum)} Alsancak coin</b>`:'henüz tekli bahis yok'}${e.coupons?.count?` · <b>${e.coupons.count} kupon, ${coin(e.coupons.staked)} Alsancak coin</b>`:''}</p>
      ${warnings.length?`<div class="adm-warn"><b>Dikkat: bu oranlar adil olanın üstünde.</b> Tek kişi bunu kullanamaz (her sonuçta kazandıran bahis takımı reddedilir), ama farklı taraflara oynayan birkaç kişi birlikte kazanır. Bilerek yaptıysan sorun yok.<ul>${warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>`:''}
      ${e.note?`<p class="adm-status" role="status">${esc(e.note)}</p>`:''}
      <div class="adm-tabs" role="tablist" aria-label="Bahis grubu">${GROUPS.map(g=>`<button type="button" role="tab" aria-selected="${g===e.group}" data-edit-group="${esc(g)}">${esc(g)}</button>`).join('')}</div>
      ${content}
      <p class="adm-hint">Oranı ${odd(ODDS.playableFrom)}'un altına düşen seçenek kesine yakın sayılır ve kapalı gelir; istersen "oynanır" yapıp herkese açabilirsin. Bültendeki oranlar, oynanan paraya göre senin oranından en fazla %${ODDS.drift*100} uzaklaşır. Bir oyuncunun her sonuçta kazandıran bahis takımı (ör. 7,5 üst ile 9,5 alt) sistemce reddedilir.</p>
      ${e.dirty&&!locked?`<div class="adm-savebar" role="region" aria-label="Kaydedilmemiş değişiklik"><span>Kaydedilmemiş değişiklik var.</span><button type="button" class="adm-button ghost" data-discard>Vazgeç</button>${saveButtons}</div>`:''}</section>`;
  }
  function marketBlock(market,mi,locked){
    const played=editing.staked?.[market.id]??{},inCoupons=editing.coupons?.markets?.[market.id]??{},others=market.family==='score'?Object.entries(played).filter(([c])=>!market.outcomes.some(o=>o.code===c)):[];
    return `<div class="adm-market${market.active?'':' is-closed'}"><div class="adm-market-head"><b>${esc(market.label)}</b>${market.custom?'<span class="adm-chip muted">senin eklediğin</span>':''}
        <label class="adm-switch"><input type="checkbox" data-active="${mi}" ${market.active?'checked':''} ${locked?'disabled':''}><span aria-hidden="true"></span><em>${market.active?'açık':'kapalı'}</em></label>${market.custom&&!Object.keys(played).length&&!Object.keys(inCoupons).length&&!locked?`<button type="button" class="adm-link" data-remove="${mi}">Sil</button>`:''}</div>
      <div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Seçenek</th><th data-short="%">Olasılık</th><th>Öneri</th><th>Oran</th><th data-short="Açık">Oynanır mı</th><th>Oynanan</th></tr></thead><tbody>${market.outcomes.map((o,oi)=>row(market,o,`${mi}:${oi}`,locked)).join('')}</tbody></table></div>
      ${others.length?`<p class="adm-hint">Listede olmayan skorlara: ${others.map(([c,s])=>`${esc(c.replace('-','–'))} (${editing.counts?.[market.id]?.[c]??0} bahis · ${coin(s)})`).join(', ')}</p>`:''}</div>`;
  }
  function row(market,o,k,locked){
    const staked=editing.staked?.[market.id]?.[o.code]??0,count=editing.counts?.[market.id]?.[o.code]??0,coupons=editing.coupons?.markets?.[market.id]?.[o.code]??0;
    return `<tr class="${o.playable?'':'is-off'}"><td>${esc(o.label)}</td><td>${pct(o.prob)}</td><td>${odd(fairOdds(o.prob))}</td>
      <td><input type="number" step="0.05" min="${ODDS.min}" max="${ODDS.max}" value="${o.odds.toFixed(2)}" data-odds="${k}" aria-label="${esc(market.label)} ${esc(o.label)} oranı" ${locked?'disabled':''}></td>
      <td><label class="adm-switch"><input type="checkbox" data-playable="${k}" ${o.playable?'checked':''} ${locked?'disabled':''} aria-label="${esc(o.label)} oynanır"><span aria-hidden="true"></span><em>${o.playable?'oynanır':'kapalı'}</em></label></td>
      <td>${[count?`${count} bahis · ${coin(staked)}`:'',coupons?`${coupons} kuponda`:''].filter(Boolean).join(' · ')||'—'}</td></tr>`;
  }
  /** The market for a player and a kind of bet, priced from his simulated goals or assists (an added one goes to players' "Özel" tab). */
  function betFor(b,who,kind){
    if(kind==='assist')return assistMarket(who.id,who.name,b.meta.playerAssists[who.id]??.003,true);
    const k=Number(kind);return playerMarket(who.id,who.name,k,b.meta.playerGoals[who.id]?.[k-1]??.003,true);
  }
  function playerBets(m,locked){
    const e=editing,b=e.book,players=playersOf(m),goal=id=>b.meta.playerGoals[id]?.[0]??0,byChance=[...players].sort((x,y)=>goal(y.id)-goal(x.id));
    if(!e.pb||!players.some(p=>p.id===e.pb.player))e.pb={player:byChance[0].id,kind:'1'};
    const who=players.find(p=>p.id===e.pb.player),kind=e.pb.kind,preview=betFor(b,who,kind),mi=b.markets.findIndex(x=>x.id===preview.id),[yes,no]=preview.outcomes;
    const picker=`<div class="adm-pb-pick"><label>Oyuncu<select data-pb-player>${m.teams.teams.map((t,i)=>`<optgroup label="${esc(t.name)}">${byChance.filter(p=>p.team===i).map(p=>`<option value="${esc(p.id)}" ${p.id===who.id?'selected':''}>${esc(p.name)} · gol ihtimali ${pct(goal(p.id))}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label>Bahis<select data-pb-kind>${KINDS.map(([v,l])=>`<option value="${v}" ${v===kind?'selected':''}>${l}</option>`).join('')}</select></label></div>`;
    const current=mi>=0?marketBlock(b.markets[mi],mi,locked):`<div class="adm-market adm-pb-new"><div class="adm-market-head"><b>${esc(preview.label)}</b><span class="adm-chip muted">bültende yok</span></div>
      <p class="adm-hint">Öneri: Evet ${odd(yes.odds)}${yes.playable?'':' (kesine yakın, kapalı gelir)'} · Hayır ${odd(no.odds)}${no.playable?'':' (kesine yakın, kapalı gelir)'} · olasılık ${pct(yes.prob)}</p>
      ${locked?'':'<div><button type="button" class="adm-button" data-pb-add>Bültene ekle</button></div>'}</div>`;
    return `<section class="adm-pb"><div><h3>Oyuncu bahisleri</h3><p class="adm-hint">Oyuncuyu ve bahsi seç: bültendeyse oranını düzenle, yoksa önerilen oranla ekle. Aşağıdaki tablodan da seçebilirsin.</p></div>${picker}${current}${playerGrid(b,players,who,kind,goal)}</section>`;
  }
  function playerGrid(b,players,who,kind,goal){
    const ids=new Set(b.markets.filter(x=>PLAYER_BETS.has(x.family)).map(x=>String(x.params.player)));ids.add(who.id);
    const rows=players.filter(p=>ids.has(p.id)).sort((x,y)=>goal(y.id)-goal(x.id));
    const cell=(p,k)=>{const x=b.markets.find(y=>y.id===(k==='assist'?`assist-${p.id}`:`goals-${p.id}-${k}`)),yes=x?.outcomes[0],label=KINDS.find(([v])=>v===k)[1];
      const cls=['adm-pb-cell',p.id===who.id&&k===kind&&'is-selected',!x&&'is-empty',x&&!x.active&&'is-closed',x&&!yes.playable&&'is-off'].filter(Boolean).join(' ');
      return `<td><button type="button" class="${cls}" data-pb-cell="${esc(p.id)}|${k}" aria-label="${esc(p.name)}: ${label}${x?`, Evet ${odd(yes.odds)}${x.active?'':', kapalı'}`:', bültende yok'}">${x?odd(yes.odds):'+'}</button></td>`;};
    return `<div class="adm-table-wrap"><table class="adm-pb-grid"><thead><tr><th>Oyuncu</th>${KINDS.map(([v])=>`<th>${v==='assist'?'Asist':`${v}+`}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(p=>`<tr><th scope="row"><span class="adm-dot ${p.team?'red':'blue'}" aria-hidden="true"></span>${esc(p.name)}</th>${KINDS.map(([v])=>cell(p,v)).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="adm-hint">Hücrede "Evet" oranı. Soluk: kesine yakın, oynanmaz · üstü çizili: bültende kapalı · +: bültende yok. Hücreye basınca yukarıda açılır.</p>`;
  }

  // --- Sonuçlar --------------------------------------------------------------------------------------------------------------------
  function resultsSection(){
    const list=data.recent;if(!list.length)return `${resultNote?`<p class="adm-status" role="status">${esc(resultNote)}</p>`:''}<section class="adm-card"><p class="adm-hint">Henüz biten maç yok. Yayın bitince bahisler ödenir ve maç buraya düşer.</p></section>`;
    const zero={bets:0,staked:0,paid:0,bonus:0},sum=list.reduce((s,m)=>{const h=m.house??zero;return {bets:s.bets+h.bets,staked:s.staked+h.staked,paid:s.paid+h.paid,bonus:s.bonus+h.bonus};},zero),net=h=>h.staked-h.paid-h.bonus;
    const stat=(label,value,cls='')=>`<div class="adm-stat ${cls}"><span>${label}</span><b>${value}</b></div>`;
    return `${resultNote?`<p class="adm-status" role="status">${esc(resultNote)}</p>`:''}<section class="adm-card"><h2>Kasa · son ${list.length} maç</h2><div class="adm-stats">${stat('Bahis',coin(sum.bets))}${stat('Oynanan',coin(sum.staked))}${stat('Ödenen',coin(sum.paid))}${stat('Kayıp bonusu',coin(sum.bonus))}${stat('Kasa',signed(net(sum)),net(sum)>=0?'up':'down')}</div>
        <p class="adm-hint">Kasa = oynanan − ödenen − kayıp bonusu. Eksiye düşebilir (kasa da kaybedebilir); Alsancak coin yalnız oyun parası.</p></section>
      <section class="adm-card"><h2>Biten maçlar</h2><ul class="adm-results">${list.map(m=>resultRow(m,net)).join('')}</ul></section>`;
  }
  function resultRow(m,net){
    const r=m.result,h=m.house??{bets:0,staked:0,paid:0,bonus:0},n=net(h),d=details.get(m.id);
    return `<li><div class="adm-result-head"><span>${esc(SHORT.format(m.kickoffAt))}</span><b>${esc(m.teams.names[0])} <strong>${r.score[0]}–${r.score[1]}</strong> ${esc(m.teams.names[1])}</b>${h.bets?`<span class="adm-chip ${n>=0?'ok':'warn'}">kasa ${signed(n)}</span>`:''}</div>
      <small>${scorers(r)}${r.motm?` · Maçın oyuncusu ${esc(r.motm.name)}`:''}</small>
      <small class="adm-muted">${h.bets?`${h.bets} bahis · oynanan ${coin(h.staked)} · ödenen ${coin(h.paid)} · kayıp bonusu ${coin(h.bonus)}`:'Bu maça bahis oynanmadı.'}</small>
      <div class="adm-row-links">${h.bets?`<button type="button" class="adm-link gold" data-everyone="${m.id}">${d?.open?'Bahisleri gizle':'Herkesin bahisleri'}</button>`:''}<button type="button" class="adm-link" data-delete-finished="${m.id}">Maçı sil</button></div>
      ${removing===m.id?`<div class="adm-confirm" role="group" aria-label="Maçı sil"><p><b>Bu maç silinsin mi?</b> ${h.bets?`${h.bets} bahis oynanmıştı.`:'Bahis oynanmamıştı.'}</p>
        ${h.bets?`<div class="adm-actions"><button type="button" class="adm-button danger" data-delete-undo="${m.id}">Sil, Alsancak coinleri geri al</button><button type="button" class="adm-button ghost" data-delete-keep="${m.id}">Sil, bakiyeler kalsın</button><button type="button" class="adm-button ghost" data-delete-cancel>Vazgeç</button></div>
        <p class="adm-hint">Geri alırsan bahisler iade edilir; kazançlar ve kayıp bonusu geri çekilir, herkesin bakiyesi bu maç hiç oynanmamış gibi olur (geri alınan Alsancak coin sonradan harcandıysa bakiye eksiye düşebilir; Oyuncular'dan düzeltebilirsin).</p>`
        :`<div class="adm-actions"><button type="button" class="adm-button danger" data-delete-keep="${m.id}">Sil</button><button type="button" class="adm-button ghost" data-delete-cancel>Vazgeç</button></div>`}</div>`:''}
      ${d?.open?everyone(d):''}</li>`;
  }
  function everyone(d){
    if(!d.bets)return '<p class="adm-hint">Yükleniyor…</p>';
    const by=new Map();for(const b of d.bets){const l=by.get(b.name)??[];l.push(b);by.set(b.name,l);}
    return `<div class="tm-everyone">${[...by].map(([n,list])=>{const net=list.reduce((s,b)=>s+b.payout-(b.status==='void'?0:b.stake),0);
      return `<div class="tm-person"><h4>${esc(n)}<span class="${net>=0?'up':'down'}">${net>=0?'+':''}${coin(net)}</span></h4><ul>${list.map(b=>`<li class="${b.status}"><span>${esc(b.label)}</span><span>${coin(b.stake)} @ ${odd(b.odds)}</span><b>${statusText[b.status]}${b.payout?` · ${coin(b.payout)}`:''}</b>${b.legs?`<ul class="tm-legs">${b.legs.map(l=>`<li class="${l.won===true?'won':l.won===false?'lost':''}"><span>${l.won===true?'✓ ':l.won===false?'✗ ':''}${esc(l.label)}</span><b>${odd(l.odds)}</b></li>`).join('')}</ul>`:''}</li>`).join('')}</ul></div>`;}).join('')}</div>`;
  }

  // --- Oyuncular, Gözlemciler ------------------------------------------------------------------------------------------------------
  function userItem(u,extra=''){
    return `<li><div><b>${esc(u.displayName)}</b><code>${esc(u.username)} · <span>${coin(u.balance)} Alsancak coin</span></code></div>${u.mustChange?'<span class="adm-chip muted">ilk şifrede</span>':'<span class="adm-chip ok">şifresini değiştirdi</span>'}
      ${extra}<div class="adm-user-actions"><button type="button" class="adm-button ghost" data-balance="${esc(u.username)}">Bakiye</button><button type="button" class="adm-button ghost" data-reset="${esc(u.username)}" data-name="${esc(u.displayName)}">Şifreyi sıfırla</button></div>
      ${balanceOf===u.username?`<div class="adm-balance"><p class="adm-hint">${esc(u.displayName)}: şu an <b>${coin(u.balance)}</b> Alsancak coin. Fark admin düzeltmesi olarak kayda geçer.</p>
        <form data-balance-form="${esc(u.username)}" data-mode="set"><label>Yeni bakiye<input name="amount" type="number" min="0" max="10000000" step="1" value="${u.balance}" inputmode="numeric" required></label><button class="adm-button" type="submit">Bakiye bu olsun</button></form>
        <form data-balance-form="${esc(u.username)}" data-mode="add"><label>Ekle (eksi: çıkar)<input name="amount" type="number" min="-10000000" max="10000000" step="1" placeholder="1000" inputmode="numeric" required></label><button class="adm-button ghost" type="submit">Ekle</button></form>
        <button class="adm-button ghost adm-balance-close" type="button" data-balance-cancel>Kapat</button></div>`:''}</li>`;
  }
  function userRows(){
    if(!users)return '<p class="adm-hint">Yükleniyor…</p>';
    const q=filter.trim().toLocaleLowerCase('tr-TR'),list=users.filter(u=>u.kind==='player'&&(!q||u.displayName.toLocaleLowerCase('tr-TR').includes(q)||u.username.includes(q)));
    return list.length?`<ul class="adm-users">${list.map(u=>userItem(u)).join('')}</ul>`:'<p class="adm-hint">Eşleşen kullanıcı yok.</p>';
  }
  function playersSection(){
    const list=(users??[]).filter(u=>u.kind==='player'),changed=list.filter(u=>!u.mustChange).length;
    return `<section class="adm-card adm-everyone"><h2>Herkese Alsancak coin ekle</h2><form class="adm-form" data-add-all><label>Tutar (eksi: çıkar)<input name="amount" type="number" min="-1000000" max="1000000" step="1" placeholder="5000" inputmode="numeric" required></label>
        <label>Kime<select name="who"><option value="">Herkes (oyuncular ve gözlemciler)</option><option value="player">Yalnız oyuncular</option><option value="observer">Yalnız gözlemciler</option></select></label><button class="adm-button" type="submit">Ekle</button></form>
        <p class="adm-hint">Her kişiye ayrı admin düzeltmesi yazılır; çıkarırken kimse sıfırın altına inmez.</p></section>
      <section class="adm-card adm-people"><div class="adm-people-head"><input type="search" class="adm-search" placeholder="Ad ya da kullanıcı adı ara" value="${esc(filter)}" data-filter aria-label="Oyuncu ara">
        <p class="adm-hint">${list.length} oyuncu · ${changed} kişi şifresini değiştirdi (en az bir kez girdi)</p></div>
      ${userNote?`<p class="adm-status" role="status">${esc(userNote)}</p>`:''}<div data-userlist>${userRows()}</div><p class="adm-hint">Sıfırlanan kullanıcı ilk şifresiyle (kullanıcı adı ve !) girer, sonra yeniden değiştirir.</p></section>`;
  }
  function observersSection(){
    const list=(users??[]).filter(u=>u.kind==='observer'),shown=list.filter(u=>u.listed).length;
    return `<div class="adm-grid"><section class="adm-card adm-observers"><h2>Gözlemci ekle</h2><form class="adm-form" data-observer-form><label>Ad<input name="name" required maxlength="30" placeholder="Örneğin Ece"></label><button class="adm-button" type="submit">Gözlemci ekle</button></form>
        ${observerNote?`<p class="adm-status" role="status">${esc(observerNote)}</p>`:''}${userNote?`<p class="adm-status" role="status">${esc(userNote)}</p>`:''}<p class="adm-hint">Kullanıcı adı adın küçük harfle yazılışı, ilk şifre sonuna ! eklenmiş hali; ilk girişte şifresini değiştirir.</p></section>
      <section class="adm-card adm-observers"><h2>Gözlemciler${list.length?` <small>${list.length} · ${shown} tabloda</small>`:''}</h2>
        ${list.length?`<ul class="adm-users">${list.map(u=>userItem(u,`<label class="adm-switch adm-listed"><input type="checkbox" data-listed="${esc(u.username)}" ${u.listed?'checked':''}><span aria-hidden="true"></span><em>${u.listed?'tabloda':'tabloda değil'}</em></label>`)).join('')}</ul>`:'<p class="adm-hint">Henüz gözlemci yok.</p>'}
        <p class="adm-hint">Anahtarı açmadıkça genel Alsancak coin tablosunda görünmez.</p></section></div>`;
  }

  // --- data and actions ------------------------------------------------------------------------------------------------------------
  async function refresh(){
    try{[data,users]=await Promise.all([api.state(),api.admin.users()]);}catch(e){if(e.status===401){location.reload();return;}host.innerHTML=`<div class="adm-error"><p class="adm-note">${esc(e.message)}</p></div>`;return;}
    if(editing&&!data.upcoming.some(m=>m.id===editing.id))editing=null;
    render();
    if(section==='bahisler'&&!editing&&data.upcoming.length)await edit(data.upcoming[0].id);
  }
  /** The book to edit carries the admin's odds (the live ones move with bets); what is staked shows beside each outcome. */
  async function edit(id,note=''){
    const d=await api.match(id),book=d.book?{...d.book,markets:d.book.markets.map(m=>({...m,outcomes:m.outcomes.map(({base,...o})=>({...o,odds:base??o.odds}))}))}:null,same=editing?.id===id;
    editing={id,book,staked:d.staked,counts:d.counts,coupons:d.coupons,dirty:false,group:same?editing.group:'Maç',pb:same?editing.pb:null,note};render();
  }
  function goto(id){
    section=SECTIONS.some(x=>x.id===id)?id:'simulasyon';history.replaceState(null,'',`#yonetim/${section}`);render();host.scrollTop=0;
    if(section==='bahisler'&&!editing&&data?.upcoming.length)void edit(data.upcoming[0].id);
  }
  async function plan(kickoffAt,replaces){
    const say=t=>{planStatus=t;const el=host.querySelector('[data-status]');if(el)el.textContent=t;};
    const input=await plannerInput();if(!input?.draft){say('Kayıtlı diziliş yok. Önce Kadro seçimi, sonra Taktik odası.');return;}
    busy=true;host.querySelectorAll('[data-plan],[data-replan]').forEach(b=>{b.disabled=true;});
    try{const r=await planMatch({draft:input.draft,context:input.ctx,kickoffAt,replaces,onStep:say,sims:Number(form.sims)||160});busy=false;planStatus='';if(replaces&&editing?.id===replaces)editing=null;
      await refresh();section='bahisler';history.replaceState(null,'','#yonetim/bahisler');await edit(r.id,`Planlandı: ${when(kickoffAt)}. Sonuç gizli. Oranları gözden geçirip bültene aç; açana kadar oyuncular maçı görmez.`);host.scrollTop=0;}
    catch(e){busy=false;say(`Planlanamadı: ${e.message}`);render();}
  }
  function markDirty(){if(editing.dirty)return;editing.dirty=true;host.querySelectorAll('[data-save]').forEach(b=>b.removeAttribute('disabled'));}
  host.addEventListener('input',event=>{
    const t=event.target;
    if(t.matches('[data-filter]')){filter=t.value;const el=host.querySelector('[data-userlist]');if(el)el.innerHTML=userRows();return;}
    if(t.matches('.adm-plan [name]')){form[t.name]=t.value;return;}
    if(t.matches('[data-odds]')&&editing){const [mi,oi]=t.dataset.odds.split(':').map(Number),o=editing.book.markets[mi].outcomes[oi],v=Number(t.value);if(Number.isFinite(v)&&v>=ODDS.min&&v<=ODDS.max){o.odds=Math.round(v*100)/100;markDirty();}}
  });
  host.addEventListener('change',async event=>{
    const t=event.target;
    if(t.matches('.adm-plan [name]')){form[t.name]=t.value;return;}
    if(t.matches('[data-listed]')){try{await api.admin.setListed(t.dataset.listed,t.checked);const u=users.find(x=>x.username===t.dataset.listed);if(u)u.listed=t.checked?1:0;render();}catch(e){alert(e.message);t.checked=!t.checked;}return;}
    if(!editing)return;
    if(t.matches('[data-odds]')){render();return;}
    if(t.matches('[data-playable]')){const [mi,oi]=t.dataset.playable.split(':').map(Number);editing.book.markets[mi].outcomes[oi].playable=t.checked;editing.dirty=true;render();return;}
    if(t.matches('[data-active]')){editing.book.markets[Number(t.dataset.active)].active=t.checked;editing.dirty=true;render();return;}
    if(t.matches('[data-liquidity]')){editing.book.liquidity=Number(t.value);editing.dirty=true;render();return;}
    if(t.matches('[data-pb-player]')){editing.pb={...editing.pb,player:t.value};render();return;}
    if(t.matches('[data-pb-kind]')){editing.pb={...editing.pb,kind:t.value};render();}
  });
  host.addEventListener('submit',async event=>{
    const bf=event.target.closest('[data-balance-form]');
    if(bf){event.preventDefault();const username=bf.dataset.balanceForm,amount=Math.round(Number(bf.amount.value)),u=users.find(x=>x.username===username);
      try{const r=await api.admin.setBalance(username,bf.dataset.mode==='add'?{add:amount}:{balance:amount});balanceOf=null;userNote=`${u?.displayName??username}: ${coin(r.from)} → ${coin(r.balance)} Alsancak coin.`;users=await api.admin.users();render();}catch(e){userNote=e.message;render();}return;}
    const all=event.target.closest('[data-add-all]');
    if(all){event.preventDefault();const add=Math.round(Number(all.amount.value)),who=all.who.value||null,whom=who==='player'?'oyunculara':who==='observer'?'gözlemcilere':'herkese';
      if(!add||!confirm(`${whom.charAt(0).toLocaleUpperCase('tr-TR')+whom.slice(1)} ${add>0?`${coin(add)} Alsancak coin eklensin`:`${coin(-add)} Alsancak coin çıkarılsın`} mi?`))return;
      try{const r=await api.admin.addAll(add,who);userNote=`${r.users} kişiye ${add>0?'+':'−'}${coin(Math.abs(add))} Alsancak coin yazıldı.`;users=await api.admin.users();render();}catch(e){userNote=e.message;render();}return;}
    const mf=event.target.closest('[data-move-form]');
    if(mf){event.preventDefault();const at=new Date(`${mf.day.value}T${mf.time.value}`).getTime();
      try{await api.admin.moveMatch(mf.dataset.moveForm,at);moving=null;planStatus=`Maçın saati değişti: ${when(at)}.`;await refresh();}catch(e){alert(e.message);}return;}
    const f=event.target.closest('[data-observer-form]');if(!f)return;event.preventDefault();
    try{const r=await api.admin.addObserver(f.name.value);observerNote=`Eklendi: kullanıcı adı ${r.username}, ilk şifre ${r.password}. Anahtarı açmadıkça tabloda görünmez.`;users=await api.admin.users();render();}
    catch(e){observerNote=e.message;render();}
  });
  host.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b||b.disabled)return;
    if(b.dataset.section){goto(b.dataset.section);return;}
    if(b.dataset.plan!==undefined){
      const kickoffAt=new Date(`${form.day}T${form.time}`).getTime();
      if(!Number.isFinite(kickoffAt)){planStatus='Gün ve saati seç.';render();return;}
      if(kickoffAt<serverNow()+60_000&&!confirm('Bu saat geçmişte ya da bir dakikadan yakın: maç hemen başlar. Yine de planlansın mı?'))return;
      await plan(kickoffAt,null);return;
    }
    if(b.dataset.oddsOf){
      const id=b.dataset.oddsOf;if(editing?.dirty&&editing.id!==id&&!confirm('Kaydedilmemiş oran değişikliklerin var. Başka maça geçilsin mi?'))return;
      section='bahisler';history.replaceState(null,'','#yonetim/bahisler');if(editing?.id!==id){editing=null;render();host.scrollTop=0;await edit(id);}else{render();host.scrollTop=0;}return;
    }
    if(!editing&&(b.dataset.editGroup||b.dataset.pbCell||b.dataset.pbAdd!==undefined||b.dataset.save!==undefined||b.dataset.openBulletin!==undefined||b.dataset.reprice!==undefined||b.dataset.remove||b.dataset.discard!==undefined))return;
    if(b.dataset.discard!==undefined){if(confirm('Kaydedilmemiş değişiklikler geri alınsın mı?'))await edit(editing.id,'Değişiklikler geri alındı; kayıtlı oranlar yüklendi.');return;}
    if(b.dataset.editGroup){editing.group=b.dataset.editGroup;editing.note='';render();return;}
    if(b.dataset.pbCell){const [player,kind]=b.dataset.pbCell.split('|');editing.pb={player,kind};render();host.querySelector('.adm-pb')?.scrollIntoView({block:'start'});return;}
    if(b.dataset.pbAdd!==undefined){
      const m=data.upcoming.find(x=>x.id===editing.id),who=playersOf(m).find(p=>p.id===editing.pb.player),market=betFor(editing.book,who,editing.pb.kind);
      if(editing.book.markets.some(x=>x.id===market.id))return;
      editing.book.markets.push(market);editing.dirty=true;editing.note=`"${market.label}" eklendi; oyuncular "Özel" sekmesinde görür. Kaydetmeyi unutma.`;render();return;
    }
    if(b.dataset.save!==undefined||b.dataset.openBulletin!==undefined){
      const open=b.dataset.openBulletin!==undefined,id=editing.id;
      if(open&&bookWarnings(editing.book).length&&!confirm('Oranlarda uyarı var (kutuda yazıyor). Bülten yine de açılsın mı?'))return;
      try{await api.admin.saveBook(id,editing.book);if(open)await api.admin.openBulletin(id);await refresh();if(data.upcoming.some(m=>m.id===id))await edit(id,open?'Bülten açıldı: oyuncular maçı ve oranları görüyor.':'Oranlar kaydedildi.');}
      catch(e){editing.note=e.message;render();}
      return;
    }
    if(b.dataset.reprice!==undefined){
      const m=data.upcoming.find(x=>x.id===editing.id),sims=Number(form.sims)||160;if(editing.book&&!confirm(`Oranlar ${sims} simülasyonla yeniden hesaplanacak; elle yaptığın değişiklikler gider. Devam edilsin mi?`))return;
      editing.busy='Oranlar hesaplanıyor… %0';render();
      try{const book=await repriceMatch({id:editing.id,teams:m.teams,sims,onProgress:f=>{editing.busy=`Oranlar hesaplanıyor… %${Math.round(f*100)}`;const el=host.querySelector('.adm-odds .adm-status');if(el)el.textContent=editing.busy;}});
        // Markets already played keep their options and odds (their bets are paid on them); one the new suggestion lacks stays, closed.
        const played=(editing.book?.markets??[]).filter(x=>editing.staked?.[x.id]||editing.coupons?.markets?.[x.id]);
        for(const old of played){const i=book.markets.findIndex(y=>y.id===old.id);if(i>=0)book.markets[i]=old;else book.markets.push({...old,active:false});}
        editing.busy=null;editing.book=book;editing.dirty=true;editing.note=`Yeni öneri hazır; kaydetmeyi unutma.${played.length?` Oynanmış ${played.length} bahis eski seçenek ve oranlarıyla kaldı.`:''}`;render();}
      catch(e){editing.busy=null;editing.note=e.message;render();}
      return;
    }
    if(b.dataset.remove){editing.book.markets.splice(Number(b.dataset.remove),1);editing.dirty=true;render();return;}
    if(b.dataset.replan){const m=data.upcoming.find(x=>x.id===b.dataset.replan);if(m&&confirm('Kayıtlı dizilişle bu maç yeniden üretilsin mi? Oynanan bahisler iade edilir, oranlar yeniden hesaplanır.'))await plan(m.kickoffAt,m.id);return;}
    if(b.dataset.delete){
      const id=b.dataset.delete;if(!confirm(b.dataset.started?'Yayın başladı. Maç silinirse yayın durur, oynanan bahisler iade edilir. Silinsin mi?':'Bu maç silinsin mi? Oynanan bahisler iade edilir.'))return;
      try{await api.admin.remove(id);revealed.delete(id);if(editing?.id===id)editing=null;await refresh();}catch(e){alert(e.message);}return;
    }
    if(b.dataset.deleteFinished){removing=removing===b.dataset.deleteFinished?null:b.dataset.deleteFinished;resultNote='';render();return;}
    if(b.dataset.deleteCancel!==undefined){removing=null;render();return;}
    if(b.dataset.deleteUndo||b.dataset.deleteKeep){
      const id=b.dataset.deleteUndo??b.dataset.deleteKeep,undo=!!b.dataset.deleteUndo;
      try{const r=await api.admin.remove(id,undo);removing=null;details.delete(id);resultNote=undo?`Maç silindi; ${r.reverted??0} bahsin Alsancak coini geri alındı, bakiyeler maçtan önceki haline döndü.`:'Maç silindi; bakiyeler olduğu gibi kaldı.';await refresh();}catch(e){alert(e.message);}return;
    }
    if(b.dataset.balance){balanceOf=balanceOf===b.dataset.balance?null:b.dataset.balance;userNote='';render();host.querySelector('[data-balance-form] input')?.select();return;}
    if(b.dataset.balanceCancel!==undefined){balanceOf=null;render();return;}
    if(b.dataset.move){moving=moving===b.dataset.move?null:b.dataset.move;render();return;}
    if(b.dataset.moveCancel!==undefined){moving=null;render();return;}
    if(b.dataset.reveal){
      const id=b.dataset.reveal;if(revealed.has(id)){revealed.delete(id);render();return;}
      try{const r=await api.admin.result(id),m=data.upcoming.find(x=>x.id===id);revealed.set(id,`${esc(m.teams.names[0])} <strong>${r.score[0]}–${r.score[1]}</strong> ${esc(m.teams.names[1])} · ilk yarı ${r.halfTime[0]}–${r.halfTime[1]}<br>${scorers(r)}${r.motm?` · Maçın oyuncusu ${esc(r.motm.name)}`:''}`);render();}catch(e){alert(e.message);}
      return;
    }
    if(b.dataset.everyone){
      const id=b.dataset.everyone,d=details.get(id);if(d){d.open=!d.open;render();return;}
      details.set(id,{open:true,bets:null});render();const full=await api.match(id).catch(()=>({bets:[]}));details.set(id,{open:true,bets:full.bets??[]});render();return;
    }
    if(b.dataset.reset){
      if(!confirm(`${b.dataset.name} kullanıcısının şifresi sıfırlansın mı? İlk şifresi yeniden "${b.dataset.reset}!" olur.`))return;
      try{await api.admin.reset(b.dataset.reset);const u=users.find(x=>x.username===b.dataset.reset);if(u)u.mustChange=1;render();}catch(e){alert(e.message);}
    }
  });
  window.addEventListener('beforeunload',event=>{if(editing?.dirty){event.preventDefault();event.returnValue='';}});
  return {
    /** `sub` is the section in the address (#yonetim/<sub>); none keeps the last one. */
    open(sub){if(SECTIONS.some(x=>x.id===sub))section=sub;history.replaceState(null,'',`#yonetim/${section}`);void refresh();},
    close(){},
  };
}
