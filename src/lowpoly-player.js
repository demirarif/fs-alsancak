import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/* Footballer (2026-11-10, user: "karakterleri daha gerçekçi yapabiliriz görsel olarak"): smooth-shaded and rounded — tapered limbs
 * with round ends, a chest that narrows to the waist, a calf, a face (eyes, brows, nose, ears), a collar, cuffs and sock bands in the
 * kit's trim, boots with a sole — instead of the old five-sided faceted prisms. The joints (and so every animation) are unchanged;
 * the head stays a box, rounded (user, earlier: rectangular, not round; head 10% narrower, neck 20% longer).
 * Local forward is +z; local +x is the player's left. Joint rotation.x < 0 swings a limb forward. */
const materials=new Map();
/** Cloth is matt, skin has a little sheen, boots a little gloss. */
const ROUGH={cloth:.8,skin:.55,boot:.42,hair:.78,eye:.3};
const material=(color,kind='cloth')=>{const key=`${color}/${kind}`;let m=materials.get(key);if(!m){m=new THREE.MeshStandardMaterial({color,roughness:ROUGH[kind]??.8,metalness:0});materials.set(key,m);}return m;};
/** A limb: a tube from radius top to bottom over height h, closed with round ends (a lathe), centred on its joint offset. */
function limb(top,bottom,h,{bulge=0,at=.35,seg=14}={}){
  const pts=[],n=10;
  for(let i=0;i<=n;i++){const a=-Math.PI/2+Math.PI/2*i/n;pts.push(new THREE.Vector2(bottom*Math.cos(a),-h/2+bottom*Math.sin(a)));}
  for(let i=1;i<6;i++){const u=i/6,r=bottom+(top-bottom)*u+bulge*Math.sin(Math.PI*Math.min(1,u/(1-at)))*(u<1-at?1:Math.max(0,1-(u-(1-at))/at));pts.push(new THREE.Vector2(r,-h/2+h*u));}
  for(let i=0;i<=n;i++){const a=Math.PI/2*i/n;pts.push(new THREE.Vector2(top*Math.cos(a),h/2+top*Math.sin(a)));}
  return new THREE.LatheGeometry(pts,seg);
}
/** The chest: a lathe from the waist, out over the ribs to the shoulders, rounded off at the top (flattened front to back). */
function torsoGeometry(){
  const prof=[[.158,-.25],[.163,-.17],[.18,-.08],[.2,.02],[.214,.12],[.218,.18],[.205,.225],[.17,.255],[.11,.272],[.05,.278]];
  return new THREE.LatheGeometry(prof.map(([r,y])=>new THREE.Vector2(r,y)),20);
}
const G={
  torso:torsoGeometry(),shorts:new THREE.CylinderGeometry(.168,.176,.2,18),shortsLeg:new THREE.CylinderGeometry(.097,.087,.3,14),
  thigh:limb(.07,.056,.24),knee:new THREE.SphereGeometry(.056,12,8),sock:limb(.058,.042,.3,{bulge:.012,at:.6}),sockBand:new THREE.CylinderGeometry(.061,.061,.035,14,1,true),
  sleeve:new THREE.CylinderGeometry(.074,.066,.14,14),cuff:new THREE.TorusGeometry(.064,.008,6,16),upperArm:limb(.06,.05,.13),forearm:limb(.051,.038,.2),
  hand:new THREE.SphereGeometry(.046,10,8),
  neck:new THREE.CylinderGeometry(.05,.058,.096,12),collar:new THREE.TorusGeometry(.062,.015,6,18),
  head:new RoundedBoxGeometry(.18,.25,.215,3,.05),eye:new THREE.SphereGeometry(.0135,8,6),brow:new RoundedBoxGeometry(.052,.013,.014,1,.005),
  nose:new RoundedBoxGeometry(.03,.052,.036,1,.012),mouth:new THREE.BoxGeometry(.05,.008,.006),ear:new THREE.SphereGeometry(.03,8,6),
  hairCap:new RoundedBoxGeometry(.198,.07,.233,2,.028),hairShell:new RoundedBoxGeometry(.194,.092,.229,3,.04),buzzShell:new RoundedBoxGeometry(.188,.08,.222,3,.035),hairBack:new RoundedBoxGeometry(.198,1,.048,1,.02),hairSide:new RoundedBoxGeometry(.032,1,.13,1,.012),fringe:new RoundedBoxGeometry(.198,.045,.042,1,.016),
  boot:new RoundedBoxGeometry(.1,.07,.255,2,.028),sole:new RoundedBoxGeometry(.104,.018,.262,1,.008),number:new THREE.PlaneGeometry(.19,.19),
  shadow:new THREE.CircleGeometry(.42,18),ring:new THREE.RingGeometry(.42,.5,28),
};
const shadowMaterial=new THREE.MeshBasicMaterial({color:'#0d2412',transparent:true,opacity:.32,depthWrite:false});
const ringMaterial=new THREE.MeshBasicMaterial({color:'#e0f0a0',transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false});
/** A shade of a colour (k < 1 darker): lips and the nose's shadow side from the skin. */
const shade=(hex,k)=>'#'+new THREE.Color(hex).multiplyScalar(k).getHexString();

