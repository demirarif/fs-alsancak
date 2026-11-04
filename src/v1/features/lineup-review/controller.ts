import type { LineupContext, LineupCommand, OptimizationResult } from '../../application/services.js';
import type { LineupDraft } from '../../domain/teams.js';
import type { TeamId } from '../../domain/common.js';
import type { OptimizerWorkerResponse } from '../../workers/protocol.js';
import type { PlayerLibrary } from '../player-library.ts';
import { lineupService } from '../../application/lineup-service.ts';
import { selectionService } from '../../application/selection-service.ts';
import { rebaseLineupDraft } from '../../domain/lineups.ts';
import { assessLineups } from '../../domain/lineup-evaluation.ts';
import { resolveMatchCatalog } from '../../domain/match-players.ts';
import { FORMATIONS } from '../../config/formations.ts';
import { TEAM_PRESENTATION } from '../../config/team-presentation.ts';
import { createLineupRepository } from '../../data/local-lineups.ts';
import { html } from '../player-profile/view.ts';
import { roleOnTwenty } from '../player-profile/presentation.ts';
import './lineup-review.css';
import '../match-prep.css';
import '../ui/design-system.css';
import './tactics-room.css';
import { teamKitMarkup } from '../player-profile/player-kit.ts';
import { uiIcon } from '../ui/icons.ts';
import { prepSteps } from '../ui/prep-steps.ts';
import { createPrepMotion } from '../prep-motion.ts';
import { openSocialExport } from '../social-export/dialog.ts';

