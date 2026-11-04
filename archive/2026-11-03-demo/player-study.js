import * as THREE from 'three';
import { buildStadium } from './stadium.js';
import { createLowPolyPlayer, animateLowPolyPlayer, strideCycleMeters } from './lowpoly-player.js';
import { createMatchEffects } from './match-effects.js';
import { createMatchBall } from './match-ball.js';
import { attachCameraInput } from './camera-input.js';
import { createCameraDirector } from './v1/rendering/camera-director.ts';
import { TEAM_KITS } from './v1/config/team-presentation.ts';
import { appearanceFor, SKIN_TONES, SKIN_OVERRIDES } from './v1/config/appearance.ts';
import './player-study.css';

/* A hand-authored 9.5 s study for approving the player look and motion; not the match engine. */
export const STUDY_DURATION=9.5;
const BALL_R=.11,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
function track(keys){
  return t=>{
    if(t<=keys[0][0])return {x:keys[0][1],z:keys[0][2]};
    const n=keys.length;if(t>=keys[n-1][0])return {x:keys[n-1][1],z:keys[n-1][2]};
    let i=0;while(t>keys[i+1][0])i++;
    const p0=keys[Math.max(0,i-1)],p1=keys[i],p2=keys[i+1],p3=keys[Math.min(n-1,i+2)],u=(t-p1[0])/(p2[0]-p1[0]),u2=u*u,u3=u2*u;
    const cr=j=>.5*(2*p1[j]+(-p0[j]+p2[j])*u+(2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*u2+(-p0[j]+3*p1[j]-3*p2[j]+p3[j])*u3);
    return {x:cr(1),z:cr(2)};
  };
}
const velocity=(f,t,h=.04)=>{const a=f(Math.max(0,t-h)),b=f(t+h),d=Math.min(t,h)+h;return {x:(b.x-a.x)/d,z:(b.z-a.z)/d};};
const unit=v=>{const l=Math.hypot(v.x,v.z)||1;return {x:v.x/l,z:v.z/l};};

// Lacivert 10 (shooter), lacivert 7 (passer), bordo 6 Mamadou (presser), bordo keeper.
const A=track([[0,9,-6],[.8,12.2,-3.6],[1.6,16,-.9],[2.35,20,1.2],[2.75,21.4,.9],[3.4,24.3,.2],[4.2,27.9,-.9],[4.95,31,-1.75],[5.2,31.45,-1.8],[5.6,32.4,-1.5],[6.4,34.6,-.6],[7.4,36.4,.2],[8.4,37,.5],[9.5,37.1,.5]]);
const B=track([[0,13.9,12.2],[.45,14.3,11.7],[.6,14.4,11.6],[1.1,14.8,11.2],[2.5,18,9.5],[5,23,7.5],[7,26,6.5],[9.5,27,6.3]]);
const C=track([[0,40.5,13],[1.5,38.6,9.8],[3,36.6,6.2],[4.2,35,3.4],[5,34.1,1.7],[5.45,33.9,1.35],[6.6,34.8,1.9],[9.5,35.2,2.1]]);
const K=track([[0,51.5,.3],[2.5,51.3,.2],[4.2,51,-.2],[5.3,50.9,-.25],[7.6,50.9,-.25],[9.5,51.4,.8]]);
const T={pass:.55,arrive:2.35,settled:2.75,touches:[3.25,3.85,4.45],shot:5.2,dive:5.3};
/** Stride phase from distance along the path: deterministic for any seek; offsets keep players out of step. */
function strideTable(f,offset){
  const DT=.01,STEPS=Math.ceil(STUDY_DURATION/DT),table=[offset];let prev=f(0);
  for(let i=1;i<=STEPS;i++){const cur=f(i*DT),d=Math.hypot(cur.x-prev.x,cur.z-prev.z);table.push(table[i-1]+2*Math.PI*d/strideCycleMeters(d/DT));prev=cur;}
  return t=>{const i=clamp(t/DT,0,STEPS),j=Math.floor(i);return lerp(table[j],table[Math.min(STEPS,j+1)],i-j);};
}
const STRIDE={a:strideTable(A,0),b:strideTable(B,1.7),c:strideTable(C,3.9),k:strideTable(K,.6)};
const GOAL={x:52.75,y:1.85,z:2.45},NET={x:54.5,y:1.35,z:2.7},REST={x:54.9,z:2.85};
const passDir=unit({x:20.4-14.4,z:1.4-11.6}),passStart={x:14.4+passDir.x*.42,z:11.6+passDir.z*.42};
const aDir=t=>unit(velocity(A,t)),passEnd=(()=>{const p=A(T.arrive),d=aDir(T.arrive);return {x:p.x+d.x*.42,z:p.z+d.z*.42};})();
const shotFrom=A(T.shot),shotDir=unit({x:GOAL.x-shotFrom.x,z:GOAL.z-shotFrom.z}),shotSpot={x:shotFrom.x+shotDir.x*.36-shotDir.z*.12,z:shotFrom.z+shotDir.z*.36+shotDir.x*.12};
const flight=Math.hypot(GOAL.x-shotSpot.x,GOAL.z-shotSpot.z)/26,T_GOAL=T.shot+flight,T_NET=T_GOAL+.18,T_DROP=T_NET+.32;
function dribbleLead(t){
  let last=-Infinity;for(const k of T.touches)if(t>=k)last=k;
  if(last<0)return lerp(.55,.45,smooth(T.settled,T.touches[0],t));
  const since=t-last;return since<.12?lerp(.45,1.3,1-(1-since/.12)**2):lerp(1.3,.45,smooth(.12,.6,since));
}
function ball(t){
  if(t<T.pass)return {x:passStart.x,y:BALL_R,z:passStart.z,phase:'held'};
  if(t<T.arrive){const u=(t-T.pass)/(T.arrive-T.pass),s=u*(1.6-.6*u);return {x:lerp(passStart.x,passEnd.x,s),y:BALL_R,z:lerp(passStart.z,passEnd.z,s),phase:'pass'};}
  const dribble=t2=>{const p=A(t2),d=aDir(t2),l=dribbleLead(t2);return {x:p.x+d.x*l,z:p.z+d.z*l};};
  if(t<T.settled){const end=dribble(T.settled),u=(t-T.arrive)/(T.settled-T.arrive),s=1-(1-u)**2;return {x:lerp(passEnd.x,end.x,s),y:BALL_R,z:lerp(passEnd.z,end.z,s),phase:'receive'};}
  if(t<4.6){const p=dribble(t);return {...p,y:BALL_R,phase:'dribble'};}
  if(t<T.shot){const p=dribble(4.6),s=smooth(4.6,5,t);return {x:lerp(p.x,shotSpot.x,s),y:BALL_R,z:lerp(p.z,shotSpot.z,s),phase:'set'};}
  if(t<T_GOAL){const u=(t-T.shot)/flight;return {x:lerp(shotSpot.x,GOAL.x,u),y:BALL_R+(GOAL.y-BALL_R)*u+1.1*u*(1-u),z:lerp(shotSpot.z,GOAL.z,u)+.5*Math.sin(Math.PI*u),phase:'shot'};}
  if(t<T_NET){const u=1-(1-(t-T_GOAL)/(T_NET-T_GOAL))**2;return {x:lerp(GOAL.x,NET.x,u),y:lerp(GOAL.y,NET.y,u),z:lerp(GOAL.z,NET.z,u),phase:'net'};}
  if(t<T_DROP){const u=(t-T_NET)/(T_DROP-T_NET);return {x:lerp(NET.x,REST.x,u),y:lerp(NET.y,BALL_R,u*u),z:lerp(NET.z,REST.z,u),phase:'net'};}
  return {x:REST.x,y:BALL_R+Math.max(0,.18*Math.sin(Math.PI*clamp((t-T_DROP)/.35,0,1))),z:REST.z,phase:'rest'};
}
const heading=d=>Math.atan2(d.x,d.z);
/** Everything the renderer needs at study time t. */
export function getStudyFrame(t){
  const a=A(t),b=B(t),c=C(t),k=K(t),ballPos=ball(t),speed=f=>Math.hypot(velocity(f,t).x,velocity(f,t).z);
  const shotWindow=t>=4.7&&t<5.7,passWindow=t<1;
  const actions={a:null,b:null};
  if(t>=2.1&&t<2.65)actions.a={kind:'receive',u:(t-2.1)/.55};
  for(const tk of T.touches)if(t>=tk-.15&&t<tk+.15)actions.a={kind:'touch',u:(t-tk+.15)/.3,power:.9};
  if(t>=T.shot-.36&&t<T.shot+.44)actions.a={kind:'kick',u:(t-T.shot+.36)/.8,power:1};
  if(t>=T.pass-.315&&t<T.pass+.385)actions.b={kind:'kick',u:(t-T.pass+.315)/.7,power:.55};
  const diveT=t-T.dive,diveU=diveT<0?null:diveT<.5?.45*diveT/.5:.45+.55*clamp((diveT-.5)/1.9,0,1);
  // Close view frames the sample player and his ball, then ball-and-keeper during the shot, then the celebration.
  const av=velocity(A,t),near=.3*(1-smooth(2,6,Math.hypot(ballPos.x-a.x,ballPos.z-a.z)));
  // After the strike the shooter and his dust stay in frame a moment before the camera swings to the keeper.
  const hold=1-smooth(T.shot+.12,T.shot+.5,t),goalFocus={x:lerp(ballPos.x,k.x,.45),z:lerp(ballPos.z,k.z,.45)};
  const focus=t<T.shot?{x:lerp(a.x,ballPos.x,near),z:lerp(a.z,ballPos.z,near),velocity:{x:av.x,y:0,z:av.z}}
    :t<T_NET+.15?{x:lerp(goalFocus.x,a.x,hold),z:lerp(goalFocus.z,a.z,hold)}:{x:a.x,z:a.z,velocity:{x:av.x,y:0,z:av.z}};
  return {t,ball:ballPos,focus,
    players:{
      a:{...a,phase:STRIDE.a(t),speed:speed(A),heading:shotWindow?heading(shotDir):undefined,action:actions.a,celebrate:smooth(6.2,6.7,t)*(1-smooth(8.5,9.1,t))},
      b:{...b,phase:STRIDE.b(t),speed:speed(B),heading:passWindow?heading(passDir):undefined,action:actions.b},
      c:{...c,phase:STRIDE.c(t),speed:speed(C),heading:t>5.5?heading(unit({x:ballPos.x-c.x,z:ballPos.z-c.z})):undefined},
      k:{...k,phase:STRIDE.k(t),speed:speed(K),heading:-Math.PI/2,keeper:diveU===null||diveU>=1?1:0,dive:diveU===null||diveU>=1?null:{u:diveU,side:1}},
    },
    events:[{t:T.pass,kind:'kick',at:passStart,dir:passDir,power:.45},{t:T.arrive,kind:'touch',at:passEnd,dir:aDir(T.arrive),power:.12},...T.touches.map(tk=>({t:tk,kind:'touch',at:A(tk),dir:aDir(tk),power:.08})),
      {t:T.shot,kind:'kick',at:shotSpot,dir:shotDir,power:1},{t:T_GOAL+.03,kind:'net',at:GOAL},{t:T_DROP,kind:'land',at:{x:REST.x,y:BALL_R,z:REST.z}}],
  };
}
/** [label, time, camera]: the keeper moment is best seen from behind his goal. */
export const STUDY_MOMENTS=[['Koşu',.15,'close'],['Top alma',1.95,'close'],['Top sürme',3.05,'close'],['Şut',4.7,'close'],['Kaleci',4.85,'goal'],['Gol',5.95,'close']];
const momentAt=t=>t<2.1?'Koşu':t<2.8?'Top alma':t<4.8?'Top sürme':t<5.35?'Şut':t<T_GOAL?'Kaleci uçuyor':t<6.7?'Gol':'Sevinç';

export function mountPlayerStudy(host){
  host.innerHTML=`<div class="study-scene" id="study-scene"></div><div class="study-fade" id="study-fade"></div>
  <section class="study-card" aria-labelledby="study-title"><span class="study-eyebrow">ÖRNEK FUTBOLCU · ONAYINA</span><h1 id="study-title">Az köşeli, sade oyuncu</h1>
    <p>Lacivert 10 depar atıyor, pası alıp sürüyor ve şut çekiyor. Vuruşta çimden hafif toz kalkar. Saçlar oyuncuya göre: 10 uzun, 7 kısa, kaleci orta, Mamadou çok kısa.</p>
    <dl class="study-readout"><div><dt>An</dt><dd id="study-moment">Koşu</dd></div><div><dt>Lacivert 10 hızı</dt><dd id="study-speed">0,0 m/s</dd></div></dl>
    <div class="study-row"><span>Lacivert 10 forması</span><div class="segmented" role="group" aria-label="Ana oyuncu forması"><button data-study-kit="team-1" class="active" aria-pressed="true">Lacivert</button><button data-study-kit="team-2" aria-pressed="false">Bordo</button></div></div>
    <div class="study-tones"><span>Ten tonları · oyuncuya göre sabit</span><ul>${[...SKIN_TONES,...Object.values(SKIN_OVERRIDES)].map(s=>`<li><i style="background:${s.color}"></i>${s.label}${s.id==='siyahi'?' · Mamadou':''}</li>`).join('')}</ul></div>
  </section>
  <div class="view-tools study-camera"><span class="tool-caption">KAMERA</span>
    <div class="segmented" role="group" aria-label="Kamera açısı"><button data-study-camera="close" class="active" aria-pressed="true">Yakın</button><button data-study-camera="broadcast" aria-pressed="false">TV yayını</button><button data-study-camera="wide" aria-pressed="false">Geniş</button><button data-study-camera="goal" aria-pressed="false">Kale arkası</button></div>
    <div class="camera-manual"><div class="camera-state"><span class="study-camera-status" role="status"><i></i><b>Otomatik takip</b></span><button class="study-camera-follow" hidden>Otomatiğe dön</button></div>
      <div class="camera-pad"><button data-orbit="1" aria-label="Kamerayı sola döndür">⟲</button><button data-orbit="-1" aria-label="Kamerayı sağa döndür">⟳</button><button data-tilt="1" aria-label="Kamerayı yükselt">▴</button><button data-tilt="-1" aria-label="Kamerayı alçalt">▾</button><button data-zoom=".84" aria-label="Yaklaş">+</button><button data-zoom="1.19" aria-label="Uzaklaş">−</button><button class="camera-reset study-camera-reset">Sıfırla</button></div>
      <p class="camera-hint">Sürükle: açı · Tekerlek: yakınlık · Sağ tık veya Shift + sürükle: kaydır</p></div></div>
  <footer class="study-playback"><button class="play-button" id="study-play" aria-label="Duraklat"><span>Ⅱ</span></button>
    <div class="study-moments" role="group" aria-label="Anlara git">${STUDY_MOMENTS.map(([label,t,view])=>`<button data-study-time="${t}" data-study-view="${view}">${label}</button>`).join('')}</div>
    <div class="speed-controls" role="group" aria-label="Oynatma hızı"><span class="eyebrow">HIZ</span><button data-study-speed=".25">¼×</button><button data-study-speed=".5">½×</button><button data-study-speed="1" class="active" aria-pressed="true">1×</button></div>
    <input type="range" id="study-timeline" min="0" max="${STUDY_DURATION}" step=".01" value="0" aria-label="Çalışma zaman çizelgesi"/></footer>`;
  const $=s=>host.querySelector(s),$$=s=>host.querySelectorAll(s),container=$('#study-scene');
  const scene=new THREE.Scene();scene.background=new THREE.Color('#778b7f');scene.fog=new THREE.Fog('#778b7f',165,360);
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.97;container.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight('#e5eddf','#4e6447',1.9));
  // A lower sun than the demo gives the long soft shadows of the reference look.
  const sun=new THREE.DirectionalLight('#fff1d8',2.1);sun.position.set(-48,46,-34);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:1,far:200});sun.shadow.normalBias=.03;sun.shadow.bias=-.0002;sun.shadow.radius=3;scene.add(sun,sun.target);
  buildStadium(scene);
  const camera=new THREE.PerspectiveCamera(30,1,.2,500),director=createCameraDirector('broadcast'),effects=createMatchEffects(scene);
  // Close view distance: narrow (phone) screens would otherwise step far back to keep the TV width.
  const CLOSE_ZOOM=.3,closeZoom=()=>CLOSE_ZOOM*clamp(width/height/1.6,.42,1);
  const ballMesh=createMatchBall(BALL_R);scene.add(ballMesh);
  const ballShadow=new THREE.Mesh(new THREE.CircleGeometry(.16,12),new THREE.MeshBasicMaterial({color:'#0d2412',transparent:true,opacity:.35,depthWrite:false}));ballShadow.rotation.x=-Math.PI/2;scene.add(ballShadow);
  const cast={a:{team:'team-1',id:'study-ten',number:10,skin:2,hair:'long'},b:{team:'team-1',id:'study-seven',number:7,skin:0,hair:'short'},c:{team:'team-2',id:'mamadou',number:6},k:{team:'team-2',id:'study-keeper',number:1,skin:1,hair:'medium',keeper:true}};
  const models={};
  function build(key,team=cast[key].team){
    const spec=cast[key],old=models[key],kit=spec.keeper?TEAM_KITS[team].keeper:TEAM_KITS[team];
    if(old)scene.remove(old.root);
    const look=appearanceFor(spec.id,{...(spec.skin!==undefined?{skinIndex:spec.skin}:{}),...(spec.hair?{hairStyle:spec.hair}:{})});
    models[key]=createLowPolyPlayer({kit,appearance:look,number:spec.number,keeper:!!spec.keeper});scene.add(models[key].root);
  }
  for(const key of Object.keys(cast))build(key);
  let width=1,height=1,time=0,playing=true,speed=1,visible=true,previous=performance.now(),seeked=true,lastBall=null,trailFrom=null,kitKey='team-1',closeView=true,frameId=null;
  let appliedZoom=0,lastNarrow=null;
  const observer=new ResizeObserver(()=>{width=container.clientWidth;height=container.clientHeight;if(width&&height){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
    const narrow=width/height<1.6;if(closeView&&narrow!==lastNarrow){lastNarrow=narrow;setCamera('close');}}});observer.observe(container);
  const detachInput=attachCameraInput(renderer.domElement,intent=>{director.apply(intent);});
  const format=n=>n.toFixed(1).replace('.',',');
  function seek(value){time=clamp(Number(value),0,STUDY_DURATION-.001);seeked=true;effects.clear();for(const m of Object.values(models))m.last=null;}
  function setPlaying(value){playing=value;$('#study-play span').textContent=playing?'Ⅱ':'▶';$('#study-play').setAttribute('aria-label',playing?'Duraklat':'Oynat');}
  function setCamera(mode){
    closeView=mode==='close';director.apply({kind:'set-preset',preset:closeView?'broadcast':mode});if(closeView){director.apply({kind:'zoom',factor:closeZoom()});appliedZoom=director.getState().userOffset.zoomFactor;}
  }
  host.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.studyCamera)setCamera(b.dataset.studyCamera);
    else if(b.dataset.orbit)director.apply({kind:'orbit',deltaAzimuth:Number(b.dataset.orbit)*Math.PI/12,deltaElevation:0});
    else if(b.dataset.tilt)director.apply({kind:'orbit',deltaAzimuth:0,deltaElevation:Number(b.dataset.tilt)*Math.PI/36});
    else if(b.dataset.zoom)director.apply({kind:'zoom',factor:Number(b.dataset.zoom)});
    else if(b.classList.contains('study-camera-follow'))director.apply({kind:'resume-follow'});
    else if(b.classList.contains('study-camera-reset'))setCamera(closeView?'close':director.getState().preset);
    else if(b.dataset.studyTime){seek(b.dataset.studyTime);if(b.dataset.studyView==='goal'||(b.dataset.studyView==='close'&&!closeView&&director.getState().preset==='goal'))setCamera(b.dataset.studyView);}
    else if(b.dataset.studySpeed){speed=Number(b.dataset.studySpeed);$$('[data-study-speed]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});}
    else if(b.dataset.studyKit){kitKey=b.dataset.studyKit;build('a',kitKey);seeked=true;$$('[data-study-kit]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});}
    else if(b.id==='study-play')setPlaying(!playing);
  });
  $('#study-timeline').addEventListener('input',e=>seek(e.target.value));
  let cameraKey='';
  function cameraUI(){
    const s=director.getState(),o=s.userOffset,adjusted=Math.abs(o.azimuthRadians)>.01||Math.abs(o.elevationRadians)>.01||Math.abs(o.zoomFactor-(closeView?appliedZoom:1))>.01;
    const active=closeView&&s.preset==='broadcast'?'close':s.preset,key=`${active}|${s.mode}|${adjusted}`;if(key===cameraKey)return;cameraKey=key;
    $$('[data-study-camera]').forEach(b=>{const on=b.dataset.studyCamera===active;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
    const free=s.mode==='free';$('.study-camera-status').classList.toggle('is-free',free);
    $('.study-camera-status b').textContent=free?'Elle · sabit görüntü':adjusted?'Otomatik takip · senin açın':'Otomatik takip';
    $('.study-camera-follow').hidden=!free;$('.study-camera-reset').disabled=!free&&!adjusted;
  }
  function frame(now){
    frameId=null;if(!visible)return;
    const real=Math.min(.075,Math.max(0,(now-previous)/1000));previous=now;
    const before=time,step=playing?real*speed:0;
    if(playing){time+=step;if(time>=STUDY_DURATION){seek(0);}}
    const f=getStudyFrame(time);
    if(!seeked)for(const e of f.events)if(e.t>before&&e.t<=time){
      if(e.kind==='kick'||e.kind==='touch')effects.kick({x:e.at.x+e.dir.x*-.05,z:e.at.z+e.dir.z*-.05},e.dir,e.power);
      else effects.puff({x:e.at.x,y:e.at.y??BALL_R,z:e.at.z},e.kind==='net'?9:5);
    }
    if(f.ball.phase==='shot'){if(!trailFrom||Math.hypot(f.ball.x-trailFrom.x,f.ball.y-trailFrom.y,f.ball.z-trailFrom.z)>.32){effects.trail(f.ball,1-.6*clamp((time-T.shot)/flight,0,1));trailFrom={...f.ball};}}else trailFrom=null;
    effects.update(seeked?0:step);
    const dt=seeked?1:step;
    for(const [key,m] of Object.entries(models))animateLowPolyPlayer(m,{...f.players[key],time,dt});
    const ballVelocity=lastBall&&!seeked&&step>0?{x:(f.ball.x-lastBall.x)/step,y:0,z:(f.ball.z-lastBall.z)/step}:undefined;
    // Roll the ball along its travel; spin in flight.
    if(lastBall&&!seeked){const dx=f.ball.x-lastBall.x,dz=f.ball.z-lastBall.z,d=Math.hypot(dx,dz);if(d>1e-5)ballMesh.rotateOnWorldAxis(new THREE.Vector3(dz/d,0,-dx/d),d/BALL_R*(f.ball.y>BALL_R+.05?.35:1));}
    lastBall={...f.ball};ballMesh.position.set(f.ball.x,f.ball.y,f.ball.z);
    ballShadow.position.set(f.ball.x,.022,f.ball.z);ballShadow.material.opacity=Math.max(.06,.35-(f.ball.y-BALL_R)*.12);ballShadow.scale.setScalar(1+(f.ball.y-BALL_R)*.25);
    // Look-ahead only while play moves; a paused frame stays centred on the player.
    const lead=step>0&&!seeked;
    const subject=closeView?{ball:{x:f.focus.x,y:0,z:f.focus.z},ballVelocity:lead?f.focus.velocity:undefined}:{ball:{x:f.ball.x,y:0,z:f.ball.z},ballVelocity:lead?ballVelocity:undefined};
    const pose=director.update(subject,real,width/height);
    camera.position.set(pose.position.x,pose.position.y,pose.position.z);camera.fov=pose.verticalFovDegrees;camera.updateProjectionMatrix();camera.lookAt(pose.target.x,pose.target.y,pose.target.z);
    sun.target.position.set(f.ball.x,0,f.ball.z);sun.position.set(f.ball.x-48,46,f.ball.z-34);
    renderer.render(scene,camera);seeked=false;
    $('#study-timeline').value=String(time);$('#study-timeline').style.setProperty('--progress',`${time/STUDY_DURATION*100}%`);
    $('#study-moment').textContent=momentAt(time);$('#study-speed').textContent=`${format(f.players.a.speed)} m/s`;
    $('#study-fade').style.opacity=String(Math.max(1-smooth(0,.35,time),smooth(STUDY_DURATION-.3,STUDY_DURATION,time)));
    const screen=new THREE.Vector3(f.players.a.x,1,f.players.a.z).project(camera);
    cameraUI();diagnostics={time,playing,speed,kit:kitKey,aSpeed:f.players.a.speed,ballPhase:f.ball.phase,effects:effects.count,camera:director.getState(),pose,aScreen:{x:(screen.x*.5+.5)*width,y:(-screen.y*.5+.5)*height}};
    frameId=requestAnimationFrame(frame);
  }
  let diagnostics={};
  Object.defineProperty(window,'alsancakStudy',{configurable:true,get:()=>JSON.parse(JSON.stringify(diagnostics))});
  function onKey(event){if(!visible||event.target.closest?.('input,button,a'))return;if(event.code==='Space'){event.preventDefault();setPlaying(!playing);}}
  window.addEventListener('keydown',onKey);
  frameId=requestAnimationFrame(frame);
  return {
    setVisible(value){visible=value;if(visible&&!frameId){previous=performance.now();frameId=requestAnimationFrame(frame);}},
    dispose(){visible=false;if(frameId)cancelAnimationFrame(frameId);window.removeEventListener('keydown',onKey);detachInput();observer.disconnect();renderer.dispose();host.innerHTML='';},
  };
}