function part(parent,geometry,color,y,{x=0,z=0,sx=1,sy=1,sz=1,ry=0,rx=0,kind='cloth',shadow=true}={}){
  const m=new THREE.Mesh(geometry,material(color,kind));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.rotation.set(rx,ry,0);m.castShadow=shadow;parent.add(m);return m;
}
function joint(parent,x,y,z=0){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;}
/** Head box is 0.25 m tall around the joint; long hair falls to the shoulders. */
function hair(head,style,color){
  // A shell over the top and upper sides of the head, ending above the brows (it used to be a flat slab laid on top).
  const o={kind:'hair'};
  if(style==='buzz'){part(head,G.buzzShell,color,.093,{...o,z:-.004});return;}
  part(head,G.hairShell,color,.1,{...o,z:-.004});part(head,G.fringe,color,.078,{...o,z:.096,sy:.85});
  const back={short:.12,medium:.2,long:.36}[style]??.12;part(head,G.hairBack,color,.14-back/2,{...o,z:-.106,sy:back});
  if(style==='short')return;
  const side=style==='long'?.26:.15;for(const x of [-.094,.094])part(head,G.hairSide,color,.13-side/2,{...o,x,z:-.035,sy:side});
}
/** Eyes, brows, nose, mouth and ears on the box head (front is +z). Too small to cast shadows. */
function face(head,skin,hairColor){
  const s={shadow:false};
  for(const x of [-.042,.042]){part(head,G.eye,'#1b1612',.022,{...s,x,z:.104,sz:.6,kind:'eye'});part(head,G.brow,hairColor,.05,{...s,x,z:.106,kind:'hair'});part(head,G.ear,skin,.0,{...s,x:x*2.2,sx:.45,sz:.75,kind:'skin'});}
  part(head,G.nose,shade(skin,.93),-.012,{...s,z:.11,kind:'skin'});part(head,G.mouth,shade(skin,.62),-.062,{...s,z:.106,kind:'skin'});
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
  const skin={kind:'skin'},trim=kit.trim??kit.number,boots=appearance.boots;
  // A sole that shows against the upper: light under dark boots, dark under light ones.
  const sole=new THREE.Color(boots).getHSL({h:0,s:0,l:0}).l<.45?'#e4e3dc':'#25272b';
  part(hips,G.shorts,kit.shorts,.03,{sz:.74});
  const legs=[1,-1].map(side=>{
    const hip=joint(hips,side*.092,-.01),knee=joint(hip,0,-.41),ankle=joint(knee,0,-.42);
    part(hip,G.shortsLeg,kit.shorts,-.13,{sz:.92});part(hip,G.thigh,appearance.skin,-.27,skin);
    part(knee,G.knee,appearance.skin,-.01,skin);part(knee,G.sock,kit.socks,-.235);part(knee,G.sockBand,trim,-.075);
    part(ankle,G.boot,boots,-.045,{z:.05,kind:'boot'});part(ankle,G.sole,sole,-.083,{z:.05,kind:'boot'});
    return {hip,knee,ankle};
  });
  part(chest,G.torso,kit.shirt,.25,{sz:.64});
  part(chest,G.collar,trim,.516,{rx:Math.PI/2,sz:.8});
  part(chest,G.neck,appearance.skin,.538,skin);
  const head=joint(chest,0,.676);part(head,G.head,appearance.skin,0,skin);face(head,appearance.skin,appearance.hair);hair(head,appearance.hairStyle??'short',appearance.hair);
  const arms=[1,-1].map(side=>{
    const shoulder=joint(chest,side*.205,.45),elbow=joint(shoulder,0,-.29);
    part(shoulder,G.sleeve,kit.shirt,-.06);part(shoulder,G.cuff,trim,-.128,{rx:Math.PI/2});part(shoulder,G.upperArm,appearance.skin,-.2,skin);
    part(elbow,G.forearm,appearance.skin,-.12,skin);
    part(elbow,G.hand,keeper?kit.gloves:appearance.skin,-.27,keeper?{sx:1.35,sy:1.25,sz:1.35}:{sx:.95,sy:1.15,sz:.8,kind:'skin'});
    return {shoulder,elbow,side};
  });
  const back=new THREE.Mesh(G.number,new THREE.MeshBasicMaterial({map:numberTexture(number,kit.number),transparent:true,depthWrite:false}));
  back.position.set(0,.3,-.118);back.rotation.y=Math.PI;chest.add(back);
  // User 2026-11-04: players looked a little big for the pitch.
  root.scale.setScalar(PLAYER_SCALE);
  // seed: his own breathing and weight-shift rhythm; style: his goal celebration (from the shirt number, so it is always the same).
  // back / shuffle: how much of his gait is a backpedal or a side-step; acc, yawRate, look*: smoothed so they never snap.
  return {root,body,hips,chest,head,legs,arms,shadow,ring,phase:0,heading:0,last:null,seed:(number*2.399)%(Math.PI*2),style:(number*3+1)%4,
    back:0,shuffle:0,acc:0,yawRate:0,vPrev:null,lookYaw:0,lookPitch:0};
}

