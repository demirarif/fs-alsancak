import * as THREE from 'three';
import { SKIN_TONES } from './v1/config/appearance.ts';

const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .96, ...extra });
const concrete = material('#63716a'), darkConcrete = material('#3a4844'), white = material('#e4e9dc');

function box(scene, size, position, mat, shadows = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size),mat);
  mesh.position.set(...position);mesh.castShadow = shadows;mesh.receiveShadow = true;scene.add(mesh);return mesh;
}

/* The turf (2026-11-10, user: "sahayı ... daha gerçekçi"): mowing bands that catch the light a little differently across their width,
 * blades instead of square grain, and wear where a pitch wears — the goalmouths, the penalty spots, the centre — paler and yellower.
 * Still no external artwork. Canvas: 2048 × 1326 for 105 × 68 m (19.5 px/m); u runs along the length. */
function grassTexture() {
  const W=2048,H=1326,px=W/105,canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');
  let seed=381;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  // Bands: 12 across the length, each with a soft light-to-shade sweep (the mower's direction).
  const bands=12,bw=W/bands;
  for(let i=0;i<bands;i++){
    const g=ctx.createLinearGradient(i*bw,0,(i+1)*bw,0),light=i%2===0;
    g.addColorStop(0,light?'#4a7640':'#3b6336');g.addColorStop(.5,light?'#477340':'#3d6637');g.addColorStop(1,light?'#44703e':'#3f6838');
    ctx.fillStyle=g;ctx.fillRect(Math.floor(i*bw),0,Math.ceil(bw)+1,H);
  }
  // Blades: short strokes lying mostly along the mowing direction, in several greens.
  const tints=['rgba(150,190,96,.10)','rgba(98,140,62,.12)','rgba(28,62,26,.12)','rgba(190,205,130,.06)','rgba(44,86,38,.14)'];
  ctx.lineCap='round';
  for(let i=0;i<260000;i++){
    const x=random()*W,y=random()*H,len=1.6+random()*3.2,a=(random()-.5)*.9;
    ctx.strokeStyle=tints[(random()*tints.length)|0];ctx.lineWidth=.55+random()*.7;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*len,y+Math.sin(a)*len);ctx.stroke();
  }
  // Wear: soft pale patches, mottled, where the play is heaviest.
  const wear=(mx,mz,rx,rz,strength)=>{
    const cx=(mx+52.5)*px,cy=(34-mz)*px;
    for(let k=0;k<70;k++){
      const ox=(random()-.5)*rx*px*1.3,oy=(random()-.5)*rz*px*1.3,r=(.35+random()*.65)*Math.min(rx,rz)*px*.55;
      const g=ctx.createRadialGradient(cx+ox,cy+oy,0,cx+ox,cy+oy,r);
      g.addColorStop(0,`rgba(118,128,74,${(.07+random()*.07)*strength})`);g.addColorStop(1,'rgba(118,128,74,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx+ox,cy+oy,r,0,Math.PI*2);ctx.fill();
    }
  };
  for(const s of [-1,1]){wear(s*49.5,0,6,9,1.25);wear(s*41.5,0,2.6,2.6,.8);wear(s*44,0,9,12,.45);}
  wear(0,0,5,5,.35);wear(0,0,16,22,.07);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
  return texture;
}
/** A small tiling bump of grass tufts, repeated many times over the pitch: close up the turf catches the light unevenly. */
function grassBump() {
  const N=256,canvas=document.createElement('canvas');canvas.width=canvas.height=N;const ctx=canvas.getContext('2d');
  let seed=77;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  ctx.fillStyle='#808080';ctx.fillRect(0,0,N,N);
  for(let i=0;i<9000;i++){const v=(110+random()*110)|0,x=random()*N,y=random()*N;ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(x,y,1+random()*1.5,1.5+random()*3);}
  const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(70,45);t.anisotropy=8;return t;
}

