import * as THREE from 'three';
import { buildStadium } from './stadium.js';
import { players,teams } from './players.js';
import { DEMO_TOUCHES } from './demo.js';
import { createLowPolyPlayer,animateLowPolyPlayer } from './lowpoly-player.js';
import { createMatchEffects } from './match-effects.js';
import { createMatchBall } from './match-ball.js';
import { createCameraDirector } from './v1/rendering/camera-director.ts';
import { TEAM_KITS } from './v1/config/team-presentation.ts';
import { assignAppearances,appearanceFor } from './v1/config/appearance.ts';
import { getBundledCatalog } from './v1/data/bundled-catalog.ts';

const BALL_R=.11;
// Balanced over the whole catalog, so a player looks the same in every lineup.
const LOOKS=assignAppearances(getBundledCatalog().players.map(p=>p.id));

export function createMatchScene(container,labelContainer) {
  const scene=new THREE.Scene();scene.background=new THREE.Color('#778b7f');scene.fog=new THREE.Fog('#778b7f',165,360);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.97;
  renderer.domElement.setAttribute('aria-label','Üç boyutlu futbol sahası, 22 oyuncu ve top');
  container.append(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(30,1,.3,500);
  // Camera time is presentation time: it keeps responding while the motion study is paused.
  const director=createCameraDirector('broadcast');
  let hudRects=[],lastPose=null;
  scene.add(new THREE.HemisphereLight('#e5eddf','#4e6447',1.9));
  const sun=new THREE.DirectionalLight('#fff1d8',2.0);sun.position.set(-38,85,-37);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-75,right:75,top:65,bottom:-65,near:.5,far:220});sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;sun.shadow.radius=2;scene.add(sun);
  buildStadium(scene);
  const models=players.map(p=>{
    const team=TEAM_KITS[p.team===0?'team-1':'team-2'];
    const m=createLowPolyPlayer({kit:p.keeper?team.keeper:team,appearance:LOOKS.get(p.id)??appearanceFor(p.id),number:p.number,keeper:p.keeper});
    m.root.position.set(p.base.x,0,p.base.z);scene.add(m.root);return m;
  });
  const effects=createMatchEffects(scene);
  const ball=createMatchBall(BALL_R);scene.add(ball);
  const ballShadow=new THREE.Mesh(new THREE.CircleGeometry(.2,16),new THREE.MeshBasicMaterial({color:'#132914',transparent:true,opacity:.28,depthWrite:false}));ballShadow.rotation.x=-Math.PI/2;scene.add(ballShadow);
  // Small pitch marker makes a real-size football readable from a high camera.
  const marker=new THREE.Mesh(new THREE.RingGeometry(.34,.40,24),new THREE.MeshBasicMaterial({color:'#f2f3d0',transparent:true,opacity:.55,depthWrite:false,side:THREE.DoubleSide}));marker.rotation.x=-Math.PI/2;scene.add(marker);
  const labels=players.map(p=>{
    const el=document.createElement('div');el.className=`player-label team-${p.team} ${p.keeper?'is-keeper':''}`;el.style.setProperty('--kit',teams[p.team].color);
    const dot=document.createElement('span');dot.className='label-dot';const text=document.createElement('span');text.textContent=p.name;el.append(dot,text);labelContainer.append(el);return el;
  });
  const project=new THREE.Vector3();let width=1,height=1,first=true,lastFrame=null;
  const observer=new ResizeObserver(()=>resize());observer.observe(container);
  function resize(){width=container.clientWidth;height=container.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
  resize();
  let previousPositions=null,previousTime=0,previousBall=null,trailFrom=null;const speeds=players.map(()=>0);
  function render(frame,dt,namesEnabled=true){
    const simStep=previousPositions?frame.time-previousTime:0,playing=simStep>.0001&&simStep<.5,simDt=playing?simStep:0,t=frame.time;
    const step=previousBall?frame.time-previousTime:0;
    const ballVelocity=step>.0001&&step<.5?{x:(frame.ball.x-previousBall.x)/step,y:0,z:(frame.ball.z-previousBall.z)/step}:undefined;
    const lastBall=previousBall;previousBall={x:frame.ball.x,z:frame.ball.z};
    const pose=director.update({ball:{x:frame.ball.x,y:frame.ball.y,z:frame.ball.z+.34},ballVelocity},first?0:dt,width/height);lastPose=pose;
    camera.position.set(pose.position.x,pose.position.y,pose.position.z);camera.fov=pose.verticalFovDegrees;camera.updateProjectionMatrix();
    camera.lookAt(pose.target.x,pose.target.y,pose.target.z);
    // Strikes and first touches come from the choreography's owner changes; dust only while play runs forward.
    if(playing)for(const k of DEMO_TOUCHES)if(k.kickT>previousTime&&k.kickT<=t){const d=Math.hypot(k.to.x-k.from.x,k.to.z-k.from.z)||1;effects.kick({x:k.from.x,z:k.from.z+.34},{x:(k.to.x-k.from.x)/d,z:(k.to.z-k.from.z)/d},k.shot?1:.5);}
    if(!playing&&Math.abs(simStep)>.0001)effects.clear();
    frame.poses.forEach((p,i)=>{
      // A paused frame keeps the last speed, so the stride freezes mid-step instead of snapping to idle.
      if(playing){const old=previousPositions[i];speeds[i]=Math.hypot(p.x-old.x,p.z-old.z)/simStep;}
      const speed=Math.min(8,speeds[i]),keeper=players[i].keeper;
      const kick=DEMO_TOUCHES.find(k=>k.kicker===i&&t>=k.kickT-.315&&t<k.kickT+.385);
      const receive=!kick&&!keeper&&DEMO_TOUCHES.find(k=>k.receiver===i&&t>=k.receiveT-.3&&t<k.receiveT+.25);
      const heading=kick?Math.atan2(kick.to.x-kick.from.x,kick.to.z-kick.from.z):speed>.6?undefined:p.direction;
      const action=kick?{kind:'kick',u:(t-kick.kickT+.315)/.7,power:kick.shot?1:.6}:receive?{kind:'receive',u:(t-receive.receiveT+.3)/.55}:null;
      animateLowPolyPlayer(models[i],{x:p.x,z:p.z,speed,heading,time:t,dt:playing?simDt:1,action,keeper:keeper&&speed<1.5?1:0,owner:p.owner});
    });
    previousPositions=frame.poses.map(p=>({x:p.x,z:p.z}));previousTime=frame.time;
    const ballAt={x:frame.ball.x,y:frame.ball.y-.16+BALL_R,z:frame.ball.z+.34};
    if(playing&&lastBall){const dx=frame.ball.x-lastBall.x,dz=frame.ball.z-lastBall.z,d=Math.hypot(dx,dz);if(d>1e-5)ball.rotateOnWorldAxis(new THREE.Vector3(dz/d,0,-dx/d),d/BALL_R*(ballAt.y>BALL_R+.1?.35:1));}
    ball.position.set(ballAt.x,ballAt.y,ballAt.z);
    const shot=DEMO_TOUCHES.find(k=>k.shot&&t>k.kickT&&t<k.receiveT);
    if(shot&&playing){if(!trailFrom||Math.hypot(ballAt.x-trailFrom.x,ballAt.y-trailFrom.y,ballAt.z-trailFrom.z)>.32){effects.trail(ballAt,1-.6*(t-shot.kickT)/(shot.receiveT-shot.kickT));trailFrom={...ballAt};}}else trailFrom=null;
    effects.update(simDt);
    ballShadow.position.set(frame.ball.x,.026,frame.ball.z+.34);ballShadow.material.opacity=Math.max(.05,.30-frame.ball.y*.023);
    marker.position.set(frame.ball.x,.028,frame.ball.z+.34);marker.material.opacity=frame.passing?.45:.25;
    project.copy(ball.position).project(camera);
    const placed=[{x:(project.x*.5+.5)*width-9,y:(-project.y*.5+.5)*height-9,w:18,h:18}];
    // Owner first, then pass participants, then nearest support players.
    const active=[...frame.labels].sort((a,b)=>(a===frame.owner?-1:b===frame.owner?1:0));
    const displayed=new Set();
    if(namesEnabled)for(const i of active){
      const p=frame.poses[i];project.set(p.x,2.5,p.z);project.project(camera);
      if(project.z>1||project.z< -1)continue;
      let x=(project.x*.5+.5)*width,y=(-project.y*.5+.5)*height;
      const el=labels[i];el.classList.toggle('is-owner',i===frame.owner);
      const w=el.offsetWidth,h=el.offsetHeight;
      x-=w/2;y-=h;
      for(let attempt=0;attempt<4;attempt++){
        const overlaps=placed.some(r=>x<r.x+r.w+5&&x+w+5>r.x&&y<r.y+r.h+4&&y+h+4>r.y);
        if(!overlaps)break;y-=h+5;
      }
      if(placed.some(r=>x<r.x+r.w+5&&x+w+5>r.x&&y<r.y+r.h+4&&y+h+4>r.y))continue;
      if(x<8||x+w>width-8||y<8||y+h>height-8)continue;
      // Names never land underneath the scoreboard, camera panel or captions.
      if(hudRects.some(r=>x<r.x+r.width+6&&x+w+6>r.x&&y<r.y+r.height+6&&y+h+6>r.y))continue;
      el.style.transform=`translate(${Math.round(x)}px,${Math.round(y)}px)`;el.style.opacity='1';displayed.add(i);placed.push({x,y,w,h});
    }
    labels.forEach((el,i)=>{if(!displayed.has(i))el.style.opacity='0';});
    renderer.render(scene,camera);first=false;lastFrame=frame;
  }
  return {render,canvas:renderer.domElement,setCamera(intent){director.apply(intent);},setHudExclusions(rects){hudRects=rects;},get camera(){return director.getState();},
    get diagnostics(){return {players:models.length,visibleLabels:labels.filter(el=>el.style.opacity==='1').length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,width,height,frame:lastFrame?.time,cameraPose:lastPose};},dispose(){observer.disconnect();renderer.dispose();}};
}
