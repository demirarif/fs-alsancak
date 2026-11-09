import { createMatchRenderer, sampleReplay } from './match-renderer.js';
import { attachCameraInput } from '../camera-input.js';
import { createLineupRepository } from '../v1/data/local-lineups.ts';
import { rebaseLineupDraft } from '../v1/domain/lineups.ts';
import { createMatchSnapshot } from '../v1/application/match-factory.ts';
import { freshSeed } from '../v1/engine/rng.ts';
import { EDIT, EDIT_V1, editOf, halfHighlights } from './highlight-edit.js';
import { walkoutState, walkoutPose, WALKOUT_MIN_SECONDS } from './walkout.js';
import { teamKitMarkup } from '../v1/features/player-profile/player-kit.ts';
import { uiIcon } from '../v1/features/ui/icons.ts';
import { announcedRule, commentary, withoutEffect } from './commentary.js';
import { positionFit } from '../v1/engine/position-fit.ts';
import { FORMATIONS } from '../v1/config/formations.ts';
import { createMatchArchive } from '../v1/data/match-archive.ts';
import { broadcastPlan, broadcastAt, stoppages } from './broadcast-plan.js';
import './match.css';
import './match-ui.css';

/* Match screen: it opens on black and the players fade in walking out while the worker computes the half (user decision: no loading or
 * "simulating" text). "Özet" plays the important moments at real speed (~5 or ~2.5 min a half),
 * 1×–8× play the whole half. At half time the full tactics room (#dizilis) changes formations and places; coming back plays half 2 with
 * them. Leaving and returning mid-match resumes instead of restarting. Visual language follows the player inventory and cards. */
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const clock=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const minute=s=>`${Math.floor(s/60)+1}'`;
const shirtIcon=team=>`<span class="match-kit" aria-hidden="true">${teamKitMarkup(team===0?'team-1':'team-2')}</span>`;
// Highlight edits play at real speed (user decision): about 10 or 5 minutes for the match, i.e. 300 / 150 s a half.
// Slow motion (0,25× / 0,5×) for watching a passage closely; "Son pozisyon" replays the last big moment at REPLAY_RATE, as on TV.
const SPEEDS=[['h10','Özet · 10 dk'],['h5','Özet · 5 dk'],[.25,'0,25×'],[.5,'0,5×'],[1,'1×'],[2,'2×'],[4,'4×'],[8,'8×']],BUDGET={h10:300,h5:150},REPLAY_RATE=.5;
const goalText=e=>e.reason.explanation.replace(/^GOL! /,'').replace(/ · \d+–\d+$/,'');

/** Inventory-style dialog card: wordmark topline, header, body, action footer. */
function card({label,title,lead='',body='',actions='',status=false,wide=false}){
  return `<div class="match-card${wide?' wide':''}"><div class="mc-topline"><span class="mc-wordmark">ALSANCAK</span><span class="mc-label">${label}</span></div>
    <div class="mc-header">${title}${lead?`<p>${lead}</p>`:''}</div>${body?`<div class="mc-body">${body}</div>`:''}
    ${actions?`<div class="match-actions">${actions}${status?'<p class="match-export-status" role="status"></p>':''}</div>`:''}</div>`;
}

