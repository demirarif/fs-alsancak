import type { Player, PlayerCatalog, GuestPlayerRequest, GuestScaling, Position } from '../domain/players.js';
import { createGuestPlayerFactory } from '../domain/guest-player.ts';
import { getBundledCatalog } from '../data/bundled-catalog.ts';
import { createCatalogIndex, mainRating } from '../data/catalog-index.ts';
import { createLocalCatalogRepository } from '../data/local-catalog.ts';
import { ATTRIBUTE_GROUPS, GUEST_POLICY } from '../config/defaults.ts';
import { POSITION_LABELS } from '../config/catalog-source.ts';
import { ATTRIBUTE_LABELS } from './player-profile/model.ts';
import { html, playerProfileMarkup, roleStars } from './player-profile/view.ts';
import { attributeOnTwenty, gradeClass, roleOnTwenty } from './player-profile/presentation.ts';
import './player-library.css';
import './ui-pass-one.css';
import { playerKitMarkup } from './player-profile/player-kit.ts';
import { inventoryShell, inventoryPlayerMarkup } from './player-profile/inventory-view.ts';
import './player-profile/player-card.css';
import './player-profile/inventory.css';
import { openSocialExport } from './social-export/dialog.ts';

export interface LibrarySnapshot { readonly catalog:PlayerCatalog; readonly ready:boolean; readonly error:string }
export interface PlayerLibrary {
  openInventory(trigger:HTMLElement):void;
  openProfile(id:string,trigger:HTMLElement,displayCatalog?:PlayerCatalog):void;
  openGuestEditor(trigger:HTMLElement):void;
  subscribe(listener:(snapshot:LibrarySnapshot)=>void):()=>void;
  refresh():Promise<boolean>;
  dispose():void;
}

