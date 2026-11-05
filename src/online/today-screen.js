import { api, serverNow } from './api.js';
import { decodeRecording } from '../v1/online/recording.ts';
import { DINAR, scoreOutcome, SCORE_MAX } from '../v1/online/markets.ts';
import './online.css';

/* "Günün maçı" (user decisions 2026-11-05): the balance in dinar (a game currency only) and asking a friend for some ("para at"), the next
 * match with its squads and a countdown, the bulletin until kick-off (one side per bet, the odds move with the money, near-certain picks
 * shown but not playable), "Canlı izle" from the kick-off, past matches with the result, the man of the match, one's own net and the 30 %
 * loss bonus, everybody's bets (only after the match), and the dinar table. What the admin does lives in the Yönetim paneli. */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const DAY=new Intl.DateTimeFormat('tr-TR',{weekday:'long',day:'numeric',month:'long'}),TIME=new Intl.DateTimeFormat('tr-TR',{hour:'2-digit',minute:'2-digit'}),SHORT=new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long'});
const when=ms=>`${DAY.format(ms)} · ${TIME.format(ms)}`,dinar=n=>`${Math.round(n).toLocaleString('tr-TR')}`,odd=o=>o.toFixed(2).replace('.',',');
function left(ms){const s=Math.max(0,Math.round(ms/1000)),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return d?`${d} gün ${h} saat`:h?`${h} saat ${m} dakika`:m?`${m} dakika ${s%60} saniye`:`${s} saniye`;}
const GROUPS=['Maç','Yarılar','Goller','Skor','Oyuncular','Özel','Diğer'];
function goalsLine(r){
  if(!r?.goals.length)return 'Gol yok';
  return [0,1].map(i=>{const tally=new Map();for(const g of r.goals.filter(g=>g.team===i)){const k=g.ownGoal?`${g.name} (k.k.)`:g.name;tally.set(k,(tally.get(k)??0)+1);}
    return tally.size?`<span class="${i?'red':'blue'}">${[...tally].map(([n,c])=>esc(c>1?`${n} ${c}`:n)).join(', ')}</span>`:'';}).filter(Boolean).join(' · ');
}
const statusText={open:'bekliyor',won:'kazandı',lost:'kaybetti',void:'iade'};