/** Model scale against the 105×68 m pitch. */
export const PLAYER_SCALE=.9;
const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
/** Metres per full stride cycle (two steps). Found with the leg geometry (2026-11-10, user: "bazı oyuncular koşarken sahada kayıyor"):
 * ~1.5 m walking up to ~4 m sprinting, so the steps come at a footballer's rate (2 a second walking, 3 jogging, 4.5 sprinting; it was
 * 6 at a sprint) and, with the longer hip swing at speed, the planted foot sweeps back about as fast as he moves. */
export const strideCycleMeters=speed=>{const v=Math.max(0,speed),w=walkShare(v);return (1.105+.361*v)*(1-w)+(1.4-.75*Math.exp(-v/.55))*w;};
/** Walking, the stride is set by the walk cycle's sweep (.6 of the cycle on the ground): ~1 m at 1 m/s, two steps a second. */
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
/** Piecewise-smooth keyframes: keys = [[u,value],...]. */
const key=(keys,u)=>{if(u<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++)if(u<=keys[i][0]){const [a,va]=keys[i-1],[b,vb]=keys[i];return va+(vb-va)*smooth(a,b,u);}return keys.at(-1)[1];};
const window_=(u,inEnd,outStart)=>smooth(0,inEnd,u)*(1-smooth(outStart,1,u));
/** Looping keyframes, smooth through every key (Catmull-Rom): keys = [[c,value],...] with c in [0,1), the cycle closing on itself. */
function cyc(keys,c){
  const n=keys.length;c=((c%1)+1)%1;let i=n-1;for(let j=0;j<n;j++)if(keys[j][0]<=c)i=j;
  const at=k=>{const m=((k%n)+n)%n;return [keys[m][0]+Math.floor(k/n),keys[m][1]];};
  const [t0,p0]=at(i-1),[t1,p1]=at(i),[t2,p2]=at(i+1),[t3,p3]=at(i+2),x=c<t1?c+1:c,h=t2-t1,s=(x-t1)/h,s2=s*s,s3=s2*s;
  const m1=(p2-p0)/(t2-t0)*h,m2=(p3-p1)/(t3-t1)*h;
  return (2*s3-3*s2+1)*p1+(s3-2*s2+s)*m1+(-2*s3+3*s2)*p2+(s3-s2)*m2;
}
/** One leg's running cycle at a sprint, over its own cycle c: 0 the foot strikes just ahead of the hips, .15 mid-stance (body at its
 * lowest), .32 toe-off, then the heel folds up behind him and the knee drives through to reach for the next strike. Around .4 and .9
 * both feet are off the ground — the flight that makes it a run and not a fast walk (2026-11-10: the old sine stride planted both feet
 * at full stretch). A jog is the same shape, smaller. */
const RUN={hip:[[0,-.4],[.15,-.02],[.32,.42],[.47,.34],[.66,-.32],[.84,-.74]],
  knee:[[0,.2],[.15,.46],[.32,.22],[.5,1.45],[.68,1.9],[.84,1.1],[.94,.42]],
  ankle:[[0,-.05],[.15,.1],[.32,.55],[.5,.38],[.72,.1],[.92,-.1]]};
/** A walk (2026-11-10): not a slow run. The foot is down for 60% of its cycle — heel strike at 0, the leg sweeping back under him to
 * push off at .6 — so the two stances overlap and a foot is always on the grass; the knee folds only in the swing. Up to ~1.6 m/s it is
 * this, from ~1.9 m/s the run, blended between (a narrow blend: the mixed stride skated and scuffed). */
const WALK={hip:[[0,-.374],[.3,0],[.6,.374],[.75,.054],[.9,-.32]],
  knee:[[0,.08],[.12,.24],[.4,.08],[.6,.36],[.72,1.1],[.84,.78],[.94,.2]],
  ankle:[[0,-.12],[.12,.04],[.45,.1],[.6,.34],[.7,.08],[.9,-.1]]};
/** How much of the gait is the walk, from his speed (m/s). Stance ends at .6 of a leg's cycle walking, .32 running. */
export const walkShare=speed=>1-smooth(1.4,1.9,speed);
const stanceEnd=speed=>.32+.28*walkShare(speed);

