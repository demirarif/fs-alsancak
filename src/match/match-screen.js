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
import { matchReport, bestOfHalf, portraitOf } from './match-report.js';
import { eventIcon } from './event-icons.js';
import { createMatchAudio } from './match-audio.js';
import { createScorebug } from './scorebug.js';
import { TEAM_PRESENTATION } from '../v1/config/team-presentation.ts';
import { FRAME_HEADER, PLAYER_CHANNELS, SAMPLE_HZ } from '../v1/engine/replay.ts';
import './match.css';
import './match-ui.css';
// Night theme (2026-11-10, chosen from the "Alsancak arayüz önerileri" designs): last, so it restyles the layers above it.
import './match-night.css';
// …and its premium, animated layer (row D of the same designs, the user's "Evet, uygula" on 2026-11-10).
import './match-premium.css';

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
/** A score figure as an odometer: the digits 0…n in a column that rolls up to n (premium theme). */
const odo=n=>`<span class="odo" style="--n:${n}" aria-hidden="true"><span>${Array.from({length:n+1},(_,i)=>`<i>${i}</i>`).join('')}</span></span>`;
const SHOT_KINDS=new Set(['shot','header','penalty']);
/** Full time: confetti in the winners' colours with the lime and white (none for a draw). Positions are fixed, not random. */
function confetti(score){
  if(score[0]===score[1])return '';
  const colors=score[0]>score[1]?['#4f7fd1','#8fb3f0','#2c4f8f','#c8f04a','#f2f4f8']:['#d4587c','#f0a7bb','#8e2747','#c8f04a','#f2f4f8'];
  return `<div class="ft-confetti" aria-hidden="true">${Array.from({length:42},(_,i)=>`<i style="--x:${(i*97+31)%100}%;--d:${(4.4+(i*13%30)/10).toFixed(1)}s;--delay:-${((i*29)%70/10).toFixed(1)}s;--w:${6+i%3*2}px;--h:${10+i%4*3}px;--c:${colors[i%colors.length]};--sway:${(1.4+i%4*.35).toFixed(2)}s"></i>`).join('')}</div>`;
}
/** Possession so far in a half: running counts of the 10 Hz frames each side had the ball, built once per replay. */
const possCache=new WeakMap();
function possessionCounts(r){
  let c=possCache.get(r);if(c)return c;
  const s=FRAME_HEADER+r.playerOrder.length*PLAYER_CHANNELS.length,n=r.frameCount,a=new Uint32Array(n+1),b=new Uint32Array(n+1);
  for(let i=0;i<n;i++){const p=r.samples[i*s+5];a[i+1]=a[i]+(p===0?1:0);b[i+1]=b[i]+(p===1?1:0);}
  c={a,b,at:t=>{const i=Math.max(0,Math.min(n,Math.floor((t-r.startSeconds)*SAMPLE_HZ)+1));return [a[i],b[i]];}};possCache.set(r,c);return c;
}

/** Inventory-style dialog card: wordmark topline, header, body, action footer. */
function card({label,title,lead='',body='',actions='',status=false,wide=false,final=false}){
  return `<div class="match-card${wide?' wide':''}${final?' is-final':''}"><div class="mc-topline"><span class="mc-wordmark">ALSANCAK</span><span class="mc-label">${label}</span></div>
    <div class="mc-header">${title}${lead?`<p>${lead}</p>`:''}</div>${body?`<div class="mc-body">${body}</div>`:''}
    ${actions?`<div class="match-actions">${actions}${status?'<p class="match-export-status" role="status"></p>':''}</div>`:''}</div>`;
}