export function mountToday(host,{user}){
  let data=null,poll=null,tick=null,shown='',group='Maç',slip=null,asking=false,people=null,notice='';const details=new Map();
  const signature=d=>JSON.stringify([d.balance,d.requests.incoming.map(r=>r.id),d.requests.outgoing.map(r=>[r.id,r.status]),d.upcoming.map(m=>[m.id,m.live,m.over,m.regenerated,m.mine.length,m.book?.markets.map(x=>x.outcomes.map(o=>o.odds).join()).join()]),d.recent.map(m=>[m.id,m.net]),d.leaderboard.map(x=>[x.username,x.balance])]);
  async function refresh(force=true){
    try{data=await api.state();const sig=signature(data);
      // Someone typing a stake keeps the field; the next poll redraws.
      if((force||sig!==shown)&&!host.querySelector('.tm-slip input:focus')){shown=sig;render();}}
    catch(e){if(e.status===401){location.reload();return;}host.innerHTML=`<div class="tm"><p class="tm-error">${esc(e.message)}</p><button class="tm-button" data-retry>Tekrar dene</button></div>`;}
  }
  function team(t,i){return `<div class="tm-team ${i?'red':'blue'}"><h3>${esc(t.name)}<small>${esc(t.formation)}</small></h3><ul>${t.players.map(p=>`<li><span>${esc(p.label)}</span>${esc(p.name)}</li>`).join('')}</ul></div>`;}
  function wallet(){
    // Asking is for a balance that has run out (under the smallest bet).
    const canAsk=!user.isAdmin&&data.balance<DINAR.minStake;if(!canAsk)asking=false;
    const r=data.requests,ask=asking?`<form class="tm-ask" data-ask-form><label>Kimden<select name="to" required><option value="">Seç</option>${(people??[]).map(p=>`<option value="${esc(p.username)}">${esc(p.displayName)}</option>`).join('')}</select></label>
      <label>Ne kadar<input type="number" name="amount" min="${DINAR.minStake}" max="${DINAR.start}" step="100" value="1000" inputmode="numeric"></label><button class="tm-button" type="submit">İsteği gönder</button><button class="tm-ghost" type="button" data-ask-cancel>Vazgeç</button></form>`:'';
    return `<section class="tm-card tm-wallet"><div class="tm-wallet-row"><div><div class="tm-eyebrow">BAKİYEN</div><strong class="tm-balance">${dinar(data.balance)} <small>dinar</small></strong></div>
      ${canAsk?`<button class="tm-ghost" type="button" data-ask ${asking?'hidden':''}>Arkadaşından dinar iste</button>`:''}</div>${ask}
      ${r.incoming.map(x=>`<div class="tm-request"><span><b>${esc(x.displayName)}</b> senden <b>${dinar(x.amount)} dinar</b> istiyor.</span><span class="tm-links"><button type="button" data-send="${x.id}">Gönder</button><button type="button" data-decline="${x.id}">Reddet</button></span></div>`).join('')}
      ${r.outgoing.filter(x=>x.status==='pending'||Date.now()-x.at<86_400_000).map(x=>`<p class="tm-hint">${esc(x.displayName)} kişisinden ${dinar(x.amount)} dinar istedin · ${x.status==='pending'?'bekliyor':x.status==='sent'?'gönderdi':'reddetti'}</p>`).join('')}
      ${notice?`<p class="tm-status" role="status">${esc(notice)}</p>`:''}<p class="tm-hint">Dinar yalnız oyun parası; satın alınmaz, hiçbir şeye çevrilmez.${user.isAdmin?'':' Bakiyen biterse bir arkadaşından isteyebilirsin.'}</p></section>`;
  }
  function outcomeButton(m,market,o,locked){
    const picked=slip&&slip.match===m.id&&slip.market===market.id&&slip.code===o.code,held=m.mine.find(b=>b.market===market.id&&b.status!=='void'),other=held&&held.code!==o.code;
    const off=locked||user.isAdmin||!o.playable||!market.active||other,title=!o.playable?'Oynanamaz: kaybetme ihtimali neredeyse yok':other?'Bu bahiste diğer taraftasın':'';
    const trend=o.base&&Math.abs(o.odds-o.base)>=.01?(o.odds<o.base?'down':'up'):'';
    return `<button type="button" class="tm-pick${picked?' is-picked':''}${held&&!other?' is-held':''}${trend?` is-${trend}`:''}" data-pick="${m.id}|${market.id}|${esc(o.code)}" ${off?'disabled':''} ${title?`title="${title}"`:''}><span>${esc(o.label)}</span><b>${odd(o.odds)}</b></button>`;
  }
  function bulletin(m){
    const book=m.book;if(!book)return '';const locked=m.live||serverNow()>=m.kickoffAt,groups=GROUPS.filter(g=>book.markets.some(x=>x.group===g&&x.active));
    if(!groups.includes(group))group=groups[0]??'Maç';
    const markets=book.markets.filter(x=>x.group===group&&x.active);
    const scoreBox=group==='Skor'&&!locked&&!user.isAdmin?`<form class="tm-other-score" data-other-score="${m.id}"><span>Başka skor</span><input name="a" type="number" min="0" max="${SCORE_MAX}" inputmode="numeric" aria-label="${esc(m.teams.names[0])} golleri"><span>–</span><input name="b" type="number" min="0" max="${SCORE_MAX}" inputmode="numeric" aria-label="${esc(m.teams.names[1])} golleri"><button class="tm-ghost" type="submit">Seç</button></form>`:'';
    return `<div class="tm-bulletin"><div class="tm-tabs" role="tablist">${groups.map(g=>`<button type="button" role="tab" aria-selected="${g===group}" data-group="${g}">${g}</button>`).join('')}</div>
      ${markets.map(market=>{const held=m.mine.find(b=>b.market===market.id&&b.status!=='void');return `<div class="tm-market"><h4>${esc(market.label)}${held?` <small>· ${esc(held.label.split(': ').pop())} tarafındasın</small>`:''}</h4><div class="tm-odds${market.outcomes.length>3?' many':''}">${market.outcomes.map(o=>outcomeButton(m,market,o,locked)).join('')}</div></div>`;}).join('')}${scoreBox}
      <p class="tm-hint">Bir bahiste yalnız bir tarafa oynanır; oran, oynadığın anki orana kilitlenir. Oranlar oynanan paraya göre ağır ağır değişir. Soluk seçenekler kesine yakın olduğu için oynanamaz. Her sonuçta en az birinin kazandığı bahisler (ör. 7,5 üst ile 9,5 alt) birlikte oynanmaz.</p></div>${slipBox(m)}`;
  }
  function slipBox(m){
    if(!slip||slip.match!==m.id)return '';const stake=Number(slip.stake)||0,win=Math.floor(stake*slip.odds);
    return `<form class="tm-slip" data-slip><div class="tm-slip-pick"><span>${esc(slip.label)}</span><b>${odd(slip.odds)}</b></div>
      <div class="tm-slip-row"><label>Tutar<input name="stake" type="number" min="${DINAR.minStake}" max="${Math.min(DINAR.maxStake,data.balance)}" step="50" value="${esc(slip.stake)}" inputmode="numeric"></label>
      <div class="tm-quick">${[100,500,1000,2500,5000].map(v=>`<button type="button" data-quick="${v}" ${v>data.balance?'disabled':''}>${dinar(v)}</button>`).join('')}</div></div>
      <div class="tm-slip-row"><span class="tm-win">Kazanırsan <b>${dinar(win)}</b> dinar</span><span class="tm-actions"><button class="tm-ghost" type="button" data-slip-cancel>Vazgeç</button><button class="tm-button" type="submit" ${stake<DINAR.minStake||stake>DINAR.maxStake||stake>data.balance?'disabled':''}>Bahsi yap</button></span></div>
      <p class="tm-hint">En az ${dinar(DINAR.minStake)}, en çok ${dinar(DINAR.maxStake)} dinar. Maç bitince kaybettiğin net dinarın %${DINAR.lossBonus*100}'u geri gelir.</p></form>`;
  }
  function myBets(m){
    if(!m.mine.length)return '';
    return `<div class="tm-mybets"><h3>Bahislerin</h3><ul>${m.mine.map(b=>`<li><span>${esc(b.label)}</span><span>${dinar(b.stake)} @ ${odd(b.odds)}</span><b>${b.status==='open'?`olası ${dinar(b.stake*b.odds)}`:statusText[b.status]}</b></li>`).join('')}</ul></div>`;
  }
  function next(m){
    const now=serverNow();
    return `<section class="tm-card tm-next${m.live?' is-live':''}"><div class="tm-eyebrow">${m.live?'<span class="tm-live">CANLI</span>':'GÜNÜN MAÇI'}</div><h1>${esc(when(m.kickoffAt))}</h1>
      <p class="tm-count" data-count="${m.kickoffAt}">${m.live?'Yayında. Gel, kaldığı yerden izle. Bahisler kapandı.':`Başlamasına ${left(m.kickoffAt-now)}`}</p>
      ${m.regenerated?'<p class="tm-note">Kadro değişti, maç yeniden üretildi; önceki bahisler iade edildi.</p>':''}
      ${user.isAdmin?'<p class="tm-note">Admin hesabı bahis oynamaz; bülteni oyuncuların gördüğü gibi görüyorsun.</p>':''}
      <div class="tm-actions">${m.live?`<a class="tm-button" href="#yayin/${m.id}">Canlı izle</a>`:'<button class="tm-button" type="button" disabled>Maç başlayınca canlı izle</button>'}</div>
      <details class="tm-squads"><summary>Kadrolar · ${esc(m.teams.names[0])} – ${esc(m.teams.names[1])}</summary><div class="tm-teams">${m.teams.teams.map(team).join('')}</div></details>
      ${bulletin(m)}${myBets(m)}</section>`;
  }
  function everyone(m){
    const d=details.get(m.id);if(!d)return '<p class="tm-hint">Yükleniyor…</p>';if(!d.bets.length)return '<p class="tm-hint">Bu maça kimse bahis oynamadı.</p>';
    const by=new Map();for(const b of d.bets){const e=by.get(b.name)??[];e.push(b);by.set(b.name,e);}
    return `<div class="tm-everyone">${[...by].map(([n,list])=>{const net=list.reduce((s,b)=>s+b.payout-(b.status==='void'?0:b.stake),0);return `<div class="tm-person"><h4>${esc(n)}<span class="${net>=0?'up':'down'}">${net>=0?'+':''}${dinar(net)}</span></h4><ul>${list.map(b=>`<li class="${b.status}"><span>${esc(b.label)}</span><span>${dinar(b.stake)} @ ${odd(b.odds)}</span><b>${statusText[b.status]}${b.payout?` · ${dinar(b.payout)}`:''}</b></li>`).join('')}</ul></div>`;}).join('')}</div>`;
  }
  function recent(m){
    const r=m.result,d=details.get(m.id);
    return `<li class="tm-match"><div class="tm-match-head"><span class="tm-date">${esc(SHORT.format(m.kickoffAt))}</span><b>${esc(m.teams.names[0])} <strong>${r.score[0]}–${r.score[1]}</strong> ${esc(m.teams.names[1])}</b>
      ${m.mine.length?`<span class="tm-points ${m.net>=0?'':'down'}">${m.net>=0?'+':''}${dinar(m.net)} dinar${m.bonus?` · bonus +${dinar(m.bonus)}`:''}</span>`:''}</div>
      <p class="tm-goals">${goalsLine(r)}${r.motm?` · Maçın oyuncusu: <b>${esc(r.motm.name)}</b>`:''}</p>
      <div class="tm-links">${serverNow()<m.recordingUntil?`<a href="#yayin/${m.id}">Tekrar izle</a>`:''}<button type="button" data-reel="${m.id}">Özeti indir · 9:16</button><button type="button" data-everyone="${m.id}">${d?.open?'Bahisleri gizle':'Herkesin bahisleri'}</button></div>
      ${d?.open?everyone(m):''}</li>`;
  }
  function render(){
    if(!data)return;const [first,...rest]=data.upcoming;
    host.innerHTML=`<div class="tm">${wallet()}${first?next(first):'<section class="tm-card tm-next"><div class="tm-eyebrow">GÜNÜN MAÇI</div><h1>Bültende maç yok</h1><p class="tm-count">Admin maçı bültene açınca burada görünecek.</p></section>'}
      ${rest.length?`<section class="tm-section"><h2>Sonraki maçlar</h2><ul class="tm-later">${rest.map(m=>`<li><b>${esc(when(m.kickoffAt))}</b><span>${esc(m.teams.names.join(' – '))}</span></li>`).join('')}</ul></section>`:''}
      <section class="tm-section"><h2>Son maçlar</h2>${data.recent.length?`<ul class="tm-recent">${data.recent.map(recent).join('')}</ul>`:'<p class="tm-hint">Henüz oynanmış maç yok.</p>'}</section>
      <section class="tm-section"><h2>Dinar tablosu</h2>${data.leaderboard.length?`<ol class="tm-board">${data.leaderboard.map((r,i)=>`<li class="${r.username===data.me.username?'is-me':''}"><span class="tm-rank">${i+1}</span><b>${esc(r.displayName)}</b><span>${r.bets} bahis</span><strong>${dinar(r.balance)}</strong></li>`).join('')}</ol>`:'<p class="tm-hint">İlk bahislerden sonra burada.</p>'}</section></div>`;
  }
  const findPick=(matchId,marketId,code)=>{const m=data.upcoming.find(x=>x.id===matchId),market=m?.book?.markets.find(x=>x.id===marketId);return {m,market,o:market?.outcomes.find(x=>x.code===code)??(market?.family==='score'?scoreOutcome(m.book,code):null)};};
  host.addEventListener('input',event=>{const f=event.target.closest('[data-slip]');if(!f||!slip)return;slip.stake=f.stake.value;const stake=Number(slip.stake)||0;f.querySelector('.tm-win b').textContent=dinar(Math.floor(stake*slip.odds));f.querySelector('button[type=submit]').disabled=stake<DINAR.minStake||stake>DINAR.maxStake||stake>data.balance;});
  host.addEventListener('submit',async event=>{
    const f=event.target;event.preventDefault();
    if(f.matches('[data-slip]')){
      const button=f.querySelector('button[type=submit]');button.disabled=true;
      try{const r=await api.bet(slip.match,slip.market,slip.code,Number(f.stake.value));notice=`Bahis alındı: ${slip.label} @ ${odd(r.odds)}`;slip=null;await refresh();}
      catch(e){notice='';button.disabled=false;const p=f.querySelector('.tm-hint');p.textContent=e.message;p.classList.add('tm-error');if(e.status===409)void refresh();}
      return;
    }
    if(f.matches('[data-other-score]')){
      const a=Number(f.a.value),b=Number(f.b.value);if(!Number.isInteger(a)||!Number.isInteger(b)||f.a.value===''||f.b.value==='')return;
      const {m,market,o}=findPick(f.dataset.otherScore,'score',`${a}-${b}`);if(!o)return;
      if(!o.playable){f.querySelector('span').textContent='Bu skor oynanamaz';return;}
      slip={match:m.id,market:market.id,code:o.code,label:`${market.label}: ${o.label}`,odds:o.odds,stake:slip?.stake??'500'};render();host.querySelector('.tm-slip input')?.focus();return;
    }
    if(f.matches('[data-ask-form]')){
      try{await api.requestDinar(f.to.value,Number(f.amount.value));asking=false;notice='İsteğin gönderildi.';await refresh();}catch(e){notice=e.message;render();}
    }
  });
  host.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b||b.disabled)return;
    if(b.dataset.retry!==undefined){void refresh();return;}
    if(b.dataset.group){group=b.dataset.group;render();return;}
    if(b.dataset.pick){const [matchId,marketId,code]=b.dataset.pick.split('|'),{m,market,o}=findPick(matchId,marketId,code);if(!o)return;
      slip=slip&&slip.match===m.id&&slip.market===market.id&&slip.code===o.code?null:{match:m.id,market:market.id,code:o.code,label:`${market.label}: ${o.label}`,odds:o.odds,stake:slip?.stake??'500'};render();host.querySelector('.tm-slip input')?.focus();return;}
    if(b.dataset.quick){if(!slip)return;slip.stake=b.dataset.quick;render();return;}
    if(b.dataset.slipCancel!==undefined){slip=null;render();return;}
    if(b.dataset.ask!==undefined){asking=true;notice='';if(!people)people=await api.people().catch(()=>[]);render();return;}
    if(b.dataset.askCancel!==undefined){asking=false;render();return;}
    if(b.dataset.send||b.dataset.decline){try{await api.answerRequest(b.dataset.send??b.dataset.decline,!!b.dataset.send);notice=b.dataset.send?'Dinar gönderildi.':'İstek reddedildi.';await refresh();}catch(e){notice=e.message;render();}return;}
    if(b.dataset.everyone){const id=b.dataset.everyone,d=details.get(id);if(d){d.open=!d.open;render();return;}details.set(id,{bets:[],open:true});render();const full=await api.match(id).catch(()=>({bets:[]}));details.set(id,{bets:full.bets??[],open:true});render();return;}
    if(b.dataset.reel){
      const label=b.textContent;b.disabled=true;
      try{b.textContent='Özet hazırlanıyor…';const rec=await decodeRecording(await api.reel(b.dataset.reel)),{exportHighlights}=await import('../match/highlight-export.js');
        const out=await exportHighlights({snapshot:rec.snapshot,lineups:rec.lineups,halves:rec.halves,teamNames:rec.teamNames,onProgress:f=>{b.textContent=`Özet hazırlanıyor… %${Math.round(f*100)}`;}});
        const url=URL.createObjectURL(out.blob),a=document.createElement('a');a.href=url;a.download=out.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);b.textContent='İndirildi';}
      catch(e){b.textContent=e.message;}finally{b.disabled=false;setTimeout(()=>{b.textContent=label;},4000);}
    }
  });
  // The countdown runs on the server clock; at zero the page fetches the live state (the watch button opens, the bulletin closes).
  function ticking(){const el=host.querySelector('[data-count]');if(!el||!data)return;const m=data.upcoming[0];if(!m||m.live)return;const ms=m.kickoffAt-serverNow();if(ms<=0){void refresh();return;}el.textContent=`Başlamasına ${left(ms)}`;}
  return {
    open(){void refresh();clearInterval(poll);clearInterval(tick);poll=setInterval(()=>{if(!document.hidden)void refresh(false);},20000);tick=setInterval(ticking,1000);},
    close(){clearInterval(poll);clearInterval(tick);poll=tick=null;},
  };
}