/** g: the model (its seed, and how much of the gait is a backpedal or a side-step). */
function basePose(phase,k,moving,time,g){
  const seed=g.seed??0,sway=Math.sin(time*.85+seed);
  // Standing: an athlete's ready stance instead of a mannequin — feet apart, knees soft, arms off the body, the weight shifting a little.
  const p={hip:[-.1,-.1],hipYaw:[0,0],hipOut:[.07,.07],knee:[.22,.22],ankle:[-.04,-.04],arm:[.06,.06],out:[.2,.2],elbow:[-.5,-.5],lean:.08,fwd:0,twist:0,hipTwist:0,
    y:-.02+Math.sin(time*2.1+seed)*.004,roll:.015*sway,side:.02*sway,pitch:0,headYaw:0,headPitch:0};
  if(moving<=0)return p;
  const back=g.back??0,shuffle=g.shuffle??0,kk=k*(1-.45*back),hipS=.55+.95*kk,kneeS=.45+.55*kk,c0=phase/TAU;
  const hips=[0,0],q={hip:[0,0],knee:[0,0],ankle:[0,0],arm:[0,0],elbow:[0,0],out:[0,0],hipOut:[0,0]};
  // Walking: the walk cycle, its step a little shorter the slower he goes; running: the run cycle.
  const wk=walkShare(k*7.5),wa=.7+.3*smooth(.2,1.2,k*7.5);
  for(let i=0;i<2;i++){const c=c0+i*.5;
    hips[i]=cyc(RUN.hip,c)*hipS*(1-wk)+cyc(WALK.hip,c)*wa*wk;q.hip[i]=hips[i];
    q.knee[i]=(.2+(cyc(RUN.knee,c)-.2)*kneeS)*(1-wk)+cyc(WALK.knee,c)*(.6+.4*wa)*wk;q.ankle[i]=cyc(RUN.ankle,c)*(.4+.6*kk)*(1-wk)+cyc(WALK.ankle,c)*wa*wk;}
  // Arms swing against the legs: hand up toward the chin as it comes forward, elbow opening by the hip on the way back.
  for(let i=0;i<2;i++){const a=hips[1-i]*(.75+.35*kk);q.arm[i]=a;q.elbow[i]=-(1.35+.1*kk)-.45*clamp(-a/.66,-1,1);q.out[i]=.12+.06*kk;}
  // Sideways (a defender shuffling across): the feet step apart and back together instead of swinging through.
  if(shuffle>0)for(let i=0;i<2;i++){const s=Math.max(0,Math.sin(phase+i*Math.PI));
    q.hip[i]+=(-.12-q.hip[i])*shuffle;q.knee[i]+=(.32+.25*s-q.knee[i])*shuffle;q.ankle[i]*=1-shuffle;q.hipOut[i]+=(.08+.13*s-q.hipOut[i])*shuffle;
    q.arm[i]+=(.05-q.arm[i])*shuffle;q.elbow[i]+=(-.8-q.elbow[i])*shuffle;q.out[i]+=(.32-q.out[i])*shuffle;}
  for(const key of Object.keys(q))for(let i=0;i<2;i++)p[key][i]+=(q[key][i]-p[key][i])*moving;
  // Lowest at each mid-stance, highest in each flight; leaning into the run, upright when backpedalling.
  const lean=(.07+.17*kk)*(1-back)-.02*back,bob=-(.012+.03*kk)*Math.cos(4*Math.PI*(c0-.15))-.03*kk;
  p.lean+=(lean-p.lean)*moving;p.y+=(bob*(1-.6*shuffle)-p.y)*moving;p.roll*=1-moving;p.side*=1-moving;
  const d=hips[0]-hips[1],run=1-shuffle;p.twist=-.16*kk*d*run*moving;p.hipTwist=.08*kk*d*run*moving;
  return p;
}
/** His goal celebration, always the same one for the same shirt number: arms out like an aeroplane, a fist punching the air, a knee
 * slide when he stops, or both arms to the sky. p: the pose so far (the legs keep running until he stops). A team-mate running to the
 * scorer (s.mate) never knee-slides; once they are together (s.together, 0–1) they hug and jump as one, in step — a scorer on his
 * knees stays down with his arms up and they hug him there. */
function celebratePose(m,p,s,speed){
  const t=s.time??0,still=1-smooth(.8,2.2,speed),style=s.mate&&m.style===2?3:m.style;let q;
  if(style===0)q={arm:[.05,.05],out:[1.5,1.5],elbow:[-.12,-.12],roll:.3*Math.sin(t*2.4),lean:.1,headPitch:-.1};
  else if(style===1){const pump=Math.sin(t*8);q={arm:[.25,-2.55-.25*pump],out:[.55,.35],elbow:[-1.5,-1.1+.5*pump],headPitch:-.3,y:p.y+still*.12*Math.max(0,Math.sin(t*6))};}
  else if(style===2){const kneel=still;
    q={arm:[-.2,-.2],out:[1.3+1.2*kneel,1.3+1.2*kneel],elbow:[-.25,-.25],hip:p.hip.map(v=>v+(-.05-v)*kneel),knee:p.knee.map(v=>v+(1.6-v)*kneel),
      ankle:p.ankle.map(v=>v+(.6-v)*kneel),hipOut:p.hipOut.map(v=>v+(.1-v)*kneel),y:p.y+(-.46-p.y)*kneel,lean:p.lean+(-.38-p.lean)*kneel,headPitch:-.45*kneel};}
  else q={arm:[-2.75,-2.75],out:[.28,.28],elbow:[-.12,-.12],headPitch:-.5,lean:-.05};
  const w=s.together??0;if(w<=0||(style===2&&!s.mate))return q;
  // Together: arms round each other, leaning in, all jumping on the same beat.
  const hop=Math.max(0,Math.sin(t*7)),g={arm:[-1.2,-1.2],out:[.78,.78],elbow:[-1.35,-1.35],lean:.16,headPitch:-.1,roll:0,y:p.y+.11*hop,knee:p.knee.map(v=>v+(.25+.3*(1-hop)-v)*still)};
  for(const k of Object.keys(g)){const a=q[k]??p[k],b=g[k];q[k]=Array.isArray(b)?b.map((v,i)=>a[i]+(v-a[i])*w):a+(b-a)*w;}
  return q;
}
/** Dribble (2026-11-10): the man taking a defender on drops his shoulder toward s.side (+1 his left) and bursts the other way; the
 * defender bites on the feint, then twists back too late (legs apart for a nutmeg). u runs through the move, contact near .47. */
