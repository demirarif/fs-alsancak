import './style.css';
import {mountPlayerLibrary} from './v1/features/player-library.ts';
import {mountTeamSelection} from './v1/features/team-selection/controller.ts';
import {mountLineupReview} from './v1/features/lineup-review/controller.ts';
import {CHEMISTRY_RULEBOOK} from './v1/config/chemistry-rulebook.ts';
import {createLineupRepository} from './v1/data/local-lineups.ts';
import {rebaseLineupDraft} from './v1/domain/lineups.ts';
import {api,serverNow} from './online/api.js';

const $=selector=>document.querySelector(selector);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
let match=null,loadingMatch=null,today=null,admin=null,account=null,online=false,user=null;
const playerLibrary=mountPlayerLibrary({onOverlayChange(){}});
const selection=mountTeamSelection($('#selection-screen'),playerLibrary);
const review=mountLineupReview($('#lineup-screen'),playerLibrary);
const lineups=createLineupRepository(),recordings=new Map();
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
/** The admin plans a match from the squads and lineup saved in this browser (the same ones the local match would play). */
async function plannerInput(){
  await selection.ready;if(!latestLibrary?.ready)await playerLibrary.refresh();
  if(!selection.draft||!latestLibrary?.ready)return null;
  const ctx={selection:selection.draft,catalog:latestLibrary.catalog,rulebook:CHEMISTRY_RULEBOOK,forms:[]},saved=await lineups.loadLineups(ctx.selection.id);
  return {ctx,draft:saved.ok&&saved.value?rebaseLineupDraft(saved.value,ctx):null};
}
async function matchScreen(){loadingMatch??=import('./match/match-screen.js');const module=await loadingMatch;match??=module.mountMatchScreen($('#match-screen'));return match;}

/* Online (the deployed site, user decisions 2026-11-05): everybody logs in. The admin account starts on its Yönetim paneli and reaches
 * squad selection, the tactics room and the local match; the others get "Günün maçı" and the live broadcast only. Local (the Vite dev
 * server, no /api): the app as before. */
async function route(){
  const token=++routeSequence,hash=location.hash,broadcast=online&&hash.startsWith('#yayin/');
  if(online&&!user.isAdmin&&!broadcast&&hash!=='#gunun-maci'){location.replace('#gunun-maci');return;}
  if(online&&user.isAdmin&&(hash===''||hash==='#')){location.replace('#yonetim');return;}
  const todayRoute=online&&hash==='#gunun-maci',adminRoute=online&&(hash==='#yonetim'||hash.startsWith('#yonetim/')),tactics=hash==='#dizilis',game=hash==='#mac'||broadcast;
  $('#selection-screen').hidden=tactics||game||todayRoute||adminRoute;$('#lineup-screen').hidden=!tactics;$('#match-screen').hidden=!game;$('#today-screen').hidden=!todayRoute;$('#admin-screen').hidden=!adminRoute;
  // The squad and tactics screens keep the top bar's right end for their stage steps; the other screens show the header buttons there.
  $('#app').classList.toggle('selection-mode',!game&&!todayRoute&&!adminRoute);account?.current(hash);
  // At half time the squads must stay as they are, so the tactics room hides the way back to squad selection.
  const halftime=tactics?match?.halftime??null:null;
  $('#selection-nav').hidden=(!tactics&&!(game&&!broadcast))||!!halftime||(online&&!user.isAdmin);$('#tactics-nav').hidden=!game||broadcast;
  const page=broadcast?'Canlı yayın':adminRoute?'Yönetim paneli':todayRoute?'Günün maçı':game?'Maç':tactics?'Taktik odası':'Kadro seçimi';
  $('#header-page-name').textContent=page;$('#header-version').textContent=game?'MAÇ':'04';document.title=`Alsancak · ${page}`;
  match?.setVisible(game);
  if(!todayRoute)today?.close();if(!adminRoute)admin?.close();
  if(!tactics)review.deactivate();
  if(todayRoute){if(!today){const {mountToday}=await import('./online/today-screen.js');if(token!==routeSequence)return;today??=mountToday($('#today-screen'),{user});}today.open();return;}
  if(adminRoute){if(!admin){const {mountAdmin}=await import('./online/admin-screen.js');if(token!==routeSequence)return;admin??=mountAdmin($('#admin-screen'),{plannerInput});}admin.open(hash.slice('#yonetim/'.length));return;}
  if(tactics){const ctx=await context(token);if(!ctx){if(token===routeSequence)$('#lineup-screen').textContent='Kadrolar yüklenemedi. Kadro seçimine dönüp tekrar dene.';return;}review.setHalftime(halftime);void review.open(ctx);}
  if(broadcast){
    const screen=await matchScreen();if(token!==routeSequence)return;screen.setVisible(true);
    const id=hash.slice('#yayin/'.length),back='<a class="match-button" href="#gunun-maci">Günün maçına dön</a>';
    try{
      const detail=await api.match(id);if(token!==routeSequence)return;
      if(serverNow()<detail.match.kickoffAt){screen.message({title:'Maç henüz başlamadı',lead:`Başlama: ${new Date(detail.match.kickoffAt).toLocaleString('tr-TR',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}`,actions:back});return;}
      if(!recordings.has(id)){
        screen.message({title:'Maç yükleniyor…',lead:'Kayıt indiriliyor; birkaç saniye sürebilir.'});
        const {decodeRecording}=await import('./v1/online/recording.ts');recordings.set(id,await decodeRecording(await api.recording(id)));if(token!==routeSequence)return;
      }
      screen.openBroadcast({recording:recordings.get(id),kickoffAt:detail.match.kickoffAt,clock:serverNow});
    }catch(e){if(token===routeSequence)screen.message({title:e.status===410?'Tam kayıt silindi':'Maç açılamadı',lead:esc(e.message),actions:back});}
    return;
  }
  if(game){
    const screen=await matchScreen();if(token!==routeSequence)return;screen.setVisible(true);
    const ctx=await context(token);if(!ctx||token!==routeSequence)return;void screen.open(ctx);
  }
}
async function boot(){
  const session=await api.session();
  if(!session.local){
    online=true;user=session.user;const auth=await import('./online/auth.js');
    if(!user)user=await auth.showLogin();
    if(user.mustChangePassword)user=await auth.requirePasswordChange(user);
    const {mountAccountMenu}=await import('./online/account-menu.js');account=mountAccountMenu(user);$('#app').classList.add('online');
  }
  window.addEventListener('hashchange',route);void route();
}
void boot();
if(import.meta.hot)import.meta.hot.dispose(()=>{window.removeEventListener('hashchange',route);unsubscribe();selection.dispose();review.dispose();match?.dispose();playerLibrary.dispose();});
