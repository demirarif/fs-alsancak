import {createMatchScene} from './scene.js';
import {attachCameraInput} from './camera-input.js';
import {getDemoFrame,DURATION,phases} from './demo.js';
import {players,teams} from './players.js';

export function mountPreview(playerLibrary){
const $=selector=>document.querySelector(selector);
let scene;
try {scene=createMatchScene($('#scene'),$('#labels'));}
catch(error){$('#loading').hidden=true;$('#scene-error').hidden=false;$('#error-detail').textContent=error.message;console.error(error);}

if(scene){
  let time=0,playing=true,speed=1,names=true,previous=performance.now(),currentPhase=-1,visible=true;
  const timeline=$('#timeline');
  const format=value=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(Math.floor(value%60)).padStart(2,'0')}`;
  function updateUI(frame){
    timeline.value=String(time);timeline.style.setProperty('--progress',`${time/DURATION*100}%`);$('#current-time').textContent=format(time);
    if(frame.phase!==currentPhase){
      currentPhase=frame.phase;const phase=phases[currentPhase];
      $('#phase-index').textContent=`0${currentPhase+1} / 05`;$('#phase-title').textContent=phase.title;$('#phase-description').textContent=phase.description;
      $('#phase-tags').replaceChildren(...phase.tags.map(text=>{const el=document.createElement('span');el.textContent=text;return el;}));
      document.querySelectorAll('[data-time]').forEach((button,i)=>button.classList.toggle('active',i===currentPhase));
    }
  }
  function setPlaying(value){playing=value;$('#play-icon').textContent=playing?'Ⅱ':'▶';$('#play-pause').setAttribute('aria-label',playing?'Duraklat':'Oynat');}
  let wasPlayingBeforeOverlay=false,overlayOpen=false;
  const overlayChanged=open=>{if(open&&!overlayOpen){wasPlayingBeforeOverlay=playing;setPlaying(false);}else if(!open&&overlayOpen)setPlaying(wasPlayingBeforeOverlay);overlayOpen=open;};
  function seek(value){time=Math.max(0,Math.min(DURATION,Number(value)));updateUI(getDemoFrame(time));}
  $('#play-pause').addEventListener('click',()=>setPlaying(!playing));
  $('#restart').addEventListener('click',()=>seek(0));
  timeline.addEventListener('input',e=>seek(e.target.value));
  document.querySelectorAll('[data-speed]').forEach(button=>button.addEventListener('click',()=>{
    speed=Number(button.dataset.speed);
    document.querySelectorAll('[data-speed]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});
  }));
  document.querySelectorAll('[data-time]').forEach(button=>button.addEventListener('click',()=>seek(button.dataset.time)));
  const presetNames={broadcast:'TV yayını',wide:'Geniş',goal:'Kale arkası'};
  const setPreset=preset=>scene.setCamera({kind:'set-preset',preset});
  document.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>setPreset(button.dataset.camera)));
  document.querySelectorAll('[data-orbit]').forEach(button=>button.addEventListener('click',()=>scene.setCamera({kind:'orbit',deltaAzimuth:Number(button.dataset.orbit)*Math.PI/12,deltaElevation:0})));
  document.querySelectorAll('[data-tilt]').forEach(button=>button.addEventListener('click',()=>scene.setCamera({kind:'orbit',deltaAzimuth:0,deltaElevation:Number(button.dataset.tilt)*Math.PI/36})));
  document.querySelectorAll('[data-zoom]').forEach(button=>button.addEventListener('click',()=>scene.setCamera({kind:'zoom',factor:Number(button.dataset.zoom)})));
  $('#camera-follow').addEventListener('click',()=>scene.setCamera({kind:'resume-follow'}));
  $('#camera-reset').addEventListener('click',()=>scene.setCamera({kind:'reset-view'}));
  const detachCamera=attachCameraInput(scene.canvas,intent=>scene.setCamera(intent));
  let cameraKey='';
  function updateCameraUI(){
    const state=scene.camera,o=state.userOffset,adjusted=Math.abs(o.azimuthRadians)>.01||Math.abs(o.elevationRadians)>.01||Math.abs(o.zoomFactor-1)>.01;
    const key=`${state.preset}|${state.mode}|${adjusted}`;if(key===cameraKey)return;cameraKey=key;
    document.querySelectorAll('[data-camera]').forEach(b=>{const on=b.dataset.camera===state.preset;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
    const free=state.mode==='free',status=$('#camera-status');status.classList.toggle('is-free',free);
    status.querySelector('b').textContent=free?'Elle · sabit görüntü':adjusted?'Otomatik takip · senin açın':'Otomatik takip';
    $('#camera-follow').hidden=!free;$('#camera-reset').disabled=!free&&!adjusted;
    $('#camera-note').textContent=free?'Elle kamera':`${presetNames[state.preset]} açısı`;
    hudDirty=true;
  }
  // Labels avoid the real HUD boxes, measured instead of hard-coded corners.
  let hudDirty=true;
  function measureHud(){
    const box=$('#viewport').getBoundingClientRect();
    scene.setHudExclusions([...document.querySelectorAll('#viewport .scoreboard,#viewport .view-tools,#viewport .scene-caption,#viewport .pitch-note,#viewport .roster-panel:not([hidden])')]
      .map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height).map(r=>({x:r.left-box.left,y:r.top-box.top,width:r.width,height:r.height})));
    hudDirty=false;
  }
  const hudObserver=new ResizeObserver(()=>{hudDirty=true;});hudObserver.observe($('#viewport'));hudObserver.observe(document.querySelector('#viewport .view-tools'));
  $('#names-toggle').addEventListener('click',()=>{names=!names;$('#names-toggle').classList.toggle('active',names);$('#names-toggle').setAttribute('aria-pressed',String(names));});
  $('#fullscreen').addEventListener('click',async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#app').requestFullscreen();}
    catch(error){$('#fullscreen').title='Bu tarayıcı tam ekranı desteklemiyor';console.info(error.message);}
  });
  function toggleRoster(open){$('#roster').hidden=!open;$('#roster-toggle').setAttribute('aria-expanded',String(open));hudDirty=true;}
  $('#roster-toggle').addEventListener('click',()=>toggleRoster($('#roster').hidden));
  $('#roster-close').addEventListener('click',()=>toggleRoster(false));
  $('#roster-content').replaceChildren(...teams.map((team,index)=>{
    const el=document.createElement('section');el.className='roster-team';
    const h=document.createElement('h3');const kit=document.createElement('i');kit.className=`kit ${team.id}`;h.append(kit,document.createTextNode(team.name));el.append(h);
    players.filter(p=>p.team===index).forEach(p=>{const row=document.createElement('button');row.type='button';row.className='roster-player';row.setAttribute('aria-label',`${p.name} profilini aç`);const n=document.createElement('span');n.textContent=String(p.number).padStart(2,'0');const role=document.createElement('small');role.textContent=p.role;row.append(n,document.createTextNode(p.name),role);row.addEventListener('click',()=>playerLibrary.openProfile(p.id,row));el.append(row);});return el;
  }));
  window.addEventListener('keydown',event=>{
    if(!visible)return;
    if(document.querySelector('dialog[open]'))return;
    if(event.target.matches('input,button,a'))return;
    if(event.code==='Space'){event.preventDefault();setPlaying(!playing);}
    if(event.key.toLowerCase()==='r')seek(0);
    if(event.key==='ArrowRight'){event.preventDefault();seek(time+3);}
    if(event.key==='ArrowLeft'){event.preventDefault();seek(time-3);}
    if(event.key==='Escape')toggleRoster(false);
    const preset={'1':'broadcast','2':'wide','3':'goal'}[event.key];if(preset)setPreset(preset);
  });
  // Read-only diagnostics support development without coupling renderer to UI.
  Object.defineProperty(window,'alsancakPreview',{configurable:true,get:()=>({time,playing,speed,names,camera:scene.camera,...scene.diagnostics})});
  let animationId;
  function tick(now){
    const dt=Math.max(0,Math.min((now-previous)/1000,.075));previous=now;
    if(!visible){animationId=null;return;}
    if(playing)time=(time+dt*speed)%DURATION;
    if(hudDirty)measureHud();
    const frame=getDemoFrame(time);scene.render(frame,dt,names);updateUI(frame);updateCameraUI();$('#loading').hidden=true;
    animationId=requestAnimationFrame(tick);
  }
  animationId=requestAnimationFrame(tick);
  return {setVisible(value){visible=value;if(visible&&!animationId){previous=performance.now();animationId=requestAnimationFrame(tick);}},setOverlayOpen:overlayChanged,dispose(){cancelAnimationFrame(animationId);detachCamera();hudObserver.disconnect();scene.dispose();}};
}
return {setVisible(){},setOverlayOpen(){},dispose(){}};
}