function feintOver(p,f){
  const dip=key([[0,0],[.3,1],[.5,.2],[.62,-.7],[.85,-.25],[1,0]],f.u)*f.amount,side=f.side,leg=side>0?0:1,on=Math.max(0,dip);
  p.roll-=side*.32*dip;p.twist+=side*.35*dip;p.side+=side*.12*dip;p.y-=.06*Math.abs(dip);p.headYaw+=side*.25*dip;
  p.hipOut[leg]+=.22*on;p.knee[leg]+=.25*on;p.knee[1-leg]+=.2*on;p.out[0]+=.35*Math.abs(dip);p.out[1]+=.35*Math.abs(dip);
}
function fooledOver(p,f){
  const bite=key([[0,0],[.3,.4],[.52,1],[.7,.6],[1,0]],f.u)*f.amount,back=key([[0,0],[.55,0],[.75,1],[1,0]],f.u)*f.amount,side=f.side,leg=side>0?0:1;
  p.roll-=side*.3*bite;p.side+=side*.14*bite;p.y-=.07*bite;p.hipOut[leg]+=.3*bite;p.knee[leg]+=.35*bite;p.hip[leg]-=.15*bite;
  p.twist-=side*.45*back;p.headYaw-=side*.5*back;p.out[1-leg]+=.6*back;p.arm[1-leg]-=.4*back;
  if(f.nutmeg){const w=key([[0,0],[.35,1],[.75,1],[1,0]],f.u);p.hipOut[0]+=.18*w;p.hipOut[1]+=.18*w;p.headPitch+=.45*w;}
}
const mix=(p,q,w)=>{for(const k of Object.keys(q)){if(Array.isArray(q[k]))q[k].forEach((v,i)=>{if(v!==null)p[k][i]+=(v-p[k][i])*w;});else p[k]+=(q[k]-p[k])*w;}};

