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
/** A half's dribbles past a man ('beat' events), in time order, built once per events list. */
const beatCache=new WeakMap();
function beatsOf(events){let b=beatCache.get(events);if(!b){b=events.filter(e=>e.kind==='beat'&&e.actorId).sort((x,y)=>x.seconds-y.seconds);beatCache.set(events,b);}return b;}
/** The dribble move is drawn from FEINT_BEFORE s before the beat (the take-on starts 0.3 s before it) to FEINT_AFTER s after. */
const FEINT_BEFORE=.4,FEINT_AFTER=.45;
/** Referee (2026-11-10): yellow shirt, black shorts and socks — apart from both teams' kits and both keepers'. */
const REF_KIT={shirt:'#e8d23a',trim:'#15171c',shorts:'#15171c',socks:'#15171c',number:'#15171c'};
const SIGNALS=new Set(['foul','corner','goal-kick','throw-in','goal','kick-off','half-time','full-time']);
const signalCache=new WeakMap();
function signalsOf(events){let b=signalCache.get(events);if(!b){b=events.filter(e=>SIGNALS.has(e.kind)).sort((x,y)=>x.seconds-y.seconds);signalCache.set(events,b);}return b;}
const attackDirOf=(team,half)=>(half===1)===(team===0)?1:-1;
const KICK=new Set(['pass','through-pass','diagonal-pass','shot','header','cross','corner','clearance','kick-off','penalty']);

