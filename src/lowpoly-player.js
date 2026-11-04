import * as THREE from 'three';

/* Low-poly flat-shaded footballer: faceted prisms, no textures except the back number.
 * Local forward is +z; local +x is the player's left. Joint rotation.x < 0 swings a limb forward. */
const materials=new Map();
const material=color=>{let m=materials.get(color);if(!m){m=new THREE.MeshStandardMaterial({color,roughness:.86,metalness:0,flatShading:true});materials.set(color,m);}return m;};
const prism=(top,bottom,height,sides=5,start=0)=>new THREE.CylinderGeometry(top,bottom,height,sides,1,false,start);
const G={
  torso:prism(.215,.165,.5,6,Math.PI/6),shorts:prism(.168,.19,.2,6,Math.PI/6),shortsLeg:prism(.092,.1,.32,6),
  thigh:prism(.068,.056,.3),knee:prism(.056,.054,.09),sock:prism(.059,.045,.33),
  sleeve:prism(.068,.062,.13),upperArm:prism(.054,.048,.16),forearm:prism(.048,.04,.24),hand:new THREE.IcosahedronGeometry(.046,0),
  // Boxy head (user: rectangular, not round); hair is built from slabs around it.
  // User tuning: head 10% narrower, neck 20% longer.
  neck:prism(.05,.056,.096),head:new THREE.BoxGeometry(.18,.25,.215),
  hairCap:new THREE.BoxGeometry(.194,.065,.229),hairBack:new THREE.BoxGeometry(.194,1,.045),hairSide:new THREE.BoxGeometry(.03,1,.13),fringe:new THREE.BoxGeometry(.194,.045,.04),
  boot:new THREE.BoxGeometry(.1,.075,.25),number:new THREE.PlaneGeometry(.19,.19),
  shadow:new THREE.CircleGeometry(.42,14),ring:new THREE.RingGeometry(.42,.5,24),
};
const shadowMaterial=new THREE.MeshBasicMaterial({color:'#0d2412',transparent:true,opacity:.32,depthWrite:false});
const ringMaterial=new THREE.MeshBasicMaterial({color:'#e0f0a0',transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false});