/** Kick (pass/shot), receive (first touch), touch (dribble). kicking leg index 1 = right foot. */
function actionPose(action){
  const u=clamp(action.u,0,1),P=action.power??1,kick=action.foot??1,plant=1-kick,q={hip:[null,null],hipYaw:[null,null],knee:[null,null],ankle:[null,null],arm:[null,null],out:[null,null],elbow:[null,null]};
  // Every kick: head down over the ball through the contact (2026-11-10).
  if(action.kind==='kick')q.headPitch=key([[0,.12],[.4,action.style==='lofted'?.3:.42],[.62,.28],[1,.05]],u);
  // Contact is at u≈.45 for every kick (the engine's windup). 2026-11-09: a five-metre pass used the shot's full swing.
  if(action.kind==='kick'&&action.style==='pass'){
    // Side-foot pass: short backswing, the leg turned out so the inside of the boot meets the ball, a short follow-through, quiet arms.
    const out=kick===1?-1:1;
    q.hip[kick]=key([[0,0],[.3,.42],[.45,-.5],[.6,-.64],[1,-.1]],u);q.knee[kick]=key([[0,.2],[.3,.62],[.45,.18],[.62,.22],[1,.25]],u);
    q.ankle[kick]=key([[0,0],[.3,.1],[.45,.12],[1,.05]],u);q.hipYaw[kick]=out*key([[0,0],[.22,.78],[.62,.72],[1,0]],u);
    q.hip[plant]=key([[0,-.05],[.3,-.12],[.45,-.06],[.8,.04]],u);q.knee[plant]=key([[0,.25],[.3,.42],[.45,.36],[1,.28]],u);
    q.arm[plant]=key([[0,0],[.3,-.08],[1,0]],u);q.out[plant]=key([[0,.15],[.3,.62],[.6,.55],[1,.2]],u);q.elbow[plant]=key([[0,-1.1],[.3,-.6],[1,-1]],u);
    q.arm[kick]=key([[0,0],[.3,.3],[.6,-.05],[1,0]],u);q.out[kick]=key([[0,.15],[.3,.32],[1,.18]],u);
    q.lean=key([[0,.05],[.3,.03],[.45,.12],[.7,.07]],u);q.twist=key([[0,0],[.3,.14],[.5,-.1],[1,0]],u);q.y=key([[0,0],[.45,-.025],[1,0]],u);
    q.fwd=key([[0,0],[.3,.12],[.45,.27],[.7,.22],[1,0]],u);return {q,w:window_(u,.14,.8)};
  }
  if(action.kind==='kick'&&action.style==='lofted'){
    // Long ball, cross or clearance: big backswing, body leaning back over the planted foot, the leg swinging up through the ball.
    q.hip[kick]=key([[0,0],[.3,.82],[.45,-.72],[.65,-1.48],[1,-.25]],u);q.knee[kick]=key([[0,.2],[.3,1.6],[.45,.32],[.65,.28],[1,.25]],u);
    q.ankle[kick]=key([[0,0],[.3,.2],[.45,.5],[1,.1]],u);
    q.hip[plant]=key([[0,-.1],[.3,-.26],[.45,-.16],[.8,.1]],u);q.knee[plant]=key([[0,.25],[.3,.5],[.45,.46],[1,.3]],u);
    q.arm[plant]=key([[0,0],[.3,-.2],[.6,-.1],[1,0]],u);q.out[plant]=key([[0,.15],[.3,1.35],[.6,1.2],[1,.3]],u);q.elbow[plant]=key([[0,-1.1],[.3,-.4],[.7,-.5],[1,-1]],u);
    q.arm[kick]=key([[0,0],[.3,.6],[.6,-.2],[1,0]],u);q.out[kick]=key([[0,.15],[.3,.6],[.6,.45],[1,.2]],u);q.elbow[kick]=key([[0,-1.1],[.3,-.7],[.7,-.8],[1,-1]],u);
    q.lean=key([[0,.04],[.3,-.1],[.45,-.2],[.7,-.12],[1,0]],u);q.twist=key([[0,0],[.3,.4],[.47,-.25],[.75,-.36],[1,0]],u);
    q.y=key([[0,0],[.45,-.035],[.7,.02],[1,0]],u);q.fwd=key([[0,0],[.3,.12],[.45,.2],[.7,.18],[1,0]],u);return {q,w:window_(u,.16,.82)};
  }
  if(action.kind==='kick'){
    // Shot (and a driven pass, softer): over the ball at contact, a full follow-through that lifts him off the ground.
    const shot=action.style==='shot'?1:0;
    q.hip[kick]=key([[0,0],[.3,.75*P],[.45,-.62],[.62,-1.15*P],[1,-.2]],u);q.knee[kick]=key([[0,.2],[.3,1.55],[.45,.3],[.62,.38],[1,.25]],u);
    q.ankle[kick]=key([[0,0],[.3,.15],[.45,.45],[1,.1]],u);
    q.hip[plant]=key([[0,-.1],[.3,-.2],[.45,-.08],[.8,.12]],u);q.knee[plant]=key([[0,.25],[.3,.45],[.45,.38],[1,.3]],u);
    // Balance arm opens wide and fairly straight; the kicking-side arm swings back, then across.
    q.arm[plant]=key([[0,0],[.3,-.15],[.6,-.05],[1,0]],u);q.out[plant]=key([[0,.15],[.3,1.25*P],[.6,1.05*P],[1,.3]],u);q.elbow[plant]=key([[0,-1.1],[.3,-.45],[.7,-.55],[1,-1]],u);
    q.arm[kick]=key([[0,0],[.3,.55],[.6,-.15],[1,0]],u);q.out[kick]=key([[0,.15],[.3,.5],[.6,.35],[1,.2]],u);q.elbow[kick]=key([[0,-1.1],[.3,-.7],[.7,-.8],[1,-1]],u);
    q.lean=key([[0,.05],[.3,-.08],[.45,(.14+.1*shot)*P],[.7,.06+.06*shot]],u);q.twist=key([[0,0],[.3,.36*P],[.47,-.22*P],[.7,-.32*P],[1,0]],u);
    q.y=key([[0,0],[.45,-.04],[.65,(.03+.05*shot)*P],[1,0]],u);
    // The ball sits ~0.55 m ahead of him (engine carry offset); the planting step brings the striking foot to it.
    q.fwd=key([[0,0],[.3,.12],[.45,.22],[.7,.2],[1,0]],u);return {q,w:window_(u,.16,.8)};
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
    // First touch (2026-11-10: it barely showed): the receiving foot turned out and lifted to meet the ball with the inside of the boot,
    // giving with it at contact (≈.45) to kill it; knees soft, arms out for balance, eyes on the ball.
    const out=kick===1?-1:1;
    q.hipYaw[kick]=out*key([[0,0],[.28,.62],[.75,.5],[1,0]],u);q.hip[kick]=key([[0,-.05],[.3,-.44],[.45,-.38],[.62,-.12],[1,-.05]],u);
    q.knee[kick]=key([[0,.3],[.3,.52],[.45,.46],[.62,.36],[1,.25]],u);q.ankle[kick]=key([[0,0],[.3,-.22],[.5,-.15],[1,0]],u);
    q.hip[plant]=-.1;q.knee[plant]=key([[0,.3],[.45,.52],[1,.3]],u);q.hipOut=[.06,.06];
    q.out=[key([[0,.2],[.35,.62],[.8,.5],[1,.2]],u),key([[0,.2],[.35,.58],[.8,.48],[1,.2]],u)];q.elbow=[-.75,-.75];q.arm=[.05,.05];
    q.lean=key([[0,.06],[.4,.18],[1,.08]],u);q.y=key([[0,0],[.45,-.05],[1,0]],u);q.headPitch=key([[0,.12],[.4,.4],[1,.12]],u);
    return {q,w:window_(u,.2,.75)};
  }
  q.hip[kick]=key([[0,-.1],[.5,-.38*P],[1,-.1]],u);q.knee[kick]=key([[0,.3],[.5,.25],[1,.4]],u);q.ankle[kick]=key([[0,0],[.5,.3],[1,0]],u);
  return {q,w:window_(u,.3,.65)};
}