function field(scene) {
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(500,500), material('#3d5147'));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.06;ground.receiveShadow=true;scene.add(ground);
  const surround = new THREE.Mesh(new THREE.PlaneGeometry(122,84),material('#476b40'));
  surround.rotation.x=-Math.PI/2;surround.position.y=-.025;surround.receiveShadow=true;scene.add(surround);
  const turf=new THREE.Mesh(new THREE.PlaneGeometry(105,68),material('#ffffff',{map:grassTexture(),bumpMap:grassBump(),bumpScale:.6,roughness:.92}));
  turf.rotation.x=-Math.PI/2;turf.receiveShadow=true;scene.add(turf);
  // Painted lines: brighter and crisper, still a touch of the grass through them.
  const lineMat=new THREE.MeshBasicMaterial({color:'#eef3e6',transparent:true,opacity:.9,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const lineVertices=[];
  function strip(x1,z1,x2,z2,width=.115){
    const dx=x2-x1,dz=z2-z1,length=Math.hypot(dx,dz);
    const nx=-dz/length*width/2,nz=dx/length*width/2;
    const a=[x1+nx,.017,z1+nz],b=[x1-nx,.017,z1-nz],c=[x2+nx,.017,z2+nz],d=[x2-nx,.017,z2-nz];
    lineVertices.push(...a,...b,...c,...c,...b,...d);
  }
  function rectangle(x1,z1,x2,z2){strip(x1,z1,x2,z1);strip(x2,z1,x2,z2);strip(x2,z2,x1,z2);strip(x1,z2,x1,z1);}
  function circle(x,z,r,start=0,end=Math.PI*2){
    const points=[];for(let a=start;a<=end+.001;a+=(end-start)/96)points.push(new THREE.Vector3(x+Math.cos(a)*r,.019,z+Math.sin(a)*r));
    for(let i=0;i<points.length-1;i++)strip(points[i].x,points[i].z,points[i+1].x,points[i+1].z,.105);
  }
  function spot(x,z){const m=new THREE.Mesh(new THREE.CircleGeometry(.16,16),lineMat);m.rotation.x=-Math.PI/2;m.position.set(x,.02,z);scene.add(m);}
  rectangle(-52.5,-34,52.5,34);strip(0,-34,0,34);circle(0,0,9.15);spot(0,0);
  for(const sign of [-1,1]){
    rectangle(sign*52.5,-20.16,sign*36,20.16);rectangle(sign*52.5,-9.16,sign*47,9.16);spot(sign*41.5,0);
    const angle=Math.acos(5.5/9.15);
    circle(sign*41.5,0,9.15,sign===1?Math.PI-angle:-angle,sign===1?Math.PI+angle:angle);
    goal(scene,sign);
    for(const z of [-34,34]){
      const cornerX=sign*52.5;
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,1.5,5),white);pole.position.set(cornerX,.75,z);scene.add(pole);
      const flag=new THREE.Mesh(new THREE.PlaneGeometry(.47,.31),new THREE.MeshStandardMaterial({color:'#e7ba4b',side:THREE.DoubleSide}));flag.position.set(cornerX+.23,1.33,z);scene.add(flag);
      const start=sign===-1?(z<0?0:-Math.PI/2):(z<0?Math.PI/2:Math.PI);
      circle(cornerX,z,1,start,start+Math.PI/2);
    }
  }
  const lineGeometry=new THREE.BufferGeometry();lineGeometry.setAttribute('position',new THREE.Float32BufferAttribute(lineVertices,3));scene.add(new THREE.Mesh(lineGeometry,lineMat));
}

function goal(scene,sign) {
  const g=new THREE.Group();const front=sign*52.65,back=sign*55.2,height=2.44,half=3.66;
  function bar(a,b,r=.065,mat=white){
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),d=end.clone().sub(start);
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length(),7),mat);mesh.position.copy(start.add(end).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());mesh.castShadow=true;g.add(mesh);
  }
  bar([front,0,-half],[front,height,-half]);bar([front,0,half],[front,height,half]);bar([front,height,-half],[front,height,half]);
  for(const z of [-half,half]){bar([front,height,z],[back,2,z],.035);bar([back,0,z],[back,2,z],.035);bar([front,.05,z],[back,.05,z],.025);}
  bar([back,2,-half],[back,2,half],.03);
  const netMat=new THREE.LineBasicMaterial({color:'#d3e0d5',transparent:true,opacity:.44});const points=[];
  const segment=(a,b)=>points.push(...a,...b);
  for(let z=-half;z<=half;z+=.24){segment([back,0,z],[back,2,z]);segment([front,height,z],[back,2,z]);}
  for(let y=.12;y<=2;y+=.24)segment([back,y,-half],[back,y,half]);
  for(const z of [-half,half]){
    for(let x=Math.min(front,back);x<=Math.max(front,back);x+=.24){const h=height-(Math.abs(x-front)/Math.abs(back-front))*.44;segment([x,0,z],[x,h,z]);}
    for(let y=.12;y<2;y+=.24)segment([front,y,z],[back,y,z]);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.add(new THREE.LineSegments(geometry,netMat));scene.add(g);
}

