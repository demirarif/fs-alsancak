import './style.css';
import {mountPlayerLibrary} from './v1/features/player-library.ts';
import {mountTeamSelection} from './v1/features/team-selection/controller.ts';
import {mountLineupReview} from './v1/features/lineup-review/controller.ts';
import {CHEMISTRY_RULEBOOK} from './v1/config/chemistry-rulebook.ts';

const $=selector=>document.querySelector(selector);
let match=null,loadingMatch=null;
const playerLibrary=mountPlayerLibrary({onOverlayChange(){}});
const selection=mountTeamSelection($('#selection-screen'),playerLibrary);
const review=mountLineupReview($('#lineup-screen'),playerLibrary);
let latestLibrary;const unsubscribe=playerLibrary.subscribe(snapshot=>{latestLibrary=snapshot;});
let routeSequence=0;
$('#selection-screen').addEventListener('selection-confirmed',()=>{location.hash='#dizilis';});
// Match engine session: the tactics screen's confirm button starts the match (the lineup is read back from storage).
$('#lineup-screen').addEventListener('click',event=>{const button=event.target.closest('#tactics-confirm');if(button&&!button.disabled)setTimeout(()=>{location.hash='#mac';},350);});
$('#inventory-toggle').addEventListener('click',event=>playerLibrary.openInventory(event.currentTarget));
async function context(token){
  await selection.ready;if(token!==routeSequence)return null;
  if(!latestLibrary?.ready)await playerLibrary.refresh();if(token!==routeSequence)return null;
  return selection.draft&&latestLibrary?.ready?{selection:selection.draft,catalog:latestLibrary.catalog,rulebook:CHEMISTRY_RULEBOOK,forms:[]}:null;
}
async function route(){
  const token=++routeSequence,tactics=location.hash==='#dizilis',game=location.hash==='#mac';
  $('#selection-screen').hidden=tactics||game;$('#lineup-screen').hidden=!tactics;$('#match-screen').hidden=!game;
  $('#app').classList.toggle('selection-mode',!game);
  // At half time the squads must stay as they are, so the tactics room hides the way back to squad selection.
  const halftime=tactics?match?.halftime??null:null;
  $('#selection-nav').hidden=(!tactics&&!game)||!!halftime;$('#tactics-nav').hidden=!game;
  $('#header-page-name').textContent=game?'Maç':tactics?'Taktik odası':'Kadro seçimi';$('#header-version').textContent=game?'MAÇ':'04';
  document.title=game?'Alsancak · Maç':tactics?'Alsancak · Taktik odası':'Alsancak · Kadro seçimi';
  match?.setVisible(game);
  if(!tactics)review.deactivate();
  if(tactics){const ctx=await context(token);if(!ctx){if(token===routeSequence)$('#lineup-screen').textContent='Kadrolar yüklenemedi. Kadro seçimine dönüp tekrar dene.';return;}review.setHalftime(halftime);void review.open(ctx);}
  if(game){
    loadingMatch??=import('./match/match-screen.js');
    const module=await loadingMatch;if(token!==routeSequence)return;
    match??=module.mountMatchScreen($('#match-screen'));match.setVisible(true);
    const ctx=await context(token);if(!ctx||token!==routeSequence)return;void match.open(ctx);
  }
}
window.addEventListener('hashchange',route);void route();
if(import.meta.hot)import.meta.hot.dispose(()=>{window.removeEventListener('hashchange',route);unsubscribe();selection.dispose();review.dispose();match?.dispose();playerLibrary.dispose();});