/** state: {x,z,speed,heading?,time,dt,action?,keeper?,dive?:{u,side},celebrate?,owner?,look?,lookUp?} — dt is match time, so slow
 * motion slows legs too. heading: where he faces (else where he moves); look: the world angle to the ball, lookUp its pitch. */
export function animateLowPolyPlayer(m,s){
  const dx=m.last?s.x-m.last.x:0,dz=m.last?s.z-m.last.z:0,moved=m.last?Math.min(1.5,Math.hypot(dx,dz)):0,speed=Math.max(0,s.speed??0),dt=s.dt??0,ease=r=>1-Math.exp(-dt*r);
  if(m.last&&moved>.002&&s.heading===undefined)m.target=Math.atan2(dx,dz);
  if(s.heading!==undefined)m.target=s.heading;
  m.last={x:s.x,z:s.z};
  const before=m.heading;m.heading+=wrap((m.target??m.heading)-m.heading)*ease(11);
  // How he moves against where he faces (2026-11-10): forward, backpedalling, or side-stepping. Backwards the stride runs in reverse.
  const h=m.heading,along=moved>.002?(dx*Math.sin(h)+dz*Math.cos(h))/moved:1,across=moved>.002?(dx*Math.cos(h)-dz*Math.sin(h))/moved:0;
  if(moved>.002){m.back+=((along<-.35?1:0)-m.back)*ease(8);m.shuffle+=((Math.abs(across)>.65&&speed<4.5?1:0)-m.shuffle)*ease(8);}
  // Replays pass a phase derived from distance travelled, so seeking shows the right stride.
  m.phase=s.phase!==undefined?s.phase%TAU:(m.phase+(along<-.2?-1:1)*TAU*moved/(strideCycleMeters(speed)*PLAYER_SCALE)+TAU)%TAU;
  if(dt>0){m.acc+=(clamp((speed-(m.vPrev??speed))/dt,-8,8)-m.acc)*ease(3);m.yawRate+=(clamp(wrap(m.heading-before)/dt,-4,4)-m.yawRate)*ease(6);}m.vPrev=speed;
  // Full steps from a slow walk: below 1.4 m/s the legs used to move only partly, and the body glided (83% foot slide at 0.6 m/s).
  const k=clamp(speed/7.5,0,1),moving=smooth(.06,.6,speed),p=basePose(m.phase,k,moving,s.time??0,m);
  // Into the run as he speeds up, back as he brakes; banking into a turn at speed.
  p.lean+=clamp(m.acc*.028,-.2,.16)*moving*(1-m.back);p.roll+=clamp(-m.yawRate*speed*.03,-.28,.28)*moving*(1-m.shuffle);
  // Head, and a little of the chest, turn to the ball; up to it in the air, down to it at his feet.
  m.lookYaw+=((s.look!==undefined?clamp(wrap(s.look-h),-1.35,1.35):0)-m.lookYaw)*ease(7);m.lookPitch+=((s.lookUp??0)-m.lookPitch)*ease(7);
  if(s.keeper){const w=s.keeper;mix(p,{hip:[-.35,-.35],hipOut:[.15,.15],knee:[.7,.7],ankle:[.25,.25],arm:[-.5,-.5],out:[.38,.38],elbow:[-.95,-.95],lean:.3,y:-.13},w*(1-moving*.6));}
  let busy=0;if(s.action){const {q,w}=actionPose(s.action);mix(p,q,w);busy=w;}
  if(s.celebrate){mix(p,celebratePose(m,p,s,speed),s.celebrate);busy=Math.max(busy,s.celebrate*.6);}
  if(s.dive){
    const u=clamp(s.dive.u,0,1),side=s.dive.side,fly=smooth(0,.45,u),w=1-smooth(.82,1,u);
    mix(p,{hip:[-.25,-.05],knee:[.2,.45],arm:[-.15,-.15],out:[2.85,2.85],elbow:[-.1,-.1],lean:.05},w*smooth(0,.2,u));
    p.roll=-side*1.32*fly*w;p.side=side*.35*smooth(0,.55,u)*w;p.y+=(.48*Math.sin(Math.PI*clamp(u/.55,0,1))+.12*fly)*w;busy=Math.max(busy,w);
  }
  const free=1-busy;p.twist+=m.lookYaw*.3*(1-.75*moving)*free;p.headYaw=clamp(m.lookYaw*.95*free-p.twist,-1.1,1.1);p.headPitch+=m.lookPitch*free;
  if(s.feint)feintOver(p,s.feint);if(s.fooled)fooledOver(p,s.fooled);
  // Referee's signals (2026-11-10): his right arm pointing the way he faces (level for a free kick or throw-in, down to the spot or the
  // centre, up to the corner flag), the whistle to his mouth, or both arms up at full time.
  if(s.signal){const g=s.signal,w=g.w;
    if(g.kind==='point')mix(p,{arm:[null,g.level==='low'?-.95:g.level==='up'?-2.1:-1.5],out:[null,.12],elbow:[null,-.05],headPitch:g.level==='low'?.25:0},w);
    else if(g.kind==='whistle')mix(p,{arm:[-2.05,null],out:[.38,null],elbow:[-2.35,null],headPitch:-.08},w);
    else mix(p,{arm:[-2.75,-2.75],out:[.3,.3],elbow:[-.1,-.1],headPitch:-.2},w);}
  m.root.position.set(s.x,0,s.z);m.root.rotation.y=m.heading;
  m.body.position.set(p.side,p.y,p.fwd);m.body.rotation.set(p.pitch,0,p.roll);m.hips.rotation.y=p.hipTwist;m.chest.rotation.set(p.lean,p.twist,0);m.head.rotation.set(p.headPitch,p.headYaw,0);
  m.legs.forEach((leg,i)=>{leg.hip.rotation.set(p.hip[i],p.hipYaw[i],(i?-1:1)*p.hipOut[i]);leg.knee.rotation.x=p.knee[i];leg.ankle.rotation.x=p.ankle[i];});
  m.arms.forEach((arm,i)=>{arm.shoulder.rotation.set(p.arm[i],0,arm.side*p.out[i]);arm.elbow.rotation.x=p.elbow[i];});
  const air=Math.max(0,p.y);m.shadow.position.x=p.side;m.shadow.scale.set(1+Math.abs(p.roll)*.6,.72,1);m.shadow.material.opacity=.32-air*.25;
  m.ring.visible=!!s.owner;
  plantFoot(m,s,h,moving>.3&&busy<.3&&!s.dive&&!s.signal&&dt>0&&dt<.2,dt,speed);
}
/* Foot planting (2026-11-10, user: "bazı oyuncular koşarken sahada kayıyor gibi"): the stride is timed to his speed, but this short-legged
 * model's planted foot still swept back 10–15% slower than he moved, so it skated. While a foot is on the ground the body (hips and all)
 * is shifted a few centimetres so that foot stays where it landed; in the air the shift eases back to nothing. At most 0.2 m.
 * Upright too: the standing boot is put on the grass (it went 2–5 cm under at mid-stance), no boot ever sinks, and walking one is
 * always down (both feet were off the ground a third of the time, a hover); running keeps its flight.
 * Which foot is standing comes from the stride, not from which is lower: with the body lowered the swinging boot passes as low as the
 * standing one, and choosing by height swapped the plant to it mid-swing (the walk then skated at 45%). */