/** size: fixed pixel size (offline export) instead of following the container. */
export function createMatchRenderer(container,labelContainer,{snapshot,lineups,preserveDrawingBuffer=false,size=null}){
  // Late-afternoon light (2026-11-09): a warmer haze, golden sun and sky fill; the turf keeps its colours.
  const scene=new THREE.Scene();scene.background=new THREE.Color('#8b9684');scene.fog=new THREE.Fog('#8b9684',165,360);
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer});
  renderer.setPixelRatio(size?1:Math.min(window.devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.97;
  renderer.domElement.setAttribute('aria-label','Maç: üç boyutlu saha, 22 oyuncu ve top');container.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight('#efe8d6','#4f5f40',1.85));
  // Soft-edged shadows, finer over the play (2026-11-10, user: "sahayı ve futbolcuları daha gerçekçi"): the box follows the play as before,
  // a little tighter, and the map is larger where the device can afford it (a player's shadow ~25 px/m instead of ~14).
  const sun=new THREE.DirectionalLight('#ffe2b6',2.2);sun.castShadow=true;const shadowPx=!size&&window.innerWidth<820?2048:3072;sun.shadow.mapSize.set(shadowPx,shadowPx);
  Object.assign(sun.shadow.camera,{left:-62,right:62,top:52,bottom:-52,near:.5,far:230});sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;sun.shadow.radius=2;sun.position.set(-40,80,-38);scene.add(sun);
  const standGroups=buildStadium(scene,{kits:[TEAM_KITS['team-1'].shirt,TEAM_KITS['team-2'].shirt]});
  const camera=new THREE.PerspectiveCamera(30,1,.3,500),director=createCameraDirector('broadcast'),effects=createMatchEffects(scene);
  const byId=new Map(snapshot.players.map(p=>[p.id,p])),numbers=new Map();
  lineups.forEach(l=>l.assignments.forEach((a,i)=>numbers.set(a.playerId,i+1)));
  const models=new Map(),labels=new Map(),feintSides=new Map();
  function addPlayer(id,team){
    const p=byId.get(id),keeper=p.kind==='goalkeeper',kit=TEAM_KITS[team===0?'team-1':'team-2'];
    const m=createLowPolyPlayer({kit:keeper?kit.keeper:kit,appearance:LOOKS.get(id)??appearanceFor(id),number:numbers.get(id)??0,keeper});scene.add(m.root);models.set(id,{model:m,keeper,team,speed:0,prev:null});
    const el=document.createElement('div');el.className=`match-label team-${team}`;el.style.setProperty('--kit',TEAM_PRESENTATION[team===0?'team-1':'team-2'].color);
    const dot=document.createElement('i'),text=document.createElement('span');text.textContent=p.name;el.append(dot,text);labelContainer?.append(el);labels.set(id,el);
  }
  lineups.forEach((l,team)=>l.assignments.forEach(a=>addPlayer(a.playerId,team)));
  // The referee is not in the match engine: he follows the ball as referees do (a little behind the play, toward the middle of the
  // pitch on the side away from the ball — the diagonal), faces it, and signals what the events record.
  const referee={model:createLowPolyPlayer({kit:REF_KIT,appearance:{...appearanceFor('hakem'),boots:'#16181d'},number:'',keeper:false}),x:0,z:-10,vx:0,vz:0,lane:-1,speed:0};scene.add(referee.model.root);
  function moveReferee(state,events,dt,seeked){
    const r=referee,b=state.ball,t=state.t;if(b.z>6)r.lane=-1;else if(b.z<-6)r.lane=1;
    const tx=Math.max(-46,Math.min(46,b.x*.9)),tz=Math.max(-31,Math.min(31,b.z*.6+r.lane*8)),gx=tx-r.x,gz=tz-r.z,gap=Math.hypot(gx,gz);
    if(seeked||gap>30){r.x=tx;r.z=tz;r.vx=r.vz=0;}
    else if(dt>0){const want=Math.min(gap<1.2?0:gap>8?7.6:5,gap*1.8),ux=gap?gx/gap:0,uz=gap?gz/gap:0,acc=7*dt;let ax=ux*want-r.vx,az=uz*want-r.vz;const al=Math.hypot(ax,az);if(al>acc){ax*=acc/al;az*=acc/al;}r.vx+=ax;r.vz+=az;r.x+=r.vx*dt;r.z+=r.vz*dt;}
    r.speed=dt>0?Math.hypot(r.vx,r.vz):0;
    // The signal for the latest whistle in the last 2.4 s: which way he points, or the whistle to his mouth.
    let signal,face=Math.atan2(b.x-r.x,b.z-r.z);const half=t>=1800?2:1;
    for(const e of signalsOf(events)){if(e.seconds>t)break;const age=t-e.seconds;if(age>2.4)continue;
      const w=Math.min(1,age/.18)*(1-Math.max(0,Math.min(1,(age-1.9)/.5)));let at=null,level='level',kind='point';
      const team=e.teamId==='team-2'?1:e.teamId==='team-1'?0:-1,penalty=e.kind==='foul'&&/PENALTI/.test(e.reason?.explanation??'');
      if(e.kind==='foul'){const d=attackDirOf(1-team,half);at=penalty?{x:d*41.5,z:0}:{x:r.x+d*10,z:r.z};if(penalty)level='low';}
      else if(e.kind==='throw-in'&&team>=0)at={x:r.x+attackDirOf(team,half)*10,z:r.z};
      else if(e.kind==='corner'&&team>=0){at={x:attackDirOf(team,half)*52.5,z:(Math.sign(b.z)||1)*34};level='up';}
      else if(e.kind==='goal-kick'&&team>=0){at={x:-attackDirOf(team,half)*47,z:0};level='low';}
      else if(e.kind==='goal'){at={x:0,z:0};level='low';}
      else kind=e.kind==='full-time'?'arms':'whistle';
      signal={kind,level,w};if(at)face=Math.atan2(at.x-r.x,at.z-r.z);
    }
    animateLowPolyPlayer(r.model,{x:r.x,z:r.z,speed:r.speed,heading:face,time:t,dt:seeked?1:dt,signal,
      look:Math.atan2(b.x-r.x,b.z-r.z),lookUp:Math.max(-.6,Math.min(.38,-Math.atan2(b.y-1.5,Math.max(2,Math.hypot(b.x-r.x,b.z-r.z)))))});
  }
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
    if(seeked||lastT===null||t<lastT||t-lastT>2){effects.clear();standGroups.crowd.calm();for(const m of models.values())m.prev=null;trailFrom=null;}
    else for(const e of events){if(e.seconds<=lastT||e.seconds>t)continue;
      if(KICK.has(e.kind)){const dx=e.destination.x-e.origin.x,dz=e.destination.z-e.origin.z,d=Math.hypot(dx,dz)||1;effects.kick({x:e.origin.x,z:e.origin.z},{x:dx/d,z:dz/d},e.kind==='shot'||e.kind==='penalty'?1:e.kind==='header'?.4:.45);}
      if(e.kind==='goal'){effects.puff({x:Math.sign(state.ball.x)*53.2,y:1.2,z:state.ball.z},10);standGroups.crowd.cheer(e.teamId==='team-2'?1:0);}}
    standGroups.crowd.update(simDt);
    const ballSpeed=lastBall&&simDt>0?Math.hypot(state.ball.x-lastBall.x,state.ball.y-lastBall.y,state.ball.z-lastBall.z)/simDt:0;
    if(state.ball.state===BALL_STATE.air&&ballSpeed>16){if(!trailFrom||Math.hypot(state.ball.x-trailFrom.x,state.ball.y-trailFrom.y,state.ball.z-trailFrom.z)>.35){effects.trail(state.ball,Math.min(1,ballSpeed/28));trailFrom={...state.ball};}}else trailFrom=null;
    effects.update(simDt);
    // The man with the ball at his feet runs where he goes; with the ball in play everyone else may keep facing it while moving
    // (2026-11-10: a defender dropping back used to turn his back on the ball), and every head follows it.
    const live=state.ball.state!==BALL_STATE.dead,held=state.ball.state===BALL_STATE.feet||state.ball.state===BALL_STATE.hands;
    let holder=null;if(held){let best=1.2;for(const p of state.players){const d=Math.hypot(p.x-state.ball.x,p.z-state.ball.z);if(d<best){best=d;holder=p.id;}}}
    // Dribbles on now: the man on the ball feints one way and goes the other, the man he beats bites. The fake side (a world direction)
    // is fixed per beat: toward the side the defender stands, so he goes past on the other.
    const feints=new Map(),fooled=new Map();
    for(const e of beatsOf(events)){
      if(e.seconds-FEINT_BEFORE>t)break;if(t>e.seconds+FEINT_AFTER)continue;
      const c=state.players.find(q=>q.id===e.actorId),d=state.players.find(q=>q.id===e.targetPlayerId);if(!c)continue;
      const why=e.reason?.explanation??'',nutmeg=/bacak arası/.test(why),amount=nutmeg||/çalımla/.test(why)?1:.6,key=`${e.id}@${e.seconds}`;
      let fw=feintSides.get(key);
      if(!fw){const lx=Math.cos(c.heading),lz=-Math.sin(c.heading);let side=d?Math.sign((d.x-c.x)*lx+(d.z-c.z)*lz):0;if(!side)side=e.tick%2?1:-1;fw={x:side*lx,z:side*lz};feintSides.set(key,fw);}
      const u=(t-(e.seconds-FEINT_BEFORE))/(FEINT_BEFORE+FEINT_AFTER);feints.set(c.id,{u,fw,amount});if(d)fooled.set(d.id,{u,fw,amount,nutmeg});
    }
    const sideOf=(fw,h)=>Math.sign(fw.x*Math.cos(h)-fw.z*Math.sin(h))||1;
    // Celebrating: who is close to a celebrating team-mate (they hug), and where that team-mate is (they face him).
    const celebrating=state.players.filter(q=>q.action===ACTION.celebrate);
    for(const p of state.players){
      const entry=models.get(p.id);if(!entry)continue;const m=entry.model,prev=entry.prev;
      if(prev&&simDt>0)entry.speed=Math.hypot(p.x-prev.x,p.z-prev.z)/simDt;entry.prev={x:p.x,z:p.z};
      // style (pass / lofted / drive / shot) is read from the ball's flight after contact (replay-sampling.js).
      const a=p.action,action=a===ACTION.pass?{kind:'kick',u:p.u,power:p.style==='drive'?.8:.6,foot:p.param,style:p.style??'drive'}:a===ACTION.shot?{kind:'kick',u:p.u,power:1,foot:p.param,style:'shot'}:a===ACTION.receive?{kind:'receive',u:p.u}
        :a===ACTION.touch?{kind:'touch',u:p.u,power:.9}:a===ACTION.tackle?{kind:'tackle',u:p.u}:a===ACTION.header?{kind:'header',u:p.u}:a===ACTION.throw?{kind:'throw',u:p.u}
        :a===ACTION.slide?{kind:'slide',u:p.u,foot:1}:a===ACTION.fall?{kind:'fall',u:p.u}
        :a===ACTION.catch||a===ACTION.hold?{kind:'catch',u:a===ACTION.hold?.5:p.u,high:a===ACTION.catch&&p.param===2}:null;
      const dive=a===ACTION.dive?{u:p.u,side:p.param||1}:null;
      const bx=state.ball.x-p.x,bz=state.ball.z-p.z,bd=Math.hypot(bx,bz),toBall=Math.atan2(bx,bz);
      // Facing: the engine's own while he stands or acts; else his run, unless he is moving away from the ball or across it at a jog —
      // then he backpedals facing it, or runs half-turned to it (hysteresis so he does not flick between the two).
      let face=entry.speed<.6||action||dive?p.heading:undefined;
      if(face===undefined&&prev&&live&&p.id!==holder&&a!==ACTION.celebrate&&bd<50){
        const mx=p.x-prev.x,mz=p.z-prev.z;
        if(Math.hypot(mx,mz)<1e-4)face=entry.face;
        else{const move=Math.atan2(mx,mz),diff=Math.atan2(Math.sin(toBall-move),Math.cos(toBall-move)),ad=Math.abs(diff);
          entry.backpedal=entry.speed<4.6&&(entry.backpedal?ad>1.4:ad>1.8);
          face=entry.backpedal?toBall:entry.speed<3.6&&ad>.95?move+Math.sign(diff)*Math.min(ad-.55,1.25):undefined;}
      }
      const celebrate=a===ACTION.celebrate?Math.min(1,p.u*5)*(1-Math.max(0,Math.min(1,(p.u-.9)/.1))):0;
      let together=0;
      if(celebrate){let near=null,nd=99;for(const q of celebrating)if(q!==p&&q.team===p.team){const d=Math.hypot(q.x-p.x,q.z-p.z);if(d<nd){nd=d;near=q;}}
        together=1-Math.max(0,Math.min(1,(nd-1.1)/1.1));if(near&&together>.4&&entry.speed<1.2)face=Math.atan2(near.x-p.x,near.z-p.z);}
      entry.face=face;
      const fe=feints.get(p.id),fo=fooled.get(p.id),h=face??p.heading;
      animateLowPolyPlayer(m,{x:p.x,z:p.z,speed:Math.min(10,entry.speed),heading:face,time:t,dt:seeked?1:simDt,action,dive,keeper:entry.keeper&&entry.speed<1.4?1:0,celebrate,
        mate:a===ACTION.celebrate&&p.param>=1,together,
        feint:fe?{u:fe.u,side:sideOf(fe.fw,h),amount:fe.amount}:undefined,fooled:fo?{u:fo.u,side:sideOf(fo.fw,h),amount:fo.amount,nutmeg:fo.nutmeg}:undefined,
        look:live&&bd<70&&bd>.3?toBall:undefined,lookUp:live?Math.max(-.6,Math.min(.38,-Math.atan2(state.ball.y-1.5,Math.max(2,bd)))):0});
    }
    moveReferee(state,events,simDt,seeked||lastT===null||t<lastT||t-lastT>2);
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
    /** QA: where the referee stands. */
    get referee(){return {x:referee.x,z:referee.z};},
    /** Normalised screen position (0–1, top-left origin) of a world point in the last rendered view. */
    screenPoint(x,y,z){project.set(x,y,z).project(camera);return {u:project.x*.5+.5,v:-project.y*.5+.5,visible:project.z>-1&&project.z<1};},
    // Losing the context frees the GPU at once; a new match or an export makes a fresh renderer.
    dispose(){observer?.disconnect();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();labels.forEach(el=>el.remove());}};
}
