import * as THREE from 'three';
import { teams } from './players.js';

const sphere = new THREE.SphereGeometry(1, 10, 8);
const torso = new THREE.CylinderGeometry(.215, .18, .48, 8);
const limb = new THREE.CapsuleGeometry(.072, .23, 3, 6);
const calf = new THREE.CapsuleGeometry(.061, .25, 3, 6);
const boot = new THREE.BoxGeometry(.14, .11, .28);
const skinColors = [0xd2a17d, 0xb47d58, 0xe0b18f, 0x83563d, 0xc18b65];
const mat = color => new THREE.MeshStandardMaterial({ color, roughness: .92 });
const teamMaterials = teams.map(t => ({ shirt: mat(t.color), shorts: mat(t.shorts), socks: mat(t.socks), keeper: mat(t.keeper) }));
const bootMat = mat('#202723'), hairMaterials = [mat('#251e19'), mat('#3c2c20'), mat('#6d5438')];

function mesh(geometry, material, scale, position) {
  const m = new THREE.Mesh(geometry, material);
  if (scale) m.scale.set(...scale);
  if (position) m.position.set(...position);
  m.castShadow = true;
  return m;
}

export function makePlayer(player, index) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const palette = teamMaterials[player.team], skin = mat(skinColors[index % skinColors.length]);
  const shirt = player.keeper ? palette.keeper : palette.shirt;
  const shorts = player.keeper ? palette.keeper : palette.shorts;
  const socks = player.keeper ? palette.keeper : palette.socks;
  body.add(mesh(torso, shirt, null, [0, 1.15, 0]));
  const head = mesh(sphere, skin, [.145, .175, .145], [0, 1.64, 0]);
  body.add(head);
  body.add(mesh(sphere, hairMaterials[index % 3], [.149, .085, .146], [0, 1.75, -.015]));
  body.add(mesh(new THREE.CylinderGeometry(.175, .2, .22, 8), shorts, null, [0, .82, 0]));
  const arms = [], legs = [];
  for (const sign of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(sign * .25, 1.36, 0);
    arm.rotation.z = sign * .12;
    arm.add(mesh(limb, shirt, [1.08, .68, 1.08], [0, -.12, 0]));
    arm.add(mesh(limb, skin, [.87, .76, .87], [0, -.37, .035]));
    if (player.keeper) arm.add(mesh(sphere, mat('#e3e5d8'), [.095, .105, .075], [0, -.51, .04]));
    body.add(arm); arms.push(arm);
    const leg = new THREE.Group();
    leg.position.set(sign * .105, .78, 0);
    leg.add(mesh(limb, shorts, [1.2, .65, 1.2], [0, -.12, 0]));
    leg.add(mesh(calf, skin, [1, .65, 1], [0, -.34, 0]));
    leg.add(mesh(calf, socks, [1.08, .72, 1.08], [0, -.53, 0]));
    leg.add(mesh(boot, bootMat, null, [0, -.70, .065]));
    body.add(leg); legs.push(leg);
  }
  // A small number patch is enough detail at the distant broadcast scale.
  const numberCanvas = document.createElement('canvas');
  numberCanvas.width = 64; numberCanvas.height = 64;
  const ctx = numberCanvas.getContext('2d');
  ctx.fillStyle = player.keeper && player.team === 0 ? '#233044' : '#fff7e5';
  ctx.font = 'bold 45px Arial'; ctx.textAlign = 'center';ctx.fillText(String(player.number), 32, 49);
  const tex = new THREE.CanvasTexture(numberCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(.25, .25), new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));
  patch.position.set(0, 1.17, -.214); patch.rotation.y = Math.PI; body.add(patch);

  const ring = new THREE.Mesh(new THREE.RingGeometry(.40, .47, 40), new THREE.MeshBasicMaterial({color:'#e0f0a0',transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));
  ring.rotation.x = -Math.PI / 2;ring.position.y = .035; ring.visible = false;root.add(ring);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.4, 20),new THREE.MeshBasicMaterial({color:'#122617',transparent:true,opacity:.19,depthWrite:false}));
  shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1, .6, 1);shadow.position.y = .025;root.add(shadow);
  root.position.set(player.base.x, 0, player.base.z);
  return {root,body,arms,legs,ring,phase:index*1.37};
}

export function animatePlayer(model, pose, time, speed) {
  model.root.position.set(pose.x,0,pose.z);
  model.root.rotation.y = pose.direction;
  const stride = pose.running ? Math.min(.60, .18 + speed * .13) : .02;
  const wave = Math.sin(time * (speed > 3 ? 11 : 8.5) + model.phase);
  model.legs[0].rotation.x = wave * stride;
  model.legs[1].rotation.x = -wave * stride;
  model.arms[0].rotation.x = -wave * stride * .72 - .15;
  model.arms[1].rotation.x = wave * stride * .72 - .15;
  model.body.position.y = pose.running ? Math.abs(wave) * .035 : Math.sin(time * 2 + model.phase) * .008;
  model.body.rotation.x = pose.running ? .06 : 0;
  model.ring.visible = pose.owner;
}