function boardTexture() {
  const c=document.createElement('canvas');c.width=2048;c.height=96;const ctx=c.getContext('2d');
  ctx.fillStyle='#1e2b28';ctx.fillRect(0,0,c.width,c.height);
  for(let i=0;i<4;i++){
    const x=i*512;ctx.fillStyle='#d5ee90';ctx.font='bold 32px Arial';ctx.fillText('ALSANCAK',x+33,54);
    ctx.fillStyle='#a1b39e';ctx.font='11px Arial';ctx.fillText('OYUNU BİRLİKTE KUR.',x+286,51);
    ctx.fillStyle='#4c6250';ctx.fillRect(x+489,27,1,42);
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}

/** Seating per side and per end in its own group: a camera standing in or behind a stand does not show it (a broadcast never shows its
 * own stand). Boards, walkways and lines stay. */
/** Spectators on the seats (2026-11-09: the stands were empty coloured blocks): a low-poly torso and head per fan, one InstancedMesh of
 * each per stand so a hidden stand hides its crowd too. Fans wear their team's shirt or plain clothes; on a goal the scoring side's fans
 * jump (match time, so a slow-motion replay slows them too). */
function buildCrowd(stands, kits) {
  let seed=977;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const plain=['#d9d6cc','#2b2f36','#6f7a83','#a8925f','#3f5f4a','#c9c2b0','#8a3b2e','#e3c65a'];
  const torsoGeo=new THREE.BoxGeometry(.42,.5,.3),headGeo=new THREE.BoxGeometry(.2,.23,.21),mat=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.92,flatShading:true});
  const dummy=new THREE.Object3D(),color=new THREE.Color(),parts=[];
  for(const {group,spots} of stands){
    const people=[];
    for(const s of spots){if(random()>s.fill)continue;const r=random();people.push({...s,fan:r<.36?0:r<.72?1:2,phase:random()*Math.PI*2,lift:.22+random()*.22});}
    const torso=new THREE.InstancedMesh(torsoGeo,mat,people.length),head=new THREE.InstancedMesh(headGeo,mat,people.length);
    people.forEach((p,i)=>{color.set(p.fan<2?kits[p.fan]:plain[Math.floor(random()*plain.length)]);torso.setColorAt(i,color);color.set(SKIN_TONES[Math.floor(random()*SKIN_TONES.length)].color);head.setColorAt(i,color);});
    group.add(torso,head);parts.push({torso,head,people});
  }
  /** Writes every fan at his jump height: `lift(p)` metres above his seat. */
  const place=lift=>{for(const {torso,head,people} of parts){people.forEach((p,i)=>{const up=lift(p);
    dummy.rotation.set(0,p.ry,0);dummy.position.set(p.x,p.y+.55+up,p.z);dummy.updateMatrix();torso.setMatrixAt(i,dummy.matrix);
    dummy.position.set(p.x,p.y+.95+up,p.z);dummy.updateMatrix();head.setMatrixAt(i,dummy.matrix);});torso.instanceMatrix.needsUpdate=true;head.instanceMatrix.needsUpdate=true;}};
  place(()=>0);
  let cheer=null;const CHEER=3.2;
  return {
    cheer(team){cheer={team,t:0};},
    calm(){if(cheer){cheer=null;place(()=>0);}},
    update(dt){
      if(!cheer||dt<=0)return;cheer.t+=dt;
      if(cheer.t>CHEER){cheer=null;place(()=>0);return;}
      const t=cheer.t,fade=Math.min(1,t/.25)*Math.min(1,(CHEER-t)/.8);
      place(p=>p.fan===cheer.team?p.lift*fade*Math.max(0,Math.sin(t*7.5+p.phase)):p.fan===2?.25*p.lift*fade*Math.max(0,Math.sin(t*6+p.phase)):0);
    },
  };
}

