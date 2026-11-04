import * as THREE from 'three';

/* Presentation-only effects. They run on match time, so slow motion slows the dust too. */
const puffGeometry=new THREE.IcosahedronGeometry(1,0),bitGeometry=new THREE.BoxGeometry(1,1,1),ringGeometry=new THREE.RingGeometry(.82,1,16);

export function createMatchEffects(scene,{seed=11}={}){
  const pool=[],active=new Set();let random=seed>>>0;
  const rand=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;};
  const between=(a,b)=>a+(b-a)*rand();
  function take(geometry){
    let p=pool.find(item=>!active.has(item)&&item.mesh.geometry===geometry);
    if(!p){const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({transparent:true,depthWrite:false,roughness:1,flatShading:true}));mesh.renderOrder=2;scene.add(mesh);p={mesh,v:new THREE.Vector3(),spin:new THREE.Vector3()};pool.push(p);}
    active.add(p);p.mesh.visible=true;return p;
  }
  function spawn(geometry,{at,v,color,size,grow=0,life,opacity,gravity=0,drag=0,spin=0,flat=false}){
    const p=take(geometry);Object.assign(p,{age:0,life,size,grow,opacity,gravity,drag,flat});
    p.mesh.position.copy(at);p.v.copy(v);p.spin.set(between(-spin,spin),between(-spin,spin),between(-spin,spin));
    p.mesh.material.color.set(color);p.mesh.material.opacity=opacity;p.mesh.scale.setScalar(size);p.mesh.rotation.set(flat?-Math.PI/2:rand()*3,flat?0:rand()*3,0);
  }
  return {
    /** Contact under the kicking foot: soft dust, a few grass bits and a faint ground ring. power 0..1. */
    kick(position,direction,power=1){
      const at=new THREE.Vector3(position.x,.06,position.z),back=new THREE.Vector3(-direction.x,0,-direction.z).normalize();
      // A dribble touch lifts a whisper of dust; a shot lifts a small cloud.
      const dust=Math.round(1+power*12);
      for(let i=0;i<dust;i++){
        const spread=new THREE.Vector3(between(-1,1),0,between(-1,1)).multiplyScalar(.9).add(back.clone().multiplyScalar(between(.2,1)));
        spawn(puffGeometry,{at:at.clone().add(spread.clone().multiplyScalar(.12)),v:spread.multiplyScalar(between(.5,1.4)*(.6+power)).setY(between(.25,.9)*(.5+power)),
          color:['#d9d2b6','#cfc7a8','#e4dfca'][i%3],size:between(.07,.13),grow:between(1.6,2.8),life:between(.75,1.3),opacity:between(.38,.55),drag:2.2,spin:1.5});
      }
      for(let i=0;i<Math.round(power*7);i++)spawn(bitGeometry,{at:at.clone(),v:new THREE.Vector3(between(-1,1),0,between(-1,1)).add(back.clone().multiplyScalar(.8)).multiplyScalar(between(1,2.4)*(.5+power)).setY(between(1.6,3.4)*(.4+power*.7)),
        color:['#3c6a35','#4f8a42','#5e7d3a'][i%3],size:between(.025,.045),life:between(.5,.85),opacity:.95,gravity:9.8,drag:.6,spin:12});
      if(power>.3)spawn(ringGeometry,{at:at.clone().setY(.03),v:new THREE.Vector3(),color:'#eae4cc',size:.18,grow:3.2*(.4+power),life:.38,opacity:.42,flat:true});
    },
    /** Short-lived puffs behind a struck ball. */
    trail(position,strength=1){spawn(puffGeometry,{at:new THREE.Vector3(position.x,position.y,position.z),v:new THREE.Vector3(0,.15,0),color:'#f4f2e6',size:.07*strength,grow:-.55,life:.32,opacity:.42*strength,spin:2});},
    /** Ball hitting the net or the turf. */
    puff(position,count=6){for(let i=0;i<count;i++)spawn(puffGeometry,{at:new THREE.Vector3(position.x,position.y,position.z),v:new THREE.Vector3(between(-.8,.8),between(.1,.7),between(-.8,.8)),
      color:'#e8e4d2',size:between(.05,.09),grow:1.8,life:between(.5,.8),opacity:.4,drag:2.5,spin:1.5});},
    update(dt){
      for(const p of [...active]){
        p.age+=dt;const t=p.age/p.life;
        if(t>=1){p.mesh.visible=false;active.delete(p);continue;}
        p.v.y-=p.gravity*dt;p.v.multiplyScalar(Math.exp(-p.drag*dt));p.mesh.position.addScaledVector(p.v,dt);
        if(p.gravity&&p.mesh.position.y<p.size/2){p.mesh.position.y=p.size/2;p.v.set(p.v.x*.4,-p.v.y*.15,p.v.z*.4);}
        if(!p.flat){p.mesh.rotation.x+=p.spin.x*dt;p.mesh.rotation.y+=p.spin.y*dt;p.mesh.rotation.z+=p.spin.z*dt;}
        p.mesh.scale.setScalar(Math.max(.001,p.size*(1+p.grow*t)));p.mesh.material.opacity=p.opacity*(1-t)**1.4;
      }
    },
    clear(){for(const p of active)p.mesh.visible=false;active.clear();},
    get count(){return active.size;},
  };
}