function part(parent,geometry,color,y,{x=0,z=0,sx=1,sy=1,sz=1,ry=0}={}){
  const m=new THREE.Mesh(geometry,material(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.rotation.y=ry;m.castShadow=true;parent.add(m);return m;
}
function joint(parent,x,y,z=0){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;}
/** Head box is 0.25 m tall around the joint; long hair falls to the shoulders. */
function hair(head,style,color){
  if(style==='buzz'){part(head,G.hairCap,color,.115,{sy:.45});return;}
  part(head,G.hairCap,color,.115);part(head,G.fringe,color,.085,{z:.095});
  const back={short:.12,medium:.2,long:.36}[style]??.12;part(head,G.hairBack,color,.14-back/2,{z:-.106,sy:back});
  if(style==='short')return;
  const side=style==='long'?.26:.15;for(const x of [-.094,.094])part(head,G.hairSide,color,.13-side/2,{x,z:-.035,sy:side});
}
function numberTexture(number,color){
  const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');
  ctx.fillStyle=color;ctx.font='bold 44px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(number),32,35);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

/** kit: TEAM_KITS entry (or its keeper block); appearance: appearanceFor(). */
export function createLowPolyPlayer({kit,appearance,number,keeper=false}){
  const root=new THREE.Group(),body=joint(root,0,0),hips=joint(body,0,.92),chest=joint(body,0,.98);
  const shadow=new THREE.Mesh(G.shadow,shadowMaterial.clone());shadow.rotation.x=-Math.PI/2;shadow.position.y=.02;shadow.scale.set(1,.72,1);root.add(shadow);
  const ring=new THREE.Mesh(G.ring,ringMaterial);ring.rotation.x=-Math.PI/2;ring.position.y=.03;ring.visible=false;root.add(ring);
  part(hips,G.shorts,kit.shorts,.03,{sz:.74});
  const legs=[1,-1].map(side=>{
    const hip=joint(hips,side*.092,-.01),knee=joint(hip,0,-.41),ankle=joint(knee,0,-.42);
    part(hip,G.shortsLeg,kit.shorts,-.145,{sz:.9});part(hip,G.thigh,appearance.skin,-.26);
    part(knee,G.knee,appearance.skin,-.04);part(knee,G.sock,kit.socks,-.235);
    part(ankle,G.boot,appearance.boots,-.045,{z:.05});
    return {hip,knee,ankle};
  });
  part(chest,G.torso,kit.shirt,.25,{sz:.64});
  part(chest,G.neck,appearance.skin,.538);
  const head=joint(chest,0,.676);part(head,G.head,appearance.skin,0);hair(head,appearance.hairStyle??'short',appearance.hair);
  const arms=[1,-1].map(side=>{
    const shoulder=joint(chest,side*.205,.45),elbow=joint(shoulder,0,-.29);
    part(shoulder,G.sleeve,kit.shirt,-.06);part(shoulder,G.upperArm,appearance.skin,-.2);
    part(elbow,G.forearm,appearance.skin,-.12);part(elbow,G.hand,keeper?kit.gloves:appearance.skin,-.27,{sx:keeper?1.35:1,sy:keeper?1.25:1,sz:keeper?1.35:1});
    return {shoulder,elbow,side};
  });
  const back=new THREE.Mesh(G.number,new THREE.MeshBasicMaterial({map:numberTexture(number,kit.number),transparent:true,depthWrite:false}));
  back.position.set(0,.3,-.118);back.rotation.y=Math.PI;chest.add(back);
  // User 2026-11-04: players looked a little big for the pitch.
  root.scale.setScalar(PLAYER_SCALE);
  return {root,body,hips,chest,head,legs,arms,shadow,ring,phase:0,heading:0,last:null};
}

/** Model scale against the 105×68 m pitch. */
export const PLAYER_SCALE=.9;
const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
/** Metres per full stride cycle (two steps): ~1.35 m jogging up to ~2.9 m sprinting, so feet do not slide. */
export const strideCycleMeters=speed=>1.35+.2*Math.max(0,speed);
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
/** Piecewise-smooth keyframes: keys = [[u,value],...]. */
const key=(keys,u)=>{if(u<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++)if(u<=keys[i][0]){const [a,va]=keys[i-1],[b,vb]=keys[i];return va+(vb-va)*smooth(a,b,u);}return keys.at(-1)[1];};
const window_=(u,inEnd,outStart)=>smooth(0,inEnd,u)*(1-smooth(outStart,1,u));

function basePose(phase,k,moving,time){
  const p={hip:[0,0],knee:[.06,.06],ankle:[0,0],arm:[.04,.04],out:[.1,.1],elbow:[-.25,-.25],lean:.02,twist:0,hipTwist:0,y:Math.sin(time*2.1)*.004,roll:0,side:0,pitch:0};
  if(moving<=0)return p;
  const hipA=.22+.53*k,armA=.22+.42*k;
  for(let i=0;i<2;i++){
    const leg=phase+i*Math.PI,armPhase=phase+(1-i)*Math.PI,swing=Math.sin(armPhase);
    const hip=-hipA*Math.sin(leg),knee=.12+(.35+1.25*k)*Math.max(0,Math.cos(leg-.6))**1.3,ankle=.3*k*Math.max(0,-Math.sin(leg+.4));
    p.hip[i]+= (hip-p.hip[i])*moving;p.knee[i]+=(knee-p.knee[i])*moving;p.ankle[i]+=(ankle-p.ankle[i])*moving;
    p.arm[i]+=(-armA*swing-p.arm[i])*moving;p.out[i]+=(.1+.1*k-p.out[i])*moving;
    // Forward swing folds the elbow (hand at chest height); back swing opens it toward the hip.
    p.elbow[i]+=((-1.15-.45*k)-.35*k*swing-p.elbow[i])*moving;
  }
  p.lean+=(.04+.2*k-p.lean)*moving;p.twist=.16*k*Math.sin(phase)*moving;p.hipTwist=-.1*k*Math.sin(phase)*moving;
  p.y+=((.015+.045*k)*(.5-.5*Math.cos(2*phase))-.035*k)*moving;
  return p;
}
const mix=(p,q,w)=>{for(const k of Object.keys(q)){if(Array.isArray(q[k]))q[k].forEach((v,i)=>{if(v!==null)p[k][i]+=(v-p[k][i])*w;});else p[k]+=(q[k]-p[k])*w;}};

/** Kick (pass/shot), receive (first touch), touch (dribble). kicking leg index 1 = right foot. */
function actionPose(action){
  const u=clamp(action.u,0,1),P=action.power??1,kick=action.foot??1,plant=1-kick,q={hip:[null,null],knee:[null,null],ankle:[null,null],arm:[null,null],out:[null,null],elbow:[null,null]};
  if(action.kind==='kick'){
    q.hip[kick]=key([[0,0],[.3,.75*P],[.45,-.55*P],[.62,-1.15*P],[1,-.2]],u);q.knee[kick]=key([[0,.2],[.3,1.55],[.45,.3],[.62,.38],[1,.25]],u);
    q.ankle[kick]=key([[0,0],[.3,.15],[.45,.45],[1,.1]],u);
    q.hip[plant]=key([[0,-.1],[.3,-.2],[.45,-.08],[.8,.12]],u);q.knee[plant]=key([[0,.25],[.3,.45],[.45,.38],[1,.3]],u);
    // Balance arm opens wide and fairly straight; the kicking-side arm swings back, then across.
    q.arm[plant]=key([[0,0],[.3,-.15],[.6,-.05],[1,0]],u);q.out[plant]=key([[0,.15],[.3,1.25*P],[.6,1.05*P],[1,.3]],u);q.elbow[plant]=key([[0,-1.1],[.3,-.45],[.7,-.55],[1,-1]],u);
    q.arm[kick]=key([[0,0],[.3,.55],[.6,-.15],[1,0]],u);q.out[kick]=key([[0,.15],[.3,.5],[.6,.35],[1,.2]],u);q.elbow[kick]=key([[0,-1.1],[.3,-.7],[.7,-.8],[1,-1]],u);
    q.lean=key([[0,.05],[.3,-.08],[.45,.14*P],[.7,.06]],u);q.twist=key([[0,0],[.3,.36*P],[.47,-.22*P],[.7,-.32*P],[1,0]],u);
    q.y=key([[0,0],[.45,-.04],[.65,.03*P],[1,0]],u);return {q,w:window_(u,.16,.8)};
  }
  if(action.kind==='header'){
    // Take-off, rise with the forehead forward, land.
    q.y=key([[0,0],[.25,-.06],[.5,.45],[.8,.12],[1,0]],u);q.lean=key([[0,0],[.35,-.2],[.55,.24],[1,0]],u);
    q.hip=[key([[0,0],[.25,-.4],[.5,-.15],[1,0]],u),key([[0,0],[.25,-.4],[.5,.12],[1,0]],u)];q.knee=[key([[0,.2],[.25,.75],[.5,.35],[1,.2]],u),key([[0,.2],[.25,.75],[.5,.55],[1,.2]],u)];
    q.arm=[-.45,-.45];q.out=[.75,.75];q.elbow=[-.6,-.6];return {q,w:window_(u,.15,.85)};
  }
  if(action.kind==='throw'){
    const arm=key([[0,-2.9],[.45,-2.75],[.62,-1.1],[1,-.5]],u),elbow=key([[0,-1.2],[.45,-1.3],[.62,-.25],[1,-.4]],u);
    q.arm=[arm,arm];q.out=[.15,.15];q.elbow=[elbow,elbow];q.lean=key([[0,-.12],[.45,-.2],[.65,.18],[1,.05]],u);return {q,w:window_(u,.12,.85)};
  }
  if(action.kind==='catch'){
    // High claim: up off the ground with both arms above the head; otherwise gloves forward at chest height.
    if(action.high){q.arm=[-2.85,-2.85];q.out=[.18,.18];q.elbow=[-.15,-.15];q.lean=-.05;q.y=key([[0,0],[.25,-.06],[.45,.38],[.75,.05],[1,0]],u);q.knee=[key([[0,.2],[.25,.7],[.45,.2],[1,.2]],u),key([[0,.2],[.25,.7],[.45,.45],[1,.2]],u)];return {q,w:window_(u,.1,.9)};}
    q.arm=[-1.45,-1.45];q.out=[.22,.22];q.elbow=[-.35,-.35];q.lean=.12;return {q,w:window_(u,.12,.9)};
  }
  if(action.kind==='slide'){
    // Sliding tackle: down onto the hip with the lead leg straight along the ground at the ball, the other folded under, torso back;
    // contact at u≈0.22, on the ground until ~0.6, then up.
    const down=key([[0,0],[.16,1],[.6,1],[.88,0]],u),lead=kick,fold=1-kick;
    q.y=-.7*down;q.lean=key([[0,.1],[.16,-.6],[.3,-.72],[.6,-.65],[.88,0]],u);
    q.hip[lead]=-1.5*down;q.knee[lead]=key([[0,.3],[.16,.08],[.6,.12],[.88,.3]],u);q.ankle[lead]=.35*down;
    q.hip[fold]=-.35*down;q.knee[fold]=.2+1.7*down;q.ankle[fold]=.2*down;
    q.arm=[.55*down,.55*down];q.out=[.25+.75*down,.25+.75*down];q.elbow=[-.35,-.35];q.twist=.25*down;
    return {q,w:window_(u,.06,.92)};
  }
  if(action.kind==='fall'){
    // Fouled: stumble, go down face first, stay down a moment, get up.
    const flat=key([[0,0],[.18,.15],[.38,1.33],[.72,1.38],[.92,0]],u),bend=key([[0,.15],[.18,1],[.38,.35],[.72,.3],[.9,1.1],[1,.2]],u);
    q.pitch=flat;q.lean=key([[0,0],[.18,.45],[.38,.1],[.72,.1],[.9,.4],[1,0]],u);q.knee=[bend,bend*.85];q.hip=[-.3*bend,-.25*bend];
    q.arm=[key([[0,0],[.2,-.9],[.38,-2.4],[.72,-2.3],[.9,-.6],[1,0]],u),key([[0,0],[.2,-1.1],[.38,-2.5],[.72,-2.4],[.9,-.7],[1,0]],u)];
    q.out=[.35,.35];q.elbow=[-.3,-.3];q.y=key([[0,0],[.18,-.08],[.38,.06],[.72,.06],[.9,-.05],[1,0]],u);
    return {q,w:window_(u,.04,.96)};
  }
  if(action.kind==='tackle'){
    q.hip[kick]=key([[0,-.2],[.45,-1.05],[1,-.3]],u);q.knee[kick]=key([[0,.3],[.45,.15],[1,.3]],u);q.knee[plant]=key([[0,.3],[.45,.8],[1,.3]],u);
    q.lean=key([[0,.1],[.45,.32],[1,.1]],u);q.y=key([[0,0],[.45,-.16],[1,0]],u);q.out[0]=.5;q.out[1]=.5;return {q,w:window_(u,.15,.8)};
  }
  if(action.kind==='receive'){
    q.hip[kick]=key([[0,-.2],[.45,-.5],[.7,-.25]],u);q.knee[kick]=key([[0,.4],[.45,.55],[.8,.3]],u);q.ankle[kick]=key([[0,0],[.45,-.25],[1,0]],u);
    q.knee[plant]=.38;q.out[0]=.45;q.out[1]=.45;q.lean=.12;q.y=-.03;return {q,w:window_(u,.25,.7)};
  }
  q.hip[kick]=key([[0,-.1],[.5,-.38*P],[1,-.1]],u);q.knee[kick]=key([[0,.3],[.5,.25],[1,.4]],u);q.ankle[kick]=key([[0,0],[.5,.3],[1,0]],u);
  return {q,w:window_(u,.3,.65)};
}

/** state: {x,z,speed,heading?,time,dt,action?,keeper?,dive?:{u,side},celebrate?,owner?} — dt is match time, so slow motion slows legs too. */
export function animateLowPolyPlayer(m,s){
  const moved=m.last?Math.min(1.5,Math.hypot(s.x-m.last.x,s.z-m.last.z)):0,speed=Math.max(0,s.speed??0);
  if(m.last&&moved>.002&&s.heading===undefined)m.target=Math.atan2(s.x-m.last.x,s.z-m.last.z);
  if(s.heading!==undefined)m.target=s.heading;
  m.last={x:s.x,z:s.z};
  // Replays pass a phase derived from distance travelled, so seeking shows the right stride.
  m.phase=s.phase!==undefined?s.phase%TAU:(m.phase+TAU*moved/(strideCycleMeters(speed)*PLAYER_SCALE))%TAU;
  m.heading+=wrap((m.target??m.heading)-m.heading)*(1-Math.exp(-(s.dt??0)*11));
  const k=clamp(speed/7.5,0,1),moving=smooth(.25,1.4,speed),p=basePose(m.phase,k,moving,s.time??0);
  if(s.keeper){const w=s.keeper;mix(p,{hip:[-.35,-.35],knee:[.7,.7],ankle:[.25,.25],arm:[-.5,-.5],out:[.38,.38],elbow:[-.95,-.95],lean:.3,y:-.13},w*(1-moving*.6));}
  if(s.action){const {q,w}=actionPose(s.action);mix(p,q,w);}
  if(s.celebrate)mix(p,{arm:[-.25,-.25],out:[2.45,2.45],elbow:[-.35,-.35]},s.celebrate);
  if(s.dive){
    const u=clamp(s.dive.u,0,1),side=s.dive.side,fly=smooth(0,.45,u),w=1-smooth(.82,1,u);
    mix(p,{hip:[-.25,-.05],knee:[.2,.45],arm:[-.15,-.15],out:[2.85,2.85],elbow:[-.1,-.1],lean:.05},w*smooth(0,.2,u));
    p.roll=-side*1.32*fly*w;p.side=side*.35*smooth(0,.55,u)*w;p.y+=(.48*Math.sin(Math.PI*clamp(u/.55,0,1))+.12*fly)*w;
  }
  m.root.position.set(s.x,0,s.z);m.root.rotation.y=m.heading;
  m.body.position.set(p.side,p.y,0);m.body.rotation.set(p.pitch,0,p.roll);m.hips.rotation.y=p.hipTwist;m.chest.rotation.set(p.lean,p.twist,0);
  m.legs.forEach((leg,i)=>{leg.hip.rotation.x=p.hip[i];leg.knee.rotation.x=p.knee[i];leg.ankle.rotation.x=p.ankle[i];});
  m.arms.forEach((arm,i)=>{arm.shoulder.rotation.set(p.arm[i],0,arm.side*p.out[i]);arm.elbow.rotation.x=p.elbow[i];});
  const air=Math.max(0,p.y);m.shadow.position.x=p.side;m.shadow.scale.set(1+Math.abs(p.roll)*.6,.72,1);m.shadow.material.opacity=.32-air*.25;
  m.ring.visible=!!s.owner;
}