function stands(scene, kits) {
  const boardMat=new THREE.MeshBasicMaterial({map:boardTexture(),side:THREE.DoubleSide});
  const seatingColors=['#3d5149','#758079','#c5c5b0','#b59c68','#52665d','#a5aea3','#465d55','#7d5550'];
  const seatMaterial = material('#ffffff');
  const dummy=new THREE.Object3D(), color=new THREE.Color();
  const group=()=>{const g=new THREE.Group();scene.add(g);return g;};
  const groups={side:{[-1]:group(),[1]:group()},end:{[-1]:group(),[1]:group()}};
  // Seats a fan may take: fuller along the halfway line, thinner toward the corners and behind the goals.
  const crowdStands=[];
  for(const side of [-1,1]){
    const stand=groups.side[side],seats=new THREE.InstancedMesh(new THREE.BoxGeometry(.56,.6,.48),seatMaterial,1200);let count=0;const spots=[];crowdStands.push({group:stand,spots});
    box(scene,[122,.18,3.4],[0,.04,side*37],material('#64736b'));
    box(scene,[120,.75,.35],[0,.5,side*39.1],darkConcrete);
    const ad=new THREE.Mesh(new THREE.PlaneGeometry(116,1.05),boardMat);ad.position.set(0,.8,side*38.9);ad.rotation.y=side===-1?0:Math.PI;scene.add(ad);
    for(let row=0;row<8;row++){
      const z=side*(41+row*1.35),y=.8+row*.6;
      box(stand,[125,.65,1.37],[0,y-.25,z],row%2?concrete:darkConcrete);
      for(let col=0;col<132;col++){
        if(col%33<3)continue;
        const x=-59.5+col*.91;
        dummy.position.set(x,y+.43,z);dummy.rotation.set(0,side===-1?0:Math.PI,0);dummy.scale.set(1,1,1);dummy.updateMatrix();seats.setMatrixAt(count,dummy.matrix);
        color.set(seatingColors[(col*13+row*7+(col%3)*11)%seatingColors.length]);seats.setColorAt(count,color);count++;
        // Sitting on the seat top (y + .73): the torso's centre .25 above it, a little to the back of the seat.
        spots.push({x,y:y+.43,z:z+side*.12,ry:side===-1?0:Math.PI,fill:Math.abs(x)<34?.74:.5});
      }
    }
    box(stand,[126,.4,.5],[0,6.1,side*51.2],material('#a1aba0'));
    box(stand,[126,2.0,.4],[0,6.9,side*51.6],darkConcrete);
    seats.count=count;seats.instanceMatrix.needsUpdate=true;stand.add(seats);
  }
  for(const sign of [-1,1]){
    box(scene,[3.5,.15,77],[sign*58.7,.03,0],material('#69776e'));
    const ad=new THREE.Mesh(new THREE.PlaneGeometry(71,1.05),boardMat);ad.position.set(sign*57.7,.8,0);ad.rotation.y=sign===-1?Math.PI/2:-Math.PI/2;scene.add(ad);
    // Seated like the side stands (bare concrete steps read as grey bands when the camera swings toward a goal).
    const seats=new THREE.InstancedMesh(new THREE.BoxGeometry(.56,.6,.48),seatMaterial,500);let count=0;const spots=[];crowdStands.push({group:groups.end[sign],spots});
    for(let row=0;row<5;row++){
      const x=sign*(61+row*1.5),y=.8+row*.6;box(groups.end[sign],[1.6,.6,83],[x,y,0],row%2?concrete:darkConcrete);
      for(let col=0;col<90;col++){
        if(col%30<2)continue;
        dummy.position.set(x,y+.6,-40.5+col*.91);dummy.rotation.set(0,sign===-1?Math.PI/2:-Math.PI/2,0);dummy.scale.set(1,1,1);dummy.updateMatrix();seats.setMatrixAt(count,dummy.matrix);
        color.set(seatingColors[(col*11+row*5+(col%4)*7)%seatingColors.length]);seats.setColorAt(count,color);count++;
        spots.push({x:x+sign*.12,y:y+.6,z:-40.5+col*.91,ry:sign===-1?Math.PI/2:-Math.PI/2,fill:.42});
      }
    }
    seats.count=count;seats.instanceMatrix.needsUpdate=true;groups.end[sign].add(seats);
    // A restrained end wall gives depth without enclosing the pitch in a box.
    box(groups.end[sign],[.4,1.8,84],[sign*69,4.1,0],darkConcrete);
  }
  // Technical areas and benches on the near touchline: part of the main stand's view, hidden with it.
  for(const x of [-13,13]){
    box(groups.side[1],[8,.2,2.3],[x,.15,38],darkConcrete);
    box(groups.side[1],[8,.1,2.4],[x,2.15,38.4],material('#354c45'));
    box(groups.side[1],[8,1.6,.12],[x,1.25,39.5],material('#89a198',{transparent:true,opacity:.35}));
  }
  return {...groups,crowd:buildCrowd(crowdStands,kits)};
}

/** Builds the pitch and stands; returns the stand groups (side ±1 along z, end ±1 along x) so a view can leave out the one it stands in,
 * and the crowd (cheer / calm / update). kits: the two teams' shirt colours, for the fans. */
export function buildStadium(scene, { kits = ['#1d3766', '#76203a'] } = {}) { field(scene);return stands(scene, kits); }
