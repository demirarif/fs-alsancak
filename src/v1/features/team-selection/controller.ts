import type { SelectionDraft } from '../../domain/teams.js';
import type { TeamId } from '../../domain/common.js';
import type { SelectionCommand } from '../../application/services.js';
import type { PlayerLibrary, LibrarySnapshot } from '../player-library.ts';
import { createSelectionDraft } from '../../domain/selection.ts';
import { selectionService } from '../../application/selection-service.ts';
import { createSelectionRepository } from '../../data/local-selection.ts';
import { createCatalogIndex, mainRating } from '../../data/catalog-index.ts';
import { TEAM_PRESENTATION } from '../../config/team-presentation.ts';
import { html } from '../player-profile/view.ts';
import { gradeClass, roleOnTwenty } from '../player-profile/presentation.ts';
import './team-selection.css';
import '../match-prep.css';
import '../ui/design-system.css';
import './compact-selection.css';
import { uiIcon } from '../ui/icons.ts';
import { prepSteps } from '../ui/prep-steps.ts';
import { playerKitMarkup, teamKitMarkup } from '../player-profile/player-kit.ts';
import { CARD_POSITIONS } from '../player-profile/player-card.ts';
import { createPrepMotion } from '../prep-motion.ts';
import { resolveMatchCatalog } from '../../domain/match-players.ts';
import { openSocialExport } from '../social-export/dialog.ts';

