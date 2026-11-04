import * as THREE from 'three';

/* Original star-panel match ball in the low-poly style: white shell, six navy stars with a pale rim.
 * Inspired by premium tournament balls; not a copy of any federation's registered design. */
const STAR_CENTERS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].map(v=>new THREE.Vector3(...v));
const WHITE=new THREE.Color('#f5f5ef'),NAVY=new THREE.Color('#1c2a4a'),RIM=new THREE.Color('#c5ccd8');

export function createMatchBall(radius=.11){
  const geometry=new THREE.IcosahedronGeometry(radius,3),position=geometry.getAttribute('position'),colors=[];
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3(),u=new THREE.Vector3(),v=new THREE.Vector3();
  for(let i=0;i<position.count;i+=3){
    a.fromBufferAttribute(position,i);b.fromBufferAttribute(position,i+1);c.fromBufferAttribute(position,i+2);n.copy(a).add(b).add(c).normalize();
    let best=STAR_CENTERS[0],index=0;STAR_CENTERS.forEach((s,k)=>{if(s.dot(n)>best.dot(n)){best=s;index=k;}});
    u.set(0,1,0);if(Math.abs(best.y)>.9)u.set(1,0,0);u.cross(best).normalize();v.crossVectors(best,u);
    const rho=Math.acos(Math.min(1,best.dot(n))),theta=Math.atan2(n.dot(v),n.dot(u))+index*.7;
    // Five-pointed outline: inner .2 rad, tips .5 rad.
    const edge=.2+.3*Math.pow(.5+.5*Math.cos(5*theta),2.2);
    const color=rho<edge?NAVY:rho<edge+.07?RIM:WHITE;
    for(let k=0;k<3;k++)colors.push(color.r,color.g,color.b);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const ball=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.55,flatShading:true}));ball.castShadow=true;
  return ball;
}