export function mountMatchScreen(host){
  host.innerHTML=`<div class="match-stage"><div class="match-scene"></div><div class="match-labels" aria-hidden="true"></div>
    <section class="match-scoreboard" aria-live="polite"><div class="match-team">${shirtIcon(0)}<b data-name="0"></b></div><strong class="match-score">0 <em>–</em> 0</strong><div class="match-team right"><b data-name="1"></b>${shirtIcon(1)}</div>
      <div class="match-clock"><span data-clock>00:00</span><small data-period>1. yarı</small></div><span class="match-onair" hidden>CANLI</span></section>
    <ol class="match-ticker" aria-label="Son olaylar"></ol><section class="match-why" role="dialog" aria-label="Neden oldu?" hidden></section><div class="match-goal-banner" hidden></div><div class="match-chapter" aria-hidden="true"></div><div class="match-cut" aria-hidden="true"></div><div class="match-blackout on" aria-hidden="true"></div>
    <div class="match-camera"><div class="mc-segmented" role="group" aria-label="Kamera açısı"><button data-preset="broadcast" data-short="TV" class="active" aria-pressed="true">TV yayını</button><button data-preset="wide" data-short="Geniş" aria-pressed="false">Geniş</button><button data-preset="goal" data-short="Kale" aria-pressed="false">Kale arkası</button></div></div>
    <a class="mc-exit" href="#gunun-maci" aria-label="Yayından çık, Günün maçına dön"><svg class="ui-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg></a>
    <button class="mc-golive" data-golive hidden>CANLI'ya dön</button><div class="match-overlay" role="dialog" aria-modal="false" hidden></div></div>
  <footer class="match-controls"><button class="mc-play" data-play aria-label="Duraklat"><span class="mc-play-symbol" aria-hidden="true">${uiIcon('pause')}</span><span class="mc-play-label">Duraklat</span></button>
    <button class="mc-replay" data-replay title="Son pozisyonu yarı hızda tekrar izle" aria-label="Son pozisyonu yarı hızda tekrar izle">${uiIcon('reset')}<span>Son pozisyon</span></button>
    <div class="mc-speeds" role="group" aria-label="İzleme biçimi">${SPEEDS.map(([v,l],i)=>`${i===2?'<i class="mc-speed-divider" aria-hidden="true"></i>':''}<button data-speed="${v}" ${v==='h10'?'class="active" aria-pressed="true"':'aria-pressed="false"'} ${BUDGET[v]?'title="Önemli anlar gerçek hızda"':''}>${l}</button>`).join('')}</div>
    <div class="match-timeline"><input type="range" data-timeline min="0" max="1800" step="1" value="0" aria-label="Yarı içinde zaman"/><div class="match-marks" aria-hidden="true"></div></div>
    <button class="match-skip" data-skip><span>Devre arasına geç</span>${uiIcon('skipForward')}</button></footer>`;
  const $=s=>host.querySelector(s),$$=s=>host.querySelectorAll(s),overlay=$('.match-overlay'),blackout=$('.match-blackout');
  let context=null,draft=null,snapshot=null,renderer=null,worker=null,runId=0,halves=[null,null],results=[null,null],carry=null,lineups=null;
  let whyResume=false,half=1,t=0,playing=true,speed='h10',raf=null,last=performance.now(),visible=false,seeked=true,detachInput=null,bannerUntil=0,chapterUntil=0,disposed=false,exporting=false;
  // phase: walk-out while the worker computes, then play. Highlights: segments of the current half and the one on screen.
  let phase='idle',walkT=0,segments=[],segIndex=0,nameOf=()=>'',stops=[];
  // A replay in progress: play up to `to` at REPLAY_RATE, then go back to where the viewer was.
  let replay=null;
  // Set when the user leaves for the tactics room at half time; the next open() plays the second half with the saved lineup.
  let changingLineup=false;
  // Online broadcast (user decision 2026-11-05): mode 'broadcast' plays a downloaded recording; while `bcast.live` the picture follows
  // the server clock (everybody at the same moment). Pausing or a replay leaves live play; "CANLI'ya dön" rejoins it.
  let mode='local',bcast=null;
  const repository=createLineupRepository();

  function status(html){overlay.hidden=false;overlay.innerHTML=html;replay=null;transport();}
  /** Transport follows the state: nothing to play under a half-time / full-time card, no seeking or replay during the walk-out. */
  function transport(){const card=!overlay.hidden,live=phase==='play'&&!card,locked=mode==='broadcast'&&(!broadcastOver()||bcast.trimmed);if(card){$('.match-why').hidden=true;whyResume=false;}$('[data-play]').disabled=card;$('[data-skip]').disabled=!live||locked;$('[data-replay]').disabled=!live;$('[data-timeline]').disabled=!live||locked;
    // During the broadcast nobody skips ahead or changes the edit: it is the same programme for everybody until it has ended.
    $$('[data-speed]').forEach(b=>{b.disabled=locked;});$('[data-golive]').hidden=!(mode==='broadcast'&&!bcast.live&&!broadcastOver());$('.match-onair').hidden=!(mode==='broadcast'&&bcast.live);$('.match-scoreboard').classList.toggle('is-live',mode==='broadcast'&&!!bcast?.live);}
  const broadcastOver=()=>mode==='broadcast'&&(bcast.clock()-bcast.kickoffAt)/1000>=bcast.plan.total;
  function teamName(i){return mode==='broadcast'?bcast.names[i]:context.selection.teams[i].name;}
  function scoreRow(score){return `<div class="mc-score-row"><div class="mc-side">${shirtIcon(0)}<b>${esc(teamName(0))}</b></div><strong class="mc-score">${score[0]}<em>–</em>${score[1]}</strong><div class="mc-side right"><b>${esc(teamName(1))}</b>${shirtIcon(1)}</div></div>`;}
  /** Same 22 players, team by team, as the match in progress. */
  const samePlayers=ls=>!!snapshot&&ls.every((l,i)=>{const a=new Set(l.assignments.map(x=>x.playerId)),b=snapshot.lineups[i].assignments.map(x=>x.playerId);return a.size===b.length&&b.every(id=>a.has(id));});
  async function open(next){
    if(mode==='broadcast'){mode='local';bcast=null;snapshot=null;host.classList.remove('is-broadcast');transport();}
    const saved=await repository.loadLineups(next.selection.id),value=saved.ok&&saved.value?rebaseLineupDraft(saved.value,next):null;
    if(snapshot&&value&&samePlayers(value.lineups)&&phase!=='idle'){
      context=next;
      // Back from the tactics room at half time: the second half uses the formation and places saved there.
      if(changingLineup&&results[0]&&!halves[1]){changingLineup=false;draft=value;lineups=value.lineups;simulate(2);}
      return;
    }
    changingLineup=false;context=next;stop();runId++;halves=[null,null];results=[null,null];carry=null;half=1;t=0;phase='idle';overlay.hidden=true;replay=null;transport();blackout.classList.add('on');
    if(!value){status(card({label:'Maç',title:'<h2>Önce dizilişi onayla.</h2>',lead:'Kadro ve diziliş kaydı bulunamadı ya da kadrolar değişti.',actions:'<a class="match-button" href="#dizilis">Taktik odasına dön</a>'}));return;}
    draft=value;lineups=draft.lineups;newMatch();
  }
  function newMatch(){
    snapshot=createMatchSnapshot(draft,context,freshSeed());lineups=snapshot.lineups;halves=[null,null];results=[null,null];carry=null;half=1;t=0;
    const names=new Map(snapshot.players.map(p=>[p.id,p.name]));nameOf=id=>names.get(id);
    $$('[data-name]').forEach(el=>{el.textContent=teamName(Number(el.dataset.name));});
    renderer?.dispose();$('.match-scene').innerHTML='';$('.match-labels').innerHTML='';detachInput?.();
    renderer=createMatchRenderer($('.match-scene'),$('.match-labels'),{snapshot,lineups});detachInput=attachCameraInput(renderer.canvas,intent=>renderer.setCamera(intent));
    simulate(1);
  }
  /** Computes half h in the worker while the players walk out; the kick-off follows once both are done. */
  function simulate(h){
    const id=++runId;half=h;playing=true;setPlayIcon();overlay.hidden=true;phase='walkout';walkT=0;seeked=true;replay=null;transport();
    blackout.classList.add('on');$('.match-ticker').innerHTML='';$('.match-marks').innerHTML='';
    const score=h===1?[0,0]:results[0].score;$('.match-score').innerHTML=`${score[0]} <em>–</em> ${score[1]}`;$('[data-clock]').textContent=h===1?'00:00':'30:00';$('[data-period]').textContent=h===1?'1. yarı':'2. yarı';
    if(visible&&!raf){last=performance.now();raf=requestAnimationFrame(frame);}
    worker?.terminate();worker=new Worker(new URL('../v1/workers/simulation.worker.ts',import.meta.url),{type:'module'});
    const failed=message=>{phase='idle';blackout.classList.remove('on');status(card({label:'Maç',title:'<h2>Maç hesaplanamadı.</h2>',lead:esc(message),actions:'<button class="match-button" data-action="retry">Tekrar dene</button>'}));};
    worker.onmessage=event=>{const m=event.data;if(m.runId!==id||disposed)return;
      if(m.kind==='failed')failed(m.message);
      if(m.kind==='half-complete'){worker.terminate();worker=null;results[h-1]=m.result;halves[h-1]=m.result.replay;carry=m.result.carry;}};
    worker.onerror=()=>failed('Maç işçisi başlatılamadı.');
    worker.postMessage({kind:'simulate-half',runId:id,snapshot,half:h,lineups,carry:h===1?null:carry});
  }
  function startHalf(h){
    half=h;const r=halves[h-1];phase='play';blackout.classList.remove('on');overlay.hidden=true;playing=true;setPlayIcon();cut();replay=null;transport();
    editSegments();stops=stopsOf(h);segIndex=0;t=highlighting()?segments[0].start:r.startSeconds;seeked=true;
    $('[data-timeline]').min=String(r.startSeconds);$('[data-timeline]').max=String(r.endSeconds);$('[data-period]').textContent=h===1?'1. yarı':'2. yarı';
    $('.match-ticker').innerHTML='';{const skip=h===1?'Devre arasına geç':'Maç sonuna geç';$('[data-skip] span').textContent=skip;$('[data-skip]').title=skip;$('[data-skip]').setAttribute('aria-label',skip);}
    if(highlighting())chapter();
    if(visible&&!raf){last=performance.now();raf=requestAnimationFrame(frame);}
  }
  function stop(){if(raf)cancelAnimationFrame(raf);raf=null;worker?.terminate();worker=null;}
  function setPlayIcon(){$('.mc-play-symbol').innerHTML=uiIcon(playing?'pause':'play');$('.mc-play-label').textContent=playing?'Duraklat':'Devam et';$('[data-play]').setAttribute('aria-label',playing?'Duraklat':'Devam et');$('[data-play]').classList.toggle('is-paused',!playing);}
  const highlighting=()=>typeof speed==='string';
  /** The edit being played: a broadcast keeps the one it was planned with (v1 for the first broadcasts), a local match today's. */
  const currentEdit=()=>mode==='broadcast'?editOf(bcast?.edit?.version):EDIT;
  /** A half's dead-ball stretches; a recording with its edit stored carries them (the trimmed live copy cannot be scanned for them). */
  const stopsOf=h=>(mode==='broadcast'&&bcast?.edit?.stops?.[h-1])||stoppages(halves[h-1]);
  /** Segments of the chosen edit (the 10-minute one marks the timeline in full-speed modes too). Important moments, not goals: the
   * marks are neutral so the timeline never gives the score away. */
  function editSegments(){
    const r=halves[half-1],stored=mode==='broadcast'&&bcast?.edit&&(speed==='h10'||bcast.trimmed)?bcast.edit.segments[half-1]:null;
    segments=stored??halfHighlights(r,BUDGET[speed]??BUDGET.h10,currentEdit()).segments;const span=r.endSeconds-r.startSeconds;
    $('.match-marks').innerHTML=segments.slice(1).map(s=>`<i style="left:${(s.start-r.startSeconds)/span*100}%;width:${Math.max(.25,(s.end-s.start)/span*100)}%"></i>`).join('');
  }
  /** Quick dip between highlight segments, like a TV edit. */
  function cut(){const el=$('.match-cut');el.classList.remove('on');void el.offsetWidth;el.classList.add('on');}
  function chapter(){const s=segments[segIndex];if(!s)return;const el=$('.match-chapter');el.textContent=`ÖZET · ${minute(s.start)}`;el.classList.add('on');chapterUntil=performance.now()+1800;}
  /** In highlight mode, line t up with the segment at or after it. */
  /** TV-style replay: the last big moment of the past 20 s (a shot, save or goal; otherwise the last 8 s) again at half speed. */
  function startReplay(){
    const r=phase==='play'&&overlay.hidden?halves[half-1]:null;if(!r)return;
    if(mode==='broadcast'&&bcast.live){bcast.live=false;transport();}
    // The trimmed live copy holds only the edit's moments: a replay stays within the one on air.
    const floor=mode==='broadcast'&&bcast.trimmed?segments[segIndex]?.start??r.startSeconds:r.startSeconds;
    const back=r.events.filter(e=>e.seconds<=t&&t-e.seconds<20&&e.importance>=.45&&e.seconds>=floor).at(-1),from=Math.max(r.startSeconds,floor,back?back.seconds-4:t-8),to=back?Math.min(t,back.seconds+2.5):t;
    if(to-from<1)return;
    replay={to,returnT:replay?.returnT??t};t=from;seeked=true;playing=true;setPlayIcon();cut();
    const el=$('.match-chapter');el.textContent='TEKRAR · 0,5×';el.classList.add('on');chapterUntil=performance.now()+2200;
  }
  function alignToSegments(){const i=segments.findIndex(s=>s.end>t);if(i<0){segIndex=segments.length-1;return;}segIndex=i;if(t<segments[i].start){t=segments[i].start;seeked=true;cut();chapter();}}

  function frame(now){
    raf=null;if(!visible||disposed)return;
    const real=Math.min(.1,Math.max(0,(now-last)/1000));last=now;
    // The reel export renders offline; the live view rests meanwhile so the two do not share the GPU.
    if(exporting){raf=requestAnimationFrame(frame);return;}
    if(mode==='broadcast'){if(bcast.live){liveFrame(real);raf=requestAnimationFrame(frame);return;}if(!bcast.overSeen&&broadcastOver()){bcast.overSeen=true;transport();}}
    if(phase==='walkout'){
      // Paused, the walk-out holds too (and the kick-off waits for play).
      const step=playing?real:0;walkT+=step;renderer.render(walkoutState(lineups,walkT,half===1?[0,0]:results[0].score),{realDt:real,simDt:seeked?0:step,seeked,pose:walkoutPose(walkT)});
      // The first walk-out frame is on screen: fade up from black.
      if(seeked)blackout.classList.remove('on');seeked=false;
      if(halves[half-1]&&walkT>=WALKOUT_MIN_SECONDS)startHalf(half);
      raf=requestAnimationFrame(frame);return;
    }
    const r=phase==='play'?halves[half-1]:null;if(!r){raf=requestAnimationFrame(frame);return;}
    const moving=playing&&overlay.hidden,prev=t;let step=0;
    if(replay){step=moving?real*REPLAY_RATE:0;t=Math.min(replay.to,t+step);if(t>=replay.to&&moving){t=replay.returnT;replay=null;seeked=true;cut();}}
    else if(highlighting()){
      // Once the last moment has played the clock stays at the end of the half (it used to fall back to the segment's end).
      const seg=segments[segIndex];step=moving?real:0;if(t<seg.end)t=Math.min(seg.end,t+step);
      if(t>=seg.end&&moving&&t<r.endSeconds){if(segIndex<segments.length-1){segIndex++;t=segments[segIndex].start;seeked=true;cut();chapter();}else{t=r.endSeconds;seeked=true;}}
    }else{step=moving?real*speed:0;t=Math.min(r.endSeconds,t+step);}
    // Nobody watches the players walk to a set piece (user): a quick cut to just before the kick.
    if(moving&&!replay){const ed=currentEdit(),stop=stops.find(s=>t>=s[0]&&t<s[1]);if(stop&&stop[1]-t>ed.cutOver){t=stop[1]-ed.cutKeep;seeked=true;cut();}}
    const jumped=seeked,state=sampleReplay(r,t);renderer.render(state,{realDt:real,simDt:jumped?0:step,events:r.events,seeked:jumped});seeked=false;
    hud(state,r,jumped?t:prev);
    if(chapterUntil&&performance.now()>chapterUntil){$('.match-chapter').classList.remove('on');chapterUntil=0;}
    if(t>=r.endSeconds&&moving)endOfHalf();
    raf=requestAnimationFrame(frame);
  }
  const countdown=s=>{const n=Math.max(0,Math.ceil(s));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;};
  /** One frame of the live broadcast: what is on air now, from the server clock. */
  function liveFrame(real){
    const at=broadcastAt(bcast.plan,(bcast.clock()-bcast.kickoffAt)/1000);
    if(at.key!==bcast.key){bcast.key=at.key;enterPart(at);}
    if(at.kind==='before'||at.kind==='halftime'){const el=overlay.querySelector('[data-countdown]');if(el)el.textContent=countdown(at.remaining);return;}
    if(at.kind==='walkout'){walkT=at.offset;renderer.render(walkoutState(at.half===1?snapshot.lineups:lineups,walkT,at.half===1?[0,0]:results[0].score),{realDt:real,simDt:real,seeked:false,pose:walkoutPose(walkT)});return;}
    if(at.kind==='end'){bcast.live=false;bcast.overSeen=true;phase='play';half=2;t=halves[1].endSeconds;endOfHalf();return;}
    const r=halves[at.half-1],prev=t,jump=at.piece!==bcast.piece||seeked;
    if(at.piece!==bcast.piece){if(bcast.piece>=0&&at.cut)cut();bcast.piece=at.piece;segIndex=at.seg;if(at.segStart)chapter();}
    t=at.t;const state=sampleReplay(r,t);renderer.render(state,{realDt:real,simDt:jump?0:Math.max(0,t-prev),events:r.events,seeked:jump});seeked=false;
    hud(state,r,jump?t:prev);
    if(chapterUntil&&performance.now()>chapterUntil){$('.match-chapter').classList.remove('on');chapterUntil=0;}
  }
  function enterPart(at){
    overlay.hidden=true;
    if(at.kind==='before'){phase='idle';blackout.classList.add('on');status(card({label:'Canlı yayın',title:'<h2>Maç birazdan başlıyor</h2>',lead:'Başlamasına <b data-countdown></b>'}));return;}
    if(at.kind==='walkout'){phase='walkout';half=at.half;blackout.classList.remove('on');$('.match-ticker').innerHTML='';$('.match-marks').innerHTML='';const score=at.half===1?[0,0]:results[0].score;
      $('.match-score').innerHTML=`${score[0]} <em>–</em> ${score[1]}`;$('[data-clock]').textContent=at.half===1?'00:00':'30:00';$('[data-period]').textContent=at.half===1?'1. yarı':'2. yarı';transport();return;}
    if(at.kind==='half'){half=at.half;phase='play';blackout.classList.remove('on');const r=halves[half-1];editSegments();stops=stopsOf(half);segIndex=0;bcast.piece=-1;seeked=true;
      $('[data-timeline]').min=String(r.startSeconds);$('[data-timeline]').max=String(r.endSeconds);$('[data-period]').textContent=half===1?'1. yarı':'2. yarı';$('.match-ticker').innerHTML='';transport();return;}
    if(at.kind==='halftime'){phase='play';half=1;t=halves[0].endSeconds;status(card({wide:true,label:'Devre arası',title:scoreRow(results[0].score),lead:'İkinci yarı <b data-countdown></b> sonra başlıyor.',body:scorers(1)+stats(1)}));}
  }
  /** Plays a planned match from its recording (mode 'broadcast'). Opened after the broadcast, it starts from the top with no score card. */
  function openBroadcast({recording,kickoffAt,clock}){
    stop();runId++;mode='broadcast';changingLineup=false;host.classList.add('is-broadcast');
    snapshot=recording.snapshot;lineups=recording.lineups[1];halves=[recording.halves[0],recording.halves[1]];results=[recording.results[0],recording.results[1]];carry=null;
    // A recording planned since 6 Nov carries its edit (and the live copy is trimmed to it); the first ones replay with the v1 edit they had.
    bcast={kickoffAt,clock,plan:recording.edit?.plan??broadcastPlan(halves,EDIT_V1),edit:recording.edit??null,trimmed:!!recording.trimmed,live:true,names:recording.teamNames,key:'',piece:-1,overSeen:false};
    const names=new Map(snapshot.players.map(p=>[p.id,p.name]));nameOf=id=>names.get(id);
    $$('[data-name]').forEach(el=>{el.textContent=teamName(Number(el.dataset.name));});
    speed='h10';$$('[data-speed]').forEach(x=>{const on=x.dataset.speed==='h10';x.classList.toggle('active',on);x.setAttribute('aria-pressed',String(on));});
    renderer?.dispose();$('.match-scene').innerHTML='';$('.match-labels').innerHTML='';detachInput?.();
    renderer=createMatchRenderer($('.match-scene'),$('.match-labels'),{snapshot,lineups:snapshot.lineups});detachInput=attachCameraInput(renderer.canvas,intent=>renderer.setCamera(intent));
    overlay.hidden=true;replay=null;half=1;phase='idle';playing=true;setPlayIcon();$('.match-ticker').innerHTML='';
    if(broadcastOver()){bcast.live=false;bcast.overSeen=true;startHalf(1);}else blackout.classList.add('on');
    transport();if(visible&&!raf){last=performance.now();raf=requestAnimationFrame(frame);}
  }
  /** A card over the match stage (loading, not started yet, recording deleted). */
  function message({title,lead='',actions=''}){if(raf)cancelAnimationFrame(raf);raf=null;phase='idle';blackout.classList.add('on');status(card({label:'Canlı yayın',title:`<h2>${title}</h2>`,lead,actions}));}
  function hud(state,r,prev){
    $('.match-score').innerHTML=`${state.score[0]} <em>–</em> ${state.score[1]}`;$('[data-clock]').textContent=clock(Math.min(r.endSeconds,state.t));
    const tl=$('[data-timeline]');if(document.activeElement!==tl){tl.value=String(state.t);tl.style.setProperty('--progress',`${(state.t-r.startSeconds)/(r.endSeconds-r.startSeconds)*100}%`);}
    const fresh=replay?[]:r.events.filter(e=>e.seconds>prev&&e.seconds<=state.t&&e.importance>=.3);
    if(fresh.length){const list=$('.match-ticker');for(const e of fresh){const line=commentary(e,nameOf);if(!line)continue;const li=document.createElement('li');li.className=`${e.kind==='goal'?'is-goal':''} ${e.teamId==='team-2'?'red':'blue'}`;li.innerHTML=`<button type="button" data-why="${e.id}" title="Neden oldu?"><b>${minute(e.seconds)}</b><span>${esc(line)}</span></button>`;list.prepend(li);}while(list.children.length>3)list.lastChild.remove();}
    const goal=fresh.find(e=>e.kind==='goal');
    if(goal){const b=$('.match-goal-banner'),team=goal.teamId==='team-2'?1:0;b.hidden=false;b.className=`match-goal-banner ${team?'red':'blue'}`;b.innerHTML=`<strong>GOL!</strong><span>${shirtIcon(team)}${esc(goalText(goal))}</span>`;bannerUntil=performance.now()+3200;}
    if(bannerUntil&&performance.now()>bannerUntil){$('.match-goal-banner').hidden=true;bannerUntil=0;}
  }
  // "Neden oldu?": a ticker line opens the engine's own account of that moment (probability, pressure, the skills it used, the rules on
  // the man at that instant), and the match waits while it is read.
  const ATTR_TR={speed:'hız',stamina:'dayanıklılık',strength:'güç',passing:'pas',vision:'görüş',control:'kontrol',dribbling:'top sürme',shooting:'şut',finishing:'bitiricilik',defending:'savunma',pressing:'pres',positioning:'pozisyon'};
  function ruleText(id,e){
    if(id==='team-chemistry')return'Takım kimyası (lider oyuncular ya da gergin ortam) takım arkadaşlarının pas/görüş/pozisyonuna yansıyor.';
    if(id==='position-fit'){const ls=e.seconds<halves[0]?.endSeconds?snapshot.lineups:lineups,team=e.teamId==='team-2'?1:0,l=ls[team],a=l?.assignments.find(x=>x.playerId===e.actorId),slot=a&&FORMATIONS[l.formationId]?.slots.find(s=>s.id===a.slotId),p=snapshot.players.find(x=>x.id===e.actorId);
      return(p&&slot&&positionFit(p.name,p.positionRatings,slot.position)?.[0]?.explanation)??'Mevkisinin dışında oynuyor.';}
    // An in-match rule says what switches it on, not its numbers (user, 2026-11-06: "Utku … −0,5 yazmasın", "hepsini gizle"); it still acts.
    const rule=snapshot.rulebook.rules.find(r=>r.id===id);
    return rule?.description?(announcedRule(rule)?withoutEffect(rule.description):rule.description):id;
  }
  function openWhy(id){
    const e=[...(halves[0]?.events??[]),...(halves[1]?.events??[])].find(x=>x.id===id);if(!e)return;const r=e.reason,box=$('.match-why');
    const facts=[r.successProbability!==undefined?`Tahmini olasılık %${Math.round(r.successProbability*100)}`:'',r.pressure>0?`Baskı %${Math.round(r.pressure*100)}`:'',r.distanceMeters>0?`${r.distanceMeters.toFixed(0)} m`:'',e.outcome?`Sonuç: ${({goal:'gol',save:'kurtarış',parry:'çelme',wide:'auta',post:'direk',block:'blok'})[e.outcome]??e.outcome}`:''].filter(Boolean);
    const attrs=Object.entries(r.attributeContributions??{}).map(([k,v])=>`${ATTR_TR[k]??k} ${String(v).replace('.',',')}`);
    const rules=(r.ruleIds??[]).map(x=>ruleText(x,e));
    box.innerHTML=`<header><strong>Neden oldu? · ${minute(e.seconds)}</strong><button type="button" data-why-close aria-label="Kapat">×</button></header><p class="why-line">${esc(commentary(e,nameOf))}</p>
      <p class="why-engine">${esc(r.explanation)}</p>${facts.length?`<ul class="why-facts">${facts.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>`:''}
      ${attrs.length?`<p class="why-attrs"><span>Kullanılan özellikler</span>${esc(attrs.join(' · '))}</p>`:''}
      ${rules.length?`<div class="why-rules"><span>${esc(nameOf(e.actorId)??'Oyuncu')} üzerindeki kurallar</span><ul>${rules.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'<p class="why-none">Bu anda oyuncu üzerinde özel kural yok: yalnız özellikleri ve şans.</p>'}`;
    whyResume=whyResume||playing;playing=false;setPlayIcon();box.hidden=false;box.querySelector('[data-why-close]').focus();
  }
  function closeWhy(){const box=$('.match-why');if(box.hidden)return;box.hidden=true;if(whyResume&&phase==='play'&&overlay.hidden){playing=true;setPlayIcon();}whyResume=false;}
  function stats(upTo=2){
    const s=(upTo===1?results[0]:results[1]??results[0]).teamStats,pct=(a,b)=>Math.round(a/Math.max(1,a+b)*100);
    const row=(label,a,b,va,vb)=>`<div class="mc-stat"><span>${a}</span><span>${label}</span><span>${b}</span><i style="--share:${(va+vb?va/(va+vb)*100:50).toFixed(1)}%"></i></div>`;
    const p0=pct(s[0].possession,s[1].possession),acc=i=>Math.round(s[i].completed/Math.max(1,s[i].passes)*100);
    return `<div class="mc-stats">${row('Topa sahip olma',`%${p0}`,`%${100-p0}`,p0,100-p0)}${row('Şut (isabet)',`${s[0].shots} (${s[0].onTarget})`,`${s[1].shots} (${s[1].onTarget})`,s[0].shots,s[1].shots)}${row('Pas isabeti',`%${acc(0)}`,`%${acc(1)}`,acc(0),acc(1))}${row('Korner',s[0].corners,s[1].corners,s[0].corners,s[1].corners)}${row('Faul',s[0].fouls,s[1].fouls,s[0].fouls,s[1].fouls)}${row('Kurtarış',s[0].saves,s[1].saves,s[0].saves,s[1].saves)}</div>`;
  }
  function scorers(upTo=2){
    const goals=halves.slice(0,upTo).filter(Boolean).flatMap(h=>h.events.filter(e=>e.kind==='goal'));
    return `<div class="match-columns${goals.length?'':' is-scoreless'}">${[0,1].map(i=>`<ul class="match-scorers ${i?'red':'blue'}"><li class="mc-col-title">Goller</li>${goals.filter(e=>e.teamId===`team-${i+1}`).map(e=>`<li><b>${minute(e.seconds)}</b> ${esc(goalText(e))}</li>`).join('')||'<li class="none">Gol yok</li>'}</ul>`).join('')}</div>`;
  }
  function endOfHalf(){
    playing=false;setPlayIcon();
    // Re-watching: the second half already exists, so continue into it without simulating again.
    if(half===1&&halves[1]&&overlay.hidden){startHalf(2);return;}
    const score=results[half-1].score;
    if(mode==='broadcast'){
      if(half===1)status(card({wide:true,label:'Devre arası',title:scoreRow(score),body:scorers(1)+stats(1),actions:`<button class="match-button" data-action="second">İkinci yarıyı izle${uiIcon('arrowRight')}</button>`}));
      else if(bcast.trimmed)status(card({wide:true,label:'Maç sonu',title:scoreRow(score),body:scorers(2)+stats(2),actions:`<a class="match-button ghost" href="#gunun-maci">Günün maçına dön</a><a class="match-button" href="#gunun-maci/sonuclar">Özeti izle${uiIcon('arrowRight')}</a>`}));
      else status(card({wide:true,label:'Maç sonu',title:scoreRow(score),body:scorers(2)+stats(2),status:true,actions:`<button class="match-button ghost" data-action="rewatch">${uiIcon('reset')}Baştan izle</button><a class="match-button ghost" href="#gunun-maci">Günün maçına dön</a><button class="match-button" data-action="export">${uiIcon('download')}Özeti indir · 9:16</button>`}));
      return;
    }
    if(half===1)status(card({wide:true,label:'Devre arası',title:scoreRow(score),body:scorers(1)+stats(1),
      actions:`<button class="match-button ghost" data-action="tactics">Dizilişi değiştir${uiIcon('arrowUpRight')}</button><button class="match-button" data-action="second">İkinci yarıyı başlat${uiIcon('arrowRight')}</button>`}));
    else{archiveMatch();status(card({wide:true,label:'Maç sonu',title:scoreRow(score),body:scorers()+stats()+'<p class="match-archived">Maç bu cihazda arşive kaydedildi.</p>',status:true,
      actions:`<button class="match-button ghost" data-action="rewatch">${uiIcon('reset')}Tekrar izle</button><button class="match-button ghost" data-action="new">Yeni maç oyna${uiIcon('arrowRight')}</button><button class="match-button ghost" data-action="archive">Maç arşivi</button><button class="match-button" data-action="export">${uiIcon('download')}Özeti indir · 9:16</button>`}));}
  }
  // Match archive and backup (7. aşama): every finished match is kept on this device; one JSON file carries squads, lineups, guests,
  // weekly forms and the archive to another browser, or back after the browser data is cleared.
  const archive=createMatchArchive();let archivedId=null;
  function archiveMatch(){
    if(!snapshot||!results[1]||archivedId===snapshot.id)return;archivedId=snapshot.id;
    const goals=[...(halves[0]?.events??[]),...(halves[1]?.events??[])].filter(e=>e.kind==='goal').map(e=>({name:nameOf(e.actorId)??'',team:e.teamId==='team-2'?1:0,minute:Math.floor(e.seconds/60)+1}));
    archive.save({id:snapshot.id,kind:'archived-match',savedAt:new Date().toISOString(),weekId:snapshot.weekId,engineVersion:snapshot.tuning?.version??'',teamNames:[teamName(0),teamName(1)],score:[...results[1].score],halfTime:[...results[0].score],scorers:goals,snapshot,secondHalfLineups:lineups})
      .catch(()=>{archivedId=null;const p=host.querySelector('.match-archived');if(p)p.textContent='Maç arşive kaydedilemedi (tarayıcı depolaması kapalı olabilir).';});
  }
  const goalList=m=>Object.entries(m.scorers.reduce((a,g)=>(a[g.name]=(a[g.name]??0)+1,a),{})).sort((a,b)=>b[1]-a[1]).map(([n,c])=>c>1?`${n} ${c}`:n).join(', ');
  async function openArchive(note=''){
    let dlg=host.querySelector('.match-archive');if(!dlg){dlg=document.createElement('dialog');dlg.className='match-archive';host.append(dlg);}
    let list=[];try{list=await archive.list();}catch{note=note||'Arşiv okunamadı (tarayıcı depolaması kapalı olabilir).';}
    const when=iso=>new Date(iso).toLocaleString('tr-TR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    dlg.innerHTML=`<header><strong>Maç arşivi</strong><button type="button" data-archive-close aria-label="Kapat">×</button></header>
      ${list.length?`<ol>${list.map(m=>`<li><span class="when">${esc(when(m.savedAt))}</span><b>${esc(m.teamNames[0])} ${m.score[0]}–${m.score[1]} ${esc(m.teamNames[1])}</b><small>İlk yarı ${m.halfTime[0]}–${m.halfTime[1]}${m.scorers.length?` · ${esc(goalList(m))}`:''}</small></li>`).join('')}</ol>`:'<p class="archive-empty">Henüz kayıtlı maç yok.</p>'}
      <footer><button type="button" class="match-button ghost" data-archive-backup>${uiIcon('download')}Yedeği indir</button><label class="match-button ghost">Yedek yükle<input type="file" accept="application/json,.json" data-archive-restore hidden></label></footer><p class="archive-note" role="status">${esc(note)}</p>`;
    if(!dlg.open)dlg.showModal();
  }
  host.addEventListener('click',async event=>{
    const b=event.target.closest('[data-archive-close],[data-archive-backup]');if(!b)return;const dlg=host.querySelector('.match-archive');
    if(b.dataset.archiveClose!==undefined){dlg?.close();return;}
    try{const blob=new Blob([await archive.backup()],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`alsancak-yedek-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);dlg.querySelector('.archive-note').textContent='Yedek indirildi.';}
    catch{dlg.querySelector('.archive-note').textContent='Yedek alınamadı.';}
  });
  host.addEventListener('change',async event=>{
    const input=event.target.closest?.('[data-archive-restore]');if(!input?.files?.[0])return;
    if(!confirm('Yedekteki kadro, diziliş, misafir, form ve maç kayıtları bu tarayıcıdakilerin üzerine yazılacak. Devam edilsin mi?')){input.value='';return;}
    let note;try{const n=await archive.restore(await input.files[0].text());note=`${n} kayıt geri yüklendi. Kadro ve dizilişin görünmesi için sayfayı yenile.`;}
    catch(error){note=error instanceof Error&&error.message.includes('yedeği')?error.message:'Yedek okunamadı.';}
    input.value='';await openArchive(note);
  });
  host.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b||b.disabled)return;
    if(b.dataset.preset){renderer?.setCamera({kind:'set-preset',preset:b.dataset.preset});$$('[data-preset]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});}
    else if(b.dataset.orbit)renderer?.setCamera({kind:'orbit',deltaAzimuth:Number(b.dataset.orbit)*Math.PI/12,deltaElevation:0});
    else if(b.dataset.tilt)renderer?.setCamera({kind:'orbit',deltaAzimuth:0,deltaElevation:Number(b.dataset.tilt)*Math.PI/36});
    else if(b.dataset.zoom)renderer?.setCamera({kind:'zoom',factor:Number(b.dataset.zoom)});
    else if(b.dataset.follow!==undefined)renderer?.setCamera({kind:'reset-view'});
    else if(b.dataset.play!==undefined){if(!$('.match-why').hidden){$('.match-why').hidden=true;whyResume=false;}playing=!playing;setPlayIcon();if(mode==='broadcast'&&bcast.live&&!playing){bcast.live=false;transport();}}
    else if(b.dataset.golive!==undefined){bcast.live=true;bcast.key='';bcast.piece=-1;replay=null;playing=true;setPlayIcon();seeked=true;transport();}
    else if(b.dataset.replay!==undefined)startReplay();
    else if(b.dataset.why)openWhy(b.dataset.why);
    else if(b.dataset.whyClose!==undefined)closeWhy();
    else if(b.dataset.speed){replay=null;speed=BUDGET[b.dataset.speed]?b.dataset.speed:Number(b.dataset.speed);$$('[data-speed]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});if(phase==='play'){editSegments();if(highlighting())alignToSegments();}}
    else if(b.dataset.skip!==undefined&&!(mode==='broadcast'&&(!broadcastOver()||bcast.trimmed))){const r=phase==='play'?halves[half-1]:null;if(r){replay=null;t=r.endSeconds;segIndex=segments.length-1;seeked=true;}}
    else if(b.dataset.action==='tactics'){changingLineup=true;location.hash='#dizilis';}
    else if(b.dataset.action==='second'){changingLineup=false;if(mode==='broadcast')startHalf(2);else simulate(2);}
    else if(b.dataset.action==='rewatch'){startHalf(1);}
    else if(b.dataset.action==='new'){newMatch();}
    else if(b.dataset.action==='archive'){openArchive();}
    else if(b.dataset.action==='retry'){half===1?simulate(1):simulate(2);}
    else if(b.dataset.action==='export'){
      const statusEl=overlay.querySelector('.match-export-status'),actions=[...overlay.querySelectorAll('.match-actions button')];
      actions.forEach(x=>{x.disabled=true;});exporting=true;statusEl.textContent='Özet hazırlanıyor…';
      try{const {exportHighlights}=await import('./highlight-export.js');
        const blob=await exportHighlights({snapshot,lineups:[snapshot.lineups,lineups],halves,teamNames:[teamName(0),teamName(1)],onProgress:f=>{statusEl.textContent=`Özet hazırlanıyor… %${Math.round(f*100)}`;}});
        const url=URL.createObjectURL(blob.blob),a=document.createElement('a');a.href=url;a.download=blob.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
        statusEl.textContent=`İndirildi: ${blob.filename} (${Math.round(blob.seconds)} sn, ${blob.mime.includes('mp4')?'MP4':'WebM'})`;}
      catch(error){statusEl.textContent=`Özet hazırlanamadı: ${error instanceof Error?error.message:error}`;}
      finally{actions.forEach(x=>{x.disabled=false;});exporting=false;}
    }
  });
  $('[data-timeline]').addEventListener('input',e=>{if(phase!=='play'||(mode==='broadcast'&&(!broadcastOver()||bcast.trimmed)))return;replay=null;t=Number(e.target.value);seeked=true;if(highlighting())alignToSegments();});
  // HUD boxes the name labels must avoid.
  const hudObserver=new ResizeObserver(()=>{if(!renderer)return;const box=host.querySelector('.match-stage').getBoundingClientRect();renderer.setHudExclusions([...host.querySelectorAll('.match-scoreboard,.match-camera,.match-ticker')].map(el=>el.getBoundingClientRect()).map(r=>({x:r.left-box.left,y:r.top-box.top,width:r.width,height:r.height})));});
  hudObserver.observe(host.querySelector('.match-stage'));
  function onKey(event){if(visible&&event.code==='Escape'&&!$('.match-why').hidden){closeWhy();return;}if(!visible||!overlay.hidden||event.target.closest?.('input,select,button,a'))return;if(event.code==='Space'){event.preventDefault();playing=!playing;setPlayIcon();if(mode==='broadcast'&&bcast.live&&!playing){bcast.live=false;transport();}}}
  window.addEventListener('keydown',onKey);
  Object.defineProperty(window,'alsancakMatch',{configurable:true,get:()=>({phase,half,t,playing,speed,mode,live:!!bcast?.live,score:results[1]?.score??results[0]?.score??null,ready:!!halves[half-1],overlay:!overlay.hidden,
    events:halves.filter(Boolean).reduce((n,h)=>n+h.events.length,0),
    /** QA: times of this half's events of a kind (optionally matching a pattern in the explanation). */
    moments:(kind,pattern)=>(halves[half-1]?.events??[]).filter(e=>e.kind===kind&&(!pattern||new RegExp(pattern).test(e.reason.explanation))).map(e=>e.seconds),segments:segments.length,segment:segIndex,highlightSeconds:Math.round(segments.reduce((n,s)=>n+s.end-s.start,0)),camera:renderer?.cameraState??null})});
  return {open,openBroadcast,message,
    /** Half-time score while the user changes the lineup in the tactics room, else null. */
    get halftime(){return changingLineup&&results[0]&&!halves[1]?{score:results[0].score}:null;},
    setVisible(value){visible=value;if(visible&&!raf){last=performance.now();raf=requestAnimationFrame(frame);}if(!visible){if(raf)cancelAnimationFrame(raf);raf=null;}},
    dispose(){disposed=true;stop();detachInput?.();hudObserver.disconnect();window.removeEventListener('keydown',onKey);renderer?.dispose();repository.close();}};
}