const SOLE=new THREE.Vector3(),FOOT=[new THREE.Vector3(),new THREE.Vector3()];
const soleOf=(leg,out)=>{leg.ankle.updateWorldMatrix(true,false);return out.copy(SOLE.set(0,-.08,.05).applyMatrix4(leg.ankle.matrixWorld));};
function plantFoot(m,s,h,on,dt,speed=0){
  const P=m.plant??={leg:-1,x:0,z:0,ox:0,oz:0};
  if(!on){P.leg=-1;P.ox*=.8;P.oz*=.8;m.body.position.x+=P.ox;m.body.position.z+=P.oz;return;}
  m.body.position.x+=P.ox;m.body.position.z+=P.oz;
  soleOf(m.legs[0],FOOT[0]);soleOf(m.legs[1],FOOT[1]);
  // The stride's stance (RUN: strike at 0, toe-off at .32 of each leg's cycle); walking it lasts the half cycle, so a foot is always down.
  // Stance from the stride (walk .6 of each leg's cycle, run .32); in a walk's double support the trailing foot (struck earlier) holds.
  const end=stanceEnd(speed),c0=m.phase/TAU,cy=[((c0%1)+1)%1,((c0+.5)%1+1)%1],in0=cy[0]<end,in1=cy[1]<end;
  let st=in0&&in1?(cy[0]>cy[1]?0:1):in0?0:in1?1:-1;const c=Math.cos(h),sn=Math.sin(h);
  // Out of stance by the cycle but still on the grass (the toe leaving, the heel arriving): that boot holds too.
  if(st<0){const lo=FOOT[0].y<FOOT[1].y?0:1;if(FOOT[lo].y<.02)st=lo;}
  if(st>=0){
    const f=FOOT[st];
    if(P.leg===st){
      // World slip of the planted sole → the body's local frame (root turned by h, scaled), then undo it.
      const wx=P.x-f.x,wz=P.z-f.z,lx=(wx*c-wz*sn)/PLAYER_SCALE,lz=(wx*sn+wz*c)/PLAYER_SCALE;
      let ox=P.ox+lx,oz=P.oz+lz;const len=Math.hypot(ox,oz);if(len>.2){ox*=.2/len;oz*=.2/len;}
      m.body.position.x+=ox-P.ox;m.body.position.z+=oz-P.oz;P.ox=ox;P.oz=oz;
    }else{P.leg=st;P.x=f.x;P.z=f.z;}
  }else P.leg=-1;
  // Height: the standing boot on the grass; in flight only that neither boot is under it.
  const low=Math.min(FOOT[0].y,FOOT[1].y);let dy=st>=0?-FOOT[st].y:Math.max(0,-low);if(low+dy<0)dy=-low;dy=clamp(dy,-.07,.07);m.body.position.y+=dy/PLAYER_SCALE;
  // Always easing back toward the hips' own place (fast in the air, slowly on the ground), so it never builds up.
  const back=1-Math.exp(-dt*(P.leg<0?9:1.5));P.ox-=P.ox*back;P.oz-=P.oz*back;
}