export function mountPlayerLibrary(options:{readonly onOverlayChange?:(open:boolean)=>void}={}):PlayerLibrary {
  const host=document.createElement('div');host.id='player-library';
  host.innerHTML=`${inventoryShell()}
  <dialog class="library-dialog guest-dialog" aria-labelledby="guest-title"><header class="library-header"><div><span class="profile-eyebrow">ENVANTERE YENİ BİR İSİM</span><h2 id="guest-title">Nasıl bir oyuncu?</h2><p>Tanıdığın bir oyuncuyu referans al. Farkını sen belirle.</p></div><button class="modal-close" data-close-guest aria-label="Oyuncu eklemeyi kapat">×</button></header><form id="guest-form" novalidate><div class="guest-body"><div class="guest-fields"><label class="field-label" for="guest-name"><span>01</span> OYUNCU ADI</label><input id="guest-name" class="library-input" placeholder="Örn. Deniz" maxlength="40" autocomplete="off"/><label class="field-label" for="guest-reference"><span>02</span> KİME BENZİYOR?</label><select id="guest-reference" class="library-input" aria-describedby="reference-hint"></select><p id="reference-hint" class="field-hint">Mevki alışkanlıkları referans oyuncudan alınır.</p><div class="field-label"><span>03</span> NE KADAR BENZİYOR?</div><div class="scaling-mode" role="group" aria-label="Özellik ayar yöntemi"><button type="button" data-mode="overall" class="active" aria-pressed="true">Genel</button><button type="button" data-mode="split" aria-pressed="false">Ayrı ayarla</button></div><div id="overall-fields"><div class="slider-heading"><label for="guest-overall">Tüm özellikler</label><output id="overall-output" for="guest-overall">%95</output></div><input id="guest-overall" class="guest-range" type="range" min="60" max="120" value="95" step="1"/><div class="range-legend"><span>%60</span><span>Referans %100</span><span>%120</span></div></div><div id="split-fields" hidden><div class="slider-heading"><label for="guest-physical">Fiziksel</label><output id="physical-output" for="guest-physical">%95</output></div><input id="guest-physical" class="guest-range" type="range" min="60" max="120" value="95" step="1"/><p class="range-description">Hız, dayanıklılık ve güç</p><div class="slider-heading"><label for="guest-game">Teknik / oyun</label><output id="game-output" for="guest-game">%95</output></div><input id="guest-game" class="guest-range" type="range" min="60" max="120" value="95" step="1"/><p class="range-description">Pas, görüş, kontrol, dripling, şut, bitiricilik, savunma, pres ve pozisyon</p></div><p id="keeper-scaling-hint" class="field-hint" hidden>Kaleci referansında genel çubuk, kalecilik puanını ayarlar.</p><div class="guest-adaptation-note"><span class="adaptation-marker"></span><div><strong>Yeni takım, bir alışma payı.</strong><p>Pas bağlantısında küçük bir dezavantaj ve yeteneğine bağlı kontrol hatası riski. Baz özellikleri bu yüzden azaltılmaz.</p></div></div></div><aside class="guest-preview" aria-label="Canlı oyuncu önizlemesi"><div id="guest-preview-content"></div><button type="button" class="profile-preview-link" id="inspect-preview">Tam profili incele <span>↗</span></button></aside></div><div class="guest-form-error" id="guest-error" role="alert" hidden></div><footer class="guest-footer"><span>Bu tarayıcıya kaydedilir.<small>Sayfayı yenilediğinde envanterde kalır.</small></span><div><button type="button" class="secondary-action" data-close-guest>Vazgeç</button><button type="submit" class="primary-action" id="save-guest">Oyuncuyu kaydet <span>↗</span></button></div></footer></form></dialog>
  <dialog class="library-dialog profile-dialog" aria-labelledby="profile-title"><div id="profile-content"></div></dialog>`;
  document.body.append(host);
  const find=<T extends Element=HTMLElement>(selector:string)=>{const el=host.querySelector<T>(selector);if(!el)throw new Error(`Oyuncu arayüz öğesi eksik: ${selector}`);return el;};
  const inventory=find<HTMLDialogElement>('.inventory-dialog'),guest=find<HTMLDialogElement>('.guest-dialog'),profile=find<HTMLDialogElement>('.profile-dialog');
  const nameInput=find<HTMLInputElement>('#guest-name'),referenceInput=find<HTMLSelectElement>('#guest-reference');
  const overall=find<HTMLInputElement>('#guest-overall'),physical=find<HTMLInputElement>('#guest-physical'),game=find<HTMLInputElement>('#guest-game');
  const save=find<HTMLButtonElement>('#save-guest');
  const seed=getBundledCatalog(),repository=createLocalCatalogRepository(seed),factory=createGuestPlayerFactory();
  let catalog:PlayerCatalog=seed,filter='all',query='',mode:'overall'|'split'='overall',saving=false,ready=false,disposed=false,loadSequence=0;
  let preview:Player|null=null;
  let exportProfile:{player:Player;catalog:PlayerCatalog}|null=null;
  let inventoryPosition:Position|''='';
  let catalogError='';
  const listeners=new Set<(snapshot:LibrarySnapshot)=>void>();
  function notifyCatalog(){for(const listener of listeners)listener({catalog,ready,error:catalogError});}
  const returnFocus=new Map<HTMLDialogElement,HTMLElement>();
  const abort=new AbortController(),eventOptions={signal:abort.signal};
  function overlayChanged(){options.onOverlayChange?.(host.querySelectorAll('dialog[open]').length>0);}
  function show(dialog:HTMLDialogElement,trigger:HTMLElement){returnFocus.set(dialog,trigger);if(!dialog.open)dialog.showModal();overlayChanged();}
  for(const dialog of [inventory,guest,profile]){
    dialog.addEventListener('close',()=>{overlayChanged();const trigger=returnFocus.get(dialog);if(trigger?.isConnected)trigger.focus();},eventOptions);
    dialog.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const focusable=[...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,a[href],[tabindex]:not([tabindex="-1"])')]
        .filter(el=>el.getClientRects().length>0&&!el.closest('[hidden]'));
      const first=focusable[0],last=focusable.at(-1);
      if(!first||!last){event.preventDefault();dialog.focus();return;}
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    },eventOptions);
    dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom){if(dialog!==guest||!saving)dialog.close();}},eventOptions);
  }
  guest.addEventListener('cancel',event=>{if(saving)event.preventDefault();},eventOptions);
  function statusError(message:string){find('#library-alert').hidden=false;find('#library-alert span').textContent=message;find('#storage-status').textContent='Yerel kayıt kullanılamıyor';}
  function renderInventory(){
    const active=catalog.players.filter(p=>!p.archived),guests=active.filter(p=>p.origin.kind==='guest').length;
    find('#all-count').textContent=String(active.length);find('#guest-count').textContent=String(guests);
    find('#inventory-counts').textContent=`${active.length} oyuncu · ${active.filter(p=>p.kind==='goalkeeper').length} kaleci`;
    const results=createCatalogIndex(catalog).search({query,...(inventoryPosition?{position:inventoryPosition}:{})})
      .filter(p=>filter==='all'||(filter==='guests'?p.origin.kind==='guest':p.kind===filter))
      .sort((a,b)=>a.name.localeCompare(b.name,'tr'));
    find('#inventory-grid').innerHTML=results.map(p=>inventoryPlayerMarkup(p,catalog)).join('');
    find('#inventory-empty').hidden=results.length>0;
    find('#inventory-grid').hidden=results.length===0;
    find('#inventory-summary').textContent=`${results.length} / ${active.length} oyuncu`;
  }
  async function refresh():Promise<boolean>{
    const sequence=++loadSequence,result=await repository.load();if(disposed||sequence!==loadSequence)return false;
    ready=result.ok;
    if(result.ok){catalog=result.value;find('#library-alert').hidden=true;find('#storage-status').textContent='Yerel kayıt hazır';renderInventory();}
    else statusError(result.problems.map(p=>p.message).join(' '));
    catalogError=result.ok?'':result.problems.map(p=>p.message).join(' ');notifyCatalog();
    save.disabled=!ready||saving;return result.ok;
  }
  function showProfile(player:Player,trigger:HTMLElement,saved=false,displayCatalog=catalog){
    exportProfile={player,catalog:displayCatalog};
    find('#profile-content').innerHTML=`${saved?'<div class="saved-notice" role="status">Oyuncu kaydedildi. Envanterde seni bekliyor.</div>':''}${playerProfileMarkup(player,displayCatalog)}`;
    profile.scrollTop=0;
    show(profile,trigger);
  }
  function currentRequest():GuestPlayerRequest {
    const reference=catalog.players.find(p=>p.id===referenceInput.value)??seed.players[0]!;
    const scaling:GuestScaling=mode==='overall'||reference.kind==='goalkeeper'?{mode:'overall',overallPercent:Number(overall.value)}:{mode:'split',physicalPercent:Number(physical.value),gamePercent:Number(game.value)};
    return reference.kind==='goalkeeper'?{kind:'goalkeeper',name:nameInput.value,referencePlayerId:reference.id,scaling:scaling as Extract<GuestScaling,{mode:'overall'}>}
      :{kind:'outfield',name:nameInput.value,referencePlayerId:reference.id,scaling};
  }
  function renderPreview(){
    const reference=catalog.players.find(p=>p.id===referenceInput.value),isKeeper=reference?.kind==='goalkeeper';
    if(isKeeper)mode='overall';
    host.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button=>{button.disabled=saving||isKeeper&&button.dataset.mode==='split';button.classList.toggle('active',button.dataset.mode===mode);button.setAttribute('aria-pressed',String(button.dataset.mode===mode));});
    find('#overall-fields').hidden=mode!=='overall';find('#split-fields').hidden=mode!=='split';find('#keeper-scaling-hint').hidden=!isKeeper;
    for(const [input,key] of [[overall,'overall'],[physical,'physical'],[game,'game']] as const){find(`#${key}-output`).textContent=`%${input.value}`;input.style.setProperty('--fill',`${(Number(input.value)-60)/60*100}%`);}
    const result=factory.preview(currentRequest(),catalog);preview=result.ok?result.value:null;
    find<HTMLButtonElement>('#inspect-preview').disabled=!preview;
    if(!preview||!reference){find('#guest-preview-content').innerHTML='<p class="profile-muted">Önizleme için bir referans seç.</p>';return;}
    const level=roleOnTwenty(mainRating(preview)),referenceLevel=roleOnTwenty(mainRating(reference)),delta=level-referenceLevel;
    const statRows=preview.kind==='outfield'?Object.entries(preview.attributes).map(([key,value])=>{const displayed=attributeOnTwenty(value);return `<div class="preview-attribute ${(ATTRIBUTE_GROUPS.physical as readonly string[]).includes(key)?'physical-attribute':''}"><span>${html(ATTRIBUTE_LABELS[key as keyof typeof ATTRIBUTE_LABELS])}</span><strong class="${gradeClass(displayed)}">${displayed}</strong></div>`;}).join(''):`<div class="preview-keeper"><span>Kalecilik / 20</span><strong class="${gradeClass(level)}">${level}</strong></div>`;
    find('#guest-preview-content').innerHTML=`<div class="preview-kicker"><span>CANLI ÖNİZLEME · 20 ÜZERİNDEN</span><i></i></div><div class="preview-hero">${playerKitMarkup(preview)}<div><span class="origin-badge is-guest">MİSAFİR OYUNCU</span><h3>${html(preview.name)}</h3><p>${html(POSITION_LABELS[preview.mainPosition])}</p></div></div><div class="preview-rating"><div><span>MEVKİ SEVİYESİ / 20</span><strong class="${gradeClass(level)}">${level}</strong>${roleStars(mainRating(preview))}</div><div class="preview-comparison"><span>${html(reference.name)}</span><strong class="${gradeClass(referenceLevel)}">${referenceLevel}</strong><small class="${delta<0?'delta-negative':'delta-positive'}">${delta===0?'Benzer seviye':`${delta>0?'+':''}${delta} seviye`}</small></div></div><div class="preview-attributes">${statRows}</div><p class="preview-caption">Özellikler 20 üzerinden gösterilir. Mevki alışkanlıkları referanstan alınır.</p>`;
  }
  function openGuest(trigger:HTMLElement){
    nameInput.value='';overall.value=physical.value=game.value=String(GUEST_POLICY.percent.initial);mode='overall';find('#guest-error').hidden=true;
    const sorted=[...catalog.players.filter(p=>!p.archived)].sort((a,b)=>a.name.localeCompare(b.name,'tr'));
    referenceInput.innerHTML=sorted.map(p=>`<option value="${html(p.id)}">${html(p.name)} · ${html(POSITION_LABELS[p.mainPosition])}${p.origin.kind==='guest'?' · Misafir':''}</option>`).join('');
    referenceInput.value='baran';renderPreview();save.disabled=!ready;show(guest,trigger);nameInput.focus();
  }
  find<HTMLSelectElement>('#inventory-position').addEventListener('change',event=>{inventoryPosition=(event.target as HTMLSelectElement).value as Position|'';renderInventory();},eventOptions);
  find('#inventory-search').addEventListener('input',event=>{query=(event.target as HTMLInputElement).value;renderInventory();},eventOptions);
  find('.ri-tabs').addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLButtonElement>('[data-filter]');if(!button)return;filter=button.dataset.filter!;
    host.querySelectorAll('[data-filter]').forEach(el=>{el.classList.toggle('active',el===button);el.setAttribute('aria-pressed',String(el===button));});renderInventory();},eventOptions);
  find('#inventory-grid').addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLButtonElement>('[data-player]');if(!button)return;const p=catalog.players.find(p=>p.id===button.dataset.player);if(p)showProfile(p,button);},eventOptions);
  find('#new-guest').addEventListener('click',event=>openGuest(event.currentTarget as HTMLElement),eventOptions);
  find('#retry-storage').addEventListener('click',()=>{void refresh();},eventOptions);
  find('[data-close-inventory]').addEventListener('click',()=>inventory.close(),eventOptions);
  host.querySelectorAll('[data-close-guest]').forEach(button=>button.addEventListener('click',()=>{if(!saving)guest.close();},eventOptions));
  find('#profile-content').addEventListener('click',event=>{const target=event.target as Element;if(target.closest('[data-close-profile]'))profile.close();const button=target.closest<HTMLElement>('[data-export-profile]');if(button&&exportProfile)openSocialExport({kind:'player',...exportProfile},button);},eventOptions);
  find('.scaling-mode').addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLButtonElement>('[data-mode]');if(!button||button.disabled)return;mode=button.dataset.mode as 'overall'|'split';renderPreview();},eventOptions);
  for(const input of [nameInput,referenceInput,overall,physical,game])input.addEventListener('input',()=>{find('#guest-error').hidden=true;renderPreview();},eventOptions);
  find('#inspect-preview').addEventListener('click',event=>{if(preview)showProfile(preview,event.currentTarget as HTMLElement);},eventOptions);
  find('#guest-form').addEventListener('submit',async event=>{
    event.preventDefault();if(saving||!ready)return;saving=true;save.disabled=true;save.textContent='Kaydediliyor…';
    guest.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>('input,select,button').forEach(el=>el.disabled=true);
    try{
      if(!await refresh())throw new Error('Yerel kayıt alanı kullanılamıyor. Tekrar deneyebilirsin.');
      const result=factory.create(currentRequest(),catalog);
      if(!result.ok){find('#guest-error').textContent=result.problems.map(p=>p.message).join(' ');find('#guest-error').hidden=false;if(result.problems.some(p=>p.field==='name'))nameInput.setAttribute('aria-invalid','true');return;}
      const saved=await repository.saveGuest(result.value);
      if(!saved.ok){find('#guest-error').textContent=saved.problems.map(p=>p.message).join(' ');find('#guest-error').hidden=false;return;}
      await refresh();guest.close();showProfile(result.value,find('#new-guest'),true);
    }catch(error){find('#guest-error').textContent=error instanceof Error?error.message:'Oyuncu kaydedilemedi.';find('#guest-error').hidden=false;}
    finally{saving=false;guest.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>('input,select,button').forEach(el=>el.disabled=false);save.textContent='Oyuncuyu kaydet ↗';save.disabled=!ready;renderPreview();}
  },eventOptions);
  nameInput.addEventListener('input',()=>nameInput.removeAttribute('aria-invalid'),eventOptions);
  renderInventory();void refresh();
  return {
    openInventory(trigger){renderInventory();show(inventory,trigger);void refresh();},
    openProfile(id,trigger,displayCatalog=catalog){const player=displayCatalog.players.find(p=>p.id===id);if(player)showProfile(player,trigger,false,displayCatalog);},
    openGuestEditor:openGuest,
    subscribe(listener){listeners.add(listener);listener({catalog,ready,error:catalogError});return ()=>{listeners.delete(listener);};},
    refresh,
    dispose(){disposed=true;listeners.clear();abort.abort();for(const d of [profile,guest,inventory])d.close();repository.close();host.remove();},
  };
}