export function mountTeamSelection(host:HTMLElement,library:PlayerLibrary) {
  host.innerHTML=`${prepSteps('squads')}<h1 class="selection-sr-only">Kadro seçimi</h1>
  <div class="selection-workspace" data-view="squad"><div class="selection-view-tabs" role="group" aria-label="Görünüm"><button type="button" data-selection-view="squad" aria-pressed="true">Kadrolar</button><button type="button" data-selection-view="pool" aria-pressed="false">Oyuncu havuzu</button></div><section class="squad-area" aria-label="Takım kadroları"><div class="squad-grid" id="squad-grid"></div></section>
  <aside class="selection-inventory" aria-labelledby="selection-inventory-title"><header><h2 id="selection-inventory-title">Oyuncular <small id="selection-pool-count"></small></h2><div class="pool-header-actions"><button class="pool-library" data-open-library aria-label="Oyuncu envanterini aç" title="Oyuncu envanteri">${uiIcon('arrowUpRight')}</button><button id="selection-new-guest" class="selection-add-guest" title="Referans oyuncudan misafir ekle">Misafir ekle</button></div></header><div class="pool-controls"><label class="selection-search">${uiIcon('search')}<input type="search" id="selection-search" placeholder="Oyuncu ara" aria-label="Kadro için oyuncu ara" autocomplete="off"/></label><div class="selection-filters"><select id="selection-position" aria-label="Mevki filtresi"><option value="">Tüm mevkiler</option>${Object.entries(CARD_POSITIONS).map(([id,name])=>`<option value="${id}">${html(name)}</option>`).join('')}</select><label><input type="checkbox" id="selection-available"/> Sadece boşta</label></div></div><div class="pool-target" id="pool-target"></div><div class="selection-player-list" id="selection-player-list"></div><footer id="selection-list-summary"></footer></aside></div>
  <footer class="selection-footer"><div class="selection-footer-meta"><label class="selection-date-label">Maç tarihi <input type="date" id="selection-date" aria-label="Maç tarihi"/></label><span class="selection-progress" id="selection-total">00<small>/ 22</small></span><strong id="selection-readiness" role="status" hidden></strong><span id="selection-save-status" role="status" class="selection-sr-only">Kayıtlar yükleniyor</span></div><div class="selection-footer-actions"><button id="selection-retry" class="selection-retry" hidden>Tekrar kaydet</button><button class="squad-export" id="selection-export" disabled>${uiIcon('download')}İndir</button><button id="selection-confirm" class="selection-confirm" disabled>Dizilişe geç ${uiIcon('arrowRight')}</button></div></footer><div class="selection-message" id="selection-message" role="status" hidden></div>`;
  const find=<T extends HTMLElement=HTMLElement>(selector:string)=>host.querySelector<T>(selector)!;
  const repository=createSelectionRepository(),abort=new AbortController(),eventOptions={signal:abort.signal};
  let state:LibrarySnapshot, draft:SelectionDraft|null=null, loaded=false,disposed=false,writing=false,saveError='',conflict=false,confirmedRevision=-1;
  let query='',position='',availableOnly=false;
  const queue:SelectionDraft[]=[],motion=createPrepMotion(host);

  function message(text:string){const el=find('#selection-message');el.hidden=!text;el.textContent=text;}
  function renderStatus(){
    const retry=find<HTMLButtonElement>('#selection-retry');retry.hidden=!saveError&&!state?.error;retry.textContent=conflict?'Son kaydı yükle':'Tekrar dene';
    if(!draft||!state){find('#selection-save-status').textContent=saveError||'Kayıtlı kadro yükleniyor…';return;}
    const count=draft.teams.reduce((sum,t)=>sum+t.playerIds.length,0),validation=selectionService.validateForLineups(draft,state.catalog);
    find<HTMLButtonElement>('#selection-export').disabled=!loaded||!state.ready||count===0;
    find('#selection-total').innerHTML=`${String(count).padStart(2,'0')}<small>/ 22</small>`;
    find('#selection-readiness').textContent=validation.ok?'İki takım da hazır':`${22-count} oyuncu daha seç${validation.ok?'':draft.teams.some(t=>!t.playerIds.some(id=>state.catalog.players.find(p=>p.id===id)?.kind==='goalkeeper'))?' · Kalecileri unutma':''}`;
    find('#selection-readiness').hidden=count!==22||validation.ok;
    if(count===22&&!validation.ok)find('#selection-readiness').textContent='Kaleci seçimlerini kontrol et';
    find('#selection-save-status').textContent=saveError||state.error||(!loaded?'Kayıtlı kadro yükleniyor…':queue.length||writing?'Seçimler kaydediliyor…':'Bu tarayıcıya kaydedildi');
    find('#selection-save-status').classList.toggle('save-failed',!!saveError||!!state.error);
    find('#selection-save-status').classList.toggle('selection-sr-only',!saveError&&!state.error);
    find<HTMLButtonElement>('#selection-confirm').disabled=!loaded||!state.ready||!validation.ok||!!saveError||queue.length>0||writing;
    find<HTMLButtonElement>('#selection-new-guest').disabled=!state.ready;
  }
  async function drain(){
    if(writing||saveError||disposed)return;writing=true;renderStatus();
    while(queue.length&&!disposed){
      const result=await repository.saveSelection(queue[0]!);
      if(!result.ok){saveError=result.problems.map(p=>p.message).join(' ');conflict=result.problems.some(p=>p.code==='SELECTION_CONFLICT');break;}
      queue.shift();
    }
    writing=false;renderStatus();
  }
  function commit(command:SelectionCommand):boolean{
    if(!draft||!loaded||!state.ready||conflict)return false;
    const result=selectionService.apply(draft,command,state.catalog);
    if(!result.ok){message(result.problems.map(p=>p.message).join(' '));return false;}
    if(result.value===draft)return false;
    draft=result.value;confirmedRevision=-1;message('');queue.push(draft);render();void drain();return true;
  }
  function render(){
    if(!draft||!state)return;
    const before=motion.capture();
    const focused=document.activeElement as HTMLElement|null;
    const focusKey=focused?.closest('#selection-screen')?['activate','add','profile','remove','barkuzToggle'].find(key=>focused.dataset[key]):undefined;
    const focusValue=focusKey?focused!.dataset[focusKey]:undefined;
    const focusCard=focusKey?focused!.closest<HTMLElement>('.squad-card'):null,focusTeam=focusCard?.dataset.team;
    const focusIndex=focusCard?[...focusCard.querySelectorAll('[data-remove]')].indexOf(focused!):-1;
    const catalog=resolveMatchCatalog(state.catalog,draft),index=createCatalogIndex(catalog),enabled=loaded&&state.ready&&!conflict;
    const date=find<HTMLInputElement>('#selection-date');date.value=draft.weekId;date.disabled=!enabled;
    find('#squad-grid').innerHTML=draft.teams.map(team=>{
      const presentation=TEAM_PRESENTATION[team.teamId],active=team.teamId===draft!.activeTeamId;
      const players=team.playerIds.map(id=>index.getById(id)),keeperCount=players.filter(p=>p?.kind==='goalkeeper').length;
      const rows=Array.from({length:11},(_,i)=>{
        const id=team.playerIds[i],p=players[i];
        if(!id)return `<li class="squad-empty"><span>${String(i+1).padStart(2,'0')}</span><i></i><small>${i===0?'Kaleci veya saha oyuncusu seç':'Oyuncu bekleniyor'}</small></li>`;
        const score=p?roleOnTwenty(mainRating(p)):0;
        // The row itself sends the player back to the pool; the profile has its own small button.
        return `<li data-motion-key="squad:${team.teamId}:${html(id)}" data-squad-player="${html(id)}" class="squad-player ${p?.archived||!p?'unavailable-player':''}"><span class="squad-number">${String(i+1).padStart(2,'0')}</span><button class="squad-player-remove" data-remove="${html(id)}" data-team="${team.teamId}" aria-label="${html(p?.name??id)} oyuncusunu ${html(team.name)} kadrosundan çıkar" title="Havuza geri gönder" ${enabled?'':'disabled'}><span class="squad-avatar ${p?.kind==='goalkeeper'?'is-keeper':''}">${p?teamKitMarkup(team.teamId,p.kind==='goalkeeper',p):'?'}</span><span><strong>${html(p?.name??'Oyuncu bulunamadı')}</strong><small>${p?html(CARD_POSITIONS[p.mainPosition]):'Envanterden kaldırılmış'}${p?.origin.kind==='guest'?' <em>Misafir</em>':''}</small></span><b class="${gradeClass(score)}">${p?score:'–'}</b></button><button class="squad-profile" data-profile="${html(id)}" aria-label="${html(p?.name??id)} profilini aç" title="Oyuncu profili" ${p?'':'disabled'}>${uiIcon('arrowUpRight')}</button></li>`;
      }).join('');
      return `<article class="squad-card ${active?'is-active':''}" data-team="${team.teamId}" style="--team-color:${presentation.color};--keeper-color:${presentation.keeper}"><button class="squad-select" data-activate="${team.teamId}" aria-pressed="${active}" ${enabled?'':'disabled'}><span class="team-shirt" aria-hidden="true">${teamKitMarkup(team.teamId)}</span><span><strong>${html(team.name)}</strong></span><b>${String(team.playerIds.length).padStart(2,'0')}<small>/ 11</small></b><i class="active-team-check">${active?uiIcon('check'):''}</i></button><div class="squad-column-labels"><span>Oyuncu</span><span title="20 üzerinden mevki seviyesi">Puan</span></div><ol>${rows}</ol><footer><span class="squad-keeper ${keeperCount===1?'is-ready':''}"><i></i>Kaleci ${keeperCount} / 1</span><button class="squad-clear" data-clear="${team.teamId}" aria-label="${html(team.name)} kadrosunu temizle" ${enabled&&team.playerIds.length?'':'disabled'}>${uiIcon('trash')}Temizle</button></footer></article>`;
    }).join('');
    renderInventory();renderStatus();
    motion.settle(before);
    host.querySelector('[data-remove="barkuz"].squad-player-remove')?.after(barkuzButton());
    if(focusKey&&focusValue){
      // Same control in the same card or the inventory; a removed row hands focus to the next row, then to the pool.
      const attribute=`data-${focusKey.replace(/[A-Z]/g,c=>`-${c.toLowerCase()}`)}`,selector=`[${attribute}="${CSS.escape(focusValue)}"]:not(:disabled)`;
      const scope=focusTeam?host.querySelector(`.squad-card[data-team="${CSS.escape(focusTeam)}"]`):host.querySelector('.selection-inventory');
      const rows=focusKey==='remove'&&scope?[...scope.querySelectorAll<HTMLButtonElement>('[data-remove]:not(:disabled)')]:[];
      const replacement=scope?.querySelector<HTMLButtonElement>(selector)??host.querySelector<HTMLButtonElement>(selector)
        ??(rows.length?rows[Math.min(Math.max(focusIndex,0),rows.length-1)]!:null)
        ??(focusKey==='add'||focusKey==='remove'?host.querySelector<HTMLButtonElement>('.pool-add:not(:disabled)'):null);
      replacement?.focus({preventScroll:true});
    }
  }
  function renderInventory(){
    if(!draft||!state)return;
    const active=draft.teams.find(t=>t.teamId===draft!.activeTeamId)!,style=TEAM_PRESENTATION[active.teamId];
    const index=createCatalogIndex(resolveMatchCatalog(state.catalog,draft)),assigned=new Map(draft.teams.flatMap(t=>t.playerIds.map(id=>[id,t] as const)));
    const results=index.search({query}).filter(p=>(!position||p.preferredPositions.includes(position as typeof p.mainPosition))&&(!availableOnly||!assigned.has(p.id))).sort((a,b)=>a.name.localeCompare(b.name,'tr'));
    const hasKeeper=active.playerIds.some(id=>index.getById(id)?.kind==='goalkeeper');
    // Phones also get both teams here as a switch with their counts: the team headers scroll away while the pool is in view.
    const target=find('#pool-target'),locked=!loaded||!state.ready||conflict;target.style.setProperty('--team-color',style.color);
    target.innerHTML=`<strong class="pool-target-name">${html(active.name)}</strong><span class="pool-team-switch" role="group" aria-label="Oyuncuların ekleneceği takım">${draft.teams.map(t=>{const s=TEAM_PRESENTATION[t.teamId],on=t.teamId===active.teamId;
      return `<button class="pool-team ${on?'is-active':''}" data-activate="${t.teamId}" aria-pressed="${on}" style="--team-color:${s.color}" ${locked?'disabled':''}><i class="team-marker ${s.marker}" aria-hidden="true"></i><strong>${html(t.name)}</strong><span>${String(t.playerIds.length).padStart(2,'0')}/11</span></button>`;}).join('')}</span>`;
    find('#selection-pool-count').textContent=String(state.catalog.players.filter(p=>!p.archived).length);
    find('#selection-player-list').innerHTML=results.map(p=>{
      const team=assigned.get(p.id),reason=team?`${team.name} kadrosunda`:active.playerIds.length===11?'Aktif takım dolu':hasKeeper&&p.kind==='goalkeeper'?'Aktif takımın kalecisi var':'';
      const level=roleOnTwenty(mainRating(p));
      return `<div class="pool-player ${team?'is-assigned':''}"${team?` style="--team-color:${TEAM_PRESENTATION[team.teamId].color}"`:''}><button class="pool-add" data-add="${html(p.id)}" aria-label="${html(p.name)} oyuncusunu ${html(active.name)} kadrosuna ekle" title="${html(reason||`${active.name} kadrosuna ekle`)}" ${reason||!loaded||!state.ready||conflict?'disabled':''}><span class="pool-avatar ${p.kind==='goalkeeper'?'is-keeper':''}">${playerKitMarkup(p)}</span><span class="pool-player-name"><strong>${html(p.name)}</strong><small>${html(CARD_POSITIONS[p.mainPosition])}${p.origin.kind==='guest'?' · Misafir':''}</small></span><span class="pool-player-rating ${gradeClass(level)}">${level}</span>${team?`<i class="team-marker ${TEAM_PRESENTATION[team.teamId].marker}" style="--team-color:${TEAM_PRESENTATION[team.teamId].color}" aria-label="${html(team.name)}"></i>`:''}</button><button class="pool-profile" data-profile="${html(p.id)}" aria-label="${html(p.name)} profilini aç" title="Oyuncu profili">${uiIcon('arrowUpRight')}</button></div>`;
    }).join('')||'<div class="pool-empty">Bu filtrede oyuncu yok.<small>Aramayı veya mevki filtresini değiştirebilirsin.</small></div>';
    find('#selection-list-summary').textContent=`${results.length} oyuncu · ${state.catalog.players.filter(p=>!p.archived&&!assigned.has(p.id)).length} boşta`;
    host.querySelector('[data-add="barkuz"]')?.after(barkuzButton());
  }
  function barkuzButton(){
    const button=document.createElement('button');button.type='button';button.className='barkuz-keeper-toggle';button.dataset.barkuzToggle='true';
    button.setAttribute('role','switch');button.setAttribute('aria-checked',String(!!draft?.barkuzGoalkeeper));button.setAttribute('aria-label','Barkuz kaleci modu');
    button.innerHTML='<span class="switch-track" aria-hidden="true"><span class="switch-knob"></span></span><span class="switch-label">Kaleci</span>';
    button.disabled=!loaded||!state.ready||conflict;button.title='Yusuf seviyesinde kalecilik · İsabetli uzun kanat pası';return button;
  }
  const unsubscribe=library.subscribe(snapshot=>{state=snapshot;render();});
  host.addEventListener('click',event=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
    // Phones show the squads or the player pool (compact-selection.css); a tab only switches which one is on screen.
    if(button.dataset.selectionView){const view=button.dataset.selectionView;find('.selection-workspace').dataset.view=view;host.querySelectorAll<HTMLButtonElement>('[data-selection-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.selectionView===view)));}
    else if(button.dataset.activate)commit({kind:'activate-team',teamId:button.dataset.activate as TeamId});
    else if(button.dataset.barkuzToggle)commit({kind:'set-barkuz-goalkeeper',enabled:!draft?.barkuzGoalkeeper});
    else if(button.dataset.add){
      const source=button.getBoundingClientRect(),avatar=button.querySelector('.pool-avatar')?.innerHTML??'',name=button.querySelector('strong')?.textContent??'';
      const playerId=button.dataset.add,teamId=draft?.activeTeamId;
      if(commit({kind:'add-player',playerId})){
        const target=host.querySelector<HTMLElement>(`.squad-card[data-team="${CSS.escape(teamId??'')}"] [data-squad-player="${CSS.escape(playerId)}"]`);
        if(target)motion.transfer(source,target.querySelector('.squad-avatar')?.innerHTML??avatar,name,target);
      }
    }
    else if(button.dataset.remove)commit({kind:'remove-player',teamId:button.dataset.team as TeamId,playerId:button.dataset.remove});
    else if(button.dataset.clear)commit({kind:'clear-team',teamId:button.dataset.clear as TeamId});
    else if(button.dataset.profile&&draft)library.openProfile(button.dataset.profile,button,resolveMatchCatalog(state.catalog,draft));
    else if(button.dataset.openLibrary!==undefined)library.openInventory(button);
    else if(button.id==='selection-new-guest')library.openGuestEditor(button);
    else if(button.id==='selection-export'&&draft)openSocialExport({kind:'squads',selection:draft,catalog:resolveMatchCatalog(state.catalog,draft)},button);
  },eventOptions);
  find<HTMLInputElement>('#selection-search').addEventListener('input',event=>{query=(event.target as HTMLInputElement).value;renderInventory();},eventOptions);
  find<HTMLSelectElement>('#selection-position').addEventListener('change',event=>{position=(event.target as HTMLSelectElement).value;renderInventory();},eventOptions);
  find<HTMLInputElement>('#selection-available').addEventListener('change',event=>{availableOnly=(event.target as HTMLInputElement).checked;renderInventory();},eventOptions);
  find<HTMLInputElement>('#selection-date').addEventListener('change',event=>commit({kind:'set-week',weekId:(event.target as HTMLInputElement).value}),eventOptions);
  find('#selection-retry').addEventListener('click',async()=>{
    if(!state.ready)await library.refresh();
    if(!loaded||conflict){await load();return;}
    saveError='';void drain();
  },eventOptions);
  find('#selection-confirm').addEventListener('click',()=>{
    if(!draft||!selectionService.validateForLineups(draft,state.catalog).ok)return;
    confirmedRevision=draft.revision;message('');
    host.dispatchEvent(new CustomEvent('selection-confirmed',{detail:draft,bubbles:true}));
    find('#selection-readiness').textContent='Kadro seçimi tamamlandı';
  },eventOptions);
  async function load(){
    loaded=false;saveError='';conflict=false;renderStatus();
    const result=await repository.loadSelection();if(disposed)return;
    if(!result.ok){saveError=result.problems.map(p=>p.message).join(' ');renderStatus();return;}
    queue.length=0;draft=result.value;
    if(!draft){const now=new Date(),date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;draft=createSelectionDraft(crypto.randomUUID(),date);queue.push(draft);}
    loaded=true;render();void drain();
  }
  const ready=load();
  return {ready,get draft(){return draft;},get confirmed(){return !!draft&&confirmedRevision===draft.revision;},dispose(){disposed=true;motion.dispose();abort.abort();unsubscribe();repository.close();}};
}