const metricLabels={roleStrength:'Mevki gücü',passing:'Pas bağlantısı',cohesion:'Uyum',defensiveBalance:'Savunma dengesi',attackingThreat:'Hücum tehdidi'} as const;
export function mountLineupReview(host:HTMLElement,library:PlayerLibrary){
  let halftime:{score:readonly [number,number]}|null=null;
  const repository=createLineupRepository(),abort=new AbortController();
  let context:LineupContext|null=null,draft:LineupDraft|null=null,result:OptimizationResult|null=null;
  let generation=0,worker:Worker|null=null,cancelWorker:()=>void=()=>{},busy=false,writing=false,error='',conflict=false,disposed=false;
  let selected:{teamId:TeamId;slotId:string}|null=null,dragged:{teamId:TeamId;slotId:string}|null=null;
  const queue:LineupDraft[]=[],motion=createPrepMotion(host);
  function status(text:string){const node=host.querySelector('#tactics-status');if(node)node.textContent=text;}
  async function drain(){
    if(writing||error||disposed)return;writing=true;status('Diziliş kaydediliyor…');
    while(queue.length&&!disposed){const saved=await repository.saveLineups(queue[0]!);if(!saved.ok){error=saved.problems.map(p=>p.message).join(' ');conflict=saved.problems.some(p=>p.code==='LINEUP_CONFLICT'||p.code==='STALE_SELECTION');break;}queue.shift();}
    writing=false;renderFooter();
  }
  function renderFooter(){
    const node=host.querySelector<HTMLButtonElement>('#tactics-confirm');if(node)node.disabled=busy||!!error||queue.length>0||writing||!draft;
    status(error|| (writing||queue.length?'Diziliş kaydediliyor…':'Diziliş kaydedildi'));
    host.querySelector('#tactics-status')?.classList.toggle('tactics-sr-only',!error);
    const retry=host.querySelector<HTMLButtonElement>('#tactics-retry');if(retry){retry.hidden=!error;retry.textContent=conflict?'Son kaydı yükle':'Tekrar dene';}
  }
  function render(){
    if(!context||!draft||!result)return;
    const before=motion.capture();
    const focused=document.activeElement instanceof HTMLElement&&host.contains(document.activeElement)?document.activeElement:null;
    const focusSelector=!focused?null:focused.dataset.slot?`[data-slot="${CSS.escape(focused.dataset.slot)}"][data-team="${CSS.escape(focused.dataset.team??'')}"]`
      :focused.dataset.suggestion!==undefined?`[data-suggestion="${CSS.escape(focused.dataset.suggestion)}"][data-team="${CSS.escape(focused.dataset.team??'')}"]`
      :focused.dataset.formationId?`button[data-formation-id="${CSS.escape(focused.dataset.formationId)}"][data-team="${CSS.escape(focused.dataset.team??'')}"]`:focused.dataset.profile?`[data-profile="${CSS.escape(focused.dataset.profile)}"]`:focused.id?`#${CSS.escape(focused.id)}`:null;
    const assessment=assessLineups(draft,context),catalog=resolveMatchCatalog(context.catalog,context.selection);
    const cards=draft.lineups.map((lineup,index)=>{
      const team=context!.selection.teams[index]!,style=TEAM_PRESENTATION[team.teamId],formation=FORMATIONS[lineup.formationId];
      const nodes=formation.slots.map(slot=>{
        const assignment=lineup.assignments.find(a=>a.slotId===slot.id)!,player=catalog.players.find(p=>p.id===assignment.playerId)!;
        const score=player.kind==='goalkeeper'?player.goalkeeperRating:player.positionRatings[slot.position as keyof typeof player.positionRatings]??0;
        const active=selected?.teamId===team.teamId&&selected.slotId===slot.id;
        return `<div data-motion-key="pitch:${team.teamId}:${html(player.id)}" class="tactic-player ${active?'is-selected':''} ${player.kind==='goalkeeper'?'is-keeper':''}" style="left:${slot.anchor.z*100}%;top:${(1-slot.anchor.x)*100}%" title="${html(player.name)} · ${html(slot.label)} · ${roleOnTwenty(score)}/20"><button class="tactic-token" data-slot="${slot.id}" data-team="${team.teamId}" draggable="${slot.position!=='GK'}" aria-label="${html(player.name)} · ${html(slot.label)} · Yer değiştir" aria-pressed="${active}">${teamKitMarkup(team.teamId,player.kind==='goalkeeper',player)}</button><div class="tactic-player-label"><strong>${html(player.name)}</strong><button data-profile="${html(player.id)}" aria-label="${html(player.name)} taktik profilini aç">${uiIcon('arrowUpRight')}</button></div></div>`;
      }).join('');
      const suggestions=result!.suggestions[team.teamId];
      return `<section class="tactic-team" data-team="${team.teamId}" data-formation-id="${lineup.formationId}" style="--team-color:${style.color};--keeper-color:${style.keeper}"><header><div class="tactic-team-identity"><span class="tactic-team-kit" aria-hidden="true">${teamKitMarkup(team.teamId)}</span><h2>${html(team.name)}</h2></div><div class="tactic-formations" role="group" aria-label="${html(team.name)} dizilişi">${Object.keys(FORMATIONS).map(id=>`<button data-formation-id="${id}" data-team="${team.teamId}" aria-pressed="${id===lineup.formationId}" class="${id===lineup.formationId?'is-active':''}">${id}</button>`).join('')}</div><button class="tactic-recommend" data-suggestion="0" data-team="${team.teamId}" title="Önerilen dizilişi uygula: ${suggestions[0]!.lineup.formationId}" aria-label="${html(team.name)} için önerilen dizilişi uygula">${uiIcon('reset')}</button></header><div class="tactic-pitch" aria-label="${html(team.name)} taktik sahası"><svg class="tactic-pitch-lines" viewBox="0 0 680 1050" preserveAspectRatio="none" aria-hidden="true"><path d="M20 20h640v1010H20zM20 525h640M138 20v165h404V20M248 20v55h184V20M138 1030V865h404v165M248 1030v-55h184v55"/><circle cx="340" cy="525" r="91.5"/><circle cx="340" cy="525" r="3"/><path d="M268 185q72 70 144 0M268 865q72-70 144 0"/></svg>${nodes}</div></section>`;
    });
    const metrics=Object.entries(metricLabels).map(([key,label])=>{
      const blue=assessment.evaluation.teams[0].metrics[key as keyof typeof metricLabels],red=assessment.evaluation.teams[1].metrics[key as keyof typeof metricLabels];
      return `<div class="tactic-metric" title="${html(blue.explanations[0]?.text??'')}"><span>${label}</span><div><b class="blue-value" aria-label="Mavi takım ${label}: ${blue.score.toFixed(1)} / 100">${blue.score.toFixed(1).replace('.',',')}</b><i aria-hidden="true"></i><b class="red-value" aria-label="Kırmızı takım ${label}: ${red.score.toFixed(1)} / 100">${red.score.toFixed(1).replace('.',',')}</b></div></div>`;
    }).join('');
    const reports=assessment.evaluation.teams.map((team,index)=>{
      const effects=[...new Map(assessment.applied.filter(a=>a.playerIds.some(id=>draft!.lineups[index]!.assignments.some(s=>s.playerId===id))).map(a=>[a.ruleId,a])).values()];
      return `<section class="tactic-report"><h3 style="color:${TEAM_PRESENTATION[team.teamId].color}">${html(context!.selection.teams[index]!.name)}</h3><p class="tactic-atmosphere ${team.atmosphere.state}">${html(team.atmosphere.text)}</p>${effects.length?effects.map(e=>`<p class="${e.effect.kind==='attribute-delta'&&e.effect.delta<0||e.effect.kind==='team-atmosphere'&&e.effect.delta<0?'negative':'positive'}">${html(e.explanation)}</p>`).join(''):'<p>Bu yerleşimde özel isim eşleşmesi tetiklenmedi.</p>'}${team.warnings.map(w=>`<p class="tactic-warning">${html(w.text)}</p>`).join('')}</section>`;
    }).join('');
    host.innerHTML=`${prepSteps('lineup')}<h1 class="tactics-sr-only">${halftime?'Devre arası dizilişi':'Diziliş'}</h1><div class="tactics-layout"><div class="tactics-pitches">${cards[0]}<section class="tactics-balance" aria-label="İki takımın pas, uyum ve oyun dengesi">${metrics}<button class="tactics-detail-button" data-open-reports>${uiIcon('info')}Uyum detayları</button></section>${cards[1]}</div></div>
    <footer class="tactics-footer"><div class="tactics-footer-left">${halftime?`<span class="tactics-halftime">Devre arası <strong>${halftime.score[0]}–${halftime.score[1]}</strong></span><a class="tactics-back" href="#mac">${uiIcon('arrowLeft')}Maça dön</a>`:`<a class="tactics-back" href="#kadrolar">${uiIcon('arrowLeft')}Kadrolar</a>`}<button class="squad-export" data-export-lineup>${uiIcon('download')}İndir</button><span id="tactics-status" role="status" class="tactics-sr-only"></span></div><div><button id="tactics-retry" hidden>Tekrar dene</button><button id="tactics-confirm">${halftime?'İkinci yarıyı başlat':'Maça geç'}${uiIcon('arrowRight')}</button></div></footer>
    <dialog class="tactics-detail-dialog" id="tactics-details" aria-labelledby="tactics-detail-title"><header><h2 id="tactics-detail-title">Uyum detayları</h2><button data-close-reports aria-label="Uyum detaylarını kapat">${uiIcon('close')}</button></header><div class="tactic-reports">${reports}</div></dialog><p class="tactics-notice" id="tactics-notice" role="status" hidden></p>`;
    renderFooter();
    motion.settle(before);
    // innerHTML replaces every control; keep keyboard users on the control they used.
    if(focusSelector)host.querySelector<HTMLElement>(focusSelector)?.focus({preventScroll:true});
  }
  function apply(command:LineupCommand){
    if(!draft||!context||conflict)return;
    const changed=lineupService.apply(draft,command,context);selected=null;
    if(!changed.ok){render();status(changed.problems.map(p=>p.message).join(' '));host.querySelector('#tactics-status')?.classList.remove('tactics-sr-only');return;}
    if(changed.value===draft){render();return;}draft=changed.value;queue.push(draft);render();void drain();
  }
  host.addEventListener('click',event=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
    if(button.hasAttribute('data-open-reports'))host.querySelector<HTMLDialogElement>('#tactics-details')?.showModal();
    else if(button.hasAttribute('data-close-reports'))host.querySelector<HTMLDialogElement>('#tactics-details')?.close();
    else if(button.hasAttribute('data-export-lineup')&&draft&&context)openSocialExport({kind:'squads',selection:context.selection,catalog:resolveMatchCatalog(context.catalog,context.selection),lineups:draft},button);
    else if(button.dataset.formationId)apply({kind:'change-formation',teamId:button.dataset.team as TeamId,formationId:button.dataset.formationId as keyof typeof FORMATIONS});
    else if(button.dataset.slot){
      const pick={teamId:button.dataset.team as TeamId,slotId:button.dataset.slot};
      if(selected&&selected.teamId===pick.teamId&&selected.slotId===pick.slotId){selected=null;render();}
      else if(selected&&selected.teamId===pick.teamId){const first=selected;selected=null;apply({kind:'swap-slots',teamId:pick.teamId,firstSlot:first.slotId,secondSlot:pick.slotId});}
      else{selected=pick;render();}
    }else if(button.dataset.profile&&context)library.openProfile(button.dataset.profile,button,resolveMatchCatalog(context.catalog,context.selection));
    else if(button.dataset.suggestion!==undefined&&result){const teamId=button.dataset.team as TeamId;apply({kind:'apply-suggestion',teamId,suggestion:result.suggestions[teamId][Number(button.dataset.suggestion)]!});}
    else if(button.id==='tactics-confirm'){const notice=host.querySelector<HTMLElement>('#tactics-notice')!;notice.hidden=false;notice.textContent=halftime?'İkinci yarı bu düzenle başlıyor.':'Yerleşim onaylandı ve kaydedildi. Maç başlıyor.';}
    else if(button.id==='tactics-retry'){if(conflict&&context)void open(context,true);else if(!draft&&context)void open(context,true);else{error='';void drain();}}
  },{signal:abort.signal});
  host.addEventListener('dragstart',event=>{const e=event as DragEvent,button=(e.target as Element).closest<HTMLElement>('[data-slot]');if(!button)return;dragged={teamId:button.dataset.team as TeamId,slotId:button.dataset.slot!};e.dataTransfer?.setData('text/plain',`${dragged.teamId}:${dragged.slotId}`);if(e.dataTransfer)e.dataTransfer.effectAllowed='move';},{signal:abort.signal});
  host.addEventListener('dragover',event=>{
    const target=(event.target as Element).closest<HTMLElement>('[data-slot]');
    if(!target||!dragged||target.dataset.team!==dragged.teamId)return;
    event.preventDefault();host.querySelectorAll('.is-drop-target').forEach(node=>node.classList.remove('is-drop-target'));
    target.closest('.tactic-player')?.classList.add('is-drop-target');
  },{signal:abort.signal});
  host.addEventListener('drop',event=>{event.preventDefault();const target=(event.target as Element).closest<HTMLElement>('[data-slot]');if(target&&dragged&&target.dataset.team===dragged.teamId)apply({kind:'swap-slots',teamId:dragged.teamId,firstSlot:dragged.slotId,secondSlot:target.dataset.slot!});dragged=null;},{signal:abort.signal});
  host.addEventListener('dragend',()=>{dragged=null;host.querySelectorAll('.is-drop-target').forEach(node=>node.classList.remove('is-drop-target'));},{signal:abort.signal});
  async function open(next:LineupContext,force=false){
    if(!force&&context?.selection.revision===next.selection.revision&&context.selection.id===next.selection.id&&context.catalog.version===next.catalog.version&&draft){render();return;}
    cancelWorker();worker?.terminate();const token=++generation;context=next;draft=null;result=null;selected=null;queue.length=0;error='';conflict=false;busy=true;
    const ready=selectionService.validateForLineups(next.selection,next.catalog);
    if(!ready.ok){busy=false;host.innerHTML=`<div class="tactics-loading"><span class="selection-eyebrow">KADROLAR HAZIR DEĞİL</span><h1>Önce iki takımı tamamla.</h1>${ready.problems.map(p=>`<p>${html(p.message)}</p>`).join('')}<a href="#kadrolar">← Kadro seçimine dön</a></div>`;return;}
    host.innerHTML=`${prepSteps('lineup')}<div class="tactics-loading"><h1>Diziliş hazırlanıyor</h1><a href="#kadrolar">Kadrolara dön</a></div>`;
    try{
      const saved=await repository.loadLineups(next.selection.id);if(token!==generation||disposed)return;
      if(!saved.ok)throw new Error(saved.problems.map(p=>p.message).join(' '));
      const optimized=await new Promise<OptimizationResult|null>((resolve,reject)=>{
        const runId=crypto.randomUUID();cancelWorker=()=>resolve(null);
        worker=new Worker(new URL('../../workers/optimizer.worker.ts',import.meta.url),{type:'module'});
        worker.onmessage=(event:MessageEvent<OptimizerWorkerResponse>)=>{
          const reply=event.data;if(token!==generation)return;
          if(reply.kind==='complete'&&reply.result.runId===runId&&reply.result.selectionRevision===next.selection.revision)resolve(reply.result);
          else if(reply.kind==='failed'&&reply.runId===runId)reject(new Error(reply.problems.map(p=>p.message).join(' ')));
        };
        worker.onerror=()=>reject(new Error('Diziliş işçisi başlatılamadı. Tekrar dene.'));
        worker.postMessage({kind:'suggest',request:{runId,selectionRevision:next.selection.revision,context:next,formations:Object.keys(FORMATIONS)}});
      });
      if(!optimized||token!==generation||disposed)return;worker?.terminate();worker=null;result=optimized;
      const restored=saved.value?rebaseLineupDraft(saved.value,next):null;draft=restored??optimized.initialDraft;busy=false;render();
      if(!restored||restored!==saved.value){queue.push(draft);void drain();}
    }catch(reason){if(token!==generation||disposed)return;worker?.terminate();worker=null;busy=false;error=reason instanceof Error?reason.message:'Diziliş hazırlanamadı.';host.innerHTML=`<div class="tactics-loading"><h1>Diziliş hazırlanamadı.</h1><p>${html(error)}</p><button id="tactics-retry">Tekrar dene</button><a href="#kadrolar">Kadrolara dön</a></div>`;}
  }
  return {open,
    /** Half-time mode (set by the match screen): the heading shows the score and confirming starts the second half. */
    setHalftime(next:{score:readonly [number,number]}|null){halftime=next;},
    deactivate(){if(busy){generation++;cancelWorker();worker?.terminate();worker=null;busy=false;}},dispose(){disposed=true;motion.dispose();generation++;cancelWorker();worker?.terminate();abort.abort();repository.close();}};
}