export function mountMatchScreen(host){
  host.innerHTML=`<div class="match-stage"><div class="match-scene"></div><div class="match-labels" aria-hidden="true"></div>
    <section class="match-scoreboard" aria-live="polite"><span class="sb-mark" aria-hidden="true">A</span><div class="match-team">${shirtIcon(0)}<b data-name="0"></b></div><strong class="match-score"><span class="sb-num" data-team="0">0</span><em>:</em><span class="sb-num" data-team="1">0</span></strong><div class="match-team right"><b data-name="1"></b>${shirtIcon(1)}</div>
      <div class="match-clock"><i class="sb-live" aria-hidden="true"></i><span data-clock>00:00</span><small data-period>1. yarı</small></div><span class="match-onair" hidden>CANLI</span><i class="sb-sheen" aria-hidden="true"></i></section>
    <div class="match-possession" hidden><div class="mp-poss"><b data-poss="0">%50</b><span class="mp-bar" aria-hidden="true"><i data-possbar="0"></i><i data-possbar="1"></i></span><b data-poss="1">%50</b><small>Topa sahip olma</small></div><div class="mp-fact"></div></div>
    <div class="match-lineup" aria-hidden="true"></div>
    <ol class="match-ticker" aria-label="Son olaylar"></ol><section class="match-why" role="dialog" aria-label="Neden oldu?" hidden></section><div class="match-chapter" aria-hidden="true"></div><div class="match-cut" aria-hidden="true"></div><div class="match-blackout on" aria-hidden="true"></div>
    <div class="match-camera"><div class="mc-segmented" role="group" aria-label="Kamera açısı"><button data-preset="broadcast" data-short="TV" class="active" aria-pressed="true">TV yayını</button><button data-preset="wide" data-short="Geniş" aria-pressed="false">Geniş</button><button data-preset="goal" data-short="Kale" aria-pressed="false">Kale arkası</button></div></div>
    <canvas class="match-radar" role="img" aria-label="Mini harita: oyuncuların sahadaki yerleri" hidden></canvas>
    <button class="mc-sound" data-sound aria-pressed="false" aria-label="Sesi kapat" title="Ses"></button>
    <a class="mc-exit" href="#gunun-maci" aria-label="Yayından çık, Günün maçına dön"><svg class="ui-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg></a>
    <button class="mc-golive" data-golive hidden>CANLI'ya dön</button><div class="match-overlay" role="dialog" aria-modal="false" hidden></div></div>
  <footer class="match-controls"><button class="mc-play" data-play aria-label="Duraklat"><span class="mc-play-symbol" aria-hidden="true">${uiIcon('pause')}</span><span class="mc-play-label">Duraklat</span></button>
    <button class="mc-replay" data-replay title="Son pozisyonu yarı hızda tekrar izle" aria-label="Son pozisyonu yarı hızda tekrar izle">${uiIcon('reset')}<span>Son pozisyon</span></button>
    <div class="mc-speeds" role="group" aria-label="İzleme biçimi">${SPEEDS.map(([v,l],i)=>`${i===2?'<i class="mc-speed-divider" aria-hidden="true"></i>':''}<button data-speed="${v}" ${v==='h10'?'class="active" aria-pressed="true"':'aria-pressed="false"'} ${BUDGET[v]?'title="Önemli anlar gerçek hızda"':''}>${l}</button>`).join('')}</div>
    <div class="match-timeline"><input type="range" data-timeline min="0" max="1800" step="1" value="0" aria-label="Yarı içinde zaman"/><div class="match-marks" aria-hidden="true"></div></div>
    <button class="match-skip" data-skip><span>Devre arasına geç</span>${uiIcon('skipForward')}</button></footer>`;
  const $=s=>host.querySelector(s),$$=s=>host.querySelectorAll(s),overlay=$('.match-overlay'),blackout=$('.match-blackout');
  let context=null,draft=null,snapshot=null,renderer=null,worker=null,runId=0,halves=[null,null],results=[null,null],carry=null,lineups=null;
  let whyResume=false,half=1,t=0,playing=true,speed='h10',raf=null,last=performance.now(),visible=false,seeked=true,detachInput=null,chapterUntil=0,disposed=false,exporting=false;
  // phase: walk-out while the worker computes, then play. Highlights: segments of the current half and the one on screen.
  let phase='idle',walkT=0,segments=[],segIndex=0,nameOf=()=>'',stops=[];
  // A replay in progress: play up to `to` at REPLAY_RATE, then go back to where the viewer was.
  let replay=null;
  // Goal replay (2026-11-09): due a moment after a goal; while it plays the camera is on another angle, given back once no replay runs.
  let autoReplay=null,replayCamera=null;
  // Set when the user leaves for the tactics room at half time; the next open() plays the second half with the saved lineup.
  let changingLineup=false;
  // Online broadcast (user decision 2026-11-05): mode 'broadcast' plays a downloaded recording; while `bcast.live` the picture follows
  // the server clock (everybody at the same moment). Pausing or a replay leaves live play; "CANLI'ya dön" rejoins it.
  let mode='local',bcast=null;
  // Premium theme: the score the scoreboard shows (its digits roll when a goal goes in), the strip under it that flips between facts, and
  // the half-time replays playing in the L screen's picture.
  const shownScore=[null,null];let flapAt=0,flapIndex=-1,intermission=null;
  // Score bug (2026-11-10, FC theme; user: "sol üstte skor tabelası goool olsun sonra kırmızı takım animasyonu girip 3-1'den 3-2 olsun"):
  // top left, in place of the old scoreboard. A goal plays on it — the side's colour, its mascot, GOOOOL, the scorer — and the number
  // rolls. While a goal is playing (bugGoals) the bug keeps its own score; during a replay it keeps the score as it stands.
  const FC_SIDES={'team-1':['#2b7bff','#7fb4ff'],'team-2':['#ff3b55','#ff9aa8']};
  const bug=createScorebug($('.match-stage'),{teams:['team-1','team-2'].map(id=>({code:TEAM_PRESENTATION[id].name.slice(0,3).toLocaleUpperCase('tr'),color:FC_SIDES[id][0],light:FC_SIDES[id][1]}))});
  let bugGoals=0;
  /** Which side has the ball at match time t (0, 1, or -1 when nobody does), from the replay's own possession channel. */
  const possessionAt=(r,t)=>{const s=FRAME_HEADER+r.playerOrder.length*PLAYER_CHANNELS.length,i=Math.max(0,Math.min(r.frameCount-1,Math.floor((t-r.startSeconds)*SAMPLE_HZ))),p=r.samples[i*s+5];return p===0||p===1?p:-1;};
  const repository=createLineupRepository();
  // Sound (2026-11-10): crowd, whistle, ball and the referee's voice calls; browsers allow it after the first click or key.
  const audio=createMatchAudio();
  const SOUND_ON='<svg class="ui-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 7.5h3l4-3.5v12l-4-3.5h-3z"/><path d="M13.5 7a4 4 0 0 1 0 6M15.5 5a7 7 0 0 1 0 10"/></svg>',SOUND_OFF='<svg class="ui-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 7.5h3l4-3.5v12l-4-3.5h-3z"/><path d="m13.5 8 4 4m0-4-4 4"/></svg>';
  function soundButton(){const b=$('[data-sound]');b.innerHTML=audio.muted?SOUND_OFF:SOUND_ON;b.setAttribute('aria-pressed',String(audio.muted));b.setAttribute('aria-label',audio.muted?'Sesi aç':'Sesi kapat');b.classList.toggle('is-off',audio.muted);}
  soundButton();
  host.addEventListener('pointerdown',()=>audio.unlock(),{capture:true});

  function status(html){intermission=null;hideLineups();audio.hush();$('.match-radar').hidden=true;overlay.hidden=false;overlay.innerHTML=html;replay=null;transport();}
  /** The scoreboard's figures; with `animate` (a goal in normal play) the changed one rolls up from the old figure. */
  function setScore(score,animate=false){
    for(const i of [0,1]){
      const n=score[i],from=shownScore[i];if(n===from)continue;shownScore[i]=n;const el=$(`.sb-num[data-team="${i}"]`);clearTimeout(el.rollTimer);
      if(animate&&from!==null&&n===from+1){el.innerHTML=`<span class="sb-roll"><i>${from}</i><i>${n}</i></span>`;el.rollTimer=setTimeout(()=>{el.textContent=String(n);},900);}
      else el.textContent=String(n);
    }
  }
  const scorerName=e=>e.outcome==='own-goal'?'Kendi kalesine':nameOf(e.actorId)??goalText(e).split(' · ')[0];
  /** Transport follows the state: nothing to play under a half-time / full-time card, no seeking or replay during the walk-out. */
  function transport(){const card=!overlay.hidden,live=phase==='play'&&!card,locked=mode==='broadcast'&&(!broadcastOver()||bcast.trimmed);if(card){$('.match-why').hidden=true;whyResume=false;}$('[data-play]').disabled=card;$('[data-skip]').disabled=!live||locked;$('[data-replay]').disabled=!live;$('[data-timeline]').disabled=!live||locked;
    // During the broadcast nobody skips ahead or changes the edit: it is the same programme for everybody until it has ended.
    $$('[data-speed]').forEach(b=>{b.disabled=locked;});$('[data-golive]').hidden=!(mode==='broadcast'&&!bcast.live&&!broadcastOver());$('.match-onair').hidden=!(mode==='broadcast'&&bcast.live);$('.match-scoreboard').classList.toggle('is-live',mode==='broadcast'&&!!bcast?.live);}
  const broadcastOver=()=>mode==='broadcast'&&(bcast.clock()-bcast.kickoffAt)/1000>=bcast.plan.total;
  function teamName(i){return mode==='broadcast'?bcast.names[i]:context.selection.teams[i].name;}
  /** A team's goals scorer by scorer ("Barkuz 10' 29' 32'"), as the night theme's card header lists them (2026-11-10). */
  function goalsBy(team,upTo){
    const by=new Map();
    for(const e of halves.slice(0,upTo).filter(Boolean).flatMap(h=>h.events.filter(x=>x.kind==='goal'&&x.teamId===`team-${team+1}`))){
      const who=scorerName(e);by.set(who,[...(by.get(who)??[]),minute(e.seconds)]);}
    return [...by].map(([who,ms])=>`<span><b>${esc(who)}</b> ${ms.join(' ')}</span>`).join('');
  }
  /** Card header: each team on its kit colour with its scorers, the score between them (the half-time score under a full-time one).
   * Premium theme: the figures roll up from 0 and the winners carry a "Kazanan" tag. */
  function scoreRow(score,upTo=2){
    const win=score[0]===score[1]?-1:score[0]>score[1]?0:1;
    const text=i=>`<div class="mc-side-text">${win===i?'<span class="mc-win">Kazanan</span>':''}<b>${esc(teamName(i))}</b><span class="mc-goals">${goalsBy(i,upTo)}</span></div>`;
    const ht=upTo===2&&results[0]?`<small>İlk yarı ${results[0].score[0]}:${results[0].score[1]}</small>`:'';
    return `<div class="mc-score-row"><div class="mc-side">${shirtIcon(0)}${text(0)}</div><div class="mc-score-box"><strong class="mc-score"><span class="mc-sr">${score[0]}:${score[1]}</span>${odo(score[0])}<em aria-hidden="true">:</em>${odo(score[1])}</strong>${ht}</div><div class="mc-side right">${text(1)}${shirtIcon(1)}</div></div>`;
  }
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
    const id=++runId;half=h;playing=true;setPlayIcon();overlay.hidden=true;phase='walkout';walkT=0;seeked=true;replay=null;intermission=null;transport();
    blackout.classList.add('on');$('.match-ticker').innerHTML='';$('.match-marks').innerHTML='';$('.match-possession').hidden=true;
    const score=h===1?[0,0]:results[0].score;setScore(score);$('[data-clock]').textContent=h===1?'00:00':'30:00';$('[data-period]').textContent=h===1?'1. yarı':'2. yarı';
    if(h===1)showLineups(lineups);else hideLineups();
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
    half=h;const r=halves[h-1];phase='play';blackout.classList.remove('on');overlay.hidden=true;playing=true;setPlayIcon();cut();replay=null;autoReplay=null;intermission=null;flapAt=0;flapIndex=-1;hideLineups();transport();
    editSegments();stops=stopsOf(h);segIndex=0;t=highlighting()?segments[0].start:r.startSeconds;seeked=true;
    $('[data-timeline]').min=String(r.startSeconds);$('[data-timeline]').max=String(r.endSeconds);$('[data-period]').textContent=h===1?'1. yarı':'2. yarı';
    bug.intro();$('.match-ticker').innerHTML='';{const skip=h===1?'Devre arasına geç':'Maç sonuna geç';$('[data-skip] span').textContent=skip;$('[data-skip]').title=skip;$('[data-skip]').setAttribute('aria-label',skip);}
    if(highlighting())chapter();
    if(visible&&!raf){last=performance.now();raf=requestAnimationFrame(frame);}
  }
  function stop(){if(raf)cancelAnimationFrame(raf);raf=null;worker?.terminate();worker=null;}
  function setPlayIcon(){$('.match-scoreboard').classList.toggle('is-paused',!playing);$('.mc-play-symbol').innerHTML=uiIcon(playing?'pause':'play');$('.mc-play-label').textContent=playing?'Duraklat':'Devam et';$('[data-play]').setAttribute('aria-label',playing?'Duraklat':'Devam et');$('[data-play]').classList.toggle('is-paused',!playing);}
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
  /** After a goal, once: from the build-up to the net again at half speed from another angle (behind the goal, or the TV camera if that
   * is the one on), as on TV; then back to the celebration. Not during the live broadcast, which everybody watches at the same moment. */
  function goalReplay(g){
    const r=halves[half-1];if(!r)return;
    const on=host.querySelector('[data-preset].active')?.dataset.preset??'broadcast',angle=on==='goal'?'broadcast':'goal';
    replay={to:Math.min(r.endSeconds,g.seconds+1.2),returnT:t};t=Math.max(r.startSeconds,g.seconds-4.5);seeked=true;cut();
    replayCamera=on;renderer?.setCamera({kind:'set-preset',preset:angle});
    const el=$('.match-chapter');el.textContent='GOL TEKRARI · 0,5×';el.classList.add('on');chapterUntil=performance.now()+2600;
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
      const step=playing?real:0;walkT+=step;audio.frame({x:0},real,{playing:true});renderer.render(walkoutState(lineups,walkT,half===1?[0,0]:results[0].score),{realDt:real,simDt:seeked?0:step,seeked,pose:walkoutPose(walkT)});
      // The first walk-out frame is on screen: fade up from black.
      if(seeked)blackout.classList.remove('on');seeked=false;
      if(halves[half-1]&&walkT>=WALKOUT_MIN_SECONDS)startHalf(half);
      raf=requestAnimationFrame(frame);return;
    }
    // Half time: the L screen's picture keeps replaying the half's goals.
    if(intermission&&!overlay.hidden){intermissionStep(real);raf=requestAnimationFrame(frame);return;}
    const r=phase==='play'?halves[half-1]:null;if(!r){raf=requestAnimationFrame(frame);return;}
    if(autoReplay&&t>=autoReplay.t){const g=autoReplay.goal;autoReplay=null;if(playing&&overlay.hidden&&!replay&&r.events.includes(g))goalReplay(g);}
    // However the replay ended (played out, a seek, a speed change, the half's end), the viewer's camera comes back.
    if(replayCamera&&!replay){renderer?.setCamera({kind:'set-preset',preset:replayCamera});replayCamera=null;}
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
    hud(state,r,jumped?t:prev,jumped);
    if(chapterUntil&&performance.now()>chapterUntil){$('.match-chapter').classList.remove('on');chapterUntil=0;}
    if(t>=r.endSeconds&&moving)endOfHalf();
    raf=requestAnimationFrame(frame);
  }
  const countdown=s=>{const n=Math.max(0,Math.ceil(s));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;};
  /** One frame of the live broadcast: what is on air now, from the server clock. */
  function liveFrame(real){
    const at=broadcastAt(bcast.plan,(bcast.clock()-bcast.kickoffAt)/1000);
    if(at.key!==bcast.key){bcast.key=at.key;enterPart(at);}
    if(at.kind==='before'||at.kind==='halftime'){const el=overlay.querySelector('[data-countdown]');if(el)el.textContent=countdown(at.remaining);if(intermission)intermissionStep(real);return;}
    if(at.kind==='walkout'){walkT=at.offset;renderer.render(walkoutState(at.half===1?snapshot.lineups:lineups,walkT,at.half===1?[0,0]:results[0].score),{realDt:real,simDt:real,seeked:false,pose:walkoutPose(walkT)});return;}
    if(at.kind==='end'){bcast.live=false;bcast.overSeen=true;phase='play';half=2;t=halves[1].endSeconds;endOfHalf();return;}
    const r=halves[at.half-1],prev=t,jump=at.piece!==bcast.piece||seeked;
    if(at.piece!==bcast.piece){if(bcast.piece>=0&&at.cut)cut();bcast.piece=at.piece;segIndex=at.seg;if(at.segStart)chapter();}
    t=at.t;const state=sampleReplay(r,t);renderer.render(state,{realDt:real,simDt:jump?0:Math.max(0,t-prev),events:r.events,seeked:jump});seeked=false;
    hud(state,r,jump?t:prev,jump);
    if(chapterUntil&&performance.now()>chapterUntil){$('.match-chapter').classList.remove('on');chapterUntil=0;}
  }
  function enterPart(at){
    overlay.hidden=true;intermission=null;
    if(at.kind==='before'){phase='idle';blackout.classList.add('on');status(card({label:'Canlı yayın',title:'<h2>Maç birazdan başlıyor</h2>',lead:'Başlamasına <b data-countdown></b>'}));return;}
    if(at.kind==='walkout'){phase='walkout';half=at.half;blackout.classList.remove('on');$('.match-ticker').innerHTML='';$('.match-marks').innerHTML='';const score=at.half===1?[0,0]:results[0].score;
      setScore(score);$('[data-clock]').textContent=at.half===1?'00:00':'30:00';$('[data-period]').textContent=at.half===1?'1. yarı':'2. yarı';if(at.half===1)showLineups(snapshot.lineups);else hideLineups();transport();return;}
    if(at.kind==='half'){half=at.half;phase='play';blackout.classList.remove('on');hideLineups();flapAt=0;flapIndex=-1;const r=halves[half-1];editSegments();stops=stopsOf(half);segIndex=0;bcast.piece=-1;seeked=true;
      $('[data-timeline]').min=String(r.startSeconds);$('[data-timeline]').max=String(r.endSeconds);$('[data-period]').textContent=half===1?'1. yarı':'2. yarı';$('.match-ticker').innerHTML='';transport();return;}
    if(at.kind==='halftime'){phase='play';half=1;t=halves[0].endSeconds;halftime({lead:'İkinci yarı <b data-countdown></b> sonra başlıyor.'});}
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
  /** What the strip under the scoreboard can say now (premium theme): possession, then facts from the match so far — the half-time
   * score, the goals of the last ten minutes, a man with two or more, the shots. All from the engine's events up to this moment. */
  function flapFacts(r,at,poss){
    const past=[...(half===2&&halves[0]?halves[0].events:[]),...r.events.filter(e=>e.seconds<=at)],goals=past.filter(e=>e.kind==='goal'),out=poss?['poss']:[];
    const fact=(label,value,more='')=>`<span>${esc(label)}</span><b>${esc(value)}</b>${more?`<em>${esc(more)}</em>`:''}`;
    if(half===2&&results[0])out.push(fact('İlk yarı',`${results[0].score[0]} : ${results[0].score[1]}`));
    const recent=goals.filter(e=>e.seconds>at-600);if(recent.length)out.push(fact('Son 10 dakika',`${recent.length} gol`,recent.slice(-3).map(e=>`${minute(e.seconds)} ${scorerName(e)}`).join(' · ')));
    const by=new Map();for(const e of goals)if(e.outcome!=='own-goal'&&e.actorId)by.set(e.actorId,[...(by.get(e.actorId)??[]),e]);
    const top=[...by.values()].sort((a,b)=>b.length-a.length)[0];if(top?.length>=2)out.push(fact(scorerName(top[0]),`${top.length} gol`,top.map(e=>minute(e.seconds)).join(' ')));
    // The trimmed live copy holds only the edit's moments: its shots would undercount.
    if(!(mode==='broadcast'&&bcast?.trimmed)){const shots=[0,0];for(const e of past)if(SHOT_KINDS.has(e.kind)&&e.outcome)shots[e.teamId==='team-2'?1:0]++;if(shots[0]+shots[1])out.push(fact('Şutlar',`${shots[0]} : ${shots[1]}`));}
    return out;
  }
  /** The radar (2026-11-10, user: "aşağıda fifada olduğu gibi mini map hangi oyuncu nerde o gözüksün"): the pitch from above as the
   * TV camera sees it (one goal left, the other right, the main stand at the bottom), a dot per player in his side's colour, a white ring
   * round the man on the ball, the ball itself. Hidden while the goal sting plays and on the cards. */
  const RADAR=[FC_SIDES['team-1'][0],FC_SIDES['team-2'][0]];
  function drawRadar(state){
    const c=$('.match-radar'),hide=!overlay.hidden;c.hidden=hide;if(hide)return;
    const dpr=Math.min(2,window.devicePixelRatio||1),w=c.clientWidth,h=c.clientHeight;if(!w||!h)return;
    if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}
    const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
    const pad=5,sx=(w-2*pad)/105,sz=(h-2*pad)/68,X=x=>pad+(x+52.5)*sx,Z=z=>pad+(z+34)*sz,TAU=Math.PI*2;
    g.strokeStyle='rgba(255,255,255,.42)';g.lineWidth=1;
    g.strokeRect(X(-52.5)+.5,Z(-34)+.5,105*sx-1,68*sz-1);g.beginPath();g.moveTo(X(0)+.5,Z(-34));g.lineTo(X(0)+.5,Z(34));g.stroke();
    g.beginPath();g.arc(X(0),Z(0),9.15*sx,0,TAU);g.stroke();
    for(const e of [-1,1]){g.strokeRect(e<0?X(-52.5)+.5:X(36),Z(-20.16),16.5*sx,40.32*sz);g.strokeRect(e<0?X(-52.5)+.5:X(47),Z(-9.16),5.5*sx,18.32*sz);
      g.fillStyle='rgba(255,255,255,.7)';g.fillRect(e<0?X(-52.5)-2:X(52.5),Z(-3.66),2,7.32*sz);}
    const b=state.ball,held=b.state===2||b.state===3;let carrier=null,cd=1.3;
    if(held)for(const p of state.players){const d=Math.hypot(p.x-b.x,p.z-b.z);if(d<cd){cd=d;carrier=p;}}
    for(const p of state.players){
      g.beginPath();g.arc(X(p.x),Z(p.z),3.3,0,TAU);g.fillStyle=RADAR[p.team]??'#ccc';g.fill();g.lineWidth=1;g.strokeStyle='rgba(8,10,14,.85)';g.stroke();
      if(p===carrier){g.beginPath();g.arc(X(p.x),Z(p.z),5.6,0,TAU);g.strokeStyle='#fff';g.lineWidth=1.4;g.stroke();}
    }
    g.beginPath();g.arc(X(b.x),Z(b.z),2.2,0,TAU);g.fillStyle='#fff';g.fill();g.lineWidth=1;g.strokeStyle='#0b0d10';g.stroke();
  }
  function hud(state,r,prev,jumped=false){
    drawRadar(state);
    setScore(state.score,!jumped&&!replay);$('[data-clock]').textContent=clock(Math.min(r.endSeconds,state.t));
    bug.set({clock:clock(Math.min(r.endSeconds,state.t)),period:half===2?'2Y':'1Y',possession:possessionAt(r,state.t),score:bugGoals||replay?undefined:state.score});
    const tl=$('[data-timeline]');if(document.activeElement!==tl){tl.value=String(state.t);tl.style.setProperty('--progress',`${(state.t-r.startSeconds)/(r.endSeconds-r.startSeconds)*100}%`);}
    // Possession so far, under the scoreboard (night theme): the whole match up to this moment. The broadcast's trimmed live copy holds
    // only the edit's moments, so it would mislead there and is left out. Every 6 s the strip flips to the next fact (premium theme).
    const pe=$('.match-possession'),showPoss=!(mode==='broadcast'&&bcast?.trimmed),now=performance.now();
    if(now>=flapAt){flapAt=now+6000;const facts=flapFacts(r,state.t,showPoss);pe.hidden=!facts.length;
      if(facts.length){flapIndex=(flapIndex+1)%facts.length;const f=facts[flapIndex],fact=f!=='poss',was=pe.classList.contains('is-fact');
        if(fact)pe.querySelector('.mp-fact').innerHTML=f;
        if(fact||was){pe.classList.toggle('is-fact',fact);pe.classList.remove('is-flip');void pe.offsetWidth;pe.classList.add('is-flip');}}}
    if(showPoss&&!pe.classList.contains('is-fact')){let [a,b]=possessionCounts(r).at(state.t);if(half===2&&halves[0]){const h=possessionCounts(halves[0]);a+=h.a[h.a.length-1];b+=h.b[h.b.length-1];}
      const p0=Math.round(a/Math.max(1,a+b)*100);$('[data-poss="0"]').textContent=`%${p0}`;$('[data-poss="1"]').textContent=`%${100-p0}`;
      $('[data-possbar="0"]').style.flexGrow=String(p0);$('[data-possbar="1"]').style.flexGrow=String(100-p0);}
    // Sound: the events just crossed in normal play (not after a jump), the crowd following the ball. half: the commentator tells the
    // second half's kick-off from the first (each half's replay starts at 0 s).
    if(!jumped){const crossed=r.events.filter(e=>e.seconds>prev&&e.seconds<=state.t);if(crossed.length)audio.events(crossed,{live:!replay,speed:highlighting()?1:speed,half});}
    audio.frame(state.ball,1/60,{playing});
    const fresh=replay?[]:r.events.filter(e=>e.seconds>prev&&e.seconds<=state.t&&e.importance>=.3);
    // Feed (2026-11-09): an icon for what happened (goal, saved, wide, corner, foul, dribble…) in the team's colour, four lines.
    if(fresh.length){const list=$('.match-ticker');for(const e of fresh){const line=commentary(e,nameOf);if(!line)continue;const li=document.createElement('li');li.className=`${e.kind==='goal'?'is-goal':''} ${e.teamId==='team-2'?'red':e.teamId?'blue':'neutral'}`;li.innerHTML=`<button type="button" data-why="${e.id}" title="Neden oldu?"><i class="ev">${eventIcon(e)}</i><b>${minute(e.seconds)}</b><span>${esc(line)}</span></button>`;list.prepend(li);}while(list.children.length>4)list.lastChild.remove();}
    const goal=fresh.find(e=>e.kind==='goal');
    if(goal){const team=goal.teamId==='team-2'?1:0,[who]=goalText(goal).split(' · ');
      // The score with this goal in it, from the goals so far (the 10 Hz frame can still show the score from just before the ball went in).
      const sc=[0,0];for(const e of halves.filter(Boolean).flatMap(h=>h.events))if(e.kind==='goal'&&e.seconds<=goal.seconds)sc[e.teamId==='team-2'?1:0]++;
      bugGoals++;bug.goal({team,scorer:who,minute:minute(goal.seconds),score:sc}).then(()=>{bugGoals--;});
      // The replay waits for the celebration (team-mates reaching the scorer), as on TV: 4.6 s of match time after the goal.
      if(!replay&&(highlighting()||speed<=1)&&!(mode==='broadcast'&&bcast?.live))autoReplay={t:goal.seconds+4.6,goal};}
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
    const facts=[r.successProbability!==undefined?`Tahmini olasılık %${Math.round(r.successProbability*100)}`:'',r.pressure>0?`Baskı %${Math.round(r.pressure*100)}`:'',r.distanceMeters>0?`${r.distanceMeters.toFixed(0)} m`:'',e.outcome?`Sonuç: ${({goal:'gol',save:'kurtarış',parry:'çelme',wide:'auta',post:'direk',block:'blok',header:'kafa',shot:'şut',penalty:'penaltı','own-goal':'kendi kalesine',ricochet:'sekme',deflection:'sekme',touch:'değme',spill:'elinden kaçtı',catch:'tuttu'})[e.outcome]??e.outcome}`:''].filter(Boolean);
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
    // Night theme: one tile per figure, the two teams' numbers large on either side, the share as a bar under them.
    let k=0;const row=(label,a,b,va,vb)=>`<div class="mc-stat" style="--i:${k++}"><span class="mc-stat-label">${label}</span><div class="mc-stat-values"><b>${a}</b><b>${b}</b></div><i style="--share:${(va+vb?va/(va+vb)*100:50).toFixed(1)}%"></i></div>`;
    const p0=pct(s[0].possession,s[1].possession),acc=i=>Math.round(s[i].completed/Math.max(1,s[i].passes)*100);
    return `<div class="mc-stats">${row('Topa sahip olma',`%${p0}`,`%${100-p0}`,p0,100-p0)}${row('Şut (isabet)',`${s[0].shots} (${s[0].onTarget})`,`${s[1].shots} (${s[1].onTarget})`,s[0].shots,s[1].shots)}${row('Pas isabeti',`%${acc(0)}`,`%${acc(1)}`,acc(0),acc(1))}${row('Korner',s[0].corners,s[1].corners,s[0].corners,s[1].corners)}${row('Faul',s[0].fouls,s[1].fouls,s[0].fouls,s[1].fouls)}${row('Kurtarış',s[0].saves,s[1].saves,s[0].saves,s[1].saves)}</div>`;
  }
  /** Goal flow (night theme, 2026-11-10): the match's minutes as a line, Mavi's goals above it and Kırmızı's below, the break at 30'.
   * Who scored and how (assist, header) stays on each mark's tooltip and in the line read out to screen readers. */
  function scorers(upTo=2){
    const goals=halves.slice(0,upTo).filter(Boolean).flatMap(h=>h.events.filter(e=>e.kind==='goal')),span=upTo*1800,end=upTo===2?"30' — 60'":"30'";
    const title=`<p class="mc-flow-title"><span>Maç akışı · goller</span><span>0' — ${end}</span></p>`;
    if(!goals.length)return `<div class="mc-flow is-scoreless">${title}<p class="none">Gol yok</p></div>`;
    const mark=(e,k)=>`<i class="${e.teamId==='team-2'?'red':'blue'}" style="left:${Math.min(100,e.seconds/span*100).toFixed(2)}%;--i:${k}" title="${esc(`${minute(e.seconds)} ${goalText(e)}`)}"><b>${minute(e.seconds)}</b></i>`;
    return `<div class="mc-flow">${title}<div class="mc-flow-line" role="img" aria-label="${esc('Goller: '+goals.map(e=>`${minute(e.seconds)} ${goalText(e)}`).join(', '))}">${upTo===2?'<span class="ht" aria-hidden="true"></span>':''}${goals.map(mark).join('')}</div></div>`;
  }
  /** Full-time report: man of the match, ratings and the shot map (match-report.js). A keeper is whoever played in goal (Barkuz too). */
  function reportPlayers(){
    const gk=new Set([snapshot.lineups,lineups].filter(Boolean).flatMap(ls=>ls.flatMap(l=>l.assignments.filter(a=>FORMATIONS[l.formationId]?.slots.find(s=>s.id===a.slotId)?.position==='GK').map(a=>a.playerId))));
    return snapshot.players.map(p=>({id:p.id,name:p.name,keeper:gk.has(p.id)}));
  }
  function report(){return matchReport({results,halves,players:reportPlayers()});}

  /** Half-time "L" screen (premium theme, 2026-11-10, after the broadcasters' L-shape): the picture shrinks to the top left and keeps
   * replaying the half's goals; the score, the goal difference, three figures and the half's best player on the right; the half's goals
   * along the bottom with the way on (buttons, or the live countdown). */
  function halftimeScreen({actions='',lead=''}){
    const score=results[0].score,s=results[0].teamStats,goals=halves[0].events.filter(e=>e.kind==='goal');
    const pct=(a,b)=>Math.round(a/Math.max(1,a+b)*100),p0=pct(s[0].possession,s[1].possession),acc=i=>Math.round(s[i].completed/Math.max(1,s[i].passes)*100);
    const bar=(label,a,b,va,vb,i)=>`<div class="ls-stat" style="--i:${i}"><b>${a}</b><span>${label}</span><b>${b}</b><i style="--share:${(va+vb?va/(va+vb)*100:50).toFixed(1)}%"></i></div>`;
    return `<div class="ls-screen" role="dialog" aria-label="Devre arası">
      <p class="ls-replay" aria-hidden="true"><span><i></i>Tekrar</span><b data-ls-caption>İlk yarıdan</b></p>
      <aside class="ls-side">
        <header><span class="ls-live"><i></i>Devre arası</span><span>İlk yarı · 30'</span></header>
        <div class="ls-score"><b class="blue">${esc(teamName(0))}</b><strong><span class="mc-sr">${score[0]}:${score[1]}</span>${odo(score[0])}<em aria-hidden="true">:</em>${odo(score[1])}</strong><b class="red">${esc(teamName(1))}</b></div>
        ${diffChart(goals)}
        <div class="ls-stats">${bar('Topa sahip olma',`%${p0}`,`%${100-p0}`,p0,100-p0,0)}${bar('Şut (isabet)',`${s[0].shots} (${s[0].onTarget})`,`${s[1].shots} (${s[1].onTarget})`,s[0].shots,s[1].shots,1)}${bar('Pas isabeti',`%${acc(0)}`,`%${acc(1)}`,acc(0),acc(1),2)}</div>
        ${halfStar()}
      </aside>
      <section class="ls-bottom">${goalTrack(goals)}<div class="ls-next">${lead?`<p>${lead}</p>`:''}${actions?`<div class="ls-actions">${actions}</div>`:''}</div></section></div>`;
  }
  /** The goal difference through the half as a step line, above the middle while Mavi lead, below while Kırmızı do. */
  function diffChart(goals){
    const title=`<p class="ls-title"><span>Gol farkı</span><span>0' — 30'</span></p>`;
    if(!goals.length)return `<div class="ls-chart is-empty">${title}<p class="ls-none">İlk yarıda gol yok</p></div>`;
    let d=0,max=1;const pts=[[0,0]],dots=[];
    for(const e of goals){pts.push([e.seconds,d]);d+=e.teamId==='team-2'?-1:1;pts.push([e.seconds,d]);dots.push([e.seconds,d,e.teamId==='team-2'?'red':'blue']);max=Math.max(max,Math.abs(d));}
    pts.push([1800,d]);
    const W=300,H=96,mid=H/2,k=(mid-10)/max,x=sec=>(Math.min(1800,sec)/1800*W).toFixed(1),y=v=>(mid-v*k).toFixed(1);
    const line=pts.map(([sec,v],i)=>`${i?'L':'M'}${x(sec)},${y(v)}`).join(' '),area=`M0,${mid} ${pts.map(([sec,v])=>`L${x(sec)},${y(v)}`).join(' ')} L${W},${mid} Z`;
    return `<div class="ls-chart">${title}<svg viewBox="-6 0 312 ${H}" role="img" aria-label="Gol farkı, ilk yarı"><defs><clipPath id="ls-up"><rect x="-6" width="312" height="${mid}"/></clipPath><clipPath id="ls-down"><rect x="-6" y="${mid}" width="312" height="${mid}"/></clipPath></defs>
      <line class="zero" x1="0" y1="${mid}" x2="${W}" y2="${mid}"/><path class="up" d="${area}" clip-path="url(#ls-up)"/><path class="down" d="${area}" clip-path="url(#ls-down)"/>
      <path class="line" d="${line}" pathLength="1"/>${dots.map(([sec,v,c],i)=>`<circle class="${c}" cx="${x(sec)}" cy="${y(v)}" r="5" style="--i:${i}"/>`).join('')}</svg></div>`;
  }
  /** The half's goals on its 30 minutes: Mavi's above the line, Kırmızı's below; a label moves out to a side's next row (up to three)
   * while the nearer one is still taken (widths estimated, ~9 px a letter; phones show the minutes only). */
  function goalTrack(goals){
    const title=`<p class="ls-title"><span>İlk yarının golleri</span><span>0' — 30'</span></p>`;
    if(!goals.length)return `<div class="ls-goals">${title}<p class="ls-none">İlk yarıda gol yok</p></div>`;
    const W=$('.match-stage').clientWidth,phone=W<=720,trackW=phone?W-60:Math.max(300,W-360),ends=[[-1e9,-1e9,-1e9],[-1e9,-1e9,-1e9]],rows=[1,1];
    const marks=goals.map((e,i)=>{const side=e.teamId==='team-2'?1:0,left=Math.min(100,e.seconds/1800*100),who=scorerName(e),x=left/100*trackW,w=(minute(e.seconds).length+(phone?0:1+who.length))*9+8,end=left>78;
      const from=end?x-w:x,free=ends[side].findIndex(v=>v+8<=from),lane=free>=0?free:ends[side].indexOf(Math.min(...ends[side]));ends[side][lane]=end?x:x+w;rows[side]=Math.max(rows[side],lane+1);
      return `<i class="${side?'red':'blue'} lane-${lane}${end?' end':''}" style="left:${left.toFixed(2)}%;--i:${i}"><b>${minute(e.seconds)} <span>${esc(who)}</span></b></i>`;}).join('');
    return `<div class="ls-goals">${title}<div class="ls-track" style="--up:${rows[0]};--down:${rows[1]}" role="img" aria-label="${esc('İlk yarının golleri: '+goals.map(e=>`${minute(e.seconds)} ${scorerName(e)}`).join(', '))}"><span class="ls-fill"></span>${marks}</div></div>`;
  }
  /** The half's best-rated player with his photo (or his team's shirt). */
  function halfStar(){
    const p=bestOfHalf({result:results[0],players:reportPlayers()});if(!p)return '';const face=portraitOf(p.id);
    return `<div class="ls-star ${p.team?'red':'blue'}"><span class="ls-face">${face?`<img src="${face}" alt="">`:shirtIcon(p.team)}</span><div><small>İlk yarının adamı</small><b>${esc(p.name)}</b>${p.line?`<span>${esc(p.line)}</span>`:''}</div><em>${p.rating.toFixed(1).replace('.',',')}</em></div>`;
  }
  /** Where the L screen puts the picture: as large as the stage allows with the side panel and the bottom strip around it. */
  function layoutL(){
    const st=$('.match-stage'),W=st.clientWidth,H=st.clientHeight;if(!W||!H)return;
    const g=W<1100?14:20,P=Math.min(400,Math.max(290,W*.27)),B=Math.max(140,Math.min(180,H*.23)),s=Math.max(.35,Math.min((W-P-3*g)/W,(H-B-3*g)/H));
    st.style.setProperty('--ls-s',s.toFixed(4));st.style.setProperty('--ls-g',`${g}px`);st.style.setProperty('--ls-sw',`${(W*s).toFixed(1)}px`);st.style.setProperty('--ls-sh',`${(H*s).toFixed(1)}px`);
  }
  function halftime(opts){status(halftimeScreen(opts));layoutL();startIntermission();}
  /** The half-time replays: each goal of the half from its build-up (or, with none, its biggest moments) in a loop. */
  function startIntermission(){
    const r=halves[0];if(!r||!renderer)return;
    const picks=r.events.filter(e=>e.kind==='goal'),moments=picks.length?picks:r.events.filter(e=>e.importance>=.6).slice(-3);
    const clips=moments.map(e=>({from:Math.max(r.startSeconds,e.seconds-5),to:Math.min(r.endSeconds,e.seconds+1.5),e}));
    if(!clips.length)clips.push({from:Math.max(r.startSeconds,r.endSeconds-10),to:r.endSeconds,e:null});
    intermission={r,clips,i:0,t:clips[0].from,fresh:true};intermissionCaption();
  }
  function intermissionCaption(){
    const el=overlay.querySelector('[data-ls-caption]'),e=intermission?.clips[intermission.i].e;if(!el)return;
    el.textContent=e?`İlk yarıdan · ${minute(e.seconds)} ${e.kind==='goal'?scorerName(e):(nameOf(e.actorId)??'')}`.trim():'İlk yarıdan';
  }
  function intermissionStep(real){
    const it=intermission,c=it.clips[it.i],step=it.fresh?0:real;it.t+=step;
    if(it.t>=c.to){it.i=(it.i+1)%it.clips.length;it.t=it.clips[it.i].from;it.fresh=true;intermissionCaption();}
    renderer.render(sampleReplay(it.r,it.t),{realDt:real,simDt:it.fresh?0:step,events:it.r.events,seeked:it.fresh});it.fresh=false;
  }
  /** Walk-out (premium theme): both first elevens beside the tunnel, man by man, with their photos where there are any. */
  function showLineups(ls){
    const el=$('.match-lineup');if(!ls)return;
    const side=i=>{const l=ls[i],f=FORMATIONS[l.formationId],by=new Map(l.assignments.map(a=>[a.slotId,a.playerId]));
      const rows=(f?.slots??[]).filter(s=>by.has(s.id)).map((s,k)=>{const id=by.get(s.id),face=portraitOf(id);
        return `<li style="--i:${k}"><i class="ml-face">${face?`<img src="${face}" alt="">`:''}</i><b>${esc(nameOf(id)??'')}</b><span>${esc(s.label)}</span></li>`;}).join('');
      return `<section class="ml-team ${i?'red':'blue'}"><header><small>İlk 11</small><b>${esc(teamName(i))}</b><span>${esc(f?.label??l.formationId)}</span></header><ol>${rows}</ol></section>`;};
    el.innerHTML=side(0)+side(1);el.classList.remove('on');void el.offsetWidth;el.classList.add('on');
  }
  function hideLineups(){$('.match-lineup').classList.remove('on');}
  function endOfHalf(){
    playing=false;setPlayIcon();
    // Re-watching: the second half already exists, so continue into it without simulating again.
    if(half===1&&halves[1]&&overlay.hidden){startHalf(2);return;}
    const score=results[half-1].score;
    if(mode==='broadcast'){
      if(half===1)halftime({actions:`<button class="match-button" data-action="second">İkinci yarıyı izle${uiIcon('arrowRight')}</button>`});
      else if(bcast.trimmed)status(confetti(score)+card({wide:true,final:true,label:'Maç sonu',title:scoreRow(score,half),body:scorers(2)+stats(2)+report(),actions:`<a class="match-button ghost" href="#gunun-maci">Günün maçına dön</a><a class="match-button" href="#gunun-maci/sonuclar">Özeti izle${uiIcon('arrowRight')}</a>`}));
      else status(confetti(score)+card({wide:true,final:true,label:'Maç sonu',title:scoreRow(score,half),body:scorers(2)+stats(2)+report(),status:true,actions:`<button class="match-button ghost" data-action="rewatch">${uiIcon('reset')}Baştan izle</button><a class="match-button ghost" href="#gunun-maci">Günün maçına dön</a><button class="match-button" data-action="export">${uiIcon('download')}Özeti indir · 9:16</button>`}));
      return;
    }
    if(half===1)halftime({actions:`<button class="match-button ghost" data-action="tactics">Dizilişi değiştir${uiIcon('arrowUpRight')}</button><button class="match-button" data-action="second">İkinci yarıyı başlat${uiIcon('arrowRight')}</button>`});
    else{archiveMatch();status(confetti(score)+card({wide:true,final:true,label:'Maç sonu',title:scoreRow(score,half),body:scorers()+stats()+report()+'<p class="match-archived">Maç bu cihazda arşive kaydedildi.</p>',status:true,
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
    if(b.dataset.sound!==undefined){audio.unlock();audio.setMuted(!audio.muted);soundButton();}
    else if(b.dataset.preset){replayCamera=null;renderer?.setCamera({kind:'set-preset',preset:b.dataset.preset});$$('[data-preset]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});}
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
  const hudObserver=new ResizeObserver(()=>{layoutL();if(!renderer)return;const box=host.querySelector('.match-stage').getBoundingClientRect();renderer.setHudExclusions([...host.querySelectorAll('.match-scoreboard,.sbx,.match-possession,.match-camera,.match-ticker,.match-radar')].map(el=>el.getBoundingClientRect()).map(r=>({x:r.left-box.left,y:r.top-box.top,width:r.width,height:r.height})));});
  hudObserver.observe(host.querySelector('.match-stage'));
  function onKey(event){if(visible)audio.unlock();if(visible&&event.code==='Escape'&&!$('.match-why').hidden){closeWhy();return;}if(!visible||!overlay.hidden||event.target.closest?.('input,select,button,a'))return;if(event.code==='Space'){event.preventDefault();playing=!playing;setPlayIcon();if(mode==='broadcast'&&bcast.live&&!playing){bcast.live=false;transport();}}}
  window.addEventListener('keydown',onKey);
  Object.defineProperty(window,'alsancakMatch',{configurable:true,get:()=>({phase,half,t,playing,speed,mode,live:!!bcast?.live,score:results[1]?.score??results[0]?.score??null,ready:!!halves[half-1],overlay:!overlay.hidden,
    events:halves.filter(Boolean).reduce((n,h)=>n+h.events.length,0),
    /** QA: times of this half's events of a kind (optionally matching a pattern in the explanation). */
    moments:(kind,pattern)=>(halves[half-1]?.events??[]).filter(e=>e.kind===kind&&(!pattern||new RegExp(pattern).test(e.reason.explanation))).map(e=>e.seconds),segments:segments.length,segment:segIndex,highlightSeconds:Math.round(segments.reduce((n,s)=>n+s.end-s.start,0)),camera:renderer?.cameraState??null})});
  return {open,openBroadcast,message,
    /** Half-time score while the user changes the lineup in the tactics room, else null. */
    get halftime(){return changingLineup&&results[0]&&!halves[1]?{score:results[0].score}:null;},
    setVisible(value){visible=value;if(value)audio.wake();else audio.sleep();if(visible&&!raf){last=performance.now();raf=requestAnimationFrame(frame);}if(!visible){if(raf)cancelAnimationFrame(raf);raf=null;}},
    dispose(){disposed=true;stop();audio.dispose();detachInput?.();hudObserver.disconnect();window.removeEventListener('keydown',onKey);renderer?.dispose();repository.close();}};
}
