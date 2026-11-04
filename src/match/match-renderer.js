import * as THREE from 'three';
import { buildStadium } from '../stadium.js';
import { createLowPolyPlayer, animateLowPolyPlayer } from '../lowpoly-player.js';
import { createMatchEffects } from '../match-effects.js';
import { createMatchBall } from '../match-ball.js';
import { createCameraDirector, standsBehindCamera } from '../v1/rendering/camera-director.ts';
import { TEAM_KITS, TEAM_PRESENTATION } from '../v1/config/team-presentation.ts';
import { assignAppearances, appearanceFor } from '../v1/config/appearance.ts';
import { getBundledCatalog } from '../v1/data/bundled-catalog.ts';
import { ACTION, BALL_STATE } from '../v1/engine/replay.ts';
export { sampleReplay } from './replay-sampling.js';

const BALL_R=.11,LOOKS=assignAppearances(getBundledCatalog().players.map(p=>p.id));
const KICK=new Set(['pass','through-pass','diagonal-pass','shot','header','cross','corner','clearance','kick-off','penalty']);

/** size: fixed pixel size (offline export) instead of following the container. */
export function createMatchRenderer(container,labelContainer,{snapshot,lineups,preserveDrawingBuffer=false,size=null}){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#778b7f');scene.fog=new THREE.Fog('#778b7f',165,360);
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer});
  renderer.setPixelRatio(size?1:Math.min(window.devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.97;
  renderer.domElement.setAttribute('aria-label','Maç: üç boyutlu saha, 22 oyuncu ve top');container.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight('#e5eddf','#4e6447',1.9));
  const sun=new THREE.DirectionalLight('#fff1d8',2.05);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-75,right:75,top:65,bottom:-65,near:.5,far:230});sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;sun.shadow.radius=2;sun.position.set(-40,80,-38);scene.add(sun);
  const standGroups=buildStadium(scene);
  const camera=new THREE.PerspectiveCamera(30,1,.3,500),director=createCameraDirector('broadcast'),effects=createMatchEffects(scene);
  const byId=new Map(snapshot.players.map(p=>[p.id,p])),numbers=new Map();
  lineups.forEach(l=>l.assignments.forEach((a,i)=>numbers.set(a.playerId,i+1)));
  const models=new Map(),labels=new Map();
  function addPlayer(id,team){
    const p=byId.get(id),keeper=p.kind==='goalkeeper',kit=TEAM_KITS[team===0?'team-1':'team-2'];
    const m=createLowPolyPlayer({kit:keeper?kit.keeper:kit,appearance:LOOKS.get(id)??appearanceFor(id),number:numbers.get(id)??0,keeper});scene.add(m.root);models.set(id,{model:m,keeper,team,speed:0,prev:null});
    const el=document.createElement('div');el.className=`match-label team-${team}`;el.style.setProperty('--kit',TEAM_PRESENTATION[team===0?'team-1':'team-2'].color);
    const dot=document.createElement('i'),text=document.createElement('span');text.textContent=p.name;el.append(dot,text);labelContainer?.append(el);labels.set(id,el);
  }
  lineups.forEach((l,team)=>l.assignments.forEach(a=>addPlayer(a.playerId,team)));
  const ball=createMatchBall(BALL_R);scene.add(ball);
  const ballShadow=new THREE.Mesh(new THREE.CircleGeometry(.18,14),new THREE.MeshBasicMaterial({color:'#0d2412',transparent:true,opacity:.32,depthWrite:false}));ballShadow.rotation.x=-Math.PI/2;scene.add(ballShadow);
  let width=1,height=1,hud=[],lastBall=null,lastT=null,trailFrom=null,lastPose=null;
  const observer=size?null:new ResizeObserver(()=>resize());observer?.observe(container);
  function resize(w=size?.width??container.clientWidth,h=size?.height??container.clientHeight){width=w;height=h;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  resize();
  const project=new THREE.Vector3();
  /** state: sampleReplay output; events: replay events for dust/trails; realDt drives the camera, simDt the bodies and dust; pose overrides the director. */
  function render(state,{realDt=1/60,simDt=0,events=[],names=true,seeked=false,pose:fixedPose=null}={}){
    const t=state.t;
    if(seeked||lastT===null||t<lastT||t-lastT>2){effects.clear();for(const m of models.values())m.prev=null;trailFrom=null;}
    else for(const e of events){if(e.seconds<=lastT||e.seconds>t)continue;
      if(KICK.has(e.kind)){const dx=e.destination.x-e.origin.x,dz=e.destination.z-e.origin.z,d=Math.hypot(dx,dz)||1;effects.kick({x:e.origin.x,z:e.origin.z},{x:dx/d,z:dz/d},e.kind==='shot'||e.kind==='penalty'?1:e.kind==='header'?.4:.45);}
      if(e.kind==='goal')effects.puff({x:Math.sign(state.ball.x)*53.2,y:1.2,z:state.ball.z},10);}
    const ballSpeed=lastBall&&simDt>0?Math.hypot(state.ball.x-lastBall.x,state.ball.y-lastBall.y,state.ball.z-lastBall.z)/simDt:0;
    if(state.ball.state===BALL_STATE.air&&ballSpeed>16){if(!trailFrom||Math.hypot(state.ball.x-trailFrom.x,state.ball.y-trailFrom.y,state.ball.z-trailFrom.z)>.35){effects.trail(state.ball,Math.min(1,ballSpeed/28));trailFrom={...state.ball};}}else trailFrom=null;
    effects.update(simDt);
    for(const p of state.players){
      const entry=models.get(p.id);if(!entry)continue;const m=entry.model;
      if(entry.prev&&simDt>0)entry.speed=Math.hypot(p.x-entry.prev.x,p.z-entry.prev.z)/simDt;entry.prev={x:p.x,z:p.z};
      const a=p.action,action=a===ACTION.pass?{kind:'kick',u:p.u,power:.6,foot:p.param}:a===ACTION.shot?{kind:'kick',u:p.u,power:1,foot:p.param}:a===ACTION.receive?{kind:'receive',u:p.u}
        :a===ACTION.touch?{kind:'touch',u:p.u,power:.9}:a===ACTION.tackle?{kind:'tackle',u:p.u}:a===ACTION.header?{kind:'header',u:p.u}:a===ACTION.throw?{kind:'throw',u:p.u}
        :a===ACTION.slide?{kind:'slide',u:p.u,foot:1}:a===ACTION.fall?{kind:'fall',u:p.u}
        :a===ACTION.catch||a===ACTION.hold?{kind:'catch',u:a===ACTION.hold?.5:p.u,high:a===ACTION.catch&&p.param===2}:null;
      const dive=a===ACTION.dive?{u:p.u,side:p.param||1}:null;
      animateLowPolyPlayer(m,{x:p.x,z:p.z,speed:Math.min(10,entry.speed),heading:entry.speed<.6||action?p.heading:undefined,time:t,dt:seeked?1:simDt,action,dive,keeper:entry.keeper&&entry.speed<1.4?1:0,celebrate:a===ACTION.celebrate?Math.min(1,p.u*5):0});
    }
    if(lastBall&&simDt>0){const dx=state.ball.x-lastBall.x,dz=state.ball.z-lastBall.z,d=Math.hypot(dx,dz);if(d>1e-4&&d<3)ball.rotateOnWorldAxis(new THREE.Vector3(dz/d,0,-dx/d),d/BALL_R*(state.ball.y>.4?.35:1));}
    const v=lastBall&&simDt>0&&!seeked?{x:(state.ball.x-lastBall.x)/simDt,y:0,z:(state.ball.z-lastBall.z)/simDt}:undefined;
    lastBall={...state.ball};lastT=t;
    ball.position.set(state.ball.x,Math.max(BALL_R,state.ball.y),state.ball.z);ballShadow.position.set(state.ball.x,.022,state.ball.z);ballShadow.material.opacity=Math.max(.06,.32-(state.ball.y-BALL_R)*.1);
    const pose=fixedPose??director.update({ball:{x:state.ball.x,y:0,z:state.ball.z},ballVelocity:v&&Math.hypot(v.x,v.z)<40?v:undefined},realDt,width/height);lastPose=pose;
    camera.position.set(pose.position.x,pose.position.y,pose.position.z);camera.fov=pose.verticalFovDegrees;camera.updateProjectionMatrix();camera.lookAt(pose.target.x,pose.target.y,pose.target.z);
    // A broadcast never shows its own stand: the one the camera stands in or behind is left out of this view (it only filled the foreground).
    const behind=standsBehindCamera(pose.position);for(const s of [-1,1]){standGroups.side[s].visible=behind.side!==s;standGroups.end[s].visible=behind.end!==s;}
    sun.target.position.set(state.ball.x*.6,0,state.ball.z*.4);sun.position.set(state.ball.x*.6-40,80,state.ball.z*.4-38);sun.target.updateMatrixWorld();
    placeLabels(state,names);
    renderer.render(scene,camera);
  }
  /** Up to five names: the man on the ball first, then the closest players; never over the HUD or each other. */
  function placeLabels(state,names){
    if(!labelContainer){return;}
    const ballP=state.ball,ranked=state.players.map(p=>({p,d:Math.hypot(p.x-ballP.x,p.z-ballP.z)})).sort((a,b)=>a.d-b.d);
    const holder=ranked[0]&&ranked[0].d<1.2&&(state.ball.state===BALL_STATE.feet||state.ball.state===BALL_STATE.hands)?ranked[0].p.id:null;
    const wanted=names?ranked.filter(r=>r.d<22&&(!models.get(r.p.id)?.keeper||r.p.id===holder)).slice(0,5).map(r=>r.p.id):[];
    project.set(ballP.x,ballP.y,ballP.z).project(camera);const placed=[{x:(project.x*.5+.5)*width-10,y:(-project.y*.5+.5)*height-10,w:20,h:20}],shown=new Set();
    for(const id of wanted){
      const p=state.players.find(q=>q.id===id),el=labels.get(id);project.set(p.x,2.1,p.z).project(camera);if(project.z>1||project.z<-1)continue;
      const w=el.offsetWidth,h=el.offsetHeight;let x=(project.x*.5+.5)*width-w/2,y=(-project.y*.5+.5)*height-h;
      for(let k=0;k<3&&placed.some(r=>x<r.x+r.w+4&&x+w+4>r.x&&y<r.y+r.h+3&&y+h+3>r.y);k++)y-=h+4;
      if(placed.some(r=>x<r.x+r.w+4&&x+w+4>r.x&&y<r.y+r.h+3&&y+h+3>r.y)||x<6||y<6||x+w>width-6||y+h>height-6||hud.some(r=>x<r.x+r.width+6&&x+w+6>r.x&&y<r.y+r.height+6&&y+h+6>r.y))continue;
      el.classList.toggle('is-owner',id===holder);el.style.transform=`translate(${Math.round(x)}px,${Math.round(y)}px)`;el.style.opacity='1';shown.add(id);placed.push({x,y,w,h});
    }
    for(const [id,el] of labels)if(!shown.has(id))el.style.opacity='0';
  }
  return {render,canvas:renderer.domElement,renderer,camera,setCamera(intent){director.apply(intent);},get cameraState(){return director.getState();},get pose(){return lastPose;},
    setHudExclusions(rects){hud=rects;},resize,
    /** Normalised screen position (0–1, top-left origin) of a world point in the last rendered view. */
    screenPoint(x,y,z){project.set(x,y,z).project(camera);return {u:project.x*.5+.5,v:-project.y*.5+.5,visible:project.z>-1&&project.z<1};},
    // Losing the context frees the GPU at once; a new match or an export makes a fresh renderer.
    dispose(){observer?.disconnect();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();labels.forEach(el=>el.remove());}};
}
